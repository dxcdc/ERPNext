#!/usr/bin/env bash
# ==============================================================================
# Script de Reinstalação e Limpeza Total do Ambiente Local (Docker + DB + Assets)
# ==============================================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "Arquivo .env ausente. Copie .env.example e defina as credenciais locais."
    exit 1
fi
set -a
source "$ENV_FILE"
set +a
: "${DB_ROOT_PASSWORD:?Defina DB_ROOT_PASSWORD no arquivo .env}"
: "${DB_PASSWORD:?Defina DB_PASSWORD no arquivo .env}"
: "${DB_NAME:?Defina DB_NAME no arquivo .env}"
if [[ ! "$DB_PASSWORD" =~ ^[A-Za-z0-9._~!@#%^+=-]+$ ]]; then
    echo "DB_PASSWORD contém caracteres não aceitos por este script de restauração."
    exit 1
fi

echo "=== 1. Parando e removendo containers e volumes antigos... ==="
cd "$PROJECT_ROOT"
docker compose down -v --remove-orphans || true

echo "=== 2. Subindo novos containers limpos... ==="
docker compose up -d

echo "=== 3. Aguardando o banco de dados inicializar (15 segundos)... ==="
sleep 15

echo "=== 4. Configurando diretório do site e usuários do banco... ==="
BACKEND_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'backend-1|code-backend-1|nexterp-backend-1' | head -n 1)
DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'db-1|code-db-1|nexterp-db-1' | head -n 1)

if [ -z "$DB_CONTAINER" ]; then
    echo "❌ Container do banco de dados não encontrado."
    exit 1
fi

BACKUP_FILE="${GCP_DATABASE_BACKUP:-$PROJECT_ROOT/backups/gcp-prod-database.sql.gz}"
docker exec -e MYSQL_PWD="$DB_ROOT_PASSWORD" -i "$DB_CONTAINER" mysql -u root -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\`;"
zcat "$BACKUP_FILE" | docker exec -e MYSQL_PWD="$DB_ROOT_PASSWORD" -i "$DB_CONTAINER" mysql -u root "$DB_NAME"
docker exec -e MYSQL_PWD="$DB_ROOT_PASSWORD" -i "$DB_CONTAINER" mysql -u root -e "CREATE USER IF NOT EXISTS '$DB_NAME'@'%' IDENTIFIED BY '$DB_PASSWORD'; GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_NAME'@'%'; FLUSH PRIVILEGES;"

docker exec "$BACKEND_CONTAINER" bash -c "
mkdir -p /home/frappe/frappe-bench/sites/frontend/logs
cat << 'EOF' > /home/frappe/frappe-bench/sites/frontend/site_config.json
{
 \"db_name\": \"$DB_NAME\",
 \"db_password\": \"$DB_PASSWORD\",
 \"db_host\": \"db\"
}
EOF
cat << 'EOF' > /home/frappe/frappe-bench/sites/common_site_config.json
{
 \"db_host\": \"db\",
 \"redis_cache\": \"redis://redis-cache:6379\",
 \"redis_queue\": \"redis://redis-queue:6379\",
 \"redis_socketio\": \"redis://redis-queue:6379\"
}
EOF
echo 'frontend' > /home/frappe/frappe-bench/sites/sites.txt
"

echo "=== 5. Instalando cdc_theme em modo editável no backend... ==="
docker exec "$BACKEND_CONTAINER" /home/frappe/frappe-bench/env/bin/pip install -e /home/frappe/frappe-bench/apps/cdc_theme

echo "=== 6. Rodando restauração do Porto Seguro (bench migrate, bench build, fixture import e asset sync)... ==="
./restaurar_porto_seguro.sh

echo "=== ✅ Reinstalação Local Concluída com Sucesso! ==="
