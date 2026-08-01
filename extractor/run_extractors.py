#!/usr/bin/env python
# -*- coding: utf-8 -*-

import subprocess
import sys
import os
import time
from pathlib import Path

CATALOG_SCRIPTS = [
    "1_armazem_v2.py",
    "2_Extrator_grupo_v2.py",
    "3_extratorUnidademedida.py",
    "4_Extrator_produtos_v2.py",
]
HOURLY_SCRIPTS = [
    "5_sync_ongsys_pending.py",
    "5_extrator_requisicoes_v2.py",
]
CATALOG_INTERVAL_SECONDS = 24 * 60 * 60

def run_script(script_name, env_name, force_full=False):
    """Executa um script Python individualmente, passando o env como parâmetro e variável de ambiente."""
    print(f"--- Iniciando {script_name} (env={env_name}) ---")
    start_time = time.time()

    # copia variáveis de ambiente atuais e adiciona o APP_ENV
    env_vars = os.environ.copy()
    env_vars["APP_ENV"] = env_name

    try:
        command = [sys.executable, script_name, env_name]
        if force_full and script_name.startswith("5_"):
            command.append("--full")
        subprocess.run(
            command,
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
    positional = [arg for arg in sys.argv[1:] if not arg.startswith("--")]
    env_name = positional[0] if positional else "dev"
    force_full = "--full" in sys.argv

    base_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(base_dir)

    catalog_marker = Path(base_dir) / ".last_catalog_sync"
    catalog_due = force_full or not catalog_marker.exists() or (
        time.time() - catalog_marker.stat().st_mtime >= CATALOG_INTERVAL_SECONDS
    )
    scripts = (CATALOG_SCRIPTS if catalog_due else []) + HOURLY_SCRIPTS
    print(f"Iniciando execução sequencial de {len(scripts)} extratores...")
    print(f"Diretório de trabalho: {base_dir}")
    print(f"Ambiente (env): {env_name}")
    print(f"Catálogos: {'sincronização diária' if catalog_due else 'ignorados nesta janela'}\n")

    for script in scripts:
        if os.path.exists(script):
            success = run_script(script, env_name, force_full=force_full)
            if not success:
                print("Interrompendo a sequência devido a erro no script anterior.")
                sys.exit(1)
        else:
            print(f"!!! ARQUIVO NÃO ENCONTRADO: {script} !!!")
            sys.exit(1)

    if catalog_due:
        catalog_marker.touch()

    print("Todos os extratores foram executados com sucesso!")

if __name__ == "__main__":
    main()
