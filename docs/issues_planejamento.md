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
