#!/usr/bin/env bash

set -Eeuo pipefail

SITE="${SITE:-frontend}"
URL="${URL:-http://localhost:8085}"
WAIT_SECONDS="${WAIT_SECONDS:-120}"
CHECK_ONLY=0

usage() {
  cat <<'EOF'
Uso: ./scripts/reparar_tema.sh [--check]

Recupera o ambiente local e republica o tema CDC de forma idempotente.

Opcoes:
  --check   Somente diagnostica; nao inicia, recompila ou reinicia servicos.
  -h        Mostra esta ajuda.

Variaveis opcionais: SITE, URL e WAIT_SECONDS.
EOF
}

log() { printf '[tema] %s\n' "$*"; }
fail() { printf '[tema] ERRO: %s\n' "$*" >&2; exit 1; }

while (($#)); do
  case "$1" in
    --check) CHECK_ONLY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "opcao desconhecida: $1" ;;
  esac
  shift
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

command -v docker >/dev/null || fail "Docker nao encontrado."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 nao encontrado."
docker info >/dev/null 2>&1 || fail "Docker nao esta em execucao."

[[ -f docker-compose.yml ]] || fail "docker-compose.yml nao encontrado em $ROOT_DIR."
[[ -f apps/cdc_theme/cdc_theme/public/css/cdc_theme.css ]] || fail "CSS do cdc_theme nao encontrado."
[[ -f apps/cdc_theme/cdc_theme/public/js/cdc_theme.js ]] || fail "JavaScript do cdc_theme nao encontrado."
[[ -f apps/cdc_theme/cdc_theme/public/js/cdc_management.js ]] || fail "JavaScript dos paineis gerenciais nao encontrado."
[[ -f apps/cdc_theme/cdc_theme/public/js/cdc_stock_routes.js ]] || fail "JavaScript dos relatorios de estoque nao encontrado."

log "validando configuracao e fontes do tema"
docker compose config --quiet
if command -v node >/dev/null; then
  while IFS= read -r js_file; do node --check "$js_file"; done < <(find apps/cdc_theme/cdc_theme/public/js -type f -name '*.js' -print)
else
  log "aviso: Node.js local ausente; validacao sintatica de JavaScript ignorada"
fi
python3 -m py_compile apps/cdc_theme/cdc_theme/api.py apps/cdc_theme/cdc_theme/hooks.py

if ((CHECK_ONLY)); then
  log "estado atual dos servicos"
  docker compose ps -a
  exit 0
fi

wait_for_service() {
  local service="$1" elapsed=0
  until docker compose exec -T "$service" true >/dev/null 2>&1; do
    ((elapsed >= WAIT_SECONDS)) && fail "$service nao ficou disponivel em ${WAIT_SECONDS}s. Consulte: docker compose logs $service"
    sleep 2
    elapsed=$((elapsed + 2))
  done
}

wait_for_site() {
  local elapsed=0
  until docker compose exec -T backend bench --site "$SITE" list-apps >/dev/null 2>&1; do
    ((elapsed >= WAIT_SECONDS)) && fail "o site $SITE nao respondeu em ${WAIT_SECONDS}s. Consulte: docker compose logs backend db"
    sleep 2
    elapsed=$((elapsed + 2))
  done
}

log "iniciando banco e Redis"
docker compose up -d db redis-cache redis-queue
wait_for_service db
wait_for_service redis-cache
wait_for_service redis-queue

log "atualizando a configuracao compartilhada"
docker compose run --rm configurator

log "iniciando backend"
docker compose up -d backend
wait_for_service backend
wait_for_site

docker compose exec -T backend bench --site "$SITE" list-apps | grep -q '^cdc_theme[[:space:]]' \
  || fail "cdc_theme nao esta instalado no site $SITE. A instalacao automatica foi evitada para nao alterar dados."

log "recompilando assets do cdc_theme"
docker compose exec -T backend bench build --app cdc_theme
docker compose exec -T backend bench --site "$SITE" clear-cache
docker compose exec -T backend bench --site "$SITE" clear-website-cache

log "reiniciando os servicos da aplicacao"
docker compose up -d websocket queue-short queue-long scheduler frontend
docker compose restart backend websocket queue-short queue-long scheduler frontend

for service in backend websocket queue-short queue-long scheduler frontend; do
  wait_for_service "$service"
done

log "verificando assets publicados"
curl --fail --silent --show-error --retry 15 --retry-delay 2 \
  "$URL/assets/cdc_theme/css/cdc_theme.css" >/dev/null \
  || fail "CSS nao foi publicado em $URL. Consulte: docker compose logs frontend backend"
curl --fail --silent --show-error --retry 15 --retry-delay 2 \
  "$URL/assets/cdc_theme/js/cdc_theme.js" >/dev/null \
  || fail "JavaScript nao foi publicado em $URL. Consulte: docker compose logs frontend backend"
curl --fail --silent --show-error --retry 15 --retry-delay 2 \
  "$URL/assets/cdc_theme/js/cdc_management.js" >/dev/null \
  || fail "JavaScript dos paineis gerenciais nao foi publicado em $URL. Consulte: docker compose logs frontend backend"
curl --fail --silent --show-error --retry 15 --retry-delay 2 \
  "$URL/assets/cdc_theme/js/cdc_stock_routes.js" >/dev/null \
  || fail "JavaScript dos relatorios de estoque nao foi publicado em $URL. Consulte: docker compose logs frontend backend"

log "tema recuperado e publicado em $URL"
docker compose ps
