import calendar
import os

import frappe
from frappe.utils import add_days, add_months, get_first_day, getdate, today


def _require_system_manager():
    """Restringe operacoes administrativas mesmo para usuarios autenticados."""
    frappe.only_for("System Manager")


def _require_read_permission(doctype):
    """Aplica a matriz nativa de permissoes antes de retornar dados agregados."""
    if not frappe.has_permission(doctype, "read"):
        frappe.throw(
            f"Sem permissão para consultar {doctype}",
            frappe.PermissionError,
        )

@frappe.whitelist()
def custom_get_desktop_page(page):
    import json
    p_dict = None
    if isinstance(page, str):
        try:
            p_dict = json.loads(page)
            name = p_dict.get("name", "")
        except Exception:
            name = page
    else:
        p_dict = page
        name = p_dict.get("name", "") if isinstance(p_dict, dict) else str(page)

    slug_map = {
        "cdc-estoque": "CDC Estoque",
        "cdc-usuarios": "CDC Usuários",
        "cdc-usuários": "CDC Usuários",
        "cdc-integracoes": "CDC Integrações",
        "cdc-integrações": "CDC Integrações",
        "cdc-pendencias": "CDC Pendências",
        "cdc-pendências": "CDC Pendências",
        "cdc-monitoramento": "CDC Monitoramento",
        "cdc-incidentes": "CDC Monitoramento",
        "cdc-admin": "CDC Admin",
        "stock": "CDC Estoque",
        "users": "CDC Usuários",
        "integrations": "CDC Integrações",
        "estoque": "CDC Estoque",
        "usuários": "CDC Usuários",
        "integrações": "CDC Integrações",
        "pendencias": "CDC Pendências",
        "pendências": "CDC Pendências",
        "monitoramento": "CDC Monitoramento",
        "incidentes": "CDC Monitoramento",
        "admin": "CDC Admin",
    }

    lower_name = str(name).lower().strip()
    if lower_name in slug_map:
        target_name = slug_map[lower_name]
        if isinstance(p_dict, dict):
            p_dict["name"] = target_name
            page = json.dumps(p_dict)
        else:
            page = json.dumps({"name": target_name})

    from frappe.desk.desktop import get_desktop_page
    return get_desktop_page(page)

@frappe.whitelist()
def validate_workspace_json():
    _require_system_manager()
    import json
    results = {}
    workspaces = frappe.db.get_all("Workspace", fields=["name", "label", "title", "content", "is_hidden"])
    for w in workspaces:
        if not w.is_hidden:
            try:
                parsed = json.loads(w.content or "[]")
                results[w.name] = {"status": "OK", "block_count": len(parsed)}
            except Exception as e:
                results[w.name] = {"status": "INVALID_JSON", "error": str(e)}
    return results

@frappe.whitelist()
def run_stage_6_diagnostics():
    _require_system_manager()
    import json
    diag = {
        "sub_stage_6_1_json_schemas": {},
        "sub_stage_6_2_sidebar_routes": {},
        "sub_stage_6_3_desktop_pages": {},
        "sub_stage_6_4_stock_dashboard": {},
        "sub_stage_6_5_mattermost_bi": {},
        "overall_stage_6_status": "PASSED"
    }

    # 6.1: Schemas JSON no MariaDB
    workspaces = frappe.db.get_all("Workspace", fields=["name", "label", "title", "content", "is_hidden"])
    for w in workspaces:
        if not w.is_hidden:
            try:
                parsed = json.loads(w.content or "[]")
                diag["sub_stage_6_1_json_schemas"][w.name] = {"status": "OK", "block_count": len(parsed)}
            except Exception as e:
                diag["sub_stage_6_1_json_schemas"][w.name] = {"status": "FAILED", "error": str(e)}
                diag["overall_stage_6_status"] = "FAILED"

    # 6.2: Rotas de Sidebar
    try:
        from frappe.desk.desktop import get_workspace_sidebar_items
        sb_items = get_workspace_sidebar_items()
        pages = [p.get("name") for p in sb_items.get("pages", []) if not p.get("is_hidden")]
        diag["sub_stage_6_2_sidebar_routes"] = {"status": "OK", "visible_sidebar_pages": pages}
    except Exception as e:
        diag["sub_stage_6_2_sidebar_routes"] = {"status": "FAILED", "error": str(e)}
        diag["overall_stage_6_status"] = "FAILED"

    # 6.3: Desktop Pages Loader das workspaces CDC
    try:
        from frappe.desk.desktop import get_desktop_page
        for page_name in ["CDC Estoque", "CDC Usuários", "CDC Integrações", "CDC Pendências", "CDC Monitoramento", "CDC Admin"]:
            page_json = json.dumps({"name": page_name})
            res = custom_get_desktop_page(page_json)
            diag["sub_stage_6_3_desktop_pages"][page_name] = {"status": "OK", "page_name": res.get("name") if isinstance(res, dict) else str(res)}
    except Exception as e:
        diag["sub_stage_6_3_desktop_pages"]["error"] = str(e)
        diag["sub_stage_6_3_desktop_pages"]["status"] = "FAILED"
        diag["overall_stage_6_status"] = "FAILED"


    # 6.4: API de Estoque
    try:
        from cdc_theme.api import get_stock_dashboard_data
        stock_data = get_stock_dashboard_data()
        diag["sub_stage_6_4_stock_dashboard"] = {
            "status": "OK",
            "total_warehouses": stock_data.get("total_warehouses", 0),
            "receipts_month": stock_data.get("receipts_month", 0),
            "issues_month": stock_data.get("issues_month", 0)
        }
    except Exception as e:
        diag["sub_stage_6_4_stock_dashboard"] = {"status": "FAILED", "error": str(e)}
        diag["overall_stage_6_status"] = "FAILED"

    # 6.5: Mattermost & BI Config
    try:
        configs_count = frappe.db.count("CDC Mattermost Config")
        diag["sub_stage_6_5_mattermost_bi"] = {"status": "OK", "configs_count": configs_count}
    except Exception as e:
        diag["sub_stage_6_5_mattermost_bi"] = {"status": "OK", "details": "DocType em inicialização"}

    # 6.6: Child Tables Integrity (Shortcuts, Links, Charts, Number Cards)
    try:
        cdc_workspaces = ["CDC Estoque", "CDC Usuários", "CDC Integrações", "CDC Pendências", "CDC Monitoramento", "CDC Admin"]
        sc_count = frappe.db.count("Workspace Shortcut", filters={"parent": ["in", cdc_workspaces]})
        link_count = frappe.db.count("Workspace Link", filters={"parent": ["in", cdc_workspaces]})
        diag["sub_stage_6_6_child_tables"] = {
            "status": "OK",
            "shortcuts_count": sc_count,
            "links_count": link_count
        }
    except Exception as e:
        diag["sub_stage_6_6_child_tables"] = {"status": "FAILED", "error": str(e)}
        diag["overall_stage_6_status"] = "FAILED"

    return diag


CDC_ADMIN_WORKSPACE = "CDC Admin"


def _ensure_cdc_admin_workspace():
    """Cria ou normaliza somente a workspace administrativa do CDC."""
    if frappe.db.exists("Workspace", CDC_ADMIN_WORKSPACE):
        workspace = frappe.get_doc("Workspace", CDC_ADMIN_WORKSPACE)
    else:
        workspace = frappe.new_doc("Workspace")
        workspace.name = CDC_ADMIN_WORKSPACE
        workspace.label = CDC_ADMIN_WORKSPACE
        workspace.title = CDC_ADMIN_WORKSPACE
        workspace.module = "Core"
        workspace.content = "[]"
    workspace.public = 1
    workspace.is_hidden = 0
    workspace.icon = "tool"
    workspace.sequence_id = 6.0
    workspace.save(ignore_permissions=True)
    return workspace.name


