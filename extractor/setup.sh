#!/bin/bash

echo "=============================================="
echo "   INICIANDO SETUP DO AMBIENTE PYTHON"
echo "=============================================="

PROJECT_DIR="$(pwd)"
VENV_DIR="$PROJECT_DIR/venv"
REQ_FILE="$PROJECT_DIR/requirements.txt"

echo "📁 Diretório do projeto: $PROJECT_DIR"

# ---------------------------------------------------------
# 1. Criar requirements.txt
# ---------------------------------------------------------
echo "📌 Criando arquivo requirements.txt..."

cat <<EOF > $REQ_FILE
pandas
requests
python-dotenv
schedule
mysql-connector-python
pyodbc
EOF

echo "✔ requirements.txt criado!"

# ---------------------------------------------------------
# 2. Criar ambiente virtual
# ---------------------------------------------------------
echo "📌 Criando ambiente virtual Python (venv)..."

python3 -m venv $VENV_DIR

if [ $? -ne 0 ]; then
    echo "❌ ERRO ao criar o venv. Instale o pacote python3-venv:"
    echo "   sudo apt install python3-venv -y"
    exit 1
fi

echo "✔ Ambiente virtual criado em: $VENV_DIR"

# ---------------------------------------------------------
# 3. Ativar e instalar pacotes
# ---------------------------------------------------------

echo "📌 Ativando venv..."
source $VENV_DIR/bin/activate

echo "📌 Instalando dependências..."
pip install --upgrade pip
pip install -r $REQ_FILE

echo "✔ Bibliotecas instaladas!"

# ---------------------------------------------------------
# 4. Permitir execução dos scripts Python
# ---------------------------------------------------------

chmod +x run_extractors.py
echo "✔ Permissão de execução aplicada ao run_extractors.py"

# ---------------------------------------------------------
# 5. Exibir instruções finais
# ---------------------------------------------------------

echo ""
echo "=============================================="
echo "   SETUP FINALIZADO COM SUCESSO! 🎉"
echo "=============================================="
echo ""
echo "🚀 Para rodar manualmente:"
echo "   source $VENV_DIR/bin/activate"
echo "   python run_extractors.py prod"
echo ""
echo "⏱ Para colocar no CRON, adicione esta linha:"
echo ""
echo "0 * * * * cd $PROJECT_DIR && $VENV_DIR/bin/python run_extractors.py prod >> $PROJECT_DIR/cron_log.txt 2>&1"
echo ""
echo "=============================================="
echo "Tudo pronto!"
echo "=============================================="
