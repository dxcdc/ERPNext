#!/usr/bin/env bash
# ==============================================================================
# Script de Reinstalação e Limpeza Total do Ambiente Local (Docker + DB + Assets)
# ==============================================================================
set -e

echo "=== 1. Parando e removendo containers e volumes antigos... ==="
cd /home/vier/Documentos/Code/CDC/NextERP
docker compose down -v --remove-orphans || true

echo "=== 2. Subindo novos containers limpos... ==="
docker compose up -d

echo "=== 3. Aguardando o banco de dados inicializar (15 segundos)... ==="
sleep 15

echo "=== 4. Restaurando o banco de dados de produção (gcp-prod-database.sql.gz)... ==="
BACKEND_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'backend-1|nexterp-backend-1' | head -n 1)
DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'db-1|nexterp-db-1' | head -n 1)

if [ -z "$DB_CONTAINER" ]; then
    echo "❌ Container do banco de dados não encontrado."
    exit 1
fi

DB_NAME="_5e5899d8398b5f7b"
docker exec -i "$DB_CONTAINER" mysql -u root -p'admin' -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\`;"
zcat /home/vier/Documentos/Code/CDC/NextERP/backups/gcp-prod-database.sql.gz | docker exec -i "$DB_CONTAINER" mysql -u root -p'admin' "$DB_NAME"

echo "=== 5. Instalando cdc_theme em modo editável no backend... ==="
docker exec "$BACKEND_CONTAINER" /home/frappe/frappe-bench/env/bin/pip install -e /home/frappe/frappe-bench/apps/cdc_theme

echo "=== 6. Rodando restauração do Porto Seguro (bench migrate, bench build, fixture import e asset sync)... ==="
./restaurar_porto_seguro.sh

echo "=== ✅ Reinstalação Local Concluída com Sucesso! ==="