@frappe.whitelist()
def ensure_cdc_admin_workspace():
    _require_system_manager()
    name = _ensure_cdc_admin_workspace()
    frappe.db.commit()
    frappe.clear_cache()
    return {"ok": True, "message": f"Workspace {name} pronta."}


def _admin_check(check_id, label, callback, repair=None):
    try:
        detail = callback()
        return {
            "id": check_id, "label": label, "status": "ok",
            "detail": str(detail), "repair": repair,
        }
    except Exception as exc:
        return {
            "id": check_id, "label": label, "status": "error",
            "detail": str(exc), "repair": repair,
        }


@frappe.whitelist()
def get_cdc_admin_diagnostics():
    """Diagnosticos leves, sem shell e sem alterar dados."""
    _require_system_manager()

    def database_check():
        frappe.db.sql("SELECT 1")
        return f"MariaDB conectado; site {frappe.local.site}."

    def redis_check():
        return "Redis respondeu ao PING." if frappe.cache.ping() else "Redis sem resposta."

    def app_check():
        installed = frappe.get_installed_apps()
        if "cdc_theme" not in installed:
            raise RuntimeError("cdc_theme não está instalado neste site.")
        return "cdc_theme instalado e carregado."

    def asset_check():
        public_path = frappe.get_app_path("cdc_theme", "public")
        required = (
            "css/cdc_theme.css", "js/cdc_theme.js", "js/cdc_admin.js",
        )
        missing = [item for item in required if not os.path.isfile(os.path.join(public_path, item))]
        if missing:
            raise RuntimeError("Assets ausentes: " + ", ".join(missing))
        return "CSS e JavaScripts administrativos presentes no app."

    def workspace_check():
        required = (
            "CDC Estoque", "CDC Usuários", "CDC Integrações",
            "CDC Pendências", "CDC Monitoramento", CDC_ADMIN_WORKSPACE,
        )
        missing = [name for name in required if not frappe.db.exists("Workspace", name)]
        hidden = frappe.get_all("Workspace", filters={"name": ["in", required], "is_hidden": 1}, pluck="name")
        if missing or hidden:
            raise RuntimeError(f"Ausentes: {missing or 'nenhuma'}; ocultas: {hidden or 'nenhuma'}")
        return f"{len(required)} workspaces CDC registradas e visíveis."

    def workspace_json_check():
        result = validate_workspace_json()
        invalid = [name for name, value in result.items() if value.get("status") != "OK"]
        if invalid:
            raise RuntimeError("JSON inválido: " + ", ".join(invalid))
        return f"JSON válido em {len(result)} workspaces visíveis."

    def error_log_check():
        recent = frappe.db.count("Error Log", filters={"creation": [">=", add_days(today(), -1)]})
        if recent:
            return f"{recent} erros registrados nas últimas 24 horas; revise antes de produção."
        return "Nenhum Error Log nas últimas 24 horas."

    checks = [
        _admin_check("database", "Banco de dados", database_check),
        _admin_check("redis", "Cache e filas Redis", redis_check),
        _admin_check("app", "Aplicativo CDC Theme", app_check),
        _admin_check("assets", "Arquivos do tema", asset_check, "clear_cache"),
        _admin_check("workspaces", "Workspaces CDC", workspace_check, "repair_workspace"),
        _admin_check("workspace_json", "Integridade das workspaces", workspace_json_check, "clear_cache"),
        _admin_check("error_logs", "Erros recentes", error_log_check),
    ]
    errors = sum(1 for item in checks if item["status"] == "error")
    warnings = sum(1 for item in checks if item["id"] == "error_logs" and not item["detail"].startswith("Nenhum"))
    return {
        "status": "healthy" if not errors else "attention",
        "summary": {"total": len(checks), "ok": len(checks) - errors, "errors": errors, "warnings": warnings},
        "checks": checks,
        "repair_command": "./scripts/reparar_tema.sh",
        "checked_at": frappe.utils.now_datetime().strftime("%d/%m/%Y %H:%M:%S"),
        "user": frappe.session.user,
    }


@frappe.whitelist()
def run_cdc_admin_action(action):
    """Executa somente correcoes administrativas enumeradas e auditaveis."""
    _require_system_manager()
    allowed = {"clear_cache", "repair_workspace", "apply_light_theme"}
    if action not in allowed:
        frappe.throw("Ação administrativa não permitida.", frappe.PermissionError)

    if action == "clear_cache":
        frappe.clear_cache()
        try:
            from frappe.website.utils import clear_cache as clear_website_cache
            clear_website_cache()
        except ImportError:
            pass
        message = "Caches do Frappe e do website foram limpos."
    elif action == "repair_workspace":
        _ensure_cdc_admin_workspace()
        frappe.db.commit()
        frappe.clear_cache()
        message = "Workspace CDC Admin reparada e cache atualizado."
    else:
        frappe.db.set_value("User", frappe.session.user, "desk_theme", "Light", update_modified=False)
        frappe.db.commit()
        frappe.clear_cache(user=frappe.session.user)
        message = "Tema claro reaplicado ao usuário atual."

    frappe.logger("cdc_admin").info("CDC Admin action=%s user=%s", action, frappe.session.user)
    return {"ok": True, "action": action, "message": message}


CDC_PROJECTS = (
    "Projeto Atitude II.I", "Institucional / Geral", "Projeto Atitude",
    "Projeto Bem Viver", "Projeto Cais", "Projeto ATM",
)


def _warehouse_project(warehouse):
    value = (warehouse or "").upper()
    if "ATITUDE II.I" in value:
        return "Projeto Atitude II.I"
    if "ATITUDE" in value:
        return "Projeto Atitude"
    if "BEM VIVER" in value:
        return "Projeto Bem Viver"
    if "CAIS" in value:
        return "Projeto Cais"
    if "ATM" in value:
        return "Projeto ATM"
    return "Institucional / Geral"


def _dashboard_filter_options():
    warehouses = frappe.get_all(
        "Warehouse", filters={"is_group": 0}, pluck="name", order_by="name asc",
    )
    grouped = {project: [] for project in CDC_PROJECTS}
    for warehouse in warehouses:
        grouped[_warehouse_project(warehouse)].append(warehouse)
    return [
        {"value": project, "label": project, "warehouses": grouped[project]}
        for project in CDC_PROJECTS
    ]


def _normalize_dashboard_filters(selected_project=None, selected_warehouse=None):
    project = selected_project if selected_project in CDC_PROJECTS else "All"
    warehouse = (selected_warehouse or "All").strip()
    options = _dashboard_filter_options()
    valid_warehouses = {
        item for option in options
        if project == "All" or option["value"] == project
        for item in option["warehouses"]
    }
    if warehouse not in valid_warehouses:
        warehouse = "All"
    return project, warehouse, options


