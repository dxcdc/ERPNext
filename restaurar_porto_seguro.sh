#!/usr/bin/env bash
# ==============================================================================
# Script de Restauração Automática de Porto Seguro (Tema CDC + Workspaces + Asset Sync)
# ==============================================================================
set -e

echo "=== 1. Atualizando repositório para o Porto Seguro (v1.2.0-porto-seguro) ==="
git checkout main
git pull origin main

echo "=== 2. Aplicando a restauração automática de Workspaces e Tema no Banco ==="
BACKEND_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'backend-1|code-backend-1|nexterp-backend-1' | head -n 1)
FRONTEND_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'frontend-1|code-frontend-1|nexterp-frontend-1' | head -n 1)

if [ -z "$BACKEND_CONTAINER" ]; then
    echo "❌ Nenhum container backend do ERPNext encontrado rodando."
    exit 1
fi

echo "ℹ️ Usando o container backend: $BACKEND_CONTAINER"
docker exec "$BACKEND_CONTAINER" bench --site frontend migrate
docker exec "$BACKEND_CONTAINER" bench --site frontend build
docker exec "$BACKEND_CONTAINER" bench --site frontend clear-cache

if [ -n "$FRONTEND_CONTAINER" ] && [ "$FRONTEND_CONTAINER" != "$BACKEND_CONTAINER" ]; then
    echo "ℹ️ Sincronizando bundles de assets CSS/JS compilados para o container frontend ($FRONTEND_CONTAINER)..."
    rm -rf /tmp/frappe_dist_sync /tmp/erpnext_dist_sync
    docker cp "$BACKEND_CONTAINER":/home/frappe/frappe-bench/apps/frappe/frappe/public/dist /tmp/frappe_dist_sync
    docker cp "$BACKEND_CONTAINER":/home/frappe/frappe-bench/apps/erpnext/erpnext/public/dist /tmp/erpnext_dist_sync
    docker exec "$FRONTEND_CONTAINER" rm -rf /home/frappe/frappe-bench/apps/frappe/frappe/public/dist /home/frappe/frappe-bench/apps/erpnext/erpnext/public/dist
    docker cp /tmp/frappe_dist_sync "$FRONTEND_CONTAINER":/home/frappe/frappe-bench/apps/frappe/frappe/public/dist
    docker cp /tmp/erpnext_dist_sync "$FRONTEND_CONTAINER":/home/frappe/frappe-bench/apps/erpnext/erpnext/public/dist
    docker restart "$FRONTEND_CONTAINER"
fi

echo "=== ✅ Porto Seguro Restaurado com Sucesso! ==="
