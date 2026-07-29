# Planejamento Estratégico de Issues e Backlog de Tarefas: NextERP (CDC)

Este documento estabelece o **inventário oficial de planejamento e backlog de tarefas** do projeto NextERP (CDC). Ele serve como referência para a automação de GitHub Issues e alinhamento de entregas de infraestrutura, segurança e governança.

---

## 📌 Inventário Geral de Tarefas Mapeadas

### 1. [ARCH] Conteinerização Completa e Isolamento de Recursos do Extrator
- **Categoria**: Arquitetura & Infraestrutura
- **Rótulos**: `enhancement`, `docker`, `architecture`
- **Prioridade**: 🔴 Alta
- **Descrição**: Empacotar o pipeline do extrator de dados (`run_job.sh`) e seus scripts Python em uma imagem Docker dedicada integrada à rede do Compose (`frappe_network`), isolando o consumo de recursos do host.
- **Checklist de Aceite**:
  - [ ] Criar `Dockerfile` otimizado para o serviço `cdc-extractor`.
  - [ ] Definir limites estritos de recursos no `docker-compose.yml` (`cpus: 0.5`, `memory: 512m`).
  - [ ] Substituir o cron do host por um agendador conteinerizado interno.

---

### 2. [FEAT] Otimização de Performance do Script de Produtos (Bulk Update)
- **Categoria**: Performance & Refatoração
- **Rótulos**: `performance`, `python`, `refactor`
- **Prioridade**: 🟡 Média
- **Descrição**: Refatorar o script `4_Extrator_produtos_v2.py` para substituir iterações individuais por requisições em lote (*bulk update / batching*) no ERPNext, reduzindo o tempo de execução de 4 minutos para menos de 30 segundos.
- **Checklist de Aceite**:
  - [ ] Implementar chamadas em lote nas requisições da API do ERPNext.
  - [ ] Reduzir o tempo total de execução para menos de 30 segundos.
  - [ ] Adicionar logs estruturados de tempo de resposta por lote.

---

### 3. [CONFIG] Migração do Motor de Backups para Rclone & CDC Backups Hub
- **Categoria**: Automação & Backups
- **Rótulos**: `backups`, `rclone`, `devops`
- **Prioridade**: 🔴 Alta
- **Descrição**: Substituir o script legado em Python (`bkp.py`) pelo utilitário profissional de linha de comando **Rclone**, utilizando as credenciais verificadas do projeto GCP `cdc-org` no Google Drive da CDC.
- **Checklist de Aceite**:
  - [ ] Configurar o Rclone na Hostinger VPS integrado ao Google Drive institucional da CDC.
  - [ ] Implementar verificação atômica por hash MD5/SHA256 após o upload.
  - [ ] Garantir renovação automática de tokens OAuth sem intervenção humana.

---

### 4. [FEAT] Implantação do Canal de Alertas e Notificações no Mattermost
- **Categoria**: Monitoramento & Integrações
- **Rótulos**: `monitoring`, `mattermost`, `integrations`
- **Prioridade**: 🟡 Média
- **Descrição**: Criar um mecanismo de notificação ativa que informe a equipe de TI no Mattermost sempre que o backup for concluído com sucesso ou falhar.
- **Checklist de Aceite**:
  - [ ] Criar Webhook de entrada no servidor Mattermost da CDC.
  - [ ] Integrar chamada cURL silenciosa nos scripts de backup e saúde do contêiner.
  - [ ] Enviar payload formatado com status, tamanho do arquivo e tempo decorrido.

---

### 5. [SECURITY] Hardening de Senhas em Texto Puro e Criptografia GPG nos Backups
- **Categoria**: Segurança & Criptografia
- **Rótulos**: `security`, `hardening`, `gpg`
- **Prioridade**: 🟣 Crítica
- **Descrição**: Eliminar senhas em texto claro (`admin`) dos arquivos de configuração e implementar criptografia assimétrica GPG nos backups offsite antes do envio ao Google Drive.
- **Checklist de Aceite**:
  - [ ] Mapear senhas do MariaDB para variáveis de ambiente criptografadas no arquivo `.env`.
  - [ ] Implementar chave assimétrica GPG para criptografar os dumps `.sql.gz` e arquivos `.tar` antes do upload.
  - [ ] Documentar o procedimento de decodificação de emergência com a chave privada.

---

### 6. [FEAT] Configuração do Ambiente Multi-Tenant de Treinamento (Sandbox)
- **Categoria**: Recursos & Treinamento
- **Rótulos**: `feature`, `multi-tenant`, `sandbox`
- **Prioridade**: 🟢 Baixa
- **Descrição**: Configurar um segundo site no Frappe/ERPNext (`treinamento.cdc.org.br`) na mesma VPS Hostinger para permitir que gestores e operadores realizem testes e treinamentos isolados da produção.
- **Checklist de Aceite**:
  - [ ] Executar o comando `bench new-site treinamento.cdc.org.br` na VPS.
  - [ ] Configurar rotina mensal automatizada para clonar o banco de produção para a base de treinamento.
  - [ ] Aplicar tema customizado no painel para diferenciar o ambiente de testes do oficial.

---

### 7. [FEAT] Criação do Módulo de Treinamento e Base de Dados para Capacitação
- **Categoria**: Capacitação & Treinamento
- **Rótulos**: `feature`, `training`, `sandbox`
- **Prioridade**: 🟡 Média
- **Descrição**: Desenvolver um módulo de testes e capacitação interativa no ERPNext contendo uma massa de dados fictícios para treinamento prático de operadores e gestores da CDC.
- **Checklist de Aceite**:
  - [ ] Gerar massa de dados de teste (produtos, fornecedores e requisições fictícias).
  - [ ] Configurar guia interativo de treinamento no painel principal do ERPNext.
  - [ ] Criar manual de usuário simplificado para a equipe de estoque.


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