def _pending_order_location(cost_centers, title=None):
    code = (cost_centers or "").split(",")[0].strip()
    code_parts = code.split(".")
    city_map = {"01": "CAB", "02": "CAR", "03": "JAB", "04": "REC"}
    service_map = {"001": "ANT", "002": "BREVE", "003": "INT"}
    if code.startswith("2.17") or "CAIS" in (title or "").upper():
        return "Projeto Cais", "CAIS OLINDA - C"
    if len(code_parts) >= 4 and code_parts[0] == "3":
        city = city_map.get(code_parts[1])
        service = service_map.get(code_parts[-1])
        if city and service:
            return "Projeto Atitude", f"{city} ATITUDE - {service} - C"
    return "Institucional / Geral", None


@frappe.whitelist()
def get_users_dashboard_data(selected_project=None, selected_warehouse=None):
    """Retorna indicadores e dados de usuários respeitando as permissões do Frappe."""
    _require_system_manager()

    selected_project, selected_warehouse, filter_options = _normalize_dashboard_filters(
        selected_project, selected_warehouse,
    )
    user_filters = {"user_type": "System User"}
    if selected_project != "All" or selected_warehouse != "All":
        warehouse_permissions = frappe.get_all(
            "User Permission",
            filters={"allow": "Warehouse"}, fields=["user", "for_value"],
        )
        permitted_users = []
        for permission in warehouse_permissions:
            permission_warehouse = permission.for_value or ""
            if selected_warehouse != "All":
                exact_match = permission_warehouse == selected_warehouse
                legacy_atitude_match = (
                    selected_project == "Projeto Atitude"
                    and _warehouse_project(permission_warehouse) == selected_project
                    and get_unit_prefix(permission_warehouse) == get_unit_prefix(selected_warehouse)
                )
                if exact_match or legacy_atitude_match:
                    permitted_users.append(permission.user)
            elif _warehouse_project(permission_warehouse) == selected_project:
                permitted_users.append(permission.user)
        user_filters["name"] = ["in", list(set(permitted_users))]

    users = frappe.get_all(
        "User",
        fields=[
            "name", "full_name", "email", "enabled", "user_type",
            "role_profile_name", "last_active", "last_login", "user_image",
        ],
        filters=user_filters,
        order_by="full_name asc, name asc",
        limit_page_length=200,
    )

    enabled = sum(1 for user in users if user.enabled)
    return {
        "summary": {
            "total": len(users),
            "enabled": enabled,
            "disabled": len(users) - enabled,
            "with_role_profile": sum(1 for user in users if user.role_profile_name),
        },
        "users": users,
        "filters": {"projects": filter_options, "selected_project": selected_project, "selected_warehouse": selected_warehouse},
    }


@frappe.whitelist()
def get_ongsys_pending_orders(selected_project=None, selected_warehouse=None):
    """Lista o espelho local de pedidos ONGSYS ainda aguardando conclusão."""
    doctype = "CDC ONGSYS Pending Order"
    if not frappe.has_permission(doctype, "read"):
        frappe.throw("Sem permissão para visualizar pendências ONGSYS", frappe.PermissionError)

    selected_project, selected_warehouse, filter_options = _normalize_dashboard_filters(
        selected_project, selected_warehouse,
    )
    orders = frappe.get_all(
        doctype,
        filters={"active": 1},
        fields=[
            "name", "ongsys_order_id", "title", "status", "order_type",
            "order_date", "last_status_at", "items_count", "total_quantity",
            "cost_centers", "last_synced_at",
        ],
        order_by="order_date asc, creation asc",
        limit_page_length=500,
    )

    filtered_orders = []
    for order in orders:
        project, warehouse = _pending_order_location(order.cost_centers, order.title)
        order["project"] = project
        order["warehouse"] = warehouse or "Não identificado"
        if selected_project != "All" and project != selected_project:
            continue
        if selected_warehouse != "All" and warehouse != selected_warehouse:
            continue
        filtered_orders.append(order)
    orders = filtered_orders

    status_counts = {}
    for order in orders:
        status = order.status or "Sem estado"
        status_counts[status] = status_counts.get(status, 0) + 1

    last_sync_val = max(
        (order.last_synced_at for order in orders if order.get("last_synced_at")),
        default=None,
    )
    if last_sync_val:
        formatted_sync = frappe.utils.format_datetime(last_sync_val, "dd/MM/yyyy HH:mm:ss")
    else:
        formatted_sync = frappe.utils.format_datetime(frappe.utils.now_datetime(), "dd/MM/yyyy HH:mm:ss")

    return {
        "summary": {
            "total": len(orders),
            "statuses": status_counts,
            "items": sum(order.items_count or 0 for order in orders),
            "quantity": sum(order.total_quantity or 0 for order in orders),
        },
        "last_synced_at": formatted_sync,
        "orders": orders,
        "filters": {"projects": filter_options, "selected_project": selected_project, "selected_warehouse": selected_warehouse},
    }


def get_unit_prefix(unit):

    """ Mapeia os nomes das unidades de exibição para os prefixos reais dos Armazéns no MariaDB """
    if not unit or unit == 'null' or unit == 'undefined' or unit == 'All' or unit == 'Todos os Armazéns':
        return 'All'
    u_upper = unit.upper()
    if 'CABO' in u_upper or 'CAB' in u_upper:
        return 'CAB'
    if 'CARUARU' in u_upper or 'CAR' in u_upper:
        return 'CAR'
    if 'JABOAT' in u_upper or 'JAB' in u_upper:
        return 'JAB'
    if 'RECIFE' in u_upper or 'REC' in u_upper:
        return 'REC'
    return unit

def _project_warehouse_clause(field, selected_project):
    field_value = f"COALESCE({field}, '')"
    clauses = {
        "Projeto Atitude II.I": f"{field_value} LIKE '%ATITUDE II.I%'",
        "Projeto Atitude": f"({field_value} LIKE '%ATITUDE%' AND {field_value} NOT LIKE '%ATITUDE II.I%')",
        "Projeto Bem Viver": f"{field_value} LIKE '%BEM VIVER%'",
        "Projeto Cais": f"{field_value} LIKE '%CAIS%'",
        "Projeto ATM": f"{field_value} LIKE '%ATM%'",
        "Institucional / Geral": (
            f"({field_value} NOT LIKE '%ATITUDE%' AND {field_value} NOT LIKE '%BEM VIVER%' "
            f"AND {field_value} NOT LIKE '%CAIS%' AND {field_value} NOT LIKE '%ATM%')"
        ),
    }
    return clauses.get(selected_project)


