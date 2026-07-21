# Contexto do Projeto e Guia para Assistentes de IA

Este documento funciona como o **Co-Piloto Operacional** para inteligências artificiais. Ele contém o **Contexto do Projeto (System Context Block)**, **Restrições obrigatórias** e **Receitas de Prompts Rápidos** que alinham o assistente com a nossa arquitetura, segurança e stack tecnológica.

---

## 1. System Context (Contexto do Projeto)

### Visão Geral
O projeto **NextERP** é a migração e reestruturação DevOps do ambiente ERPNext legado da empresa CDC, atualmente na GCP, para um ambiente conteinerizado em Docker Compose hospedado na VPS Hostinger.

### Stack Tecnológica
* **Base do Sistema**: Frappe Framework v14 (ERPNext).
* **Banco de Dados**: MariaDB v10.6.
* **Cache e Filas**: Redis v6.2 (Redis-cache, Redis-queue, Redis-socketio).
* **Proxy Web**: Nginx v14.
* **Sincronização Externa**: Extrator de Dados (Python script).
* **Alertas**: Notificações via webhooks do Mattermost.

### Convenções de Infraestrutura e Código
* **Isolamento de Banco**: O MariaDB e as instâncias do Redis ficam na rede privada `backend-net` e **não** publicam portas no host.
* **Repositório de Infraestrutura**: Configurações de compose, backups, nginx e segredos ficam em `cdc-infra`.
* **Repositório de Aplicação**: Customizações do Frappe ficam separadas em `ERPNext` (Custom App).
* **Política de Backups**: Backups diários comprimidos, criptografados com GPG simétrico e com disparo de webhooks para o Mattermost.
* **Gargalos conhecidos**: O Extrator de Dados deve ser isolado na rede `extractor-net` e ter limites de recursos de hardware configurados.

---

## 2. Restrições obrigatórias
Ao propor ou executar alterações neste projeto, a IA deve respeitar rigorosamente as seguintes restrições:
1. **Não expor portas de banco de dados**: NUNCA configure `ports` no container `db` ou Redis em arquivos compose de produção.
2. **Não expor segredos**: Chaves, senhas, chaves privadas SSH e tokens de API devem ser parametrizados como variáveis `${VARIÁVEL}` e descritos apenas em `.env.example`.
3. **Não realizar alterações destrutivas**: Comandos como `rm -rf` em volumes do Docker ou exclusão de banco sem plano de rollback explícito são estritamente proibidos.
4. **Independência de Alertas**: Falhas de envio de alertas para o Mattermost não devem travar ou invalidar scripts críticos, como dumps de backup.
5. **Laboratório Local Primeiro**: Nenhuma alteração de infraestrutura pode ser implantada na Hostinger sem validação prévia no openSUSE.

---

## 3. Regras para respostas da IA
1. **Análise prévia**: Sempre leia a estrutura de arquivos e configurações antes de propor código ou alterações estruturais.
2. **Entregar códigos completos**: Forneça scripts de automação ou arquivos YAML completos. Não use reticências (`...`) ou comentários do tipo "coloque o resto aqui".
3. **Conexões SSH com placeholders**: Use placeholders específicos (`<SSH_HOST>`, `<SSH_USER>`, `<SSH_PORT>`) para todos os comandos de infraestrutura.
4. **Sanitização de logs**: Remova qualquer token de webhook, cookie ou segredo antes de colar logs de depuração.

---

## 4. Prompts rápidos (Receitas Reutilizáveis)

Abaixo estão os modelos de prompts estruturados para cada caso de uso. Copie o bloco correspondente e cole na IA para realizar tarefas específicas.

### 📋 Prompts de Suporte e Diagnóstico
*   **Diagnosticar erro**:
    *   *Contexto*: NextERP rodando sob contêineres Docker Compose.
    *   *Objetivo*: Identificar a causa de falhas operacionais ou logs de erro.
    *   *Restrições*: Comandos de leitura seguros (modo read-only), sem alterar dados ou reiniciar serviços.
    *   *Saída esperada*: Análise explicativa do log, comandos de depuração (`docker logs`, `ss`, `free`) e proposta de resolução.
    *   *Docs a revisar*: [docs/troubleshooting.md](./troubleshooting.md).
