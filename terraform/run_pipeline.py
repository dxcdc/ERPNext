#!/usr/bin/env python3
"""Esteira reproduzível do laboratório CDC NextERP."""

import argparse
import json
import subprocess
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
RESULT_PATH = ROOT / "esteira_resultados.json"


def command(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def db_query(database, password, sql):
    return command(
        "docker", "exec", "-i", "nexterp-db-1", "mysql", "-N",
        "-u", "root", f"-p{password}", database, "-e", sql,
    )


def bench(site, method, kwargs=None):
    args = [
        "docker", "exec", "nexterp-backend-1", "bench", "--site", site,
        "execute", method,
    ]
    if kwargs is not None:
        args.extend(["--kwargs", json.dumps(kwargs, ensure_ascii=False)])
    return json.loads(command(*args))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", required=True)
    parser.add_argument("--database", required=True)
    parser.add_argument("--password", required=True)
    args = parser.parse_args()
    results = []

    def stage(number, title, test):
        started = time.time()
        try:
            details = test()
            status = "PASSED"
        except Exception as exc:  # mantém todas as etapas visíveis no relatório
            details = str(exc)
            status = "FAILED"
        duration = f"{time.time() - started:.2f}s"
        results.append({
            "stage": number, "title": title, "status": status,
            "duration": duration, "details": details,
        })
        icon = "✅" if status == "PASSED" else "❌"
        print(f"{icon} [{status}] Stage {number}: {title} ({duration})")

    def workspaces():
        visible = set(db_query(
            args.database, args.password,
            "SELECT name FROM tabWorkspace WHERE is_hidden=0;",
        ).splitlines())
        required = {"CDC Estoque", "CDC Usuários", "CDC Integrações", "CDC Pendências"}
        missing = required - visible
        assert not missing, f"Workspaces ausentes: {sorted(missing)}"
        return "Quatro workspaces CDC públicas e visíveis"

    def containers():
        running = set(command("docker", "ps", "--format", "{{.Names}}").splitlines())
        required = {
            "nexterp-backend-1", "nexterp-frontend-1", "nexterp-db-1",
            "nexterp-queue-long-1", "nexterp-queue-short-1",
            "nexterp-scheduler-1", "nexterp-websocket-1",
        }
        missing = required - running
        assert not missing, f"Contêineres ausentes: {sorted(missing)}"
        return "Serviços essenciais ativos"

    def assets():
        subprocess.check_call(
            ["node", "--check", str(ROOT / "apps/cdc_theme/cdc_theme/public/js/cdc_theme.js")],
            cwd=ROOT,
        )
        request = urllib.request.Request(
            "http://localhost:8085/assets/cdc_theme/js/cdc_theme.js?v=20260731_v150",
            headers={"User-Agent": "CDC-Test-Pipeline"},
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            body = response.read()
        assert response.status == 200 and len(body) > 50_000
        return f"Asset ativo via HTTP 200 ({len(body) // 1024} KB)"

    def stock_api():
        data = bench(args.site, "cdc_theme.api.get_stock_dashboard_data")
        assert data.get("total_warehouses") == 46
        assert "recent_entries" in data and "occurrences_data" in data
        for project in (
            "Projeto Atitude II.I", "Institucional / Geral", "Projeto Atitude",
            "Projeto Bem Viver", "Projeto Cais", "Projeto ATM",
        ):
            project_data = bench(
                args.site, "cdc_theme.api.get_stock_dashboard_data",
                {"selected_project": project},
            )
            assert project_data.get("selected_project") == project
        return "API do estoque e seis projetos validados"

    def users_pending():
        users = bench(args.site, "cdc_theme.api.get_users_dashboard_data")
        pending = bench(args.site, "cdc_theme.api.get_ongsys_pending_orders")
        assert users.get("summary", {}).get("total", 0) > 0
        assert "orders" in pending and "filters" in pending
        return f"{users['summary']['total']} usuários e {pending['summary']['total']} pendências"

    def routes_and_diagnostics():
        diagnostics = bench(args.site, "cdc_theme.api.run_stage_6_diagnostics")
        assert diagnostics.get("overall_stage_6_status") == "PASSED"
        source = (ROOT / "apps/cdc_theme/cdc_theme/public/js/cdc_theme.js").read_text()
        for route in (
            "/app/cdc-usuarios", "/app/cdc-integracoes", "/app/cdc-pendencias",
            "/app/stock-entry/view/report/Lancamento%20no%20Estoque%20-%20CDC",
        ):
            assert route in source, f"Rota ausente: {route}"
        return "Rotas canônicas e diagnóstico holístico aprovados"

    def inventory_report():
        chain = db_query(args.database, args.password, """
            SELECT CONCAT(reference_report,'|',disabled,'|',
              JSON_UNQUOTE(JSON_EXTRACT(json,'$.columns[0].label')))
            FROM tabReport WHERE name='Livro de Inventarios - CDC';
        """).strip()
        base = db_query(args.database, args.password, """
            SELECT CONCAT(reference_report,'|',disabled)
            FROM tabReport WHERE name='Livro de inventario - CDC';
        """).strip()
        assert chain == "Livro de inventario - CDC|0|Data", chain
        assert base == "Stock Ledger|0", base
        report = bench(
            args.site, "frappe.desk.query_report.run",
            {"report_name": "Livro de Inventarios - CDC", "filters": {}},
        )
        assert len(report.get("columns") or []) == 8
        assert len(report.get("result") or []) > 0
        return f"Livro de Inventário operacional com {len(report['result'])} linhas"

    def ongsys_and_terraform():
        index_count = db_query(args.database, args.password, """
            SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tabStock Entry'
              AND INDEX_NAME='uniq_stock_entry_idpedido_ongsys' AND NON_UNIQUE=0;
        """).strip()
        duplicates = db_query(args.database, args.password, """
            SELECT COUNT(*) FROM (
              SELECT idpedido_ongsys FROM `tabStock Entry`
              WHERE COALESCE(idpedido_ongsys,'')<>''
              GROUP BY idpedido_ongsys HAVING COUNT(*)>1
            ) duplicated;
        """).strip()
        assert index_count == "1" and duplicates == "0"
        integration_fields = db_query(args.database, args.password, """
            SELECT GROUP_CONCAT(CONCAT(fieldname, ':', fieldtype, ':', read_only,
              ':', no_copy, ':', COALESCE(depends_on,'')) ORDER BY fieldname SEPARATOR '|')
            FROM `tabCustom Field`
            WHERE dt='Stock Entry' AND fieldname IN
              ('cdc_ongsys_section', 'idpedido_ongsys', 'titulo_ongsys');
        """).strip()
        assert "cdc_ongsys_section:Section Break:0:1:eval:doc.idpedido_ongsys || doc.titulo_ongsys" in integration_fields
        assert "idpedido_ongsys:Data:1:1:" in integration_fields
        assert "titulo_ongsys:Small Text:1:1:" in integration_fields
        importer = (ROOT / "extractor/5_extrator_requisicoes_v2.py").read_text()
        for token in (
            "FAST_WINDOW_PAGES = 3", "FULL_IMPORT_INTERVAL_HOURS = 24",
            "require_response", "nenhum item válido",
        ):
            assert token in importer, f"Proteção ausente: {token}"
        api_source = (ROOT / "apps/cdc_theme/cdc_theme/api.py").read_text()
        assert "posting_date >= '2026-" not in api_source
        assert "tabStock Entry Detail" in api_source
        variables = (ROOT / "terraform/variables.tf").read_text()
        assert 'variable "restore_backup"' in variables and "default     = false" in variables
        subprocess.check_call(["bash", "-n", str(ROOT / "extractor/run_job.sh")])
        return "ONGSYS idempotente e restauração Terraform opt-in"

    stage(1, "Workspaces e banco", workspaces)
    stage(2, "Serviços e contêineres", containers)
    stage(3, "Assets e servidor web", assets)
    stage(4, "Estoque e projetos", stock_api)
    stage(5, "Usuários e pendências", users_pending)
    stage(6, "Rotas e diagnóstico", routes_and_diagnostics)
    stage(7, "Livro de Inventário", inventory_report)
    stage(8, "ONGSYS e Terraform seguro", ongsys_and_terraform)

    RESULT_PATH.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")
    failed = [result for result in results if result["status"] != "PASSED"]
    if failed:
        raise SystemExit(f"{len(failed)} etapa(s) falharam; consulte {RESULT_PATH}")
    print(f"✅ Esteira concluída: {len(results)}/{len(results)} etapas aprovadas")


if __name__ == "__main__":
    main()