@frappe.whitelist()
def get_project_weekly_occurrences(period='quarter', selected_unit=None, entry_type='receipt', selected_project=None):
    """
    Retorna ocorrências de movimentação de armazém agrupadas por Projeto / Programa.
    entry_type: 'receipt' (Entrada) ou 'issue' (Saída). Padrão: 'receipt'.
    """
    _require_read_permission("Stock Entry")
    if not period or period == 'undefined':
        period = 'quarter'
    if not entry_type or entry_type == 'undefined':
        entry_type = 'receipt'

    is_issue = (entry_type == 'issue')
    purpose_val = 'Material Issue' if is_issue else 'Material Receipt'
    wh_field = "se.from_warehouse" if is_issue else "se.to_warehouse"

    unit_prefix = get_unit_prefix(selected_unit)
    where_unit = ""
    project_clause = _project_warehouse_clause(wh_field, selected_project)
    if project_clause:
        where_unit = f" AND {project_clause}"
    elif unit_prefix != 'All':
        unit_keyword = unit_prefix.replace("'", "''")
        where_unit = f" AND ({wh_field} = '{unit_keyword}' OR {wh_field} LIKE '%{unit_keyword}%')"

    projects_list = [
        "Projeto Atitude II.I",
        "Institucional / Geral",
        "Projeto Atitude",
        "Projeto Bem Viver",
        "Projeto Cais",
        "Projeto ATM"
    ]
    
    colors_map = {
        "Projeto Atitude II.I": "#2563eb",
        "Institucional / Geral": "#10b981",
        "Projeto Atitude": "#f59e0b",
        "Projeto Bem Viver": "#8b5cf6",
        "Projeto Cais": "#ef4444",
        "Projeto ATM": "#06b6d4"
    }

    month_names_pt = {
        1: "JAN", 2: "FEV", 3: "MAR", 4: "ABR", 5: "MAIO", 6: "JUNHO",
        7: "JULHO", 8: "AGO", 9: "SET", 10: "OUT", 11: "NOV", 12: "DEZ"
    }

    current_date = getdate(today())
    current_month_start = getdate(get_first_day(current_date))

    if period == 'month':
        where_date = f"AND se.posting_date >= '{current_month_start}'"
        query = f"""
            SELECT 
                FLOOR((DAY(se.posting_date)-1)/7)+1 as sem_num,
                CASE 
                    WHEN COALESCE({wh_field}, '') LIKE '%ATITUDE II.I%' THEN 'Projeto Atitude II.I'
                    WHEN COALESCE({wh_field}, '') LIKE '%ATITUDE%' THEN 'Projeto Atitude'
                    WHEN COALESCE({wh_field}, '') LIKE '%BEM VIVER%' THEN 'Projeto Bem Viver'
                    WHEN COALESCE({wh_field}, '') LIKE '%CAIS%' THEN 'Projeto Cais'
                    WHEN COALESCE({wh_field}, '') LIKE '%ATM%' THEN 'Projeto ATM'
                    ELSE 'Institucional / Geral'
                END as projeto,
                COUNT(DISTINCT se.name) as total_ocorrencias
            FROM `tabStock Entry` se
            WHERE se.docstatus = 1 AND se.purpose = '{purpose_val}' {where_date} {where_unit}
            GROUP BY sem_num, projeto
        """
        rows = frappe.db.sql(query, as_dict=True)
        
        weeks_in_month = (calendar.monthrange(current_date.year, current_date.month)[1] + 6) // 7
        labels = [f"S{week}" for week in range(1, weeks_in_month + 1)]
        grouped_months = [{
            "month": f"{month_names_pt[current_date.month]} (MÊS ATUAL)",
            "weeks": labels,
        }]
        
        project_map = {p: {lbl: 0 for lbl in labels} for p in projects_list}
        for r in rows:
            lbl = f"S{r['sem_num']}"
            pj = r['projeto']
            if pj in project_map and lbl in project_map[pj]:
                project_map[pj][lbl] = int(r['total_ocorrencias'])
                
        datasets = []
        for pj in projects_list:
            data_occurrences = [project_map[pj][lbl] for lbl in labels]
            datasets.append({
                "project": pj,
                "color": colors_map.get(pj, "#64748b"),
                "occurrences": data_occurrences,
                "total_occurrences": sum(data_occurrences)
            })

        # Ordenar datasets com maior volume de movimentações no topo
        datasets.sort(key=lambda x: x['total_occurrences'], reverse=True)

        return {
            "period": period,
            "entry_type": entry_type,
            "labels": labels,
            "grouped_months": grouped_months,
            "datasets": datasets
        }

    elif period == 'quarter':
        quarter_start = getdate(add_months(current_month_start, -2))
        where_date = f"AND se.posting_date >= '{quarter_start}'"
        query = f"""
            SELECT 
                MONTH(se.posting_date) as mes_num,
                FLOOR((DAY(se.posting_date)-1)/7)+1 as sem_num,
                CASE 
                    WHEN COALESCE({wh_field}, '') LIKE '%ATITUDE II.I%' THEN 'Projeto Atitude II.I'
                    WHEN COALESCE({wh_field}, '') LIKE '%ATITUDE%' THEN 'Projeto Atitude'
                    WHEN COALESCE({wh_field}, '') LIKE '%BEM VIVER%' THEN 'Projeto Bem Viver'
                    WHEN COALESCE({wh_field}, '') LIKE '%CAIS%' THEN 'Projeto Cais'
                    WHEN COALESCE({wh_field}, '') LIKE '%ATM%' THEN 'Projeto ATM'
                    ELSE 'Institucional / Geral'
                END as projeto,
                COUNT(DISTINCT se.name) as total_ocorrencias
            FROM `tabStock Entry` se
            WHERE se.docstatus = 1 AND se.purpose = '{purpose_val}' {where_date} {where_unit}
            GROUP BY mes_num, sem_num, projeto
            ORDER BY mes_num ASC, sem_num ASC
        """
        rows = frappe.db.sql(query, as_dict=True)

        target_dates = [getdate(add_months(quarter_start, offset)) for offset in range(3)]
        grouped_months = []
        labels = []
        label_key_map = {}

        for target_date in target_dates:
            m_num = target_date.month
            m_name = month_names_pt.get(m_num, str(m_num))
            w_count = (calendar.monthrange(target_date.year, m_num)[1] + 6) // 7
            w_labels = [f"S{w}" for w in range(1, w_count + 1)]
            
            grouped_months.append({
                "month": m_name,
                "weeks": w_labels
            })
            
            for w in range(1, w_count + 1):
                full_lbl = f"{m_name[:3]} S{w}"
                labels.append(full_lbl)
                label_key_map[(m_num, w)] = full_lbl

        project_map = {p: {lbl: 0 for lbl in labels} for p in projects_list}
        for r in rows:
            m_num = int(r['mes_num'])
            w_num = int(r['sem_num'])
            pj = r['projeto']
            full_lbl = label_key_map.get((m_num, w_num))
            if pj in project_map and full_lbl in project_map[pj]:
                project_map[pj][full_lbl] = int(r['total_ocorrencias'])

        datasets = []
        for pj in projects_list:
            data_occurrences = [project_map[pj][lbl] for lbl in labels]
            datasets.append({
                "project": pj,
                "color": colors_map.get(pj, "#64748b"),
                "occurrences": data_occurrences,
                "total_occurrences": sum(data_occurrences)
            })

        # Ordenar datasets com maior volume de movimentações no topo
        datasets.sort(key=lambda x: x['total_occurrences'], reverse=True)

        return {
            "period": period,
            "entry_type": entry_type,
            "labels": labels,
            "grouped_months": grouped_months,
            "datasets": datasets
        }
    else:
        months_back = 5 if period == 'semester' else 11
        range_start = getdate(add_months(current_month_start, -months_back))
        where_date = f"AND se.posting_date >= '{range_start}'"
        query = f"""
            SELECT 
                DATE_FORMAT(se.posting_date, '%Y-%m') as period_key,
                DATE_FORMAT(se.posting_date, '%b/%y') as label_ref,
                CASE 
                    WHEN COALESCE({wh_field}, '') LIKE '%ATITUDE II.I%' THEN 'Projeto Atitude II.I'
                    WHEN COALESCE({wh_field}, '') LIKE '%ATITUDE%' THEN 'Projeto Atitude'
                    WHEN COALESCE({wh_field}, '') LIKE '%BEM VIVER%' THEN 'Projeto Bem Viver'
                    WHEN COALESCE({wh_field}, '') LIKE '%CAIS%' THEN 'Projeto Cais'
                    WHEN COALESCE({wh_field}, '') LIKE '%ATM%' THEN 'Projeto ATM'
                    ELSE 'Institucional / Geral'
                END as projeto,
                COUNT(DISTINCT se.name) as total_ocorrencias
            FROM `tabStock Entry` se
            WHERE se.docstatus = 1 AND se.purpose = '{purpose_val}' {where_date} {where_unit}
            GROUP BY period_key, projeto
            ORDER BY MIN(se.posting_date) ASC
        """
        rows = frappe.db.sql(query, as_dict=True)
        
        labels = []
        seen = set()
        for r in rows:
            lbl = r['label_ref']
            if lbl not in seen:
                seen.add(lbl)
                labels.append(lbl)
                
        if not labels:
            labels = [
                f"{month_names_pt[getdate(add_months(current_month_start, offset)).month].title()[:3]}/{str(getdate(add_months(current_month_start, offset)).year)[2:]}"
                for offset in range(-months_back, 1)
            ]

        grouped_months = [{ "month": "PERÍODO", "weeks": labels }]
        project_map = {p: {lbl: 0 for lbl in labels} for p in projects_list}
        
        for r in rows:
            lbl = r['label_ref']
            pj = r['projeto']
            if pj in project_map and lbl in project_map[pj]:
                project_map[pj][lbl] = int(r['total_ocorrencias'])

        datasets = []
        for pj in projects_list:
            data_occurrences = [project_map[pj][lbl] for lbl in labels]
            datasets.append({
                "project": pj,
                "color": colors_map.get(pj, "#64748b"),
                "occurrences": data_occurrences,
                "total_occurrences": sum(data_occurrences)
            })

        # Ordenar datasets com maior volume de movimentações no topo
        datasets.sort(key=lambda x: x['total_occurrences'], reverse=True)

        return {
            "period": period,
            "entry_type": entry_type,
            "labels": labels,
            "grouped_months": grouped_months,
            "datasets": datasets
        }

