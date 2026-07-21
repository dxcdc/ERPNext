#!/bin/bash

###############################################################################
# Script único para:
# - Garantir ambiente virtual (venv)
# - Garantir requirements.txt
# - Instalar/atualizar bibliotecas Python no venv
# - Executar run_extractors.py com o ambiente correto
#
# Pode ser chamado diretamente pelo CRON.
###############################################################################

set -e  # se der erro em algum comando, o script para

# Descobre o diretório do próprio script (projeto)
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$PROJECT_DIR/venv"
REQ_FILE="$PROJECT_DIR/requirements.txt"
PYTHON_BIN="python3"   # ajusta se precisar

echo "==================== INÍCIO RUN_JOB.SH ===================="
echo "Data/Hora: $(date)"
echo "Projeto   : $PROJECT_DIR"
echo "Venv      : $VENV_DIR"
echo "Req file  : $REQ_FILE"
echo "==========================================================="

###############################################################################
# 1. Garantir arquivo requirements.txt
###############################################################################
if [ ! -f "$REQ_FILE" ]; then
  echo "[INFO] requirements.txt não encontrado. Criando padrão..."
  cat <<EOF > "$REQ_FILE"
pandas
requests
python-dotenv
schedule
mysql-connector-python
pyodbc
EOF
  echo "[OK] requirements.txt criado."
else
  echo "[INFO] requirements.txt já existe. Usando o existente."
fi

###############################################################################
# 2. Garantir ambiente virtual (venv)
###############################################################################
if [ ! -d "$VENV_DIR" ]; then
  echo "[INFO] venv não encontrado. Criando em: $VENV_DIR"
  $PYTHON_BIN -m venv "$VENV_DIR"
  echo "[OK] venv criado."
else
  echo "[INFO] venv já existe."
fi

###############################################################################
# 3. Ativar venv e instalar/atualizar bibliotecas
###############################################################################
echo "[INFO] Ativando venv..."
# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"

echo "[INFO] Atualizando pip..."
pip install --upgrade pip >/dev/null 2>&1 || echo "[WARN] Não foi possível atualizar pip (verifique depois)."

echo "[INFO] Instalando dependências do requirements.txt..."
pip install -r "$REQ_FILE"
echo "[OK] Dependências instaladas/atualizadas."

###############################################################################
# 4. Tornar o run_extractors.py executável (por segurança)
###############################################################################
if [ -f "$PROJECT_DIR/run_extractors.py" ]; then
  chmod +x "$PROJECT_DIR/run_extractors.py" || true
  echo "[OK] run_extractors.py tem permissão de execução."
else
  echo "[ERRO] Arquivo run_extractors.py NÃO encontrado em $PROJECT_DIR"
  echo "===================== FIM RUN_JOB.SH (ERRO) ====================="
  exit 1
fi

###############################################################################
# 5. Executar o script principal
###############################################################################
echo "[INFO] Executando run_extractors.py (env=prod)..."
cd "$PROJECT_DIR"
"$VENV_DIR/bin/python" "$PROJECT_DIR/run_extractors.py" prod

RETVAL=$?
echo "[INFO] run_extractors.py terminou com código: $RETVAL"

echo "===================== FIM RUN_JOB.SH ====================="
echo ""
exit $RETVAL
