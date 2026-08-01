# Checklist de auditoria — CDC NextERP

Revisão iniciada em 01/08/2026. A VPS de produção é usada somente para comparação em modo leitura.

Legenda: `OK` comprovado; `CORRIGIDO` divergência encontrada e ajustada; `PARCIAL` depende de validação visual; `PENDENTE` ainda não comprovado.

## Ambiente e dados

- [x] **OK** — aplicação local disponível em `http://localhost:8085`.
- [x] **OK** — backend, frontend, MariaDB, filas, Redis, scheduler e websocket ativos.
- [x] **OK** — backup recente restaurado: 3.532 Stock Entries, com lançamentos até 31/07/2026.
- [x] **OK** — quatro workspaces públicas e visíveis: CDC Estoque, CDC Usuários, CDC Integrações e CDC Pendências.
- [x] **OK** — migração do app executada duas vezes sem perder o índice ONGSYS.

## Tema, navegação e workspaces

- [x] **OK** — ícones próprios presentes nas quatro rotas (`stock`, `users`, `integration`, `list-alt`).
- [x] **OK** — aliases com e sem acento atendidos pelo carregador de workspaces.
- [x] **CORRIGIDO** — breadcrumb passou a usar URLs ASCII canônicas (`cdc-usuarios`, `cdc-integracoes`, `cdc-pendencias`) para evitar falso “Não encontrado”.
- [x] **OK** — conteúdo nativo duplicado do workspace CDC Estoque é ocultado e o painel CDC ocupa a rota.
- [ ] **PARCIAL** — aparência final, dimensões do logotipo, espaço inferior e responsividade precisam de uma rodada visual autenticada no navegador.

## CDC Usuários

- [x] **OK** — fonte é o DocType `User` do NextERP, filtrado para `System User`; não são usuários da API.
- [x] **OK** — API retorna 69 usuários do sistema no consolidado atual.
- [x] **OK** — cards de total, ativos, inativos e usuários com perfil.
- [x] **OK** — tabela de usuários, busca, ordenação por coluna, cabeçalho fixo e rolagens horizontal superior/inferior e vertical.
- [x] **OK** — filtros encadeados Projeto → Armazém, iniciando em “Todos”.
- [x] **OK** — atalhos alinhados à produção: User, Role, Gerenciador de permissões, User Profile e User Type.
- [ ] **PARCIAL** — conferir visualmente links dos cinco atalhos com um usuário não Administrador.

## CDC Pendências

- [x] **OK** — espelho local contém somente pedidos de Produto ativos que não estão finalizados nem cancelados.
- [x] **OK** — 56 pedidos pendentes, 512 itens e quantidade 14.614 na última sincronização local.
- [x] **OK** — cards, tabela, pesquisa, detalhe de espera, ordenação e rolagens dupla/vertical.
- [x] **OK** — colunas Projeto e Armazém não são exibidas; permanecem apenas como filtros superiores.
- [x] **OK** — filtros encadeados Projeto → Armazém.
- [x] **OK** — sincronização rápida de três páginas e auditoria completa diária.
- [ ] **PARCIAL** — validar em execução real contra ONGSYS se a ordenação da API continua compatível com a janela escolhida.

## CDC Integrações

- [x] **OK** — workspace e painel Mattermost carregados na rota exclusiva.
- [x] **OK** — botões minimalistas Editar e Apagar implementados por configuração.
- [x] **OK** — exclusão exige confirmação e recarrega a lista.
- [x] **OK** — criação e diagnóstico disponíveis.
- [x] **OK** — CRUD local Mattermost validado com configuração temporária desabilitada; o registro foi removido ao final sem envio de webhook.
- [ ] **PARCIAL** — conferir visualmente os botões Editar e Apagar no navegador.

## CDC Estoque e projetos

- [x] **OK** — cards, filtros, gráficos, tabela de movimentações e atalhos customizados presentes.
- [x] **OK** — seletor de armazém possui “Mostrar todos”.
- [x] **OK** — abas Todos, Entradas e Saídas consultam o backend com filtro próprio.
- [x] **OK** — “Todos” preserva até 30 registros por tipo para entradas recentes não ocultarem saídas.
- [x] **CORRIGIDO** — armazém das movimentações agora usa também `Stock Entry Detail`; os 77 registros recentes auditados deixaram de aparecer como “Estoque Geral”.
- [x] **CORRIGIDO** — removidos filtros e indicadores mensais fixos; mês atual e mês anterior agora são calculados dinamicamente.
- [x] **CORRIGIDO** — períodos dos gráficos de mês, trimestre, semestre e ano também são calculados dinamicamente, sem datas de 2025/2026 no código.
- [x] **OK** — seis cards de projeto possuem rotas `/app/cdc-estoque/<slug>`.
- [x] **OK** — páginas de projeto usam a mesma API com filtro de projeto.
- [x] **OK** — dentro do projeto o card geral de projetos é removido e a tabela recebe a largura disponível.
- [x] **OK** — breadcrumb e botão de retorno à visão geral presentes.
- [x] **OK** — botão flutuante alterna entre fim e topo da página.
- [ ] **PARCIAL** — validar visualmente cada um dos seis projetos e os três estados da tabela.