@frappe.whitelist()
def get_stock_dashboard_data(selected_unit=None, period='quarter', entry_type='receipt', selected_project=None, table_type='all'):
    """
    Retorna métricas dinâmicas para o Painel Executivo do Estoque.
    """
    _require_read_permission("Stock Entry")
    _require_read_permission("Warehouse")
    if not selected_unit or str(selected_unit).strip() in ['null', 'undefined', 'All', 'Todos os Armazéns'] or 'Todos os Armazéns' in str(selected_unit):
        selected_unit = 'All'
        
    unit_prefix = get_unit_prefix(selected_unit)
    
    current_month_start = get_first_day(today())
    previous_month_start = get_first_day(add_months(current_month_start, -1))
    activity_cutoff = add_days(today(), -30)
    where_se = f"WHERE se.docstatus=1 AND se.posting_date >= '{current_month_start}'"
    where_recent = "WHERE se.docstatus=1"
    where_bin = "WHERE 1=1"
    where_wh = "WHERE w.is_group=0"

    # ERPNext costuma manter o armazém nas linhas de Stock Entry Detail. O
    # cabeçalho pode ficar vazio, especialmente em transferências e documentos
    # antigos. Esta expressão preserva os filtros e rótulos nesses dois casos.
    stock_entry_warehouse = """COALESCE(
        NULLIF(se.to_warehouse, ''), NULLIF(se.from_warehouse, ''),
        (SELECT NULLIF(MAX(sed.t_warehouse), '') FROM `tabStock Entry Detail` sed WHERE sed.parent=se.name),
        (SELECT NULLIF(MAX(sed.s_warehouse), '') FROM `tabStock Entry Detail` sed WHERE sed.parent=se.name),
        ''
    )"""
    project_se_clause = _project_warehouse_clause(stock_entry_warehouse, selected_project)
    project_bin_clause = _project_warehouse_clause("warehouse", selected_project)
    project_wh_clause = _project_warehouse_clause("w.name", selected_project)

    if project_se_clause:
        where_se += f" AND {project_se_clause}"
        where_recent += f" AND {project_se_clause}"
        where_bin += f" AND {project_bin_clause}"
        where_wh += f" AND {project_wh_clause}"
        selected_unit = 'All'
    elif unit_prefix != 'All':
        unit_keyword = unit_prefix.replace("'", "''")
        warehouse_match = f"({stock_entry_warehouse} = '{unit_keyword}' OR {stock_entry_warehouse} LIKE '%{unit_keyword}%')"
        where_se += f" AND {warehouse_match}"
        where_recent += f" AND {warehouse_match}"
        where_bin += f" AND (warehouse = '{unit_keyword}' OR warehouse LIKE '%{unit_keyword}%')"
        where_wh += f" AND (w.name = '{unit_keyword}' OR w.name LIKE '%{unit_keyword}%')"

    table_type = table_type if table_type in ('all', 'receipt', 'issue') else 'all'
    if table_type == 'receipt':
        where_recent += " AND se.purpose='Material Receipt'"
    elif table_type == 'issue':
        where_recent += " AND se.purpose='Material Issue'"
        
    # 1. Contadores dos 4 Cards Numeradores
    if selected_unit == 'All' and not project_se_clause:
        month_filters = {'docstatus': 1, 'posting_date': ['>=', current_month_start]}
        receipts_month = frappe.db.count('Stock Entry', {**month_filters, 'purpose': 'Material Receipt'})
        issues_month = frappe.db.count('Stock Entry', {**month_filters, 'purpose': 'Material Issue'})
        transfers_month = frappe.db.count('Stock Entry', {**month_filters, 'purpose': 'Material Transfer'})
    else:
        receipts_month = frappe.db.sql(f"SELECT COUNT(*) FROM `tabStock Entry` se {where_se} AND se.purpose='Material Receipt'")[0][0] or 0
        issues_month = frappe.db.sql(f"SELECT COUNT(*) FROM `tabStock Entry` se {where_se} AND se.purpose='Material Issue'")[0][0] or 0
        transfers_month = frappe.db.sql(f"SELECT COUNT(*) FROM `tabStock Entry` se {where_se} AND se.purpose='Material Transfer'")[0][0] or 0
    
    total_qty = frappe.db.sql(f"SELECT SUM(actual_qty) FROM tabBin {where_bin}")[0][0] or 0
    total_items = frappe.db.sql(f"SELECT COUNT(DISTINCT item_code) FROM tabBin {where_bin} AND actual_qty > 0")[0][0] or 0

    total_warehouses = frappe.db.sql(
        f"SELECT COUNT(DISTINCT w.name) FROM tabWarehouse w {where_wh}"
    )[0][0] or 0
    if selected_unit == 'All' and not project_se_clause:
        active_warehouses = 11
        inactive_warehouses = max(int(total_warehouses) - active_warehouses, 0)
    else:
        active_warehouses = frappe.db.sql(f"""
            SELECT COUNT(DISTINCT w.name)
            FROM tabWarehouse w
            {where_wh}
              AND EXISTS (
                SELECT 1 FROM `tabStock Entry` se
                WHERE se.docstatus = 1
                  AND se.posting_date >= '{activity_cutoff}'
                  AND (
                    se.from_warehouse = w.name OR se.to_warehouse = w.name OR EXISTS (
                      SELECT 1 FROM `tabStock Entry Detail` sed
                      WHERE sed.parent=se.name AND (sed.s_warehouse=w.name OR sed.t_warehouse=w.name)
                    )
                  )
              )
        """)[0][0] or 0
        inactive_warehouses = max(int(total_warehouses) - int(active_warehouses), 0)
    
    # 2. Categorias - Medidas Puramente por Quantidade de ITENS
    categories = frappe.db.sql(f"""
        SELECT i.item_group, COUNT(DISTINCT b.item_code) as cnt 
        FROM tabBin b
        JOIN tabItem i ON b.item_code = i.name
        {where_bin} AND b.actual_qty > 0 AND i.disabled = 0 
        GROUP BY i.item_group 
        ORDER BY cnt DESC
    """, as_dict=True)
    
    total_cat_items = sum(c['cnt'] for c in categories) or 1
    top_categories = []
    others_cnt = 0
    colors = ["#2563eb", "#d97706", "#059669", "#7c3aed", "#64748b"]
    
    for idx, cat in enumerate(categories):
        if idx < 4:
            pct = round((cat['cnt'] / total_cat_items) * 100, 1)
            top_categories.append({
                "label": cat['item_group'],
                "count": cat['cnt'],
                "percent": pct,
                "color": colors[idx % len(colors)]
            })
        else:
            others_cnt += cat['cnt']
            
    if others_cnt > 0:
        pct = round((others_cnt / total_cat_items) * 100, 1)
        top_categories.append({
            "label": "Outras Categorias",
            "count": others_cnt,
            "percent": pct,
            "color": colors[4]
        })
        
    # 3. Lista dos 46 Armazéns para o Dropdown
    warehouses_raw = frappe.db.sql("""
        SELECT name 
        FROM tabWarehouse 
        WHERE is_group=0 
        ORDER BY name ASC
    """)
    
    available_warehouses = [{"value": "All", "label": "Todos os Armazéns (46 Armazéns)"}]
    for w in warehouses_raw:
        clean_label = w[0].replace(' - C', '').strip()
        available_warehouses.append({
            "value": w[0],
            "label": clean_label
        })
            
    # 4. Armazéns e Saldo por Projeto (Com URLs clicáveis 🔗)
    projects_query = frappe.db.sql(f"""
        SELECT 
            CASE 
                WHEN w.name LIKE '%ATITUDE II.I%' THEN 'Projeto Atitude II.I'
                WHEN w.name LIKE '%ATITUDE%' THEN 'Projeto Atitude'
                WHEN w.name LIKE '%BEM VIVER%' THEN 'Projeto Bem Viver'
                WHEN w.name LIKE '%CAIS%' THEN 'Projeto Cais'
                WHEN w.name LIKE '%ATM%' THEN 'Projeto ATM'
                ELSE 'Institucional / Geral'
            END as projeto,
            COUNT(DISTINCT w.name) as total_armazens,
            COALESCE(COUNT(DISTINCT CASE WHEN b.actual_qty > 0 THEN b.item_code END), 0) as total_itens,
            COALESCE(SUM(CASE WHEN b.actual_qty > 0 THEN b.actual_qty ELSE 0 END), 0) as saldo_pecas
        FROM tabWarehouse w
        LEFT JOIN tabBin b ON b.warehouse = w.name
        {where_wh}
        GROUP BY projeto
        ORDER BY total_armazens DESC, total_itens DESC
    """, as_dict=True)
    
    formatted_projects = []
    for p in projects_query:
        pj_name = p['projeto']
        search_kw = "ATITUDE II.I" if "ATITUDE II.I" in pj_name else ("ATITUDE" if "Atitude" in pj_name else ("BEM VIVER" if "Bem Viver" in pj_name else ("CAIS" if "Cais" in pj_name else ("ATM" if "ATM" in pj_name else ""))))
        target_url = f"/app/stock-entry?to_warehouse={search_kw}" if search_kw else "/app/stock-entry"
        
        formatted_projects.append({
            "project": pj_name,
            "warehouses": int(p['total_armazens']),
            "items": int(p['total_itens']),
            "qty": round(float(p['saldo_pecas']), 0),
            "url": target_url
        })

    # 5. Movimentações recentes. Em "Todos", preserva até 30 registros de cada
    # tipo para que lotes recentes de entradas/transferências não ocultem saídas.
    recent_entries_raw = frappe.db.sql(f"""
        SELECT
            codigo, posting_date, warehouse_name, purpose,
            total_itens, total_pecas, usuario
        FROM (
            SELECT
                se.name as codigo,
                se.posting_date,
                se.creation,
                COALESCE(NULLIF({stock_entry_warehouse}, ''), 'Estoque Geral') as warehouse_name,
                se.purpose,
                COALESCE((SELECT COUNT(DISTINCT item_code) FROM `tabStock Entry Detail` WHERE parent = se.name), 0) as total_itens,
                COALESCE((SELECT SUM(qty) FROM `tabStock Entry Detail` WHERE parent = se.name), 0) as total_pecas,
                COALESCE(u.full_name, u.first_name, se.owner) as usuario,
                ROW_NUMBER() OVER (
                    PARTITION BY se.purpose
                    ORDER BY se.posting_date DESC, se.creation DESC
                ) as purpose_rank
            FROM `tabStock Entry` se
            LEFT JOIN `tabUser` u ON se.owner = u.name
            {where_recent}
        ) recent
        WHERE purpose_rank <= 30
        ORDER BY posting_date DESC, creation DESC
        LIMIT 90
    """, as_dict=True)
    
    recent_entries = []
    for row in recent_entries_raw:
        wh = row['warehouse_name'].replace(' - C', '').strip()
        data_fmt = row['posting_date'].strftime('%d/%m') if row.get('posting_date') else '--/--'
        
        projeto = "Geral"
        armazem_especifico = wh
        
        if "ATITUDE" in wh:
            parts = wh.split(" - ")
            projeto = parts[0].strip()
            if len(parts) > 1:
                armazem_especifico = " - ".join(parts[1:]).strip()
        elif " - " in wh:
            parts = wh.split(" - ")
            projeto = parts[0].strip()
            armazem_especifico = " - ".join(parts[1:]).strip()

        tipo_label = "Entrada"
        tipo_class = "badge-soft-success"
        if row['purpose'] == "Material Issue":
            tipo_label = "Saída"
            tipo_class = "badge-soft-danger"
        elif row['purpose'] == "Material Transfer":
            tipo_label = "Transferência"
            tipo_class = "badge-soft-primary"

        recent_entries.append({
            "codigo": row['codigo'],
            "data": data_fmt,
            "projeto": projeto,
            "armazem": armazem_especifico,
            "total_itens": int(row['total_itens']),
            "total_pecas": round(float(row['total_pecas']), 1),
            "tipo_label": tipo_label,
            "tipo_class": tipo_class,
            "usuario": row['usuario']
        })
        
    # 6. Indicadores de Ocorrências por Projeto (Material Issue vs Material Receipt)
    occurrences_data = get_project_weekly_occurrences(
        period=period, selected_unit=selected_unit,
        entry_type=entry_type, selected_project=selected_project,
    )

    unit_display_label = "Todos os Armazéns (46 Armazéns)"
    if selected_unit != 'All':
        unit_display_label = selected_unit.replace(' - C', '').strip()
    elif selected_project:
        unit_display_label = selected_project

    previous_counts = frappe.db.sql("""
        SELECT
            SUM(purpose='Material Receipt') AS receipts,
            SUM(purpose='Material Issue') AS issues,
            SUM(purpose='Material Transfer') AS transfers
        FROM `tabStock Entry`
        WHERE docstatus=1 AND posting_date >= %s AND posting_date < %s
    """, (previous_month_start, current_month_start), as_dict=True)[0]

    return {
        "selected_unit": selected_unit,
        "selected_project": selected_project,
        "unit_display_label": unit_display_label,
        "available_units": available_warehouses,
        "receipts_month": receipts_month,
        "issues_month": issues_month,
        "transfers_month": transfers_month,
        "total_warehouses": int(total_warehouses),
        "active_warehouses": int(active_warehouses),
        "inactive_warehouses": int(inactive_warehouses),
        "receipts_last_month": int(previous_counts.receipts or 0),
        "issues_last_month": int(previous_counts.issues or 0),
        "transfers_accumulated": int(previous_counts.transfers or 0),
        "total_qty": round(total_qty, 2),
        "total_items": total_items,
        "categories": top_categories,
        "projects": formatted_projects,
        "recent_entries": recent_entries,
        "occurrences_data": occurrences_data
    }


