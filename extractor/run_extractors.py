#!/usr/bin/env python
# -*- coding: utf-8 -*-

import subprocess
import sys
import os
import time

SCRIPTS = [
    "1_armazem_v2.py",
    "2_Extrator_grupo_v2.py",
    "3_extratorUnidademedida.py",
    "4_Extrator_produtos_v2.py",
    "5_extrator_requisicoes_v2.py",
]

def run_script(script_name, env_name):
    """Executa um script Python individualmente, passando o env como parâmetro e variável de ambiente."""
    print(f"--- Iniciando {script_name} (env={env_name}) ---")
    start_time = time.time()

    # copia variáveis de ambiente atuais e adiciona o APP_ENV
    env_vars = os.environ.copy()
    env_vars["APP_ENV"] = env_name

    try:
        result = subprocess.run(
            [sys.executable, script_name, env_name],  # também passa como argumento
            check=True,
            capture_output=False,
            text=True,
            env=env_vars,  # <-- AQUI
        )
        elapsed = time.time() - start_time
        print(f"--- {script_name} concluído com sucesso em {elapsed:.2f} segundos ---\n")
        return True
    except subprocess.CalledProcessError as e:
        print(f"!!! ERRO ao executar {script_name} !!!")
        print(f"Código de saída: {e.returncode}")
        return False
    except Exception as e:
        print(f"!!! ERRO inesperado ao executar {script_name}: {e}")
        return False

def main():
    if len(sys.argv) > 1:
        env_name = sys.argv[1]
    else:
        env_name = "dev"

    base_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(base_dir)

    print(f"Iniciando execução sequencial de {len(SCRIPTS)} extratores...")
    print(f"Diretório de trabalho: {base_dir}")
    print(f"Ambiente (env): {env_name}\n")

    for script in SCRIPTS:
        if os.path.exists(script):
            success = run_script(script, env_name)
            if not success:
                print("Interrompendo a sequência devido a erro no script anterior.")
                sys.exit(1)
        else:
            print(f"!!! ARQUIVO NÃO ENCONTRADO: {script} !!!")
            sys.exit(1)

    print("Todos os extratores foram executados com sucesso!")

if __name__ == "__main__":
    main()
