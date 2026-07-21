# Registro de Descoberta: VM GCP prod1 (Exemplo / Higienizado)

Este arquivo é uma cópia higienizada e segura para o Git do mapeamento (Fase 1) da infraestrutura antiga na GCP. As credenciais reais foram substituídas por placeholders.

---

## 🔑 Acesso e Rede (GCP)
*   **Nome do Servidor**: `prod1`
*   **Projeto no GCP**: `cdc-org`
*   **Zona**: `us-central1-a`
*   **IP Externo Atual (GCP)**: `136.113.22.112`
*   **IP Interno**: `10.128.0.16`
*   **Usuário de Conexão Local (openSUSE)**: `dxcdc` (chave privada: `~/.ssh/id_ed25519`)
*   **Domínio do ERPNext**: `estoque.cdc.org.br`

---

## 🐳 Arquitetura do Docker (frappe_docker)
*   **Diretório do Docker Compose**: `/home/gt_transformadigital/frappe_docker`
*   **Arquivo de Configuração**: `pwd.yml` (gerenciado via `sudo docker compose -f pwd.yml ...`)
*   **Versão do ERPNext/Frappe**: `v15.88.1`
*   **Senha do root do MariaDB (db)**: `<DB_ROOT_PASSWORD>`
*   **Nome do Site no ERPNext**: `frontend`
*   **Portas Publicadas**: Apenas a `8080:8080` do container frontend.
*   **Volumes Docker**: `db-data`, `sites`, `logs`, `redis-queue-data`.

---

## 🌐 Servidor Web e SSL (Host OS)
*   **Servidor Web**: Caddy (Systemd).
*   **Arquivo de Configuração**: `/etc/caddy/Caddyfile`
*   **Regra Ativa**:
    ```text
    estoque.cdc.org.br {
        reverse_proxy localhost:8080
    }
    ```

---

## 📋 Automações e Scripts Ocultos (Cronjobs)

### 1. Extrator de Dados
*   **Pasta**: `/home/gt_transformadigital/scripts/cdcimplant/`
*   **Script de Entrada (Cron)**: `run_job.sh`
*   **Script Lógico Principal**: `run_extractors.py`
*   **Integração Externa**: Conecta-se via HTTPS em `www.ongsys.com.br` (porta 443).
*   **Observação**: O pacote `pyodbc` é código morto e não precisa de drivers ODBC na Hostinger.

### 🔑 Credenciais do Extrator (`configs.json` higienizado)
```json
{
    "ERPNext_URL": "https://estoque.cdc.org.br",
    "ERPNext_API_KEY": "<ERPNEXT_API_KEY>",
    "ERPNext_API_SECRET": "<ERPNEXT_API_SECRET>",
    "ONGSYS_URL_BASE": "https://www.ongsys.com.br/app/index.php/api/v2",
    "ONGSYS_USERNAME": "<ONGSYS_USERNAME>",
    "ONGSYS_PASSWORD": "<ONGSYS_PASSWORD_HASH>",
    "ERPNext_WAREHOUSE": "Stores - CDC"
}
```

---

### 2. Rotina de Backup
*   **Pasta**: `/home/gt_transformadigital/scripts_backup/`
*   **Script**: `bkp.py`
*   **ID da Pasta do Google Drive**: `1FpmuE_sEy6Qaw2x91q7-NeOKFsGZq2Eu`
*   **Integração**: Faz dump do site `frontend` e envia para o Google Drive (`token.pickle`).
*   **Frequência**: Duas vezes ao dia (12h00 e 18h00 horário local).