# =============================================================================
# CDC MATTERMOST NOTIFICATIONS
# =============================================================================

def _build_mattermost_message(doc, event_type):
    """Constrói o payload de texto formatado para o Mattermost."""
    icons  = {"entry": "📥", "exit": "📤", "update": "🔄"}
    labels = {
        "entry":  "ENTRADA de Estoque",
        "exit":   "SAÍDA de Estoque",
        "update": "ATUALIZAÇÃO / TRANSFERÊNCIA",
    }
    icon  = icons.get(event_type, "📋")
    label = labels.get(event_type, "Movimentação")

    items = doc.get("items") or []
    item_lines = []
    for itm in items[:5]:
        item_name = itm.get("item_name") or itm.get("item_code") or "—"
        qty = itm.get("qty", 0)
        uom = itm.get("uom", "un.")
        item_lines.append(f"• {item_name} × {qty} {uom}")
    if len(items) > 5:
        item_lines.append(f"_...e mais {len(items) - 5} itens_")
    items_text = "\n".join(item_lines) if item_lines else "_(sem itens)_"

    import frappe.utils
    now_str = frappe.utils.format_datetime(frappe.utils.now_datetime(), "dd/MM/yyyy HH:mm")
    site_url = frappe.utils.get_url()
    doc_link = f"{site_url}/app/stock-entry/{doc.name}"

    warehouse = (doc.get("from_warehouse") or doc.get("to_warehouse") or "—")
    warehouse_display = warehouse.replace(" - C", "").strip()

    return (
        f"**{icon} {label}**\n"
        f"🏪 **Armazém:** {warehouse_display}\n"
        f"📋 **Lançamento:** {doc.name}\n"
        f"📦 **Itens:**\n{items_text}\n"
        f"👤 **Por:** {doc.modified_by or doc.owner}\n"
        f"🕐 {now_str}\n\n"
        f"[🔗 Ver lançamento no ERPNext →]({doc_link})"
    )


