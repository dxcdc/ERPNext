# Backlog de Issues e Tarefas Técnicas: NextERP (CDC)

Este documento consolida a lista oficial de **Issues e Histórias de Usuário** mapeadas durante a perícia e homologação da migração do NextERP. Estas tarefas representam o plano de ação de governança, segurança e melhoria contínua para implementação no ambiente definitivo na Hostinger.

---

## 📋 Lista de Issues Mapeadas

| ID | Título da Issue | Categoria | Prioridade | Status |
| :--- | :--- | :--- | :---: | :---: |
| **#01** | [Conteinerização Completa e Isolamento de Recursos do Extrator](#issue-01-conteinerização-completa-e-isolamento-de-recursos-do-extrator) | DevOps / Infra | 🔴 Alta | `Pendente` |
| **#02** | [Otimização de Performance do Script de Produtos (Bulk Update)](#issue-02-otimização-de-performance-do-script-de-produtos) | Refatoração | 🟡 Média | `Pendente` |
| **#03** | [Migração do Motor de Backups para Rclone & CDC Backups Hub](#issue-03-migração-do-motor-de-backups-para-rclone--cdc-backups-hub) | Backups | 🔴 Alta | `Pendente` |
| **#04** | [Implantação do Canal de Alertas e Notificações no Mattermost](#issue-04-implantação-do-canal-de-alertas-e-notificações-no-mattermost) | Monitoramento | 🟡 Média | `Pendente` |
| **#05** | [Hardening de Senhas em Texto Puro e Criptografia GPG nos Backups](#issue-05-hardening-de-senhas-em-texto-puro-e-criptografia-gpg-nos-backups) | Segurança | 🟣 Crítica | `Pendente` |
| **#06** | [Configuração do Ambiente Multi-Tenant de Treinamento (Sandbox)](#issue-06-configuração-do-ambiente-multi-tenant-de-treinamento-sandbox) | Recursos | 🟢 Baixa | `Planejado` |

---

### Issue #01: Conteinerização Completa e Isolamento de Recursos do Extrator
* **Descrição**: Atualmente, o pipeline do extrator de dados (`run_job.sh`) roda diretamente na Crontab do sistema operacional do host. A proposta é empacotar o script Python e suas dependências em uma imagem Docker dedicada integrada à rede `frappe_network`.
* **Critérios de Aceite**:
  * [ ] Criar `Dockerfile` otimizado para o serviço `cdc-extractor`.
  * [ ] Definir limites estritos de recursos no `docker-compose.yml` (`cpus: 0.5`, `memory: 512m`).
  * [ ] Substituir a Cron do host por um agendador interno (Ofelia ou Celery/Cron de contêiner).
* **Labels**: `enhancement`, `docker`, `devops`

---

### Issue #02: Otimização de Performance do Script de Produtos
* **Descrição**: O script `4_Extrator_produtos_v2.py` realiza iterações sequenciais individuais via API para cada item, levando cerca de 4 minutos por execução.
* **Critérios de Aceite**:
  * [ ] Implementar chamadas em lote (*bulk update / batching*) nas requisições do ERPNext.
  * [ ] Reduzir o tempo total de execução para menos de 30 segundos.
  * [ ] Adicionar logs estruturados de tempo de resposta por lote.
* **Labels**: `refactor`, `performance`, `python`

---

### Issue #03: Migração do Motor de Backups para Rclone & CDC Backups Hub
* **Descrição**: Substituir o script legado em Python (`bkp.py`) pelo utilitário profissional de linha de comando **Rclone**, utilizando as credenciais salvas no projeto oficial GCP `cdc-org`.
* **Critérios de Aceite**:
  * [ ] Configurar o Rclone na Hostinger VPS integrado ao Google Drive institucional da CDC.
  * [ ] Implementar verificação atômica por hash MD5/SHA256 após o upload.
  * [ ] Garantir renovação automática de tokens OAuth sem intervenção humana.
* **Labels**: `backups`, `rclone`, `gdrive`, `devops`

---

### Issue #04: Implantação do Canal de Alertas e Notificações no Mattermost
* **Descrição**: Criar um mecanismo de notificação ativa que informe a equipe de TI no Mattermost sempre que o backup for concluído com sucesso ou falhar.
* **Critérios de Aceite**:
  * [ ] Criar Webhook de entrada no servidor Mattermost da CDC.
  * [ ] Integrar chamada cURL silenciosa nos scripts de backup e saúde do contêiner.
  * [ ] Enviar payload formatado com status, tamanho do arquivo e tempo decorrido.
* **Labels**: `monitoring`, `mattermost`, `integrations`

---

### Issue #05: Hardening de Senhas em Texto Puro e Criptografia GPG nos Backups
* **Descrição**: Eliminar senhas em texto claro (`admin`) dos arquivos de configuração e implementar criptografia nos backups offsite.
* **Critérios de Aceite**:
  * [ ] Mapear senhas do MariaDB para variáveis de ambiente criptografadas no arquivo `.env`.
  * [ ] Implementar chave assimétrica GPG para criptografar os dumps `.sql.gz` e arquivos `.tar` antes do envio ao Google Drive.
  * [ ] Documentar o procedimento de decodificação de emergência com a chave privada.
