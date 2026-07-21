# Estratégia de Execução

Este documento descreve a estratégia de desenvolvimento, versionamento de branches, ambientes e critérios de promoção e rollback para o NextERP, integrando notificações operacionais do Mattermost.

---

## Visão geral
O projeto NextERP visa migrar um ERPNext legado (baseado no Frappe Framework v14) de uma máquina virtual na GCP para uma VPS na Hostinger com Docker Compose.

* **Objetivo principal**: Garantir resiliência, automação de backups, isolamento do Extrator de Dados e rastreabilidade via Git.
* **Componentes**: MariaDB (DB), Redis (Cache, Fila, SocketIO), ERPNext App, ERPNext Workers, ERPNext Scheduler, Nginx Web Proxy e o Extrator de Dados.
* **Mattermost**: Utilizado para notificar deploys, integrando logs operacionais sem expor credenciais.

---

## Organização dos repositórios
Adotamos uma abordagem multi-repositório para isolar a infraestrutura do código-fonte customizado:

* **`cdc-infra`** (`https://github.com/dxcdc/cdc-infra`): Contém as configurações do Docker Compose, proxy Nginx, scripts de backup, automação do crontab, Dockerfiles de infraestrutura, arquivos `.env.example` e a pasta do Extrator de Dados (`services/extractor/`).
* **`ERPNext`** (`https://github.com/dxcdc/ERPNext`): Mantém a aplicação customizada (Custom App) do Frappe ou customizações no core (fork) contendo as regras de negócio da empresa.

---

## Estratégia de branches
Para modificações na infraestrutura e código de customizações, seguimos o seguinte padrão de branches no Git:

* **`main`**: Código de produção estável. Todo merge em `main` reflete o estado atual dos servidores Hostinger.
* **`develop`**: Branch de integração para testes locais.
* **`feature/*`**: Ramificações para desenvolvimento de novas funcionalidades de infraestrutura ou do extrator.
* **`hotfix/*`**: Correções urgentes aplicadas diretamente em produção, com posterior merge de volta para a `develop`.

### Regras de Merge e Code Review:
* Commits devem ser claros e seguir convenções de commits semânticos.
* Nenhum pull request pode ser mesclado na `main` sem validação prévia no Laboratório Local (openSUSE).
* A documentação afetada deve ser modificada no mesmo Pull Request da alteração técnica.

---

## Ambientes
Os ambientes do projeto são configurados da seguinte maneira:

### 1. Desenvolvimento (Local Dev)
* **Objetivo**: Teste inicial de novos scripts do Extrator e customizações de código.
* **Acesso**: Máquina local do desenvolvedor (`127.0.0.1`).
* **Banco de dados**: Banco local vazio ou populado com dados fictícios.

### 2. Laboratório Local (Staging / Staging openSUSE)
* **Objetivo**: Homologação completa. Replicação do banco de dados e arquivos de produção sob contêineres Docker Compose.
* **Acesso**: SSH local/Console no openSUSE.
* **Banco de dados**: Cópia do banco de produção (anonimizada, dados sensíveis removidos ou mascarados).
* **Alertas**: Notificações direcionadas para o canal de testes do Mattermost.

> [!NOTE]
> **Justificativa e Raciocínio de Homologação no openSUSE local**:
> 1. **Prova de Restauração**: Validar a integridade física e lógica dos pacotes de backup gerados no GCP antes do deploy na Hostinger. Restaurar localmente garante que os arquivos não estão corrompidos e reduz a probabilidade de falhas durante a janela de downtime.
> 2. **Isolamento de Componentes Ocultos**: Testar a conteinerização e a comunicação de rede isolada do Extrator de Dados com a API do ERPNext em rede Docker local de forma segura, garantindo que regras de timeout e performance não causem exaustão de hardware na Hostinger.
> 3. **Validação do Ambiente (.env)**: Garantir que a transição de credenciais fixadas em código (`configs.json`) para variáveis de ambiente seguras (`.env`) funciona de maneira integrada e sem quebras de execução.

### 3. Produção (Hostinger VPS)
* **Objetivo**: Atendimento aos usuários finais da CDC.
* **Acesso**: Acesso restrito via chaves SSH ED25519 criptografadas com senha.
* **Alertas**: Canal oficial do Mattermost.

> [!WARNING]
> **Dados Pessoais e Sensíveis**: NUNCA copie bases de dados contendo informações pessoais de clientes/usuários da GCP para ambientes locais sem realizar previamente scripts de mascaramento/anonimização dos dados sensíveis.

---

## Fluxos funcionais importantes
*Não aplicável para este repositório de infraestrutura puro (cdc-infra), que gerencia apenas contêineres e configurações.*

`<TODO: DOCUMENTAR FLUXOS FUNCIONAIS CRITICOS — Descrever fluxos de negócio customizados caso novos Custom Apps do ERPNext sejam criados neste projeto>`

---

## Critérios de promoção
Uma release de infraestrutura ou do Extrator de Dados só pode ser promovida para produção (Hostinger) se cumprir todos os critérios abaixo:

- [ ] **Testes de Laboratório Concluídos**: Executado localmente no openSUSE com sucesso.
- [ ] **Build Válido**: Imagens Docker do Extrator construídas sem falhas.
- [ ] **Backup Realizado**: Backup de produção atualizado e verificado imediatamente antes do deploy.
- [ ] **Plano de Rollback Definido**: Comandos de reversão validados.
- [ ] **Documentação Atualizada**: `.env.example` e documentações do `docs/` revisadas.
- [ ] **Segredos Sanitizados**: Verificação rigorosa contra exposição de credenciais em logs ou arquivos.
- [ ] **Mattermost Validado**: Alertas de deploy configurados e prontos.

---

## Comunicação pelo Mattermost
Para manter a equipe informada sobre o status da infraestrutura, os deploys devem enviar mensagens no canal do Mattermost via webhooks. As mensagens devem ser objetivas e seguir os formatos recomendados abaixo:

### Início de Implantação:
```json
{
  "username": "DeployBot",
  "text": "🚀 **INÍCIO DE IMPLANTAÇÃO**: Atualizando infraestrutura do NextERP no ambiente de `production` (Servidor: <SSH_HOST>)."
}
```

### Finalização com Sucesso:
```json
{
  "username": "DeployBot",
  "text": "✅ **IMPLANTAÇÃO CONCLUÍDA**: NextERP atualizado com sucesso no ambiente de `production`. Imagens Docker recriadas."
}
```

### Falha e Rollback:
```json
{
  "username": "DeployBot",
  "text": "🚨 **FALHA DE IMPLANTAÇÃO**: Erro detectado no deploy de `production`. Executando rollback imediato de containers e banco."
}
```

---

## Rollback
Se a atualização falhar em produção, o plano de rollback deve ser executado de forma rápida:

### 1. Reversão de Código / Imagens Docker
Caso o erro esteja na nova versão das imagens do Extrator ou do ERPNext App, execute no host:
```bash
# Navegar até a pasta do docker-compose
cd /opt/cdc-infra

# Voltar o commit anterior da branch main
git checkout HEAD~1

# Recriar os contêineres usando as imagens anteriores
docker compose down
docker compose up -d --build
```

### 2. Reversão de Banco de Dados
Caso a atualização tenha executado migrations corrompidas no banco de dados, faça o restore do backup executado imediatamente antes da implantação (conforme etapas descritas em [politica_backup.md](./politica_backup.md)).
* Restaure o dump SQL utilizando `bench restore`.
* Dispare a notificação de rollback no Mattermost.
* Nunca tente debugar código quebrado diretamente no servidor de produção; execute o rollback primeiro e investigue os logs localmente.