*   **Analisar logs**:
    *   *Contexto*: Depuração de falhas através de logs consolidados ou individuais.
    *   *Objetivo*: Identificar mensagens de aviso (WARNING) ou exceções de banco/Redis.
    *   *Restrições*: Filtrar logs sem expor credenciais em texto puro.
    *   *Saída esperada*: Linhas de erro interpretadas e comandos grep recomendados.
*   **Validar configuração de e-mail**:
    *   *Contexto*: ERPNext enviando e-mails automáticos via SMTP externo.
    *   *Objetivo*: Testar conectividade e autenticação SMTP.
    *   *Restrições*: Testes de rede por telnet/nc, sem cadastrar credenciais reais no terminal.
    *   *Saída esperada*: Passo a passo de teste de rede e configurações recomendadas no `.env.example`.
*   **Diagnosticar falha de notificação (Mattermost)**:
    *   *Contexto*: Webhooks operacionais de alertas com falhas de entrega.
    *   *Objetivo*: Identificar erros HTTP de payload (400) ou autenticação (403/404).
    *   *Restrições*: Não expor o webhook real no log de erros.
    *   *Saída esperada*: Teste manual curl e correção de escape JSON no script.

### 🐳 Prompts de Infraestrutura e Docker
*   **Corrigir container**:
    *   *Contexto*: Container em loop de restart ou falhando no healthcheck.
    *   *Objetivo*: Trazer o contêiner de volta à saúde operativa estável.
    *   *Restrições*: Sem remover volumes de dados persistidos (`docker compose down -v` proibido em produção).
    *   *Saída esperada*: Correção do arquivo compose ou do `.env` local e comando de restart.
    *   *Docs a revisar*: [docs/ajuda_infra.md](./ajuda_infra.md).
*   **Melhorar performance**:
    *   *Contexto*: Lentidão nos processos em segundo plano ou interface do NextERP.
    *   *Objetivo*: Otimizar limites de CPU/memória e parâmetros de cache do Redis.
    *   *Restrições*: Sem comprometer a estabilidade do MariaDB ou segurança física.
    *   *Saída esperada*: Bloco YAML com limites de recursos e configurações recomendadas do Redis.
*   **Revisar permissões**:
    *   *Contexto*: Erros de escrita em volumes Docker ou chaves SSH expostas.
    *   *Objetivo*: Ajustar a propriedade dos arquivos para UID/GID 1000.
    *   *Restrições*: NUNCA recomendar `chmod 777`. Indicar apenas caminhos mínimos e `chown`.
*   **Configurar alertas no Mattermost**:
    *   *Contexto*: Criação de canais de notificação de monitoramento e deploys.
    *   *Objetivo*: Mapear variáveis de webhook no Docker Compose e scripts.
    *   *Restrições*: Webhook mantido como secret no `.env`.
    *   *Saída esperada*: Variáveis integradas e payloads JSON recomendados.
*   **Testar webhook do Mattermost**:
    *   *Contexto*: Validação de novos canais de comunicação.
    *   *Objetivo*: Enviar uma mensagem manual de teste.
    *   *Restrições*: Usar a variável `$MATTERMOST_WEBHOOK_URL` exportada.
    *   *Saída esperada*: Comando curl funcional.

### 💾 Prompts de Backup, Restauração e Segurança
*   **Criar backup**:
    *   *Contexto*: Execução periódica de dumps de banco e compressão de arquivos.
    *   *Objetivo*: Gerar backup criptografado do MariaDB e anexos do NextERP.
    *   *Restrições*: Usar a estratégia 3-2-1 e criptografia simétrica GPG sem credenciais explícitas no script.
    *   *Saída esperada*: Script de backup e tarefa no Cron.
    *   *Docs a revisar*: [docs/politica_backup.md](./politica_backup.md).
*   **Restaurar backup**:
    *   *Contexto*: Recuperação de desastres ou testes locais em openSUSE.
    *   *Objetivo*: Descriptografar e importar a base de dados MariaDB.
    *   *Restrições*: Sem apagar os volumes de produção ou banco de forma irreversível.
    *   *Saída esperada*: Linhas de comando descriptografadas e importações `bench restore`.