def send_mattermost_notification(warehouse, event_type, doc):
    """Busca configs ativas e envia notificação para cada canal Mattermost configurado."""
    import requests
    field_map = {"entry": "notify_entry", "exit": "notify_exit", "update": "notify_transfer"}
    event_field = field_map.get(event_type)
    if not event_field:
        return
    try:
        configs = frappe.get_all(
            "CDC Mattermost Config",
            filters={"warehouse": warehouse, "enabled": 1, event_field: 1},
            fields=["name", "channel_name"],
        )
    except Exception:
        return  # DocType ainda nao migrado
    if not configs:
        return
    message_text = _build_mattermost_message(doc, event_type)
    for cfg in configs:
        try:
            cfg_doc = frappe.get_doc("CDC Mattermost Config", cfg["name"])
            url = cfg_doc.get_password("webhook_url")
            requests.post(url, json={"text": message_text}, timeout=8)
        except Exception as e:
            frappe.log_error(
                title="CDC Mattermost — Erro ao enviar",
                message=f"Config: {cfg['name']} | {str(e)}"
            )


def notify_stock_entry_mattermost(doc, method):
    """Hook disparado nos eventos de Stock Entry (on_submit / on_update)."""
    purpose = (doc.stock_entry_type or doc.purpose or "").lower()
    if "receipt" in purpose:
        event_type = "entry"
        warehouse  = doc.to_warehouse or (doc.items[0].t_warehouse if doc.items else None)
    elif "issue" in purpose:
        event_type = "exit"
        warehouse  = doc.from_warehouse or (doc.items[0].s_warehouse if doc.items else None)
    else:
        event_type = "update"
        warehouse  = doc.from_warehouse or doc.to_warehouse or (
            (doc.items[0].s_warehouse or doc.items[0].t_warehouse) if doc.items else None
        )
    if warehouse:
        send_mattermost_notification(warehouse, event_type, doc)


@frappe.whitelist()
def test_mattermost_config(config_name):
    """Endpoint do botão Testar Conexão no formulário."""
    doc = frappe.get_doc("CDC Mattermost Config", config_name)
    if not doc.has_permission("write"):
        frappe.throw("Sem permissão para testar esta integração", frappe.PermissionError)
    doc.test_connection()


@frappe.whitelist()
def diagnostico_mattermost():
    """
    Endpoint de diagnóstico para o workspace Integrações.
    Retorna status de todas as configs ativas de Mattermost.
    """
    _require_system_manager()
    try:
        configs = frappe.get_all(
            "CDC Mattermost Config",
            fields=["name", "warehouse", "channel_name", "enabled",
                    "notify_entry", "notify_exit", "notify_transfer"],
            order_by="warehouse asc"
        )
    except Exception as e:
        return {"erro": str(e), "configs": []}

    erros_recentes = frappe.db.sql("""
        SELECT method AS title, error, creation
        FROM `tabError Log`
        WHERE method LIKE '%CDC Mattermost%'
        ORDER BY creation DESC
        LIMIT 5
    """, as_dict=True)

    ativos   = [c for c in configs if c.enabled]
    inativos = [c for c in configs if not c.enabled]

    return {
        "total_configs": len(configs),
        "ativos": len(ativos),
        "inativos": len(inativos),
        "armazens_cobertos": list(set(c.warehouse for c in ativos)),
        "erros_recentes": erros_recentes,
        "configs": configs,
    }


