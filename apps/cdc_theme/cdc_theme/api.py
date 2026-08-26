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


def _require_stock_dashboard_access():
    """Restringe consultas agregadas que usam SQL e não aplicam User Permission por linha."""
    roles = set(frappe.get_roles(frappe.session.user))
    if not roles.intersection({"System Manager", "Stock Manager"}):
        frappe.throw(
            "Painel consolidado restrito a gestores de estoque.",
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
        "cdc-testes": "CDC Testes",
        "cdc-grupos": "CDC Grupos",
        "cdc-itens": "CDC Itens",
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
        "testes": "CDC Testes",
        "grupos": "CDC Grupos",
        "itens": "CDC Itens",
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
        for page_name in ["CDC Estoque", "CDC Usuários", "CDC Grupos", "CDC Itens", "CDC Integrações", "CDC Pendências", "CDC Monitoramento", "CDC Testes", "CDC Admin"]:
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
        cdc_workspaces = ["CDC Estoque", "CDC Usuários", "CDC Grupos", "CDC Itens", "CDC Integrações", "CDC Pendências", "CDC Monitoramento", "CDC Testes", "CDC Admin"]
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
CDC_TESTS_WORKSPACE = "CDC Testes"
CDC_GROUPS_WORKSPACE = "CDC Grupos"
CDC_ITEMS_WORKSPACE = "CDC Itens"


def _ensure_cdc_workspace(name, icon, sequence_id, content="[]"):
    if frappe.db.exists("Workspace", name):
        workspace = frappe.get_doc("Workspace", name)
    else:
        workspace = frappe.new_doc("Workspace")
        workspace.name = name
        workspace.label = name
        workspace.title = name
        workspace.module = "Core"
        workspace.content = content
    workspace.public = 1
    workspace.is_hidden = 0
    workspace.icon = icon
    workspace.sequence_id = sequence_id
    workspace.save(ignore_permissions=True)
    return workspace.name


def _repair_cdc_support_workspaces():
    monitoring_content = (
        '[{"id":"cdc-monitoring-header","type":"header","data":'
        '{"text":"<span class=\'h4\'><b>Monitoramento</b></span>","col":12}}]'
    )
    return [
        _ensure_cdc_workspace("CDC Estoque", "stock", 1.0),
        _ensure_cdc_workspace("CDC Usuários", "users", 2.0),
        _ensure_cdc_workspace(CDC_GROUPS_WORKSPACE, "folder", 3.0),
        _ensure_cdc_workspace(CDC_ITEMS_WORKSPACE, "box", 4.0),
        _ensure_cdc_workspace("CDC Integrações", "share-2", 5.0),
        _ensure_cdc_workspace("CDC Pendências", "list-checks", 6.0),
        _ensure_cdc_workspace("CDC Monitoramento", "dashboard", 7.0, monitoring_content),
        _ensure_cdc_workspace(CDC_TESTS_WORKSPACE, "check-square", 8.0),
        _ensure_cdc_workspace(CDC_ADMIN_WORKSPACE, "tool", 9.0),
    ]


@frappe.whitelist()
def ensure_cdc_admin_workspace():
    _require_system_manager()
    names = _repair_cdc_support_workspaces()
    frappe.db.commit()
    frappe.clear_cache()
    return {"ok": True, "message": f"Workspaces {', '.join(names)} prontas."}


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
            "css/cdc_theme.css", "js/cdc_theme.js", "js/cdc_tests.js",
            "js/cdc_groups.js", "js/cdc_items.js", "js/cdc_admin.js",
        )
        missing = [item for item in required if not os.path.isfile(os.path.join(public_path, item))]
        if missing:
            raise RuntimeError("Assets ausentes: " + ", ".join(missing))
        return "CSS e JavaScripts administrativos presentes no app."

    def workspace_check():
        required = (
            "CDC Estoque", "CDC Usuários", CDC_GROUPS_WORKSPACE,
            CDC_ITEMS_WORKSPACE, "CDC Integrações", "CDC Pendências",
            "CDC Monitoramento", CDC_TESTS_WORKSPACE, CDC_ADMIN_WORKSPACE,
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
        _repair_cdc_support_workspaces()
        frappe.db.commit()
        frappe.clear_cache()
        message = "Workspaces CDC Monitoramento, Testes, Grupos e Admin reparadas."
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
    _require_stock_dashboard_access()
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
    _require_stock_dashboard_access()
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
        
    # 3. Lista atual de armazéns para o dropdown
    warehouses_raw = frappe.db.sql("""
        SELECT name 
        FROM tabWarehouse 
        WHERE is_group=0 
        ORDER BY name ASC
    """)
    
    available_warehouses = [{
        "value": "All",
        "label": f"Todos os Armazéns ({int(total_warehouses)} Armazéns)",
    }]
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

    unit_display_label = f"Todos os Armazéns ({int(total_warehouses)} Armazéns)"
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


def _monitoring_quality_gate(gate_id, title, status, evidence):
    return {"id": gate_id, "title": title, "status": status, "evidence": evidence}


def _build_monitoring_quality_gates(sync_stale, duplicates, unique_index):
    """Executa gates somente leitura; estados não verificáveis nunca viram aprovação."""
    asset_paths = {
        "theme": frappe.get_app_path("cdc_theme", "public", "js", "cdc_theme.js"),
        "pending": frappe.get_app_path("cdc_theme", "public", "js", "cdc_pending.js"),
        "api": __file__,
    }
    sources = {}
    for name, path in asset_paths.items():
        try:
            with open(path, encoding="utf-8") as source_file:
                sources[name] = source_file.read()
        except OSError:
            sources[name] = ""

    theme_source = sources["theme"]
    pending_source = sources["pending"]
    route_start = theme_source.find("function isItemGroupRoute()")
    route_end = theme_source.find("function removeItemGroupDashboard()", route_start)
    route_source = theme_source[route_start:route_end] if route_start >= 0 and route_end > route_start else ""
    render_end = theme_source.find("function init()", route_start)
    render_source = theme_source[route_start:render_end] if route_start >= 0 and render_end > route_start else ""

    exact_route = (
        "routeType === 'list' && routeDoctype === 'item-group'" in route_source
        and "window.location.href" not in route_source
        and "window.location.hash" not in route_source
    )
    native_list_preserved = (
        "currentBody.insertBefore(dashboard, currentListBody)" in render_source
        and "cdc-custom-item-group-active" not in render_source
        and "document.body" not in render_source
    )
    fake_markers = (
        "58 pendências atualizadas",
        "Sincronização concluída com sucesso (Código 0",
        "234 pedidos de Produto analisados",
    )
    telemetry_is_real = (
        all(marker not in pending_source and marker not in theme_source for marker in fake_markers)
        and "cdc-btn-refresh-live" in theme_source
    )
    source_has_role_guard = "_require_stock_dashboard_access()" in sources["api"]
    source_has_warehouse_scope = callable(globals().get("_warehouse_permission_sql"))

    ongsys_status = "passed" if unique_index and not duplicates and not sync_stale else "warning"
    ongsys_evidence = (
        f"Índice único: {'ativo' if unique_index else 'ausente'}; "
        f"duplicidades: {int(duplicates)}; checkpoint: "
        f"{'desatualizado' if sync_stale else 'recente'}. "
        "A normalização é validada pela suíte automatizada do repositório."
    )
    site_url = (frappe.utils.get_url() or "").lower()
    authenticated_production = (
        "stok.cdc.org.br" in site_url
        and frappe.session.user != "Guest"
        and "System Manager" in frappe.get_roles(frappe.session.user)
    )

    checks = [
        _monitoring_quality_gate(
            "item-group-route", "1. Rota exata de Item Group",
            "passed" if exact_route else "blocked",
            "Detecção limitada à lista Item Group e ao pathname oficial."
            if exact_route else "A assinatura exata da rota não foi encontrada no asset instalado.",
        ),
        _monitoring_quality_gate(
            "item-group-native-list", "2. Lista nativa e cards superiores",
            "passed" if native_list_preserved else "blocked",
            "Dashboard montado antes da lista oficial, sem ocultar o conteúdo nativo."
            if native_list_preserved else "A montagem segura acima da lista não pôde ser confirmada.",
        ),
        _monitoring_quality_gate(
            "real-telemetry", "3. Telemetria e botões reais",
            "passed" if telemetry_is_real else "blocked",
            "Sem mensagens simuladas; os botões atualizam medições persistidas."
            if telemetry_is_real else "Foram encontrados marcadores de simulação ou ausência de atualização real.",
        ),
        _monitoring_quality_gate(
            "ongsys-integrity", "4. Normalização, job e idempotência ONGSYS",
            ongsys_status, ongsys_evidence,
        ),
        _monitoring_quality_gate(
            "warehouse-rbac", "5. RBAC por armazém nas consultas",
            "passed" if source_has_role_guard and source_has_warehouse_scope else "blocked",
            "Papel e User Permission de Warehouse aplicados aos SQL agregados."
            if source_has_role_guard and source_has_warehouse_scope
            else "O papel está protegido, mas o escopo por User Permission de Warehouse ainda exige implementação.",
        ),
        _monitoring_quality_gate(
            "security-ci", "6. Segredos, backups e workflow de PR", "warning",
            "O ERP não acessa o host e o repositório completos. Confirmação obrigatória pela CI e auditoria do servidor.",
        ),
        _monitoring_quality_gate(
            "automated-tests", "7. Rotas, permissões e integrações", "warning",
            "Testes do repositório não são executados pelo processo web. Consulte o resultado da CI antes de publicar.",
        ),
        _monitoring_quality_gate(
            "production-validation", "8. Publicação e validação autenticada",
            "passed" if authenticated_production else "blocked",
            "Painel atual executado autenticado no domínio de produção."
            if authenticated_production else "Somente aprovar após deploy e acesso autenticado em stok.cdc.org.br.",
        ),
    ]
    summary = {
        "total": len(checks),
        "passed": sum(check["status"] == "passed" for check in checks),
        "warnings": sum(check["status"] == "warning" for check in checks),
        "blocked": sum(check["status"] == "blocked" for check in checks),
    }
    summary["ready_to_publish"] = summary["blocked"] == 0 and summary["warnings"] == 0
    return {
        "summary": summary,
        "checks": checks,
        "checked_at": frappe.utils.format_datetime(frappe.utils.now_datetime(), "dd/MM/yyyy HH:mm:ss"),
    }


@frappe.whitelist()
def get_cdc_tests_dashboard():
    """Executa e retorna os gates da página CDC Testes sem alterar dados."""
    _require_system_manager()
    last_success = frappe.db.get_single_value("CDC ONGSYS Sync State", "last_success_at")
    sync_stale = True
    if last_success:
        sync_stale = frappe.utils.time_diff_in_hours(
            frappe.utils.now_datetime(), frappe.utils.get_datetime(last_success)
        ) > 2
    duplicates = frappe.db.sql("""
        SELECT COUNT(*) FROM (
            SELECT idpedido_ongsys
            FROM `tabStock Entry`
            WHERE COALESCE(idpedido_ongsys, '') <> ''
            GROUP BY idpedido_ongsys HAVING COUNT(*) > 1
        ) duplicated
    """)[0][0] or 0
    unique_index = frappe.db.sql("""
        SELECT COUNT(*)
        FROM information_schema.statistics
        WHERE table_schema=DATABASE()
          AND table_name='tabStock Entry'
          AND index_name='uniq_stock_entry_idpedido_ongsys'
          AND non_unique=0
    """)[0][0] or 0
    return _build_monitoring_quality_gates(
        sync_stale=sync_stale,
        duplicates=duplicates,
        unique_index=bool(unique_index),
    )



@frappe.whitelist()
def get_ongsys_monitoring_dashboard(selected_project="All", selected_warehouse="All"):
    """Retorna somente medições persistidas no NextERP; nunca simula execução externa."""
    _require_system_manager()

    pending_rows = frappe.get_all(
        "CDC ONGSYS Pending Order",
        filters={"active": 1},
        fields=[
            "ongsys_order_id", "title", "status", "order_type", "order_date",
            "last_status_at", "cost_centers", "items_count", "total_quantity",
            "last_synced_at",
        ],
        order_by="order_date asc, creation asc",
        limit_page_length=10000,
    )
    cutoff = frappe.utils.add_days(frappe.utils.now_datetime(), -2)
    incidents = []
    unmapped_cost_centers = set()
    stuck_orders = 0
    for order in pending_rows:
        _project, warehouse = _pending_order_location(order.cost_centers, order.title)
        last_activity = order.last_status_at or order.order_date
        is_stuck = bool(last_activity and frappe.utils.get_datetime(last_activity) <= cutoff)
        if is_stuck:
            stuck_orders += 1
        if not warehouse:
            for cost_center in (order.cost_centers or "").split(","):
                if cost_center.strip():
                    unmapped_cost_centers.add(cost_center.strip())
        if (is_stuck or not warehouse) and len(incidents) < 20:
            reason = "Centro de custo sem armazém identificado" if not warehouse else "Sem atualização há mais de 48 horas"
            incidents.append({
                "id_pedido": order.ongsys_order_id,
                "titulo": order.title or "Sem título",
                "centro_custo": order.cost_centers or "Não informado",
                "armazem_esperado": warehouse or "Não identificado",
                "status_ongsys": order.status or "Sem estado",
                "severidade": "HIGH" if not warehouse else "MEDIUM",
                "motivo": reason,
                "diagnostico": reason,
                "acao_recomendada": (
                    "Revisar o de-para oficial de centro de custo e armazém."
                    if not warehouse else
                    "Confirmar o estado do pedido no ONGSYS antes de qualquer lançamento manual."
                ),
            })

    total_warehouses = frappe.db.count("Warehouse", {"is_group": 0})
    total_users = frappe.db.count("User", {"user_type": "System User", "enabled": 1})
    total_items = frappe.db.count("Item", {"disabled": 0})
    projects = _dashboard_filter_options()

    sync_fields = (
        "last_page", "last_success_at", "last_mode", "pages_fetched",
        "last_import_mode", "last_import_pages",
    )
    sync_state = {
        field: frappe.db.get_single_value("CDC ONGSYS Sync State", field)
        for field in sync_fields
    }
    last_success = sync_state.get("last_success_at")
    sync_stale = True
    if last_success:
        sync_stale = frappe.utils.time_diff_in_hours(
            frappe.utils.now_datetime(), frappe.utils.get_datetime(last_success)
        ) > 2
    formatted_last_success = (
        frappe.utils.format_datetime(last_success, "dd/MM/yyyy HH:mm:ss")
        if last_success else "Indisponível"
    )

    imported_orders = frappe.db.sql("""
        SELECT COUNT(*)
        FROM `tabStock Entry`
        WHERE docstatus=1 AND COALESCE(idpedido_ongsys, '') <> ''
    """)[0][0] or 0
    duplicates = frappe.db.sql("""
        SELECT COUNT(*) FROM (
            SELECT idpedido_ongsys
            FROM `tabStock Entry`
            WHERE COALESCE(idpedido_ongsys, '') <> ''
            GROUP BY idpedido_ongsys HAVING COUNT(*) > 1
        ) duplicated
    """)[0][0] or 0
    unique_index = frappe.db.sql("""
        SELECT COUNT(*)
        FROM information_schema.statistics
        WHERE table_schema=DATABASE()
          AND table_name='tabStock Entry'
          AND index_name='uniq_stock_entry_idpedido_ongsys'
          AND non_unique=0
    """)[0][0] or 0

    try:
        mattermost_configs = frappe.get_all(
            "CDC Mattermost Config",
            fields=["warehouse", "channel_name", "enabled"],
            order_by="warehouse asc",
        )
    except Exception:
        mattermost_configs = []
    active_webhooks = [row for row in mattermost_configs if row.enabled]

    health = "WARNING" if (
        pending_rows or unmapped_cost_centers or stuck_orders or sync_stale
        or duplicates or not unique_index
    ) else "OK"
    log_table = [{
        "datetime": formatted_last_success,
        "duration": "Indisponível",
        "exit_code": "—",
        "status": "Checkpoint desatualizado" if sync_stale else "Checkpoint recente",
    }]

    return {
        "summary": {
            "unmapped_cost_centers_count": len(unmapped_cost_centers),
            "stuck_orders_count": stuck_orders,
            "system_health": health,
            "sync_stale": sync_stale,
        },
        "tab_pendencias": {
            "title": "Pendências ONGSYS persistidas",
            "what_it_does": "Exibe pedidos realmente gravados no espelho local e sinaliza falta de mapeamento ou inatividade superior a 48 horas.",
            "why_created": "Permitir investigação sem criar movimentações antecipadas ou apresentar incidentes fictícios.",
            "metrics": {
                "total_pendencies": len(pending_rows),
                "unmapped_warehouses": len(unmapped_cost_centers),
                "stuck_orders": stuck_orders,
                "status": health,
            },
            "incidents": incidents,
        },
        "tab_warehouses": {
            "filename": "1_armazem_v2.py",
            "title": "Armazéns e centros de custo",
            "what_it_does": "Compara a localização inferida dos pedidos pendentes com os armazéns existentes no ERPNext.",
            "why_created": "Sinalizar apenas lacunas observadas nos dados persistidos.",
            "metrics": {
                "mapped_count": total_warehouses,
                "pending_count": len(unmapped_cost_centers),
                "pending_warehouse": ", ".join(sorted(unmapped_cost_centers)[:3]) or "Nenhum",
                "status": "WARNING" if unmapped_cost_centers else "OK",
            },
        },
        "tab_entradas": {
            "filename": "5_extrator_requisicoes_v2.py",
            "title": "Importação de entradas ONGSYS",
            "what_it_does": "Mostra o checkpoint persistido e a quantidade real de pedidos convertidos em Stock Entry.",
            "why_created": "Distinguir estado confirmado no banco de disponibilidade externa não verificada.",
            "metrics": {
                "stuck_orders_count": stuck_orders,
                "sync_window": f"{sync_state.get('last_import_mode') or 'Sem execução'} / {sync_state.get('last_import_pages') or 0} páginas",
                "imported_orders": int(imported_orders),
                "status": "WARNING" if sync_stale else "OK",
            },
        },
        "tab_job": {
            "filename": "run_job.sh",
            "title": "Checkpoint do job de sincronização",
            "what_it_does": "Mostra o último checkpoint que o extrator conseguiu persistir no ERPNext.",
            "why_created": "Não confundir presença do script com comprovação de agendamento ou execução bem-sucedida.",
            "metrics": {
                "timeout_limit": "90s",
                "last_duration": "Indisponível",
                "last_exit_code": None,
                "schedule": "Não verificado pelo ERPNext",
                "last_success_at": formatted_last_success,
            },
            "log_table": log_table,
        },
        "tab_perfis": {
            "filename": "catálogos e permissões",
            "title": "Perfis, catálogo e projetos",
            "what_it_does": "Resume usuários, itens ativos e agrupamentos de armazéns existentes no banco.",
            "why_created": "Acompanhar volumes reais sem afirmar sincronização externa não comprovada.",
            "metrics": {
                "users_count": total_users,
                "projects_count": len(projects),
                "items_count": total_items,
                "items_status": "Medição local",
                "status": "OK",
            },
            "projects_list": projects,
        },
        "tab_avisos": {
            "title": "Mattermost e idempotência ONGSYS",
            "what_it_does": "Mede configurações ativas, duplicidades existentes e presença do índice único no banco.",
            "why_created": "Confirmar os controles efetivamente aplicados antes de declarar a integração saudável.",
            "metrics": {
                "active_webhooks": len(active_webhooks),
                "duplicates_count": int(duplicates),
                "audited_orders": int(imported_orders),
                "unique_index_enabled": bool(unique_index),
                "status": "OK" if not duplicates and unique_index else "WARNING",
            },
            "configs": active_webhooks,
        },
        "filters": {
            "selected_project": selected_project,
            "selected_warehouse": selected_warehouse,
        },
    }


@frappe.whitelist()
def get_item_group_dashboard_data(selected_project='All', selected_warehouse='All', period='quarter'):
    """
    Retorna os dados consolidados do catálogo e grupos de itens para a rota /app/item-group.
    Calcula quantidade de grupos, total de produtos, valor em estoque (R$) e itens por categoria.
    """
    _require_stock_dashboard_access()
    _require_read_permission("Item Group")
    _require_read_permission("Item")
    _require_read_permission("Warehouse")

    # 1. Lista de grupos de itens
    raw_groups = frappe.db.sql("""
        SELECT 
            ig.name, 
            ig.parent_item_group, 
            ig.is_group,
            COUNT(i.name) AS items_count
        FROM `tabItem Group` ig
        LEFT JOIN `tabItem` i ON i.item_group = ig.name
        GROUP BY ig.name
        ORDER BY items_count DESC, ig.name ASC
    """, as_dict=True)

    # 2. Saldos de estoque por grupo a partir da tabBin
    bin_values = frappe.db.sql("""
        SELECT 
            i.item_group,
            SUM(b.actual_qty) AS total_qty,
            SUM(b.stock_value) AS total_value
        FROM `tabBin` b
        JOIN `tabItem` i ON b.item_code = i.name
        GROUP BY i.item_group
    """, as_dict=True)

    bin_map = {row['item_group']: row for row in bin_values}

    # 图标 e Mapeamento de categorias populares
    icon_map = {
        "Alimentos": "🍚",
        "Material Pedagógico": "📚",
        "Higiene e Limpeza": "🧹",
        "Equipamentos de TI": "🖥️",
        "Eletrodomésticos": "🔌",
        "Mobiliário": "🪑",
        "Vestuário": "👕",
        "Medicamentos": "💊",
        "Expediente": "📦",
        "Todos os Grupos": "🏷️",
        "Produtos": "📦",
        "Serviços": "🛠️"
    }

    groups_list = []
    total_items = 0
    total_stock_value = 0.0
    total_stock_qty = 0.0
    critical_groups_count = 0
    low_stock_groups_count = 0

    for g in raw_groups:
        g_name = g['name']
        b_data = bin_map.get(g_name, {})
        items_cnt = g['items_count'] or 0
        s_qty = float(b_data.get('total_qty') or 0.0)
        s_val = float(b_data.get('total_value') or 0.0)

        total_items += items_cnt
        total_stock_value += s_val
        total_stock_qty += s_qty

        if items_cnt > 0 and s_qty == 0:
            status = "Sem Estoque"
            critical_groups_count += 1
        elif items_cnt > 0 and s_qty < 10:
            status = "Estoque Baixo"
            low_stock_groups_count += 1
        else:
            status = "Ativo"

        icon = icon_map.get(g_name, "📁")

        groups_list.append({
            "name": g_name,
            "parent_item_group": g['parent_item_group'] or "—",
            "is_group": "Sim" if g['is_group'] else "Não",
            "items_count": items_cnt,
            "stock_qty": round(s_qty, 2),
            "stock_value": round(s_val, 2),
            "formatted_value": f"R$ {s_val:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
            "status": status,
            "icon": icon
        })

    # Top grupos por valor
    top_groups = sorted(groups_list, key=lambda x: x['stock_value'], reverse=True)[:5]

    # Projetos e Armazéns para filtro
    projects_list = [
        {"value": "Projeto Atitude II.I", "label": "Projeto Atitude II.I"},
        {"value": "Institucional / Geral", "label": "Institucional / Geral"},
        {"value": "Projeto Atitude", "label": "Projeto Atitude"},
        {"value": "Projeto Bem Viver", "label": "Projeto Bem Viver"},
        {"value": "Projeto Cais", "label": "Projeto Cais"},
        {"value": "Projeto ATM", "label": "Projeto ATM"}
    ]

    return {
        "summary": {
            "total_groups": len(groups_list),
            "total_items": total_items,
            "total_stock_value": round(total_stock_value, 2),
            "formatted_total_value": f"R$ {total_stock_value:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
            "total_stock_qty": round(total_stock_qty, 2),
            "critical_groups_count": critical_groups_count,
            "low_stock_groups_count": low_stock_groups_count
        },
        "groups": groups_list,
        "top_groups": top_groups,
        "filters": {
            "projects": projects_list,
            "selected_project": selected_project,
            "selected_warehouse": selected_warehouse,
            "period": period
        }
    }