* **Labels**: `security`, `hardening`, `gpg`

---

### Issue #06: Configuração do Ambiente Multi-Tenant de Treinamento (Sandbox)
* **Descrição**: Configurar um segundo site no Frappe/ERPNext (`treinamento.cdc.org.br`) na mesma VPS Hostinger para permitir que gestores e operadores realizem testes e treinamentos sem afetar o banco oficial.
* **Critérios de Aceite**:
  * [ ] Executar o comando `bench new-site treinamento.cdc.org.br` na VPS.
  * [ ] Configurar rotina mensal automatizada para clonar o banco de produção para a base de treinamento.
  * [ ] Aplicar tema customizado no painel para diferenciar o ambiente de testes do oficial.
* **Labels**: `feature`, `multi-tenant`, `sandbox`

---

### Issue #07: Criação do Módulo de Treinamento e Base de Dados para Capacitação
* **Descrição**: Desenvolver um módulo de testes e capacitação interativa no ERPNext contendo uma massa de dados fictícios para treinamento prático de operadores e gestores da CDC.
* **Critérios de Aceite**:
  * [ ] Gerar massa de dados de teste (produtos, fornecedores e requisições fictícias).
  * [ ] Configurar guia interativo de treinamento no painel principal do ERPNext.
  * [ ] Criar manual de usuário simplificado para a equipe de estoque.
* **Labels**: `feature`, `training`, `sandbox`

---

### 8. [INFRA] Estabilidade dos Containers Docker de Worker e Scheduler
- **Categoria**: Infraestrutura & Containers
- **Rótulos**: `docker`, `infrastructure`, `bug`
- **Prioridade**: 🔴 Alta
- **Descrição**: Corrigir a instabilidade dos containers de segundo plano (`nexterp-scheduler-1`, `nexterp-queue-short-1` e `nexterp-queue-long-1`) adicionando a montagem de volume da pasta `./apps/cdc_theme` no `docker-compose.yml`.
- **Checklist de Aceite**:
  - [x] Montar volume `./apps/cdc_theme` nos serviços de fila e scheduler.
  - [x] Garantir que todos os 10 containers permaneçam no status `Up (healthy)`.

---

### 9. [UI] Design do Layout de Atalhos e Cartões da Workspace de Estoque
- **Categoria**: Interface & Usuário
- **Rótulos**: `ui`, `workspace`, `feature`
- **Prioridade**: 🔴 Alta
- **Descrição**: Desenhar a estrutura da Workspace de Estoque com barra de atalhos horizontal com ícone `↗` e 3 cartões de categorias (`Catálogo`, `Movimentação` e `Relatórios Personalizados`).
- **Checklist de Aceite**:
  - [x] Configurar título `Atalho` e 4 botões na barra superior.
  - [x] Estruturar os 3 cartões de categorias em colunas responsivas.
  - [x] Sincronizar tabelas `tabWorkspace`, `tabWorkspace Link` e `tabWorkspace Shortcut`.

---

### 10. [BUG] Travamento de Skeleton Loaders na Workspace de Estoque
- **Categoria**: Correção de Bugs & Frontend
- **Rótulos**: `ui`, `bug`, `frappe`
- **Prioridade**: 🔴 Alta
- **Descrição**: Resolver o travamento do renderizador de workspaces do Frappe v15 (congelado nas caixas cinzas de carregamento em 99%).
- **Checklist de Aceite**:
  - [x] Remover a chave de bloco inválida `custom_block` do JSON `content` da workspace.
  - [x] Adicionar a trava de segurança *Skeleton Guard* no script `cdc_theme.js`.

---

### 11. [BUG] Erro ao Salvar Formulário do Mattermost (notify_transfer field rename)
- **Categoria**: Correção de Bugs & Backend
- **Rótulos**: `backend`, `python`, `bug`
- **Prioridade**: 🟡 Média
- **Descrição**: Corrigir a colisão de nomes de atributos no formulário do `CDC Mattermost Config` onde o campo `notify_update` sobrescrevia o método nativo `self.notify_update()` da classe Document do Frappe (`TypeError: 'int' object is not callable`).
- **Checklist de Aceite**:
  - [x] Renomear o campo de checkbox de `notify_update` para `notify_transfer`.
  - [x] Executar `bench migrate` para atualizar o esquema da tabela no MariaDB.

---

### 12. [FEAT] Feedback Automático de Conexão e Notificação Visual no Mattermost
- **Categoria**: Integração & Monitoramento
- **Rótulos**: `integrations`, `mattermost`, `feature`
- **Prioridade**: 🟡 Média
- **Descrição**: Implementar mecanismo transparente de feedback de conexão ao salvar a integração do Mattermost, exibindo status `HTTP 200 OK`, botão de teste e log explicativo na área de Atividade.
- **Checklist de Aceite**:
  - [x] Implementar chamada automática no método `on_update`.
  - [x] Adicionar o botão `🧪 Testar Conexão` no topo do formulário.
  - [x] Exibir banner verde de status e registrar log formatado na área de Atividade.
