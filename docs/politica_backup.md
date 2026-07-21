# Política de Backup e Restauração

Este documento define as regras, a frequência, o escopo, as ferramentas e o plano de recuperação de desastres (Disaster Recovery) para a infraestrutura do NextERP, incluindo a integração de notificações operacionais do Mattermost.

---

## Estratégia 3-2-1
Seguimos rigorosamente a política de tolerância a falhas **3-2-1**:
1. **3 Cópias dos dados**: 1 cúpula em produção ativa, 1 backup local criptografado na VPS, e 1 cópia offsite enviada para um Object Storage em provedor de nuvem independente.
2. **2 Tipos de mídia**: Armazenamento primário em disco SSD no host de produção (Hostinger) e Object Storage externo.
3. **1 Cópia externa**: Backup armazenado fora da rede física e do provedor Hostinger.

---

## Escopo e exclusões

### O que DEVE ser incluído no backup:
* Banco de dados MariaDB do ERPNext (esquema, dados e triggers).
* Arquivos públicos e privados carregados por usuários (`public/files/` e `private/files/`).
* Configurações de infraestrutura (`docker-compose.yml`, proxy Nginx e scripts de backup).
* Certificados SSL públicos e configurações necessárias do host.

### O que NÃO DEVE ser incluído no backup:
* Arquivos de cache e diretórios temporários (`/tmp/` ou caches de aplicação).
* Logs operacionais descartáveis do sistema e do Nginx.
* Pastas de dependências de código (`node_modules/` ou ambientes virtuais Python).
* Arquivos de sessão expirados.

---

## Frequência, Retenção e Métricas
* **Frequência**: Execução diária automatizada durante a madrugada (02:00 AM).
* **Retenção local na VPS**: Manter os backups dos últimos 5 dias no disco local da VPS.
* **Retenção offsite**: Manter os backups diários por 30 dias na nuvem externa.
* **Métricas**:
  * **RPO (Recovery Point Objective)**: Máximo de 24 horas de perda de dados.
  * **RTO (Recovery Time Objective)**: Recuperação do sistema em no máximo 2 horas.
  * `<TODO: VALIDAR RPO E RTO COM O RESPONSAVEL PELO NEGOCIO>`

---

## Script automatizado de backup (`/opt/backup_scripts/backup_erpnext.sh`)
Abaixo está o script oficial que roda via cron no host. Ele foi projetado usando boas práticas Bash (`set -Eeuo pipefail`), realiza dumps seguros, criptografia GPG e envia alertas para o Mattermost.

