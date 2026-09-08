# Pedidos do Core para o NextERP

Situação em 07/09/2026: seis etapas concluídas na VPS CDC. Integração publicada, dados conferidos e recorrência ativa no Rundeck.

## Estado de entrega e pendências

A conferência posterior confirmou o Core em PostgreSQL, o cliente M2M ativo, a agenda habilitada e 243 pendências no NextERP, sem divergências em relação aos 3.147 pedidos do feed. O escopo entregue é pedidos/pendências.

| Item | Situação comprovada |
| :--- | :--- |
| Consumo M2M em produção | Aplicado e validado com dados reais. |
| Execução pelo Rundeck | Execução manual 99 concluída com sucesso e sem novas gravações. |
| Disparo automático pelo relógio | Agenda ativa; o histórico consultado ainda contém apenas as execuções manuais 95 e 99. Falta acompanhar o primeiro disparo agendado. |
| Custódia no OpenBao | Integração desabilitada e chave ainda não custodiada nele. A operação usa arquivo protegido. |
| Homologação visual por perfil | API autenticada validada; inspeção com navegador e perfis de usuários ainda não realizada. |
| Novo ensaio do backup NextERP | Arquivo atual verificado por gzip e SHA-256; restauração desse arquivo ainda não ensaiada. O backup Core foi restaurado em banco isolado. |
| Promoção do NextERP para `main` | A entrega está na branch `lab/estabilizacao-tema-cdc`, usada no checkout da VPS. A promoção para `main` é uma etapa separada. |

Não há bloqueio identificado para a conexão já em operação. Os itens acima distinguem o funcionamento comprovado das validações complementares e da evolução da custódia.

## Fluxo em produção

ONGSYS → PostgreSQL do Core → `GET /api/v1/ongsys/pedidos/feed/` → pendências persistentes do NextERP.

A coleta atualiza `OngsysPedido` e publica o feed versionado na mesma transação, somente depois de validar as páginas, identificadores e total informado pela origem. Reutiliza os payloads da mesma varredura. Uma falha preserva a versão publicada e permite retomar o checkpoint. A busca pontual não é tratada como coleta completa.

A rota `/api/v1/ongsys/pedidos/` continua disponível para consultas do modelo nativo, com outro contrato. O consumidor NextERP usa a rota `/feed/`, mantém a versão entre páginas e só aplica a carga inteira. Ausência de pedido não significa cancelamento. A atualização não cria movimentações de estoque nem altera o checkpoint da importação de estoque.

O feed também informa a etapa atual do workflow sem expor autor ou comentário. O NextERP persiste esse valor e calcula os cards das etapas depois de aplicar o escopo efetivo de projeto e armazém do usuário. Etapas 1 a 5 representam pendências atuais; a etapa 6 mostra pedidos recebidos e encerrados nos últimos 30 dias. O último evento cronológico prevalece, inclusive quando um pedido retorna a uma etapa anterior.

O total e a ausência de duplicações validam a cobertura da coleta, mas não garantem um instante único na origem se a ONGSYS alterar registros durante a paginação.

## Cargas e aplicação validadas

- 3.147 pedidos coletados e persistidos no Core.
- Versão `b1271fa1-b6e9-421b-b230-cecb51cb9a70`, concluída em 07/09/2026 às 17:25:53, horário de Recife.
- 243 pedidos pendentes aplicados no NextERP; a base anterior de pendências estava vazia.
- API autenticada da tela respondeu HTTP 200 e retornou 243 pendências.
- Consulta da versão já consumida retornou `not_modified=true`.
- Segunda coleta concluída às 22:11:49 de 07/09/2026, horário de Recife: versão `7257fa23-9dcb-4e7b-9194-c39008221396`, novamente com 3.147 pedidos e 243 pendências.
- Comparação após a aplicação: zero inclusões restantes, fechamentos, ausências ou divergências de estado, itens, quantidades e centros de custo.
- Chave exclusiva de pedidos recebeu HTTP 403 ao consultar contas a pagar.

## Identidade e configuração

Desde a [troca de domínio de 08/09/2026](./TROCA_DOMINIO_ESTOQUE.md), o acesso público é `https://estoque.cdc.org.br`. O subdomínio cadastrado no cliente M2M `nexterp` acompanha esse endereço. As conexões internas do Core e do extrator continuam usando os endereços internos existentes; a troca não altera chaves ou escopos.

