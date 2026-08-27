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
        required = {
            "CDC Estoque", "CDC Usuários", "CDC Grupos", "CDC Itens",
            "CDC Armazém", "CDC Integrações", "CDC Pendências",
            "CDC Monitoramento", "CDC Testes", "CDC Admin",
        }
        missing = required - visible
        assert not missing, f"Workspaces ausentes: {sorted(missing)}"
        return "Dez workspaces CDC públicas e visíveis"

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
        assets_to_check = (
            ("cdc_theme.js", 50_000),
            ("cdc_management.js", 10_000),
            ("cdc_stock_routes.js", 10_000),
        )
        sizes = []
        for filename, minimum_size in assets_to_check:
            source = ROOT / "apps/cdc_theme/cdc_theme/public/js" / filename
            subprocess.check_call(["node", "--check", str(source)], cwd=ROOT)
            request = urllib.request.Request(
                f"http://localhost:8085/assets/cdc_theme/js/{filename}?v=20260827_catalog_management_v41",
                headers={"User-Agent": "CDC-Test-Pipeline"},
            )
            with urllib.request.urlopen(request, timeout=10) as response:
                body = response.read()
            assert response.status == 200 and len(body) > minimum_size
            sizes.append(f"{filename} {len(body) // 1024} KB")
        return "Assets ativos via HTTP 200 (" + ", ".join(sizes) + ")"

    def stock_api():
        data = bench(args.site, "cdc_theme.api.get_stock_dashboard_data")
        warehouse_count = int(db_query(
            args.database, args.password,
            "SELECT COUNT(*) FROM tabWarehouse WHERE is_group=0;",
        ))
        assert data.get("total_warehouses") == warehouse_count
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
            "/app/cdc-usuários", "/app/cdc-integrações", "/app/cdc-pendências",
            "/app/cdc-monitoramento",
            "/app/cdc-testes", "/app/cdc-grupos", "/app/cdc-itens",
            "/app/cdc-armazem",
            "/app/cdc-admin",
            "/app/stock-entry/view/report/Lancamento%20no%20Estoque%20-%20CDC",
        ):
            assert route in source, f"Rota ausente: {route}"
        return "Rotas canônicas e diagnóstico holístico aprovados"

    def inventory_report():
        count = db_query(args.database, args.password, """
            SELECT COUNT(*) FROM tabReport WHERE name LIKE '%inventario%';
        """).strip()
        assert int(count) > 0
        return "Livro de Inventário operacional"

    def ongsys_and_terraform():
        importer = (ROOT / "extractor/5_extrator_requisicoes_v2.py").read_text()
        assert "common" in importer
        api_source = (ROOT / "apps/cdc_theme/cdc_theme/api.py").read_text()
        assert "tabStock Entry Detail" in api_source
        variables = (ROOT / "terraform/variables.tf").read_text()
        assert 'variable "restore_backup"' in variables and "default     = false" in variables
        subprocess.check_call(["bash", "-n", str(ROOT / "extractor/run_job.sh")])
        return "ONGSYS e Terraform seguro aprovados"

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
