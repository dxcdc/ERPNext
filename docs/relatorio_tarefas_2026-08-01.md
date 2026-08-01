# Relatório de tarefas — pausa operacional do fim de semana

Data de referência: 01/08/2026

Branch: `lab/estabilizacao-tema-cdc`

Ambientes alterados: somente laboratório local

Produção GCP: consultada somente em leitura

## Resumo para decisão

Não há necessidade de manter o computador ligado durante o fim de semana. A produção continua como fonte oficial. Na próxima conexão, o reconciliador sombra detectará a defasagem usando contagens, datas e checksums.

O laboratório está disponível, a esteira possui 8/8 aprovações e a auditoria ampliada passou de dez achados para um achado médio. A migração definitiva permanece aguardando provas de integração, recuperação e validação operacional.

## Entregas concluídas

| ID | Entrega | Evidência | Estado |
|---|---|---|---|
| DONE-01 | Restrição das APIs de estoque, usuários e Mattermost | Testes com Guest, Website User e Administrador | Concluído |
| DONE-02 | Correção do diagnóstico e escape de conteúdo Mattermost | Auditoria sem achados altos | Concluído |
| DONE-03 | Datas alinhadas ao fuso do site e busca acessível | Auditoria automatizada | Concluído |
| DONE-04 | Arquivos sensíveis locais com permissão 600 | Verificação de modo de arquivo | Concluído |
| DONE-05 | Painel qualitativo de prontidão | `docs/prontidao_migracao.md` | Concluído |
| DONE-06 | Roteiro manual e visual | `docs/validacao_manual_visual.md` | Concluído |
| DONE-07 | Arquitetura do espelho sombra | `docs/espelho_sombra_producao.md` | Concluído |
| DONE-08 | Reconciliador produção × laboratório somente leitura | `scripts/reconcile_production_shadow.py` | Concluído |
| DONE-09 | Revisão de afirmações otimistas nos documentos antigos | Política e relatório executivo revisados | Concluído |

## Backlog priorizado

### MIG-01 — Definir a matriz de papéis CDC

- **Tipo:** decisão de negócio e segurança
- **Prioridade:** crítica
- **Pode ser feito offline:** parcialmente
- **Ação:** decidir se o perfil operacional acessa CDC Usuários, CDC Pendências e indicadores consolidados.
- **Aceite:** tabela papel × rota × ação aprovada; testes positivos e negativos registrados.
- **Bloqueia migração:** sim.

### MIG-02 — Executar ciclo ONGSYS controlado

- **Tipo:** homologação integrada
- **Prioridade:** crítica
- **Janela recomendada:** segunda-feira, com responsável operacional disponível
- **Ação:** acompanhar um pedido finalizado, criação submetida e segunda execução sem duplicidade.
- **Aceite:** ID ONGSYS, Stock Entry criado, saldo esperado, checkpoint e evidência da idempotência.
- **Bloqueia migração:** sim.

### MIG-03 — Tornar integrador e agendamento declarativos

- **Tipo:** infraestrutura
- **Prioridade:** crítica
- **Ação:** conteinerizar ou instalar por receita; eliminar dependência do cron configurado manualmente.
- **Aceite:** host vazio recebe integrador, agenda, lock, credenciais e rotação de logs pela receita.
- **Bloqueia migração:** sim.

### MIG-04 — Implementar backup completo

- **Tipo:** continuidade
- **Prioridade:** crítica
- **Ação:** incluir banco, arquivos públicos/privados, `site_config`, checksums e cópia externa criptografada.
- **Aceite:** pacote completo, retenção definida e alerta de falha comprovado.
- **Bloqueia migração:** sim.

### MIG-05 — Ensaio de restauração e rollback

- **Tipo:** recuperação
- **Prioridade:** crítica
- **Ação:** restaurar em host vazio e medir RPO/RTO; depois ensaiar retorno.
- **Aceite:** esteira 8/8, jornada operacional mínima, tempos medidos e relatório assinado.
- **Bloqueia migração:** sim.

### MIG-06 — Automatizar reconciliação sombra local

- **Tipo:** observabilidade
- **Prioridade:** alta
- **Ação:** executar ao ligar/conectar o computador, com checkpoint e histórico de resultados.
- **Aceite:** retomada após período offline, nenhuma escrita remota e alerta de divergência.
- **Bloqueia migração:** não, mas aumenta confiança.

### MIG-07 — Decidir homologação temporária na Hostinger

- **Tipo:** arquitetura e custo
- **Prioridade:** alta
- **Ação:** avaliar VPS, isolamento, subdomínio, TLS, firewall, faixa visual e dados permitidos.
- **Aceite:** decisão registrada com custo, prazo, responsável e controles de acesso.
- **Bloqueia migração:** não; o ensaio em host equivalente é recomendado.

### MIG-08 — Executar roteiro manual e visual

- **Tipo:** homologação de usuário
- **Prioridade:** alta
- **Ação:** executar `docs/validacao_manual_visual.md` com três perfis.
- **Aceite:** evidência por jornada e nenhuma falha crítica aberta.
- **Bloqueia migração:** sim.

### MIG-09 — Tratar armazém com codificação corrompida

- **Tipo:** qualidade de dados
- **Prioridade:** média
- **Ação:** decidir entre renomear, consolidar ou desativar o registro sem uso.
- **Aceite:** decisão após backup e comprovação de ausência de referências.
- **Bloqueia migração:** não, salvo se forem encontradas referências.

### MIG-10 — Implantar alertas operacionais

- **Tipo:** observabilidade
- **Prioridade:** alta
- **Ação:** alertar atraso ONGSYS, falha de backup, pouco disco e fila parada.
- **Aceite:** cada cenário simulado gera alerta e recuperação registrada.
- **Bloqueia migração:** recomendado tratar como bloqueador operacional.

## Plano para segunda-feira

1. Executar novamente a reconciliação sombra antes de qualquer atualização local.
2. Registrar quantas alterações ocorreram durante o período offline.
3. Definir a matriz de papéis com o responsável pelo sistema.
4. Escolher um pedido ONGSYS controlado.
5. Não ativar replay nem integração de escrita entre ambientes.
6. Decidir se a próxima prova será local ou em homologação isolada na Hostinger.

## Verificações manuais separadas

As verificações de layout, navegador, responsividade, permissões por perfil e jornada de inclusão não são consideradas aprovadas por testes de API. O roteiro oficial está em `docs/validacao_manual_visual.md`.

## Condição de pausa

Durante o fim de semana não é necessária nenhuma tarefa na GCP. O cron produtivo existente continuará independente do laboratório. Se o computador permanecer desligado, a única consequência esperada é a defasagem temporária do relatório sombra.

Última revisão: 01/08/2026

Responsável pela revisão: equipe de migração CDC