O cliente M2M `nexterp` tem escopo `pedidos:read`. O Core guarda o hash da chave; os valores `CORE_BASE_URL`, `CORE_NEXTERP_M2M_KEY` e `ONGSYS_PENDING_SOURCE=core` estão no arquivo protegido `/etc/cdc/secrets/nexterp-extractor.env` da VPS. O site `frontend` possui `core_ongsys_pending_enabled=1`.

O OpenBao está disponível, mas sua integração com o Core estava desabilitada. A chave foi instalada no arquivo protegido existente; não foi habilitada a custódia no OpenBao. Não incluir valores de credenciais em comandos, documentação ou Git. Os aliases de escopo existentes no Core também permitem leitura de pedidos para `cadastros:read`; essa política não foi alterada.

## Operação e recorrência

O executor `/usr/local/sbin/cdc-core-pending-sync` não aceita argumentos. Seu código está em `ops/core-m2m/`. Ele usa um lock próprio e o lock compartilhado com o extrator NextERP, reutiliza uma versão concluída há menos de 45 minutos ou coleta uma nova, e aplica o feed pelo cliente M2M. Uma execução concorrente retorna código 75.

Job preparado no Rundeck:

- Projeto: `cdc-automatiza`.
- Grupo: `CDC/Integracoes`.
- Nome: `Sincronizar pedidos Core para pendencias NextERP`.
- ID: `e7e1db9b-6463-4c06-8fbd-259c96c8df65`.
- Horário configurado: a cada hora, no minuto 40, fuso `America/Recife`.
- Agenda: habilitada e confirmada pela API do Rundeck.
- Execução final 99: `succeeded`, em 07/09/2026 às 22:12:30. Ansible: `ok=2`, `changed=0`, `failed=0`. O consumidor reconheceu a versão já aplicada e não efetuou novas gravações.

A primeira execução de teste pelo Rundeck, número 95, foi bloqueada com código 75 porque outra execução já atualizava a coleta. O controle impediu a sobreposição. Após a liberação do executor, a execução 99 confirmou o fluxo sem concorrência.

As operações de importação e agendamento usam a [API oficial do Rundeck](https://docs.rundeck.com/docs/api/). Não há outro timer novo concorrendo com esse job.

## Retomada e recuperação

No Core, `python manage.py sync_ongsys_orders --resume --max-pages 100` inicia ou retoma uma coleta. Atingir o orçamento antes do fim retorna erro explícito e não publica dados parciais. A retomada verifica novamente a última página. Se a fronteira mudou, investigar antes de iniciar outra coleta com `--restart`.

O job geral executa pedidos depois das outras entidades para que uma interrupção por orçamento não impeça as demais atualizações.

Backups anteriores à ativação estão em `/var/backups/cdc-core/20260907-m2m-release/`. O backup Core foi restaurado em banco temporário e conferido; o backup NextERP de 07/09 às 17:01 teve integridade gzip e SHA-256 verificados. Não foi realizado novo ensaio de restauração desse arquivo NextERP nesta etapa.

Os contêineres anteriores `cdc-core-before-m2m` e `cdc-core-m2m-v1` foram preservados parados. Para suspender a integração, desabilitar a agenda no Rundeck e o sinalizador `core_ongsys_pending_enabled` no site. Não restaurar bancos automaticamente: a reversão de código e a suspensão da agenda preservam os pedidos já coletados.

## Validação técnica

- 53 testes das integrações Core passaram antes da publicação.
- Após a proteção do job geral, os 16 testes específicos de coleta/feed passaram em PostgreSQL descartável.
- 10 testes do consumidor/sincronização Core passaram no NextERP.
- 5 testes passaram no site Frappe descartável, incluindo rollback, idempotência, permissões e preservação do checkpoint de estoque.
- Sem migração adicional de esquema no Core; campos de controle publicados por migração no NextERP.
- Leitura da tela validada pela API autenticada; não houve inspeção visual com sessão de navegador.
- Em 08/09/2026, 17 testes do feed Core, 8 testes Frappe de persistência/escopo, 30 testes estáticos e a verificação JavaScript dos cards passaram antes da publicação das etapas 1 a 6.