## Relatórios e atalhos de estoque

- [x] **CORRIGIDO** — “Lançamento no Estoque - CDC” usa a rota de Report Builder `/app/stock-entry/view/report/...`.
- [x] **OK** — a base do relatório contém 3.532 lançamentos e o relatório está ativo.
- [x] **OK** — Balanço de Estoque e Livro de Inventários permanecem em rotas Query Report, de acordo com seu tipo.
- [x] **CORRIGIDO** — a cadeia da produção foi preservada: `Livro de Inventarios - CDC` usa `Livro de inventario - CDC`, que usa o relatório padrão Stock Ledger.
- [x] **CORRIGIDO** — o relatório-base voltou a ficar ativo e as datas obrigatórias são atualizadas para a janela dinâmica do último mês.
- [ ] **PARCIAL** — abrir Balanço e Livro no navegador e confirmar visualmente os filtros padrão de data e empresa.
- [ ] **PARCIAL** — validar botão “Adicionar lançamento” com perfil operacional; a inclusão deve continuar sendo a tela nativa de Stock Entry.

## ONGSYS, banco e execução programada

- [x] **OK** — timeout HTTPS de 90 segundos.
- [x] **OK** — importação aceita somente `Ordem finalizada`, tipo Produto e pedidos dos últimos 30 dias.
- [x] **OK** — Stock Entry é criado submetido (`docstatus = 1`).
- [x] **OK** — centro de custo sem mapeamento ou pedido sem itens válidos provoca falha explícita.
- [x] **OK** — respostas HTTP de leitura e gravação são validadas.
- [x] **OK** — índice único `uniq_stock_entry_idpedido_ongsys`; nenhuma duplicidade encontrada.
- [x] **OK** — checkpoint só avança após sucesso.
- [x] **OK** — `flock` impede cron sobreposto.
- [x] **OK** — catálogos pesados são diários; pedidos e pendências permanecem horários.
- [x] **OK** — dependências só são reinstaladas quando `requirements.txt` muda.
- [x] **OK** — simulação sem gravação rejeitou HTTP inválido, item sem mapeamento e pedido sem itens, e aceitou o mapeamento válido.
- [ ] **PENDENTE** — executar um ciclo real controlado do integrador no laboratório sem criar dados indevidos.

## Terraform e testes

- [x] **OK** — hashes de API, JS, CSS, hooks e DocTypes fazem parte dos gatilhos Terraform.
- [x] **OK** — criação do índice, saneamento de relatórios e atalhos estão na receita.
- [x] **OK** — `terraform fmt -check` e `terraform validate` aprovados.
- [x] **CORRIGIDO** — etapa 7 agora também rejeita data mensal fixa, exige fallback por Stock Entry Detail e valida rotas canônicas.
- [x] **OK** — restauração do dump agora exige `-var=restore_backup=true`; o padrão seguro é `false`.
- [x] **OK** — `terraform apply` normal foi comprovado no laboratório com restauração explicitamente ignorada.
- [x] **OK** — esteira reproduzível executada pelo Terraform e `esteira_resultados.json` atualizado com 8/8 etapas aprovadas.

## Perspectivas transversais inéditas

- [x] **OK** — auditoria não bloqueante criada em `terraform/run_extended_audit.py` e integrada ao Terraform.
- [x] **OK** — integridade de dados: zero bins órfãos, saldos negativos, lançamentos submetidos sem itens ou pendências inválidas.
- [x] **OK** — API pública como Guest recebe HTTP 403.
- [x] **CORRIGIDO** — estoque exige permissões nativas e CDC Usuários exige `System Manager`; Guest e Website User foram recusados em teste real.
- [x] **CORRIGIDO** — teste Mattermost exige escrita no documento e diagnóstico exige `System Manager`.
- [x] **CORRIGIDO** — diagnóstico Mattermost usa a coluna compatível `method` de Error Log.
- [x] **CORRIGIDO** — mensagens do diagnóstico Mattermost são escapadas antes de entrar em `innerHTML`.
- [ ] **MÉDIO** — existe um Warehouse sem uso com nome corrompido: `LONGEVIDADE E ARTICULAï¿½ï¿½O - C`.
- [x] **CORRIGIDO** — backup, site-config e tfstate permanecem ignorados pelo Git e agora usam permissão local 600.
- [x] **CORRIGIDO** — busca de pendências possui nome acessível explícito.
- [x] **CORRIGIDO** — datas de corte são calculadas no fuso do site pelo Frappe, sem `CURDATE()` do MariaDB.
- [x] **OK** — latências abaixo de 3 segundos incluindo inicialização do processo Bench nos três endpoints principais.