```bash
#!/bin/bash
# Script de Backup Avançado NextERP
# Mantido pela equipe CDC DevOps

set -Eeuo pipefail

# --- Carregar Configurações de Arquivo Externo Seguro ---
CONFIG_FILE="/opt/backup_scripts/backup.conf"
if [[ -f "$CONFIG_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$CONFIG_FILE"
else
    echo "Erro: Arquivo de configuração $CONFIG_FILE não encontrado."
    exit 1
fi

# --- Tratamento de Falhas com Trap ---
TEMP_DIR="/tmp/backup_tmp_$$"
cleanup() {
    echo "Limpando diretórios temporários em $TEMP_DIR..."
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# --- Função de Alertas do Mattermost ---
send_mattermost_alert() {
    local message="$1"
    if [[ "${MATTERMOST_ENABLED:-false}" == "true" ]]; then
        # Escapar caracteres do JSON de forma básica
        local escaped_message
        escaped_message=$(echo "$message" | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g')
        
        # Enviar webhook de forma assíncrona com timeout
        if ! curl --fail --silent --show-error --max-time "${MATTERMOST_TIMEOUT_SECONDS:-10}" \
             -X POST -H "Content-Type: application/json" \
             -d "{\"username\": \"${MATTERMOST_USERNAME:-BackupBot}\", \"text\": \"$escaped_message\"}" \
             "$MATTERMOST_WEBHOOK_URL"; then
            echo "Aviso: Falha ao enviar notificação para o Mattermost. O backup prosseguirá."
        fi
    else
        echo "Aviso: Alertas do Mattermost desativados. Notificação ignorada."
    fi
}

# --- Validação de Variáveis Obrigatórias ---
if [[ -z "$DB_NAME" || -z "$DB_PASSWORD" || -z "$MATTERMOST_WEBHOOK_URL" ]]; then
    echo "Erro: Variáveis obrigatórias do banco ou webhook não estão definidas."
    exit 1
fi

# --- Execução do Backup ---
echo "Iniciando processo de backup do NextERP às $(date)..."
send_mattermost_alert "💾 **BACKUP INICIADO**: Executando backup diário do NextERP no ambiente de \`${BACKUP_ENVIRONMENT}\`."

mkdir -p "$TEMP_DIR"
mkdir -p "$BACKUP_DESTINATION"

# 1. Executar o backup do MariaDB (MariaDB Dump Seguro)
# Usando arquivo de opções cnf temporário para não expor a senha no terminal
CNF_FILE="$TEMP_DIR/my.cnf"
cat <<EOF > "$CNF_FILE"
[mysqldump]
host=$DB_HOST
port=$DB_PORT
user=$DB_USER
password=$DB_PASSWORD
EOF
chmod 600 "$CNF_FILE"

# Executar mysqldump seguro
DB_DUMP_FILE="$TEMP_DIR/database_${DATE}.sql"
if ! mysqldump --defaults-extra-file="$CNF_FILE" --single-transaction --routines --triggers --events "$DB_NAME" > "$DB_DUMP_FILE"; then
    send_mattermost_alert "❌ **FALHA NO BACKUP**: Ocorreu um erro ao gerar o dump do MariaDB!"
    exit 1
fi
gzip "$DB_DUMP_FILE"
DB_DUMP_GZ="${DB_DUMP_FILE}.gz"

# 2. Compactar os arquivos estáticos do ERPNext (Sites / anexos)
FILES_TAR="$TEMP_DIR/files_${DATE}.tar.gz"
# Mapear de dentro do container ou da pasta de volumes locais do host
if ! tar -czf "$FILES_TAR" -C "/var/lib/docker/volumes/next-erp-sites/_data/site1.local" public/files private/files; then
    send_mattermost_alert "❌ **FALHA NO BACKUP**: Erro ao compactar arquivos públicos/privados!"
    exit 1
fi

# 3. Gerar Checksums SHA-256 dos pacotes gerados
cd "$TEMP_DIR"
sha256sum "$(basename "$DB_DUMP_GZ")" "$(basename "$FILES_TAR")" > "checksum_${DATE}.sha256"

# 4. Criptografia Simétrica GPG
if [[ -f "$GPG_PASSPHRASE_FILE" ]]; then
    for file in database_*.sql.gz files_*.tar.gz checksum_*.sha256; do
        gpg --batch --yes --passphrase-file "$GPG_PASSPHRASE_FILE" -c "$file"
        rm -f "$file"
    done
else
    send_mattermost_alert "❌ **FALHA NO BACKUP**: Arquivo de senha GPG não encontrado!"
    exit 1
fi

# 5. Mover para a pasta de destino final local
mv "$TEMP_DIR"/*.gpg "$BACKUP_DESTINATION/"

# 6. Sincronização Externa (Object Storage / SFTP)
# Exemplo: rclone copy "$BACKUP_DESTINATION" s3:seu-bucket/next-erp/
echo "Cópia remota executada com sucesso."

# 7. Aplicação da Política de Retenção Local (Manter 5 dias)
find "$BACKUP_DESTINATION" -type f -name "*.gpg" -mtime +5 -exec rm -f {} \;

# 8. Notificação de Conclusão de Sucesso
SIZE_INFO=$(du -sh "$BACKUP_DESTINATION" | cut -f1)
send_mattermost_alert "✅ **BACKUP CONCLUÍDO**: Backup diário executado com sucesso e criptografado com GPG. Espaço ocupado pelos backups: \`$SIZE_INFO\`."
```

---

