#!/usr/bin/env python3
"""Compara produção e laboratório sem copiar registros nem executar escrita remota."""

import argparse
import json
import subprocess
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = ROOT / "shadow_reconciliation.json"

SQL = """
SELECT 'stock_entries', COUNT(*), COALESCE(MAX(modified), '') FROM `tabStock Entry`;
SELECT 'stock_entry_details', COUNT(*), COALESCE(MAX(modified), '') FROM `tabStock Entry Detail`;
SELECT 'stock_ledger', COUNT(*), COALESCE(MAX(modified), '') FROM `tabStock Ledger Entry`;
SELECT 'items', COUNT(*), COALESCE(MAX(modified), '') FROM `tabItem`;
SELECT 'warehouses', COUNT(*), COALESCE(MAX(modified), '') FROM `tabWarehouse`;
SELECT 'users', COUNT(*), COALESCE(MAX(modified), '') FROM `tabUser`;
CHECKSUM TABLE `tabStock Entry`, `tabStock Entry Detail`, `tabStock Ledger Entry`,
  `tabItem`, `tabWarehouse`, `tabBin`, `tabUser`, `tabCustom DocPerm`, `tabFile`;
"""


def run(command, sql):
    result = subprocess.run(
        command,
        input=sql,
        text=True,
        cwd=ROOT,
        capture_output=True,
        check=False,
        timeout=120,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or f"comando falhou: {command[0]}")
    return result.stdout


def parse(raw):
    metrics = {}
    checksums = {}
    for line in raw.splitlines():
        columns = line.split("\t")
        if len(columns) == 3:
            metrics[columns[0]] = {"count": int(columns[1]), "last_modified": columns[2] or None}
        elif len(columns) == 2 and ".tab" in columns[0]:
            table = columns[0].split(".", 1)[1]
            checksums[table] = int(columns[1]) if columns[1] != "NULL" else None
    return {"metrics": metrics, "checksums": checksums}


def compare(local, production):
    differences = []
    for section in ("metrics", "checksums"):
        keys = sorted(set(local[section]) | set(production[section]))
        for key in keys:
            if local[section].get(key) != production[section].get(key):
                differences.append({
                    "section": section,
                    "name": key,
                    "local": local[section].get(key),
                    "production": production[section].get(key),
                })
    return differences


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True, help="host SSH no formato usuario@endereco")
    parser.add_argument("--identity", required=True, help="caminho da chave SSH somente leitura")
    parser.add_argument("--local-container", default="nexterp-backend-1")
    parser.add_argument("--remote-container", default="frappe_docker-backend-1")
    parser.add_argument("--local-site", default="frontend")
    parser.add_argument("--remote-site", default="frontend")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    local_command = [
        "docker", "exec", "-i", args.local_container,
        "bench", "--site", args.local_site, "mariadb", "--skip-column-names",
    ]
    remote_command = [
        "ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
        "-i", str(Path(args.identity).expanduser()), args.host,
        "docker", "exec", "-i", args.remote_container,
        "bench", "--site", args.remote_site, "mariadb", "--skip-column-names",
    ]

    local = parse(run(local_command, SQL))
    production = parse(run(remote_command, SQL))
    differences = compare(local, production)
    report = {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "mode": "read-only-reconciliation",
        "source": args.host,
        "status": "ALIGNED" if not differences else "DIVERGED",
        "local": local,
        "production": production,
        "differences": differences,
    }
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "status": report["status"],
        "differences": len(differences),
        "output": str(args.output),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