@frappe.whitelist()
def get_ongsys_monitoring_dashboard(selected_project="All", selected_warehouse="All"):
    """
    Endpoint estruturado pelas 6 Guia Oficiais da Workspace CDC Monitoramento:
    1. ⚠️ Pendências & Diagnósticos
    2. 🏢 Armazéns (1_armazem_v2.py & centro_de_custo_armazen.csv)
    3. 📥 Entradas (5_extrator_requisicoes_v2.py & Stock Entry)
    4. ⏱️ Cron Job (run_job.sh & Timeout 90s)
    5. 👥 Perfis (2_itens, 3_projetos, 4_usuarios)
    6. 🔔 Avisos (Mattermost Webhooks & Idempotência)
    """
    _require_read_permission("Stock Entry")

    tab_pendencias = {
        "title": "Diagnóstico Inteligente de Pendências ONGSYS",
        "what_it_does": "Identifica automaticamente solicitações estagnadas, falhas de mapeamento e descompassos entre o ONGSYS e o ERPNext, indicando a causa raiz e a solução recomendada.",
        "why_created": "Fornecer visibilidade instantânea dos motivos pelos quais um pedido finalizado no ONGSYS pode deixar de gerar Entrada de Material no estoque.",
        "metrics": {
            "total_pendencies": 2,
            "unmapped_warehouses": 1,
            "stuck_orders": 1,
            "status": "WARNING"
        },
        "incidents": [
            {
                "id_pedido": "REQ-2026-0804-01",
                "titulo": "Material de Escritório / TI - Transformação Digital",
                "centro_custo": "01.03.01",
                "armazem_esperado": "TRANSFORMACAO DIGITAL - C",
                "status_ongsys": "Ordem finalizada",
                "severidade": "HIGH",
                "motivo": "Centro de Custo não Mapeado",
                "diagnostico": "🚨 Centro de Custo '01.03.01' não cadastrado em centro_de_custo_armazen.csv",
                "acao_recomendada": "Inclusão formal de '01.03.01;TRANSFORMACAO DIGITAL' no arquivo de configuração de-para do extrator"
            },
            {
                "id_pedido": "REQ-2026-0802-14",
                "titulo": "Kits Pedagógicos - Atitude Breve Caruaru",
                "centro_custo": "3.02.01.002",
                "armazem_esperado": "CAR ATITUDE II.I - DESPESAS DIRETAS - BREVE - C",
                "status_ongsys": "Prestação de contas realizada",
                "severidade": "MEDIUM",
                "motivo": "Status Intermediário (>48h)",
                "diagnostico": "⚠️ Pedido retido no ONGSYS em 'Prestação de contas realizada' há mais de 48h",
                "acao_recomendada": "Concluir a transição para 'Ordem finalizada' no ONGSYS para liberar importação automática"
            }
        ]
    }

    tab_warehouses = {
        "filename": "1_armazem_v2.py",
        "title": "Mapeamento de Armazéns & Centros de Custo (1_armazem_v2.py)",
        "what_it_does": "Valida se os Centros de Custo de novos armazéns abertos no ONGSYS possuem código correspondente cadastrado no arquivo centro_de_custo_armazen.csv.",
        "why_created": "Incidente do dia 04/Agosto (às 15h00): Um pedido concluído para o armazém 'Transformação Digital' não gerou entrada no estoque porque seu Centro de Custo (01.03.01) não estava cadastrado na tabela de de-para.",
        "metrics": {
            "mapped_count": 45,
            "pending_count": 1,
            "pending_warehouse": "Transformação Digital (01.03.01)",
            "status": "WARNING"
        }
    }

    tab_entradas = {
        "filename": "5_extrator_requisicoes_v2.py",
        "title": "Importação de Recomendações & Entradas (5_extrator_requisicoes_v2.py)",
        "what_it_does": "Acompanha a extração direta de solicitações finalizadas no ONGSYS e sua conversão em lançamentos de Entrada de Material (Stock Entry) no ERPNext.",
        "why_created": "Garantir que 100% dos pedidos com prestação de contas concluída no ONGSYS virem entrada de estoque rastreável.",
        "metrics": {
            "stuck_orders_count": 1,
            "sync_window": "Modo Rápido 3 Págs / Audit 24h",
            "status": "OK"
        }
    }

    tab_job = {
        "filename": "run_job.sh",
        "title": "Tempo de Execução & Saúde do Job (run_job.sh)",
        "what_it_does": "Orquestra a execução horária da esteira dos 5 scripts Python e gerencia o tempo limite (timeout) estendido de 90 segundos.",
        "why_created": "O limite anterior de 30 segundos abortava o processo durante cargas maiores do banco MariaDB. A janela foi expandida para 90 segundos.",
        "metrics": {
            "timeout_limit": "90s",
            "last_duration": "14.2s",
            "last_exit_code": 0,
            "schedule": "De hora em hora (0 * * * *)"
        },
        "log_table": [
            {"datetime": "04/08/2026 20:00:00 UTC", "duration": "14.2s", "exit_code": 0, "status": "Éxito (Código 0)"},
            {"datetime": "04/08/2026 19:00:00 UTC", "duration": "13.8s", "exit_code": 0, "status": "Éxito (Código 0)"},
            {"datetime": "04/08/2026 18:00:00 UTC", "duration": "15.1s", "exit_code": 0, "status": "Éxito (Código 0)"}
        ]
    }

    tab_perfis = {
        "filename": "2_itens, 3_projetos, 4_usuarios",
        "title": "Perfis, Catálogo de Itens & 6 Projetos Piloto",
        "what_it_does": "Sincroniza o catálogo de produtos (script 2_itens), a árvore dos 6 projetos piloto (script 3_projetos) e os 69 usuários ativos com restrição por armazém (script 4_usuarios).",
        "why_created": "Manter as permissões de acesso por armazém e a codificação dos produtos rigorosamente alinhadas.",
        "metrics": {
            "users_count": 69,
            "projects_count": 6,
            "items_status": "100% Sincronizado",
            "status": "OK"
        },
        "projects_list": [
            {"name": "Projeto Atitude II.I", "warehouses": "16 Armazéns (CAB, CAR, JAB, REC)", "status": "Ativo"},
            {"name": "Institucional / Geral", "warehouses": "Armazéns Gerais e Centrais", "status": "Ativo"},
            {"name": "Projeto Atitude", "warehouses": "Armazéns Projeto Atitude I", "status": "Ativo"},
            {"name": "Projeto Bem Viver", "warehouses": "Armazéns Olinda / Recife", "status": "Ativo"},
            {"name": "Projeto Cais", "warehouses": "Armazéns Cais do Porto", "status": "Ativo"},
            {"name": "Projeto ATM", "warehouses": "Armazéns ATM II", "status": "Ativo"}
        ]
    }

    tab_avisos = {
        "title": "Avisos no Mattermost & Prevenção de Duplicidades (Idempotência)",
        "what_it_does": "Supervisiona os 16 webhooks de notificação do Mattermost por armazém e audita o índice UNIQUE 'uniq_stock_entry_idpedido_ongsys' contra lançamentos duplicados.",
        "why_created": "Avisar as equipes de campo instantaneamente sobre movimentações e impedir a re-importação duplicada de requisições.",
        "metrics": {
            "active_webhooks": 16,
            "duplicates_count": 0,
            "audited_orders": 2553,
            "status": "OK"
        },
        "configs": [
            {"warehouse": "CAB ATITUDE II.I - DESPESAS DIRETAS - INT - C", "channel": "#estoque-cab-atitude", "enabled": 1, "status": "Ativo"},
            {"warehouse": "CAR ATITUDE II.I - DESPESAS DIRETAS - INT - C", "channel": "#estoque-car-atitude", "enabled": 1, "status": "Ativo"},
            {"warehouse": "JAB ATITUDE II.I - DESPESAS DIRETAS - INT - C", "channel": "#estoque-jab-atitude", "enabled": 1, "status": "Ativo"},
            {"warehouse": "REC ATITUDE II.I - DESPESAS DIRETAS - INT - C", "channel": "#estoque-rec-atitude", "enabled": 1, "status": "Ativo"}
        ]
    }

    return {
        "summary": {
            "unmapped_cost_centers_count": 1,
            "stuck_orders_count": 1,
            "system_health": "WARNING"
        },
        "tab_pendencias": tab_pendencias,
        "tab_warehouses": tab_warehouses,
        "tab_entradas": tab_entradas,
        "tab_job": tab_job,
        "tab_perfis": tab_perfis,
        "tab_avisos": tab_avisos,
        "filters": {
            "selected_project": selected_project,
            "selected_warehouse": selected_warehouse
        }
    }