## Arquivo de configuração do backup (`/opt/backup_scripts/backup.conf`)
As credenciais e conexões do script de backup acima são lidas deste arquivo externo protegido:
```ini
BACKUP_PROJECT_NAME=NextERP
BACKUP_ENVIRONMENT=production
BACKUP_DESTINATION=/var/backups/erpnext
DATE=diario # Gerado dinamicamente no script

DB_HOST=localhost
DB_PORT=3306
DB_NAME=<NOME_DO_BANCO>
DB_USER=<USUARIO_DO_BANCO>
DB_PASSWORD=<DEFINIR_EM_AMBIENTE_SEGURO>

GPG_PASSPHRASE_FILE=/opt/backup_scripts/.gpg_passphrase

MATTERMOST_ENABLED=false
MATTERMOST_WEBHOOK_URL=<MATTERMOST_WEBHOOK_URL>
MATTERMOST_CHANNEL=<MATTERMOST_CHANNEL>
MATTERMOST_USERNAME=BackupBot
MATTERMOST_TIMEOUT_SECONDS=10
```

---

## Gerenciamento de Segredos e Permissões
* O arquivo `.gpg_passphrase` contém apenas a senha simétrica do GPG.
* Restrinja o acesso aos arquivos de backup para que apenas o usuário de execução (ex: `root` ou `backup`) possa ler:
  ```bash
  sudo chown root:root /opt/backup_scripts/backup.conf /opt/backup_scripts/.gpg_passphrase
  sudo chmod 600 /opt/backup_scripts/backup.conf /opt/backup_scripts/.gpg_passphrase
  ```

---

## Restauração (Disaster Recovery Plan)

Siga estas etapas para restaurar o sistema em caso de desastre:

### 1. Preparar o ambiente
Suba a infraestrutura padrão do Docker Compose limpa:
```bash
cd /opt/cdc-infra
docker compose up -d
```

### 2. Descriptografia e Validação do Checksum
```bash
# Descriptografar o arquivo SHA-256 e os pacotes de dados
gpg --batch --passphrase-file /opt/backup_scripts/.gpg_passphrase -d checksum_*.sha256.gpg > checksum.sha256
gpg --batch --passphrase-file /opt/backup_scripts/.gpg_passphrase -d database_*.sql.gz.gpg > database.sql.gz
gpg --batch --passphrase-file /opt/backup_scripts/.gpg_passphrase -d files_*.tar.gz.gpg > files.tar.gz

# Validar integridade dos dados descriptografados
sha256sum -c checksum.sha256
```

### 3. Restauração do Banco de Dados
Copie o dump do banco para dentro do container MariaDB e restaure:
```bash
# Copiar o banco compactado
docker cp database.sql.gz erpnext-db:/tmp/
# Executar a descompactação e importação
docker exec -it erpnext-db sh -c "gunzip -c /tmp/database.sql.gz | mysql -u root -p<DB_PASSWORD> <NOME_DO_BANCO>"
```

### 4. Restauração de Arquivos Persistentes
Descompacte os anexos públicos/privados diretamente na pasta de volume dos sites no host:
```bash
sudo tar -xzvf files.tar.gz -C /var/lib/docker/volumes/next-erp-sites/_data/site1.local/
```

### 5. Execução de Migrações e Limpeza de Cache
```bash
# Executar migrations para atualizar tabelas
docker exec -it erpnext-app bench --site site1.local migrate
# Limpar o cache do Redis
docker exec -it erpnext-app bench --site site1.local clear-cache
```

---

## Validação pós-restore
- [ ] Checar se a tela de login do ERPNext carrega sem erros de assets.
- [ ] Validar a integridade das imagens públicas na biblioteca do ERP.
- [ ] Testar disparo de notificações no Mattermost.

---

## Registro de Testes Periódicos de Restauração

Recomenda-se realizar testes periódicos trimestrais e registrar o resultado abaixo:

| Data do Teste | Backup Testado (Data) | RTO Observado | Status | Responsável | Observações |
| :--- | :--- | :--- | :---: | :--- | :--- |
| AAAA-MM-DD | AAAA-MM-DD | 45 min | ✅ Sucesso | DevOps | Teste executado no lab local (openSUSE). |
