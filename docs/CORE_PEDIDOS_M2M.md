# Pedidos do Core para o NextERP

Situação em 07/09/2026: integração ajustada e validada localmente; consumo em produção ainda não ativado.

## Contrato e origem

O NextERP consome `GET /api/v1/ongsys/pedidos/feed/`, autenticado pela identidade M2M própria, com escopo `pedidos:read`. A rota `/api/v1/ongsys/pedidos/` serve consultas do modelo nativo e tem outro contrato.

A coleta do Core publica o modelo `OngsysPedido` e o feed versionado na mesma transação após validar paginação, identificadores e total informado pela origem. Reutiliza os mesmos payloads; não faz outra varredura HTTP para preencher o modelo nativo. A busca pontual permanece disponível e não publica uma versão completa.

O consumidor mantém o identificador da versão entre páginas e só envia dados ao NextERP depois de receber a carga inteira. Uma falha preserva a última versão publicada. Pedido ausente não é cancelado automaticamente. O total e a ausência de duplicações validam a coleta, mas não garantem um instante único na origem se a ONGSYS alterar registros durante a paginação.

## Coleta e retomada

No ambiente do Core, `python manage.py sync_ongsys_orders --resume` inicia ou retoma uma coleta. `--max-pages` limita o trabalho daquela execução: atingir o orçamento antes do fim retorna erro explícito, sem publicar dados parciais. Uma nova execução com `--resume` retoma o checkpoint e verifica novamente a última página. Se essa fronteira mudou, é necessário investigar e usar `--restart` para iniciar outra coleta.

`sync_pedidos()` usa o mesmo coletor para varreduras paginadas. Uma execução limitada não deve ser interpretada como sincronização completa. O painel de tarefas registra a interrupção; o comando específico acima permite concluir a coleta sem o orçamento curto do painel.

## Ativação operacional restante

1. Publicar os ajustes do Core e do NextERP, preservando as atualizações recentes de cada aplicação e uma cópia recuperável da versão anterior.
2. Cadastrar a identidade NextERP no M2M existente, guardar o segredo pelo fluxo do OpenBao e configurar `CORE_BASE_URL` e `CORE_NEXTERP_M2M_KEY` no arquivo protegido do extrator. Não registrar valores de credenciais no Git, comandos ou relatórios.
3. Concluir a primeira coleta e confirmar versão publicada, total e horário real de conclusão. Os 101 pedidos observados na análise não comprovam cobertura completa da origem.
4. Executar `extractor/compare_core_pending.py` para comparar o feed com as pendências existentes, sem escrita. Examinar fechamentos explícitos e ausências não resolvidas.
5. Publicar os campos do estado de sincronização no NextERP e habilitar `core_ongsys_pending_enabled` no site de destino. Configurar `ONGSYS_PENDING_SOURCE=core` e executar `extractor/sync_core_pending.py`.
6. Confirmar o recibo de aplicação, os dados persistidos e uma segunda execução sem novas gravações. Configurar a recorrência no orquestrador existente, evitando concorrência com a importação direta das mesmas pendências.

Não reaproveitar chaves de outras aplicações. Os aliases de escopo existentes no Core também permitem leitura de pedidos para `cadastros:read`; essa política merece revisão própria e não foi alterada nesta integração.

## Validação realizada

- 53 testes de integrações do Core passaram em PostgreSQL descartável, incluindo publicação conjunta, retomada, falha de gravação com rollback e autenticação do feed.
- 10 testes do consumidor/sincronização Core no NextERP passaram, incluindo a rota atual, mudança de versão e rejeição de carga parcial.
- `makemigrations --check --dry-run` não identificou mudanças de esquema no Core; verificações de diff passaram.
- Estas verificações não constituem validação autenticada de ponta a ponta na VPS. Identidade M2M operacional, primeira carga publicada, aplicação e recorrência ainda precisam ser concluídas.
