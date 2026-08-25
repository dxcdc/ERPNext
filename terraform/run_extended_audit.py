#!/usr/bin/env python3
"""Auditoria não bloqueante de perspectivas transversais do laboratório CDC."""

import argparse
import json
import os
import re
import subprocess
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "auditoria_perspectivas.json"


def command(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def db(database, password, sql):
    return command(
        "docker", "exec", "-i", "nexterp-db-1", "mysql", "-N",
        "-u", "root", f"-p{password}", database, "-e", sql,
    )


def function_source(source, name):
    match = re.search(
        rf"(?:@frappe\.whitelist\(\)\s*)?def {re.escape(name)}\([^)]*\):(?P<body>.*?)(?=\n(?:@frappe\.whitelist\(\)\s*)?def |\Z)",
        source,
        re.S,
    )
    return match.group("body") if match else ""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", required=True)
    parser.add_argument("--database", required=True)
    parser.add_argument("--password", required=True)
    args = parser.parse_args()
    findings = []

    def add(category, severity, code, title, evidence, recommendation):
        findings.append({
            "category": category,
            "severity": severity,
            "code": code,
            "title": title,
            "evidence": evidence,
            "recommendation": recommendation,
        })

    api = (ROOT / "apps/cdc_theme/cdc_theme/api.py").read_text()
    css = (ROOT / "apps/cdc_theme/cdc_theme/public/css/cdc_theme.css").read_text()
    pending_js = (ROOT / "apps/cdc_theme/cdc_theme/public/js/cdc_pending.js").read_text()

    for endpoint, permission in (
        ("get_stock_dashboard_data", "Stock Entry"),
        ("get_users_dashboard_data", "System User restrito"),
        ("test_mattermost_config", "CDC Mattermost Config"),
        ("diagnostico_mattermost", "CDC Mattermost Config"),
    ):
        body = function_source(api, endpoint)
        permission_guards = ("has_permission", "only_for", "_require_read_permission", "_require_system_manager")
        if not any(guard in body for guard in permission_guards):
            add(
                "security", "HIGH", f"AUTH-{endpoint}",
                f"Endpoint {endpoint} sem autorização explícita",
                f"Função whitelisted não valida permissão de {permission}.",
                "Adicionar frappe.has_permission/only_for antes de consultar ou enviar dados.",
            )

    users_body = function_source(api, "get_users_dashboard_data")
    if 'has_permission("User", "read")' in users_body and "System Manager" not in users_body:
        add(
            "security", "HIGH", "AUTH-USERS-SCOPE",
            "API de usuários aceita escopo amplo demais",
            "Teste com Website User retornou os 69 usuários porque a leitura de User é permitida nesse perfil.",
            "Restringir a System Manager ou a papéis operacionais explicitamente autorizados.",
        )

    if "SELECT title, error, creation" in api:
        add(
            "reliability", "HIGH", "MM-DIAG-COLUMN",
            "Diagnóstico Mattermost consulta coluna inexistente",
            "tabError Log nesta versão não possui a coluna title.",
            "Usar method como título compatível ou detectar a coluna disponível.",
        )

    mojibake = int(db(
        args.database, args.password,
        "SELECT COUNT(*) FROM tabWarehouse WHERE name REGEXP 'ï|¿|�';",
    ) or 0)
    if mojibake:
        add(
            "data_quality", "MEDIUM", "WAREHOUSE-ENCODING",
            "Armazém com codificação corrompida",
            f"{mojibake} registro(s) de Warehouse contêm caracteres de mojibake.",
            "Consolidar o registro sem uso com o nome Unicode correto após backup.",
        )

    integrity_sql = """
        SELECT
          (SELECT COUNT(*) FROM tabBin b LEFT JOIN tabWarehouse w ON w.name=b.warehouse WHERE w.name IS NULL),
          (SELECT COUNT(*) FROM tabBin WHERE actual_qty<0),
          (SELECT COUNT(*) FROM `tabStock Entry` se WHERE docstatus=1 AND NOT EXISTS
            (SELECT 1 FROM `tabStock Entry Detail` d WHERE d.parent=se.name)),
          (SELECT COUNT(*) FROM `tabCDC ONGSYS Pending Order` WHERE active=1 AND
            (LOWER(TRIM(order_type)) NOT IN ('produto', 'pedido de produto')
             OR status='Ordem finalizada' OR LOWER(status) LIKE '%cancel%'));
    """
    integrity = [int(value) for value in db(args.database, args.password, integrity_sql).split("\t")]
    if any(integrity):
        add(
            "data_quality", "HIGH", "DATA-INTEGRITY",
            "Inconsistência referencial ou operacional encontrada",
            f"órfãos={integrity[0]}, saldos negativos={integrity[1]}, sem itens={integrity[2]}, pendências inválidas={integrity[3]}",
            "Investigar os registros antes da próxima migração.",
        )

    sensitive = [
        ROOT / "bkp gcp/gcp-prod-site-config.json",
        ROOT / "bkp gcp/gcp-prod-database-latest.sql.gz",
        ROOT / "terraform/terraform.tfstate",
    ]
    permissive = [str(path.relative_to(ROOT)) for path in sensitive if path.exists() and (path.stat().st_mode & 0o077)]
    if permissive:
        add(
            "security", "MEDIUM", "LOCAL-FILE-MODE",
            "Arquivos sensíveis legíveis por outros usuários locais",
            ", ".join(permissive),
            "Aplicar chmod 600 aos backups sensíveis e estados Terraform.",
        )

    if 'id="cdc-pending-search"' in pending_js and 'id="cdc-pending-search" type="search" aria-label=' not in pending_js:
        add(
            "accessibility", "MEDIUM", "A11Y-PENDING-SEARCH",
            "Busca de pendências sem nome acessível",
            "O input depende apenas do placeholder.",
            "Adicionar label ou aria-label explícito.",
        )
    theme_js = (ROOT / "apps/cdc_theme/cdc_theme/public/js/cdc_theme.js").read_text()
    if "+ d.erro +" in theme_js or "+ (e.title || '') +" in theme_js:
        add(
            "security", "MEDIUM", "XSS-MM-DIAGNOSTIC",
            "Diagnóstico Mattermost injeta mensagens sem escape",
            "Erros e títulos são concatenados em innerHTML.",
            "Aplicar escapeCDC ou construir nós usando textContent.",
        )
    if "outline: none" in css and ":focus" not in css.replace(":focus-visible", ""):
        add(
            "accessibility", "MEDIUM", "A11Y-FOCUS",
            "Indicador de foco removido de controles",
            "Selects e buscas usam outline:none sem substituição geral de foco.",
            "Adicionar estilos :focus-visible com contraste suficiente.",
        )

    if "CURDATE()" in api:
        add(
            "time", "LOW", "TIME-DB-TZ",
            "API mistura data do banco UTC com fuso do site",
            "MariaDB usa UTC e o site usa America/Recife; CURDATE pode divergir perto da meia-noite.",
            "Passar datas calculadas pelo Frappe como parâmetros SQL.",
        )

    timings = {}
    for label, method in (
        ("stock", "cdc_theme.api.get_stock_dashboard_data"),
        ("users", "cdc_theme.api.get_users_dashboard_data"),
        ("pending", "cdc_theme.api.get_ongsys_pending_orders"),
    ):
        started = time.perf_counter()
        command(
            "docker", "exec", "nexterp-backend-1", "bench", "--site", args.site,
            "execute", method,
        )
        timings[label] = round(time.perf_counter() - started, 3)
    if max(timings.values()) > 5:
        add(
            "performance", "MEDIUM", "API-LATENCY",
            "API acima do limite automático",
            json.dumps(timings, ensure_ascii=False),
            "Capturar EXPLAIN e reduzir subconsultas correlacionadas.",
        )

    summary = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "findings": len(findings),
        "by_severity": {
            severity: sum(item["severity"] == severity for item in findings)
            for severity in ("HIGH", "MEDIUM", "LOW")
        },
        "integrity_checks": {
            "orphan_bins": integrity[0], "negative_bins": integrity[1],
            "submitted_without_items": integrity[2], "invalid_pending": integrity[3],
        },
        "api_timings_seconds_including_bench_startup": timings,
    }
    OUTPUT.write_text(json.dumps({"summary": summary, "findings": findings}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