*   **Revisar segurança**:
    *   *Contexto*: Auditoria de código e infraestrutura contra vazamentos.
    *   *Objetivo*: Validar o repositório contra exposição de credenciais.
    *   *Restrições*: Auditoria baseada em varredura grep de padrões de senhas.
    *   *Saída esperada*: Relatório de sanidade ou arquivos a serem incluídos no `.gitignore`.
*   **Verificar exposição de segredos**:
    *   *Contexto*: Varredura pré-commit.
    *   *Objetivo*: Garantir conformidade de segurança.
    *   *Restrições*: Nenhuma senha real pode subir para o Git.
    *   *Saída esperada*: Comando de auditoria local com grep.
*   **Revisar o `.env.example`**:
    *   *Contexto*: Sincronização de variáveis do projeto.
    *   *Objetivo*: Garantir que o `.env.example` contém todos os placeholders necessários.
    *   *Restrições*: Sem segredos em texto puro.
    *   *Saída esperada*: Bloco do arquivo atualizado contendo os placeholders adequados.

### 📦 Prompts de Desenvolvimento e Releases
*   **Criar migration**:
    *   *Contexto*: Alterações de tabelas ou modificações estruturais do MariaDB.
    *   *Objetivo*: Criar arquivos de migração do Frappe para serem rodados via bench.
    *   *Restrições*: Sem perdas de integridade de schemas e tabelas.
    *   *Saída esperada*: Comandos Python do Frappe para geração de patches.
*   **Atualizar dependências**:
    *   *Contexto*: Atualização de bibliotecas Python ou imagens de container.
    *   *Objetivo*: Incrementar versões sem causar quebras ou loops nos contêineres.
    *   *Restrições*: Mapear compatibilidade do Frappe Framework v14.
    *   *Saída esperada*: Comandos de alteração no `requirements.txt` e reconstrução de imagens.
*   **Criar documentação**:
    *   *Contexto*: Inclusão de novas regras de infraestrutura ou processos operacionais.
    *   *Objetivo*: Gerar documentação no padrão da pasta `docs/`.
    *   *Restrições*: Seguir rigorosamente as regras de governança e links relativos.
    *   *Saída esperada*: Markdown estruturado contendo tabela de alterações e datas.
    *   *Docs a revisar*: [docs/diretrizes_documentacao.md](./diretrizes_documentacao.md).
*   **Analisar incidente**:
    *   *Contexto*: Ocorrência de indisponibilidade em produção.
    *   *Objetivo*: Criar o relatório formal do pós-incidente.
    *   *Restrições*: Abordagem sem culpabilização de indivíduos (blameless).
    *   *Saída esperada*: Preenchimento do Postmortem contendo timeline e 5 Porquês.
    *   *Docs a revisar*: [docs/postmortem.md](./postmortem.md).
*   **Criar plano de rollback**:
    *   *Contexto*: Deploys falhos ou atualizações corrompidas.
    *   *Objetivo*: Desfazer alterações técnicas e restaurar o estado estável.
    *   *Restrições*: Deve ser executável em no máximo 10 minutos.
    *   *Saída esperada*: Passo a passo de reversão de commits, imagens e dados.
*   **Corrigir interface**:
    *   *Contexto*: Erros de CSS/SCSS desalinhados ou botões não funcionais.
    *   *Objetivo*: Limpar caches do Frappe e compilar assets.
    *   *Restrições*: Sem alterar APIs públicas de layout.
    *   *Saída esperada*: Comandos de build de assets do Frappe e verificação no host.
*   **Preparar release / Preparar implantação**:
    *   *Contexto*: Lançamento de nova versão estável na Hostinger VPS.
    *   *Objetivo*: Validar checklist e enviar comunicações de deploy.
    *   *Restrições*: Atendimento completo aos critérios de promoção do ambiente.
    *   *Saída esperada*: Checklist preenchido e mensagem de deploy JSON para Mattermost.
    *   *Docs a revisar*: [docs/estrategia_execucao.md](./estrategia_execucao.md).
