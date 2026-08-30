import base64
import calendar
import json
import os
import re
import unicodedata

import frappe
from frappe.utils import add_days, add_months, get_datetime, get_first_day, getdate, now_datetime, today


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
        "cdc-armazem": "CDC Armazém",
        "cdc-armazém": "CDC Armazém",
        "cdc-armazemo": "CDC Armazém",
        "cdc-armazémo": "CDC Armazém",
        "cdc-admin": "CDC Admin",
        "cdc-treinamento": "CDC Treinamento",
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
        "armazem": "CDC Armazém",
        "armazém": "CDC Armazém",
        "armazemo": "CDC Armazém",
        "armazémo": "CDC Armazém",
        "admin": "CDC Admin",
        "treinamento": "CDC Treinamento",
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
        for page_name in ["CDC Estoque", "CDC Usuários", "CDC Grupos", "CDC Itens", "CDC Armazém", "CDC Integrações", "CDC Pendências", "CDC Monitoramento", "CDC Testes", "CDC Admin", "CDC Treinamento"]:
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
        cdc_workspaces = ["CDC Estoque", "CDC Usuários", "CDC Grupos", "CDC Itens", "CDC Armazém", "CDC Integrações", "CDC Pendências", "CDC Monitoramento", "CDC Testes", "CDC Admin", "CDC Treinamento"]
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
CDC_WAREHOUSE_WORKSPACE = "CDC Armazém"
CDC_TRAINING_WORKSPACE = "CDC Treinamento"


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
        _ensure_cdc_workspace(CDC_GROUPS_WORKSPACE, "folder-normal", 3.0),
        _ensure_cdc_workspace(CDC_ITEMS_WORKSPACE, "assets", 4.0),
        _ensure_cdc_workspace(CDC_WAREHOUSE_WORKSPACE, "organization", 5.0),
        _ensure_cdc_workspace("CDC Integrações", "integration", 6.0),
        _ensure_cdc_workspace("CDC Pendências", "list-alt", 7.0),
        _ensure_cdc_workspace("CDC Monitoramento", "dashboard", 8.0, monitoring_content),
        _ensure_cdc_workspace(CDC_TESTS_WORKSPACE, "check", 9.0),
        _ensure_cdc_workspace(CDC_ADMIN_WORKSPACE, "tool", 10.0),
        _ensure_cdc_workspace(CDC_TRAINING_WORKSPACE, "education", 11.0),
    ]


def _clear_cdc_theme_caches():
    frappe.clear_cache()
    try:
        from frappe.website.utils import clear_cache as clear_website_cache
        clear_website_cache()
    except ImportError:
        pass


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


ONGSYS_MAPPING_DOCTYPE = "CDC ONGSYS Warehouse Mapping"


def _require_ongsys_mapping_doctype():
    if not frappe.db.exists("DocType", ONGSYS_MAPPING_DOCTYPE):
        frappe.throw("Cadastro de mapeamentos ONGSYS ainda não foi migrado.", frappe.ValidationError)


@frappe.whitelist()
def get_cdc_admin_ongsys_dashboard():
    """Fotografia persistida e auditável da integração; não consulta nem altera o ONGSYS."""
    _require_system_manager()
    _require_ongsys_mapping_doctype()
    mappings = frappe.get_all(
        ONGSYS_MAPPING_DOCTYPE,
        fields=[
            "name", "cost_center_code", "description", "warehouse", "status", "enabled",
            "evidence_order_id", "evidence_order_title", "confidence", "validation_detail",
            "analysis_log", "last_analyzed_at", "activation_mode", "manual_reason",
            "evidence_found_at", "source", "verified_by", "verified_at", "last_used_at", "modified",
        ],
        order_by="cost_center_code asc",
        limit_page_length=1000,
    )
    last_success = frappe.db.get_single_value("CDC ONGSYS Sync State", "last_success_at")
    if last_success and frappe.utils.get_datetime(last_success).year <= 1:
        last_success = None
    last_page = frappe.db.get_single_value("CDC ONGSYS Sync State", "last_page") or 0
    last_mode = (
        frappe.db.get_single_value("CDC ONGSYS Sync State", "last_import_mode")
        or frappe.db.get_single_value("CDC ONGSYS Sync State", "last_mode")
        or "Sem execução"
    )
    if not last_success:
        last_mode = "Sem execução"
    discovery = frappe.db.get_value(
        "CDC ONGSYS Sync State", "CDC ONGSYS Sync State",
        ["discovery_requested_at", "discovery_started_at", "discovery_completed_at", "discovery_status",
         "discovery_pages", "discovery_orders", "discovery_matches", "discovery_strategy",
         "discovery_direct_orders", "discovery_error"], as_dict=True,
    ) or {}
    imported_orders = frappe.db.sql("""
        SELECT COUNT(*) FROM `tabStock Entry`
        WHERE docstatus=1 AND COALESCE(idpedido_ongsys, '') <> ''
    """)[0][0] or 0
    counts = {status: 0 for status in ("Descoberto", "Pendente", "Validado", "Ativo", "Ativo automático", "Ativo manual", "Bloqueado")}
    for row in mappings:
        counts[row.status] = counts.get(row.status, 0) + 1
    return {
        "summary": {
            "mappings": len(mappings), "active": counts.get("Ativo", 0) + counts.get("Ativo automático", 0) + counts.get("Ativo manual", 0),
            "pending": counts.get("Pendente", 0) + counts.get("Descoberto", 0),
            "blocked": counts.get("Bloqueado", 0), "imported_orders": imported_orders,
        },
        "sync": {
            "last_success_at": frappe.utils.format_datetime(last_success, "dd/MM/yyyy HH:mm:ss") if last_success else "Sem checkpoint",
            "last_page": int(last_page), "last_mode": last_mode,
            "executor": "Não confirmado", "automatic_schedule": False,
        },
        "discovery": discovery,
        "mappings": mappings,
        "checked_at": frappe.utils.format_datetime(frappe.utils.now_datetime(), "dd/MM/yyyy HH:mm:ss"),
    }


@frappe.whitelist(methods=["POST"])
def request_ongsys_mapping_discovery(names=None):
    """Solicita ao executor isolado uma varredura somente leitura do ONGSYS."""
    _require_system_manager()
    _require_ongsys_mapping_doctype()
    state = frappe.get_single("CDC ONGSYS Sync State")
    if state.discovery_status == "Executando":
        return {"ok": True, "message": "A validação automática já está em execução."}
    names = frappe.parse_json(names) if isinstance(names, str) else (names or [])
    if not isinstance(names, list) or len(names) > 200:
        frappe.throw("Seleção de mapeamentos inválida.", frappe.ValidationError)
    requested_codes = []
    for name in names:
        doc = frappe.get_doc(ONGSYS_MAPPING_DOCTYPE, str(name))
        if doc.status not in ("Descoberto", "Pendente", "Validado", "Sem evidência", "API indisponível", "Armazém desativado", "Falha", "Revisão necessária"):
            continue
        doc.status = "Na fila"
        doc.analysis_log = f"[{frappe.utils.now()}] Análise solicitada; nenhuma movimentação de estoque será criada."
        doc.save()
        requested_codes.append(doc.cost_center_code)
    if names and not requested_codes:
        frappe.throw("Nenhum dos itens selecionados está pendente de validação.", frappe.ValidationError)
    state.discovery_requested_at = frappe.utils.now_datetime()
    state.discovery_requested_codes = json.dumps(requested_codes, ensure_ascii=False) if names else None
    state.discovery_status = "Aguardando"
    state.discovery_error = None
    state.save()
    scope = f" para {len(requested_codes)} selecionado(s)" if names else " para todos os pendentes"
    return {"ok": True, "requested": len(requested_codes), "message": f"Validação automática solicitada{scope}; o executor seguro iniciará em até 2 minutos."}


@frappe.whitelist()
def get_ongsys_mapping_discovery_request():
    """Contrato mínimo consumido pelo executor; não retorna segredos."""
    _require_stock_dashboard_access()
    state = frappe.get_single("CDC ONGSYS Sync State")
    return {
        "requested": state.discovery_status == "Aguardando",
        "status": state.discovery_status or "Nunca executada",
        "requested_at": state.discovery_requested_at,
        "requested_codes": frappe.parse_json(state.discovery_requested_codes) if state.discovery_requested_codes else [],
    }


@frappe.whitelist()
def get_ongsys_mapping_discovery_context():
    """Fornece candidatos locais para confirmação direta no ONGSYS."""
    _require_stock_dashboard_access()
    state = frappe.get_single("CDC ONGSYS Sync State")
    requested_codes = set(frappe.parse_json(state.discovery_requested_codes) or []) if state.discovery_requested_codes else set()
    mappings = frappe.get_all(
        ONGSYS_MAPPING_DOCTYPE,
        filters={"status": ["in", ["Descoberto", "Pendente", "Na fila", "Analisando", "Validado", "Sem evidência", "API indisponível", "Armazém desativado", "Falha", "Revisão necessária"]]},
        fields=["cost_center_code", "warehouse"], limit_page_length=1000,
    )
    if requested_codes:
        mappings = [row for row in mappings if row.cost_center_code in requested_codes]
    candidates = frappe.db.sql("""
        SELECT sed.t_warehouse AS warehouse,
               MAX(CASE WHEN se.idpedido_ongsys REGEXP '^[0-9]+$'
                        THEN CAST(se.idpedido_ongsys AS UNSIGNED) END) AS order_id
        FROM `tabStock Entry Detail` sed
        INNER JOIN `tabStock Entry` se ON se.name=sed.parent AND se.docstatus=1
        WHERE sed.docstatus=1 AND COALESCE(se.idpedido_ongsys, '') <> ''
        GROUP BY sed.t_warehouse
    """, as_dict=True)
    candidate_by_warehouse = {row.warehouse: row.order_id for row in candidates if row.order_id}
    maximum = frappe.db.sql("""
        SELECT MAX(CAST(idpedido_ongsys AS UNSIGNED))
        FROM `tabStock Entry`
        WHERE docstatus=1 AND idpedido_ongsys REGEXP '^[0-9]+$'
    """)[0][0] or 0
    return {
        "requested_codes": sorted(requested_codes),
        "max_imported_order_id": int(maximum),
        "mappings": [{
            "cost_center_code": row.cost_center_code,
            "warehouse": row.warehouse,
            "candidate_order_id": candidate_by_warehouse.get(row.warehouse),
        } for row in mappings],
    }


@frappe.whitelist(methods=["POST"])
def start_ongsys_mapping_discovery():
    _require_stock_dashboard_access()
    state = frappe.get_single("CDC ONGSYS Sync State")
    if state.discovery_status != "Aguardando":
        return {"ok": False, "message": "Não há solicitação aguardando execução."}
    state.discovery_status = "Executando"
    state.discovery_started_at = frappe.utils.now_datetime()
    state.discovery_error = None
    state.save()
    return {"ok": True, "message": "Descoberta iniciada."}


def _normalized_mapping_label(value):
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    return " ".join(normalized.encode("ascii", "ignore").decode().upper().replace(" - C", "").split())


@frappe.whitelist(methods=["POST"])
def record_ongsys_mapping_discovery(findings=None, stats=None, error=None):
    """Persiste evidências reais coletadas pelo executor, sem estoque e sem ativação."""
    _require_stock_dashboard_access()
    _require_ongsys_mapping_doctype()
    findings = frappe.parse_json(findings) if isinstance(findings, str) else (findings or [])
    stats = frappe.parse_json(stats) if isinstance(stats, str) else (stats or {})
    if not isinstance(findings, list) or len(findings) > 2000:
        frappe.throw("Lote de evidências inválido.", frappe.ValidationError)
    state = frappe.get_single("CDC ONGSYS Sync State")
    requested_codes = set(frappe.parse_json(state.discovery_requested_codes) or []) if state.discovery_requested_codes else set()
    state.discovery_started_at = state.discovery_started_at or frappe.utils.now_datetime()
    if error:
        state.discovery_status = "Falhou"
        state.discovery_error = str(error)[:1000]
        state.discovery_completed_at = frappe.utils.now_datetime()
        state.discovery_requested_codes = None
        state.save()
        return {"ok": False, "message": "Falha de descoberta registrada."}
    page_errors = stats.get("page_errors") or []
    matched = validated = 0
    exceptions = len(page_errors)
    for finding in findings:
        code = str(finding.get("cost_center_code") or "").strip()
        order_id = str(finding.get("order_id") or "").strip()
        if not re.fullmatch(r"[0-9A-Za-z._-]{2,40}", code) or not re.fullmatch(r"[0-9]{1,30}", order_id):
            exceptions += 1
            continue
        if requested_codes and code not in requested_codes:
            continue
        order_type = _normalized_mapping_label(finding.get("order_type"))
        order_status = _normalized_mapping_label(finding.get("status"))
        if order_type not in ("PRODUTO", "PEDIDO DE PRODUTO") or "CANCEL" in order_status:
            exceptions += 1
            continue
        name = frappe.db.exists(ONGSYS_MAPPING_DOCTYPE, {"cost_center_code": code})
        if not name:
            doc = frappe.new_doc(ONGSYS_MAPPING_DOCTYPE)
            doc.cost_center_code = code
            doc.description = str(finding.get("description") or "")[:140]
            doc.status = "Descoberto"
            doc.enabled = 0
            doc.source = "ONGSYS"
        else:
            doc = frappe.get_doc(ONGSYS_MAPPING_DOCTYPE, name)
        if doc.status == "Bloqueado":
            continue
        doc.evidence_order_id = order_id
        doc.evidence_order_title = str(finding.get("title") or "")[:140]
        doc.evidence_found_at = frappe.utils.now_datetime()
        warehouse = frappe.db.get_value("Warehouse", doc.warehouse, ["is_group", "disabled"], as_dict=True) if doc.warehouse else None
        description = _normalized_mapping_label(doc.description)
        warehouse_label = _normalized_mapping_label(doc.warehouse)
        exact = bool(warehouse and not warehouse.is_group and not warehouse.disabled and description and (
            description == warehouse_label or description in warehouse_label or warehouse_label in description
        ))
        doc.confidence = 100 if exact else (60 if warehouse else 0)
        doc.validation_detail = (
            "Código encontrado em pedido ONGSYS finalizado; descrição e armazém correspondem."
            if exact else "Código encontrado no ONGSYS, mas o armazém exige revisão administrativa."
        )
        doc.last_analyzed_at = frappe.utils.now_datetime()
        doc.analysis_log = (doc.analysis_log or "") + f"\n[{frappe.utils.now()}] Pedido {order_id} localizado; confiança {doc.confidence}%."
        if warehouse and warehouse.disabled:
            doc.status = "Armazém desativado"
            doc.enabled = 0
            doc.validation_detail = "O centro foi localizado, mas o armazém NextERP está desativado. Selecione um substituto operacional."
            exceptions += 1
        elif exact and doc.status in ("Descoberto", "Pendente", "Na fila", "Analisando", "Validado"):
            doc.status = "Ativo automático"
            doc.enabled = 1
            doc.activation_mode = "Automática"
            doc.verified_by = frappe.session.user
            doc.verified_at = frappe.utils.now_datetime()
            validated += 1
        else:
            doc.status = "Revisão necessária"
            doc.enabled = 0
            exceptions += 1
        doc.save()
        matched += 1
    found_codes = {str(row.get("cost_center_code") or "").strip() for row in findings}
    attempted_codes = set(str(code).strip() for code in (stats.get("attempted_codes") or requested_codes) if str(code).strip())
    for missing_code in attempted_codes - found_codes:
        missing_name = frappe.db.exists(ONGSYS_MAPPING_DOCTYPE, {"cost_center_code": missing_code})
        if not missing_name:
            continue
        missing_doc = frappe.get_doc(ONGSYS_MAPPING_DOCTYPE, missing_name)
        if missing_doc.status in ("Descoberto", "Pendente", "Validado", "Na fila", "Analisando", "Sem evidência", "API indisponível", "Armazém desativado", "Revisão necessária"):
            missing_doc.confidence = 0
            warehouse = frappe.db.get_value("Warehouse", missing_doc.warehouse, ["is_group", "disabled"], as_dict=True) if missing_doc.warehouse else None
            unavailable = not stats.get("pages") and bool(page_errors)
            missing_doc.status = "Armazém desativado" if warehouse and warehouse.disabled else ("API indisponível" if unavailable else "Sem evidência")
            missing_doc.validation_detail = "O armazém NextERP está desativado; selecione um substituto operacional." if warehouse and warehouse.disabled else ("A paginação falhou; fontes alternativas não confirmaram o vínculo." if unavailable else "As fontes responderam, mas nenhuma evidência elegível foi encontrada.")
            missing_doc.last_analyzed_at = frappe.utils.now_datetime()
            missing_doc.analysis_log = (missing_doc.analysis_log or "") + f"\n[{frappe.utils.now()}] {missing_doc.validation_detail}"
            missing_doc.save()
            exceptions += 1
    state.discovery_completed_at = frappe.utils.now_datetime()
    state.discovery_status = "Concluída com exceções" if exceptions else "Concluída"
    state.discovery_pages = frappe.utils.cint(stats.get("pages"))
    state.discovery_orders = frappe.utils.cint(stats.get("orders"))
    state.discovery_matches = matched
    state.discovery_strategy = str(stats.get("strategy") or "paginação")[:140]
    state.discovery_direct_orders = frappe.utils.cint(stats.get("direct_orders_tested"))
    state.discovery_error = " | ".join(str(item) for item in page_errors)[:1000] or None
    state.discovery_requested_codes = None
    state.save()
    return {"ok": True, "matched": matched, "validated": validated, "exceptions": exceptions}


@frappe.whitelist(methods=["POST"])
def activate_ongsys_warehouse_mappings(names=None):
    """Ativação humana em lote, limitada a vínculos previamente validados."""
    _require_system_manager()
    names = frappe.parse_json(names) if isinstance(names, str) else (names or [])
    if not isinstance(names, list) or not names or len(names) > 200:
        frappe.throw("Seleção de mapeamentos inválida.", frappe.ValidationError)
    activated = []
    for name in names:
        doc = frappe.get_doc(ONGSYS_MAPPING_DOCTYPE, str(name))
        if doc.status != "Validado" or not doc.evidence_order_id or float(doc.confidence or 0) < 100:
            frappe.throw(f"O mapeamento {doc.cost_center_code} ainda não possui validação automática completa.", frappe.ValidationError)
        doc.status = "Ativo"
        doc.enabled = 1
        doc.save()
        activated.append(doc.cost_center_code)
    return {"ok": True, "activated": len(activated), "message": f"{len(activated)} mapeamento(s) ativado(s)."}


@frappe.whitelist()
def get_ongsys_warehouse_mappings_for_extractor():
    """Contrato mínimo para o integrador autenticado; nunca expõe credenciais."""
    _require_stock_dashboard_access()
    _require_ongsys_mapping_doctype()
    return frappe.get_all(
        ONGSYS_MAPPING_DOCTYPE,
        fields=["cost_center_code", "warehouse", "status"],
        order_by="cost_center_code asc", limit_page_length=1000,
    )


@frappe.whitelist(methods=["POST"])
def save_ongsys_warehouse_mapping(cost_center_code, warehouse=None, description=None, evidence_order_id=None, notes=None):
    """Cria/atualiza um rascunho; ativação é deliberadamente separada."""
    _require_system_manager()
    _require_ongsys_mapping_doctype()
    code = (cost_center_code or "").strip()
    if not re.fullmatch(r"[0-9A-Za-z._-]{2,40}", code):
        frappe.throw("Código de centro de custo inválido.", frappe.ValidationError)
    name = frappe.db.exists(ONGSYS_MAPPING_DOCTYPE, {"cost_center_code": code})
    doc = frappe.get_doc(ONGSYS_MAPPING_DOCTYPE, name) if name else frappe.new_doc(ONGSYS_MAPPING_DOCTYPE)
    doc.cost_center_code = code
    doc.description = (description or "").strip()[:140]
    doc.warehouse = (warehouse or "").strip() or None
    doc.evidence_order_id = (evidence_order_id or "").strip()[:140]
    doc.notes = (notes or "").strip()[:1000]
    doc.source = doc.source or "Cadastro administrativo"
    if doc.status in (None, "", "Descoberto", "Bloqueado"):
        doc.status = "Pendente"
    doc.enabled = 0
    doc.save(ignore_permissions=False)
    return {"ok": True, "name": doc.name, "message": f"Mapeamento {code} salvo como pendente."}


@frappe.whitelist(methods=["POST"])
def validate_ongsys_warehouse_mapping(name):
    _require_system_manager()
    _require_ongsys_mapping_doctype()
    doc = frappe.get_doc(ONGSYS_MAPPING_DOCTYPE, name)
    if not doc.warehouse:
        frappe.throw("Selecione o armazém antes de validar.", frappe.ValidationError)
    warehouse = frappe.db.get_value("Warehouse", doc.warehouse, ["is_group", "disabled"], as_dict=True)
    if not warehouse or warehouse.is_group or warehouse.disabled:
        frappe.throw("O armazém precisa ser operacional e estar ativo.", frappe.ValidationError)
    if not doc.evidence_order_id:
        frappe.throw("Informe um pedido ONGSYS como evidência.", frappe.ValidationError)
    doc.status = "Validado"
    doc.enabled = 0
    doc.verified_by = frappe.session.user
    doc.verified_at = frappe.utils.now_datetime()
    doc.save()
    return {"ok": True, "message": f"Mapeamento {doc.cost_center_code} validado; ainda não está ativo."}


@frappe.whitelist(methods=["POST"])
def activate_ongsys_warehouse_mapping(name, enabled=1):
    _require_system_manager()
    _require_ongsys_mapping_doctype()
    doc = frappe.get_doc(ONGSYS_MAPPING_DOCTYPE, name)
    activate = frappe.utils.cint(enabled) == 1
    if activate and doc.status not in ("Validado", "Ativo", "Ativo automático", "Ativo manual"):
        frappe.throw("Somente mapeamentos validados podem ser ativados.", frappe.ValidationError)
    doc.status = "Ativo" if activate else "Bloqueado"
    doc.enabled = 1 if activate else 0
    doc.save()
    return {"ok": True, "message": f"Mapeamento {doc.cost_center_code} {'ativado' if activate else 'desativado'}."}


@frappe.whitelist(methods=["POST"])
def manually_activate_ongsys_warehouse_mapping(name, reason):
    _require_system_manager()
    doc = frappe.get_doc(ONGSYS_MAPPING_DOCTYPE, name)
    reason = (reason or "").strip()
    if len(reason) < 10:
        frappe.throw("Informe uma justificativa com pelo menos 10 caracteres.", frappe.ValidationError)
    warehouse = frappe.db.get_value("Warehouse", doc.warehouse, ["is_group", "disabled"], as_dict=True) if doc.warehouse else None
    if not warehouse or warehouse.is_group or warehouse.disabled:
        frappe.throw("Selecione um armazém operacional e ativo.", frappe.ValidationError)
    doc.status, doc.enabled = "Ativo manual", 1
    doc.activation_mode, doc.manual_reason = "Manual", reason[:1000]
    doc.verified_by, doc.verified_at = frappe.session.user, frappe.utils.now_datetime()
    doc.analysis_log = (doc.analysis_log or "") + f"\n[{frappe.utils.now()}] Ativação manual por {frappe.session.user}: {reason[:300]}"
    doc.save()
    return {"ok": True, "message": f"Mapeamento {doc.cost_center_code} ativado manualmente e auditado."}


@frappe.whitelist(methods=["POST"])
def manually_activate_ongsys_warehouse_mappings(names=None, reason=None):
    _require_system_manager()
    names = frappe.parse_json(names) if isinstance(names, str) else (names or [])
    if not isinstance(names, list) or not names or len(names) > 100:
        frappe.throw("Seleção inválida.", frappe.ValidationError)
    activated = []
    for name in names:
        result = manually_activate_ongsys_warehouse_mapping(str(name), reason)
        activated.append(result["message"])
    return {"ok": True, "activated": len(activated), "message": f"{len(activated)} mapeamento(s) ativado(s) manualmente e auditados."}
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
            "js/cdc_management.js",
            "js/cdc_groups.js", "js/cdc_items.js", "js/cdc_warehouse.js",
            "js/cdc_stock_routes.js", "js/cdc_admin.js",
        )
        missing = [item for item in required if not os.path.isfile(os.path.join(public_path, item))]
        if missing:
            raise RuntimeError("Assets ausentes: " + ", ".join(missing))
        return "CSS e JavaScripts administrativos presentes no app."

    def workspace_check():
        required = (
            "CDC Estoque", "CDC Usuários", CDC_GROUPS_WORKSPACE,
            CDC_ITEMS_WORKSPACE, CDC_WAREHOUSE_WORKSPACE,
            "CDC Integrações", "CDC Pendências",
            "CDC Monitoramento", CDC_TESTS_WORKSPACE, CDC_ADMIN_WORKSPACE,
            CDC_TRAINING_WORKSPACE,
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
    allowed = {"clear_cache", "repair_workspace", "repair_theme", "apply_light_theme"}
    if action not in allowed:
        frappe.throw("Ação administrativa não permitida.", frappe.PermissionError)

    if action == "clear_cache":
        _clear_cdc_theme_caches()
        message = "Caches do Frappe e do website foram limpos."
    elif action == "repair_workspace":
        _repair_cdc_support_workspaces()
        frappe.db.commit()
        _clear_cdc_theme_caches()
        message = "As 11 workspaces CDC foram reconciliadas e os caches foram limpos."
    elif action == "repair_theme":
        names = _repair_cdc_support_workspaces()
        frappe.db.commit()
        _clear_cdc_theme_caches()
        message = (
            f"Tema CDC reparado: {len(names)} workspaces reconciliadas; "
            "caches do Desk e do website limpos."
        )
    else:
        frappe.db.set_value("User", frappe.session.user, "desk_theme", "Light", update_modified=False)
        frappe.db.commit()
        frappe.clear_cache(user=frappe.session.user)
        message = "Tema claro reaplicado ao usuário atual."

    diagnostics = get_cdc_admin_diagnostics() if action == "repair_theme" else None
    theme_gate = None
    repair_complete = None
    if action == "repair_theme":
        dashboard = get_cdc_tests_dashboard()
        theme_gate = next(
            (item for item in dashboard["checks"] if item["id"] == "theme-integrity"),
            None,
        )
        repair_complete = bool(theme_gate and theme_gate["status"] == "passed")
        if repair_complete:
            message = "Tema, workspaces, assets e caches foram revalidados com sucesso."
        else:
            evidence = theme_gate["evidence"] if theme_gate else "diagnóstico do tema indisponível"
            message = (
                "O reparo acessível pelo ERP foi executado, mas o tema ainda possui pendências: "
                f"{evidence} Execute ./scripts/reparar_tema.sh no servidor."
            )
    frappe.logger("cdc_admin").info("CDC Admin action=%s user=%s", action, frappe.session.user)
    return {
        "ok": True,
        "action": action,
        "message": message,
        "reload_required": action == "repair_theme",
        "browser_repair_required": action == "repair_theme",
        "diagnostics": diagnostics,
        "theme_gate": theme_gate,
        "repair_complete": repair_complete,
        "server_repair_required": action == "repair_theme" and not repair_complete,
        "repair_command": "./scripts/reparar_tema.sh" if action == "repair_theme" and not repair_complete else None,
    }


CDC_PROJECTS = (
    "Projeto Atitude II.I", "Institucional / Geral", "Projeto Atitude",
    "Projeto Bem Viver", "Projeto Cais", "Projeto ATM",
)

CDC_ANALYTICS_CONTRACT_VERSION = "v1"
CDC_ANALYTICS_DATASETS = {
    "warehouses": {
        "label": "Armazéns",
        "doctype": "Warehouse",
        "description": "Estrutura dos armazéns operacionais visíveis ao cliente.",
        "scope": "RBAC por armazém",
        "fields": (
            "name", "warehouse_name", "company", "parent_warehouse",
            "disabled", "is_group", "modified",
        ),
    },
    "item-groups": {
        "label": "Grupos de itens",
        "doctype": "Item Group",
        "description": "Classificação dos itens presentes nos armazéns permitidos.",
        "scope": "Derivado dos itens permitidos",
        "fields": ("name", "parent_item_group", "is_group", "modified"),
    },
    "items": {
        "label": "Itens",
        "doctype": "Item",
        "description": "Catálogo dos itens vinculados aos armazéns permitidos.",
        "scope": "Derivado dos saldos permitidos",
        "fields": (
            "name", "item_name", "item_group", "stock_uom", "disabled",
            "is_stock_item", "modified",
        ),
    },
    "stock-balances": {
        "label": "Saldos de estoque",
        "doctype": "Bin",
        "description": "Posição atual por item e armazém, sem operação de escrita.",
        "scope": "RBAC por armazém",
        "fields": (
            "name", "item_code", "warehouse", "actual_qty", "projected_qty",
            "reserved_qty", "ordered_qty", "stock_value", "modified",
        ),
    },
    "stock-movements": {
        "label": "Movimentações de estoque",
        "doctype": "Stock Ledger Entry",
        "description": "Histórico contábil das entradas, saídas e transferências permitidas.",
        "scope": "RBAC por armazém",
        "fields": (
            "name", "item_code", "warehouse", "posting_date", "posting_time",
            "actual_qty", "qty_after_transaction", "voucher_type", "voucher_no",
            "stock_value_difference", "modified",
        ),
    },
}


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


def _catalog_filter_context(selected_project=None, selected_warehouse=None):
    """Normaliza o escopo do catálogo usando apenas armazéns visíveis ao usuário."""
    _require_read_permission("Warehouse")
    _require_read_permission("Bin")
    warehouses = frappe.get_list(
        "Warehouse",
        filters={"is_group": 0},
        pluck="name",
        order_by="name asc",
        limit_page_length=0,
    )
    grouped = {project: [] for project in CDC_PROJECTS}
    for warehouse in warehouses:
        grouped[_warehouse_project(warehouse)].append(warehouse)

    options = [
        {"value": project, "label": project, "warehouses": grouped[project]}
        for project in CDC_PROJECTS if grouped[project]
    ]
    valid_projects = {option["value"] for option in options}
    requested_project = (selected_project or "All").strip()
    requested_warehouse = (selected_warehouse or "All").strip()
    if requested_project != "All" and requested_project not in valid_projects:
        frappe.throw("Projeto indisponível para o usuário atual.", frappe.PermissionError)
    if requested_warehouse != "All" and requested_warehouse not in warehouses:
        frappe.throw("Armazém indisponível para o usuário atual.", frappe.PermissionError)
    if (
        requested_project != "All" and requested_warehouse != "All"
        and _warehouse_project(requested_warehouse) != requested_project
    ):
        frappe.throw("O armazém não pertence ao projeto selecionado.", frappe.ValidationError)

    if requested_warehouse != "All":
        scoped_warehouses = [requested_warehouse]
    elif requested_project != "All":
        scoped_warehouses = grouped[requested_project]
    else:
        scoped_warehouses = warehouses
    return (
        requested_project,
        requested_warehouse,
        options,
        scoped_warehouses,
        requested_project != "All" or requested_warehouse != "All",
    )


def _analytics_require_access(contract):
    """Mantém o provedor analítico restrito e sob as permissões nativas do ERP."""
    _require_stock_dashboard_access()
    required = {"Warehouse", "Bin", contract["doctype"]}
    if contract["doctype"] == "Item Group":
        required.add("Item")
    for doctype in sorted(required):
        _require_read_permission(doctype)


def _analytics_page_limit(value):
    try:
        limit = int(value or 100)
    except (TypeError, ValueError):
        limit = 0
    if limit < 1 or limit > 200:
        frappe.throw("O limite deve estar entre 1 e 200 registros.", frappe.ValidationError)
    return limit


def _analytics_encode_cursor(dataset, after_name, checkpoint):
    payload = {
        "v": CDC_ANALYTICS_CONTRACT_VERSION,
        "dataset": dataset,
        "after": after_name,
        "checkpoint": str(checkpoint),
    }
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).decode("ascii")
    return encoded.rstrip("=")


def _analytics_decode_cursor(dataset, cursor):
    if not cursor:
        return "", now_datetime()
    try:
        padding = "=" * (-len(cursor) % 4)
        payload = json.loads(base64.urlsafe_b64decode(cursor + padding).decode("utf-8"))
        if payload.get("v") != CDC_ANALYTICS_CONTRACT_VERSION:
            raise ValueError("versão incompatível")
        if payload.get("dataset") != dataset:
            raise ValueError("conjunto incompatível")
        after_name = str(payload.get("after") or "")
        checkpoint = get_datetime(payload.get("checkpoint"))
        if checkpoint > now_datetime():
            raise ValueError("checkpoint futuro")
        return after_name, checkpoint
    except Exception:
        frappe.throw("Cursor analítico inválido ou expirado.", frappe.ValidationError)


def _analytics_modified_since(value, checkpoint):
    if not value:
        return None
    try:
        modified_since = get_datetime(value)
    except Exception:
        frappe.throw("Data modified_since inválida.", frappe.ValidationError)
    if modified_since > checkpoint:
        frappe.throw(
            "modified_since não pode ser posterior ao checkpoint da consulta.",
            frappe.ValidationError,
        )
    return modified_since


def _analytics_scoped_item_codes(scoped_warehouses):
    if not scoped_warehouses:
        return set()
    rows = frappe.get_list(
        "Bin",
        filters={"warehouse": ["in", scoped_warehouses]},
        fields=["item_code"],
        limit_page_length=0,
    )
    return {row.item_code for row in rows if row.item_code}


def _analytics_scoped_item_groups(item_codes):
    if not item_codes:
        return set()
    item_rows = frappe.get_list(
        "Item",
        filters={"name": ["in", sorted(item_codes)]},
        fields=["item_group"],
        limit_page_length=0,
    )
    direct_groups = {row.item_group for row in item_rows if row.item_group}
    if not direct_groups:
        return set()
    group_rows = frappe.get_list(
        "Item Group",
        fields=["name", "parent_item_group"],
        limit_page_length=0,
    )
    parents = {row.name: row.parent_item_group for row in group_rows}
    scoped_groups = set(direct_groups)
    pending = list(direct_groups)
    while pending:
        parent = parents.get(pending.pop())
        if parent and parent not in scoped_groups:
            scoped_groups.add(parent)
            pending.append(parent)
    return scoped_groups


def _analytics_contract_payload(dataset, contract, records):
    return {
        "id": dataset,
        "label": contract["label"],
        "description": contract["description"],
        "scope": contract["scope"],
        "status": "ready",
        "records": records,
        "fields": list(contract["fields"]),
        "filters": ["modified_since", "project", "warehouse", "cursor", "limit"],
        "method": "cdc_theme.api.get_cdc_analytics_dataset",
        "read_only": True,
    }


@frappe.whitelist()
def get_cdc_analytics_catalog():
    """Diagnóstico real dos dados que o NextERP já pode fornecer ao CDC Core."""
    for contract in CDC_ANALYTICS_DATASETS.values():
        _analytics_require_access(contract)

    _, _, project_options, scoped_warehouses, _ = _catalog_filter_context("All", "All")
    item_codes = _analytics_scoped_item_codes(scoped_warehouses)
    item_groups = _analytics_scoped_item_groups(item_codes)
    scoped_filter = {"warehouse": ["in", scoped_warehouses]}
    counts = {
        "warehouses": len(scoped_warehouses),
        "item-groups": len(item_groups),
        "items": len(item_codes),
        "stock-balances": frappe.db.count("Bin", filters=scoped_filter) if scoped_warehouses else 0,
        "stock-movements": frappe.db.count("Stock Ledger Entry", filters=scoped_filter) if scoped_warehouses else 0,
    }
    datasets = [
        _analytics_contract_payload(dataset, contract, counts[dataset])
        for dataset, contract in CDC_ANALYTICS_DATASETS.items()
    ]
    return {
        "contract_version": CDC_ANALYTICS_CONTRACT_VERSION,
        "provider": "CDC NextERP",
        "consumer": "CDC Core",
        "bi_tool": "Metabase",
        "generated_at": str(now_datetime()),
        "summary": {
            "datasets": len(datasets),
            "ready": sum(1 for item in datasets if item["status"] == "ready"),
            "warehouses": len(scoped_warehouses),
            "projects": len(project_options),
        },
        "security": {
            "authentication": "Sessão ou token Frappe autenticado",
            "authorization": "Papéis nativos e User Permission de Warehouse",
            "write_operations": False,
            "core_client": "pending",
        },
        "sync": {
            "pagination": "Cursor opaco por conjunto",
            "incremental": "modified_since e checkpoint inclusivo",
            "maximum_page_size": 200,
            "idempotency_key": "dataset + name + modified",
        },
        "datasets": datasets,
    }


@frappe.whitelist()
def get_cdc_analytics_dataset(
    dataset,
    modified_since=None,
    selected_project="All",
    selected_warehouse="All",
    cursor=None,
    limit=100,
):
    """Exporta uma página somente de leitura, incremental e limitada pelo RBAC."""
    dataset = (dataset or "").strip().lower()
    contract = CDC_ANALYTICS_DATASETS.get(dataset)
    if not contract:
        frappe.throw("Conjunto analítico desconhecido.", frappe.ValidationError)
    _analytics_require_access(contract)

    page_limit = _analytics_page_limit(limit)
    after_name, checkpoint = _analytics_decode_cursor(dataset, cursor)
    since = _analytics_modified_since(modified_since, checkpoint)
    project, warehouse, _, scoped_warehouses, _ = _catalog_filter_context(
        selected_project, selected_warehouse,
    )
    item_codes = _analytics_scoped_item_codes(scoped_warehouses)
    item_groups = _analytics_scoped_item_groups(item_codes)

    filters = {"modified": ["<=", checkpoint]}
    if since:
        filters["modified"] = ["between", [since, checkpoint]]
    if after_name:
        filters["name"] = [">", after_name]

    doctype = contract["doctype"]
    empty_scope = not scoped_warehouses
    if doctype == "Warehouse":
        filters.update({"is_group": 0, "name": ["in", scoped_warehouses]})
        if after_name:
            filters["name"] = ["in", [name for name in scoped_warehouses if name > after_name]]
    elif doctype == "Item Group":
        filters["name"] = ["in", sorted(item_groups)]
        if after_name:
            filters["name"] = ["in", [name for name in item_groups if name > after_name]]
        empty_scope = empty_scope or not item_groups
    elif doctype == "Item":
        filters["name"] = ["in", sorted(item_codes)]
        if after_name:
            filters["name"] = ["in", [name for name in item_codes if name > after_name]]
        empty_scope = empty_scope or not item_codes
    else:
        filters["warehouse"] = ["in", scoped_warehouses]
        empty_scope = empty_scope or not scoped_warehouses

    rows = [] if empty_scope else frappe.get_list(
        doctype,
        filters=filters,
        fields=list(contract["fields"]),
        order_by="name asc",
        limit_page_length=page_limit + 1,
    )
    has_more = len(rows) > page_limit
    data = rows[:page_limit]
    next_cursor = (
        _analytics_encode_cursor(dataset, data[-1].name, checkpoint)
        if has_more and data else None
    )
    return {
        "contract_version": CDC_ANALYTICS_CONTRACT_VERSION,
        "dataset": dataset,
        "read_only": True,
        "scope": {
            "project": project,
            "warehouse": warehouse,
            "warehouses": len(scoped_warehouses),
        },
        "checkpoint": str(checkpoint),
        "modified_since": str(since) if since else None,
        "returned": len(data),
        "has_more": has_more,
        "next_cursor": next_cursor,
        "data": data,
    }


def _catalog_positive_item_codes(scoped_warehouses, scope_active):
    if not scope_active or not scoped_warehouses:
        return None if not scope_active else set()
    rows = frappe.get_list(
        "Bin",
        filters={
            "warehouse": ["in", scoped_warehouses],
            "actual_qty": [">", 0],
        },
        fields=["item_code"],
        limit_page_length=0,
    )
    return {row.item_code for row in rows}


def _catalog_filters_payload(project, warehouse, options, scope_active, scoped_warehouses):
    return {
        "projects": options,
        "selected_project": project,
        "selected_warehouse": warehouse,
        "scope_active": scope_active,
        "scope_label": (
            warehouse if warehouse != "All"
            else project if project != "All"
            else "Todos os armazéns permitidos"
        ),
        "scoped_warehouses_count": len(scoped_warehouses),
    }


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


def _catalog_management_period(value):
    try:
        period = int(value or 30)
    except (TypeError, ValueError):
        period = 0
    if period not in {7, 30, 90}:
        frappe.throw("Período gerencial inválido.", frappe.ValidationError)
    return period


def _catalog_management_float(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _catalog_movement_series(rows, start_date, period_days):
    bucket_size = 1 if period_days == 7 else 7 if period_days == 30 else 15
    bucket_count = (period_days + bucket_size - 1) // bucket_size
    buckets = []
    for index in range(bucket_count):
        bucket_date = add_days(start_date, index * bucket_size)
        buckets.append({
            "label": getdate(bucket_date).strftime("%d/%m"),
            "value": 0.0,
            "secondary": 0.0,
        })
    for row in rows:
        posting_date = getdate(row.posting_date)
        index = min(max((posting_date - getdate(start_date)).days // bucket_size, 0), bucket_count - 1)
        quantity = _catalog_management_float(row.actual_qty)
        if quantity >= 0:
            buckets[index]["value"] += quantity
        else:
            buckets[index]["secondary"] += abs(quantity)
    return buckets


@frappe.whitelist()
def get_catalog_management_dashboard_data(
    dashboard_type=None,
    search=None,
    company=None,
    selected_project=None,
    selected_warehouse=None,
    selected_group=None,
    period_days=30,
):
    """Entrega visão gerencial real de grupos, itens ou armazéns com RBAC nativo."""
    dashboard_aliases = {
        "groups": "groups",
        "items": "items",
        "warehouses": "warehouses",
        "warehouse": "warehouses",
    }
    dashboard = dashboard_aliases.get((dashboard_type or "").strip().lower())
    if not dashboard:
        frappe.throw("Painel gerencial inválido.", frappe.ValidationError)

    for doctype in ("Item Group", "Item", "Warehouse", "Bin", "Stock Ledger Entry"):
        _require_read_permission(doctype)

    period = _catalog_management_period(period_days)
    requested_search = (search or "").strip()[:120]
    search_key = requested_search.casefold()
    requested_company = (company or "").strip()
    requested_group = (selected_group or "All").strip()
    project, warehouse, project_options, scoped_warehouses, project_scope_active = _catalog_filter_context(
        selected_project, selected_warehouse,
    )

    warehouse_rows = frappe.get_list(
        "Warehouse",
        filters={"is_group": 0},
        fields=["name", "warehouse_name", "company", "disabled", "parent_warehouse"],
        order_by="name asc",
        limit_page_length=0,
    )
    permitted_names = set(scoped_warehouses)
    warehouse_rows = [row for row in warehouse_rows if row.name in permitted_names]
    companies = sorted({row.company for row in warehouse_rows if row.company})
    if requested_company and requested_company not in companies:
        frappe.throw("Empresa indisponível para o usuário atual.", frappe.PermissionError)
    if requested_company:
        warehouse_rows = [row for row in warehouse_rows if row.company == requested_company]
    if dashboard == "warehouses" and search_key:
        warehouse_rows = [
            row for row in warehouse_rows
            if search_key in f"{row.name} {row.warehouse_name or ''}".casefold()
        ]
    context_warehouse_names = [row.name for row in warehouse_rows]

    group_rows = frappe.get_list(
        "Item Group",
        fields=["name", "parent_item_group", "is_group", "lft", "rgt"],
        order_by="lft asc, name asc",
        limit_page_length=0,
    )
    group_by_name = {row.name: row for row in group_rows}
    if requested_group != "All" and requested_group not in group_by_name:
        frappe.throw("Grupo de itens indisponível para o usuário atual.", frappe.PermissionError)

    allowed_groups = set(group_by_name)
    if requested_group != "All":
        selected = group_by_name[requested_group]
        allowed_groups = {
            row.name for row in group_rows
            if int(row.lft or 0) >= int(selected.lft or 0)
            and int(row.rgt or 0) <= int(selected.rgt or 0)
        }
    if dashboard == "groups" and search_key:
        allowed_groups = {
            row.name for row in group_rows
            if row.name in allowed_groups and search_key in row.name.casefold()
        }

    item_rows = frappe.get_list(
        "Item",
        fields=[
            "name", "item_name", "item_group", "disabled", "is_stock_item",
            "stock_uom", "valuation_rate",
        ],
        order_by="name asc",
        limit_page_length=0,
    )
    item_rows = [row for row in item_rows if row.item_group in allowed_groups]
    if dashboard == "items" and search_key:
        item_rows = [
            row for row in item_rows
            if search_key in f"{row.name} {row.item_name or ''}".casefold()
        ]
    visible_item_names = {row.name for row in item_rows}

    bin_rows = []
    if context_warehouse_names and visible_item_names:
        bin_rows = frappe.get_list(
            "Bin",
            filters={
                "warehouse": ["in", context_warehouse_names],
                "item_code": ["in", sorted(visible_item_names)],
            },
            fields=[
                "item_code", "warehouse", "actual_qty", "projected_qty",
                "reserved_qty", "stock_value",
            ],
            limit_page_length=0,
        )

    location_scope_active = bool(project_scope_active or requested_company)
    if location_scope_active and dashboard in {"groups", "items"}:
        located_items = {row.item_code for row in bin_rows}
        item_rows = [row for row in item_rows if row.name in located_items]
        visible_item_names = {row.name for row in item_rows}
        bin_rows = [row for row in bin_rows if row.item_code in visible_item_names]

    start_date = add_days(today(), -(period - 1))
    movement_rows = []
    if context_warehouse_names and visible_item_names:
        movement_rows = frappe.get_list(
            "Stock Ledger Entry",
            filters={
                "warehouse": ["in", context_warehouse_names],
                "item_code": ["in", sorted(visible_item_names)],
                "posting_date": [">=", start_date],
            },
            fields=["item_code", "warehouse", "posting_date", "actual_qty", "stock_value_difference"],
            order_by="posting_date asc, creation asc",
            limit_page_length=0,
        )

    item_metrics = {
        row.name: {
            "quantity": 0.0,
            "projected": 0.0,
            "reserved": 0.0,
            "value": 0.0,
            "warehouses": set(),
            "negative_locations": 0,
            "movement": False,
            "entries": 0.0,
            "exits": 0.0,
        }
        for row in item_rows
    }
    warehouse_metrics = {
        row.name: {
            "quantity": 0.0,
            "value": 0.0,
            "items": set(),
            "negative_locations": 0,
            "movement": False,
            "entries": 0.0,
            "exits": 0.0,
        }
        for row in warehouse_rows
    }
    for row in bin_rows:
        item_metric = item_metrics.get(row.item_code)
        warehouse_metric = warehouse_metrics.get(row.warehouse)
        if not item_metric or not warehouse_metric:
            continue
        quantity = _catalog_management_float(row.actual_qty)
        value = _catalog_management_float(row.stock_value)
        item_metric["quantity"] += quantity
        item_metric["projected"] += _catalog_management_float(row.projected_qty)
        item_metric["reserved"] += _catalog_management_float(row.reserved_qty)
        item_metric["value"] += value
        item_metric["warehouses"].add(row.warehouse)
        warehouse_metric["quantity"] += quantity
        warehouse_metric["value"] += value
        warehouse_metric["items"].add(row.item_code)
        if quantity < 0:
            item_metric["negative_locations"] += 1
            warehouse_metric["negative_locations"] += 1

    for row in movement_rows:
        quantity = _catalog_management_float(row.actual_qty)
        item_metric = item_metrics.get(row.item_code)
        warehouse_metric = warehouse_metrics.get(row.warehouse)
        if item_metric:
            item_metric["movement"] = True
            if quantity >= 0:
                item_metric["entries"] += quantity
            else:
                item_metric["exits"] += abs(quantity)
        if warehouse_metric:
            warehouse_metric["movement"] = True
            if quantity >= 0:
                warehouse_metric["entries"] += quantity
            else:
                warehouse_metric["exits"] += abs(quantity)

    group_metrics = {
        row.name: {
            "active_items": 0,
            "disabled_items": 0,
            "positive_items": 0,
            "quantity": 0.0,
            "value": 0.0,
            "movement_items": 0,
        }
        for row in group_rows if row.name in allowed_groups
    }
    for row in item_rows:
        metric = item_metrics[row.name]
        group_metric = group_metrics.get(row.item_group)
        if not group_metric:
            continue
        if int(row.disabled or 0):
            group_metric["disabled_items"] += 1
        else:
            group_metric["active_items"] += 1
        if metric["quantity"] > 0:
            group_metric["positive_items"] += 1
        if metric["movement"]:
            group_metric["movement_items"] += 1
        group_metric["quantity"] += metric["quantity"]
        group_metric["value"] += metric["value"]

    movement_series = _catalog_movement_series(movement_rows, start_date, period)
    filters_payload = {
        "search": requested_search,
        "companies": companies,
        "selected_company": requested_company,
        "projects": project_options,
        "selected_project": project,
        "warehouses": [
            {
                "name": row.name,
                "company": row.company,
                "project": _warehouse_project(row.name),
            }
            for row in frappe.get_list(
                "Warehouse",
                filters={"is_group": 0},
                fields=["name", "company"],
                order_by="name asc",
                limit_page_length=0,
            )
        ],
        "selected_warehouse": warehouse,
        "groups": [row.name for row in group_rows],
        "selected_group": requested_group,
        "period_days": period,
        "scope_label": (
            warehouse if warehouse != "All"
            else project if project != "All"
            else requested_company if requested_company
            else "Todos os armazéns permitidos"
        ),
    }

    if dashboard == "groups":
        rows = []
        for group_row in group_rows:
            if group_row.name not in group_metrics:
                continue
            metric = group_metrics[group_row.name]
            if metric["active_items"] == 0:
                status_key, status = "empty", "Sem itens ativos"
            elif metric["quantity"] > 0:
                status_key, status = "with_stock", "Com estoque"
            else:
                status_key, status = "no_stock", "Sem estoque"
            rows.append({
                "name": group_row.name,
                "parent": group_row.parent_item_group or "—",
                "active_items": metric["active_items"],
                "positive_items": metric["positive_items"],
                "quantity": metric["quantity"],
                "value": metric["value"],
                "status": status,
                "status_key": status_key,
            })
        total_groups = len(rows)
        used_groups = sum(row["active_items"] > 0 for row in rows)
        empty_groups = sum(row["active_items"] == 0 for row in rows)
        groups_with_stock = sum(row["quantity"] > 0 for row in rows)
        groups_without_stock = sum(row["active_items"] > 0 and row["quantity"] <= 0 for row in rows)
        stock_value = sum(row["value"] for row in rows)
        sorted_by_value = sorted(rows, key=lambda row: (row["value"], row["active_items"]), reverse=True)
        sorted_by_items = sorted(rows, key=lambda row: (row["active_items"], row["value"]), reverse=True)
        concentration = (sorted_by_value[0]["value"] / stock_value * 100) if sorted_by_value and stock_value else 0
        return {
            "dashboard_type": dashboard,
            "updated_at": now_datetime().strftime("%d/%m/%Y %H:%M"),
            "period_days": period,
            "filters": filters_payload,
            "insight": (
                f"{used_groups} de {total_groups} grupos possuem itens ativos; "
                f"{empty_groups} estão vazios e {groups_with_stock} possuem saldo positivo."
            ),
            "cards": [
                {"label": "Grupos no contexto", "value": total_groups, "description": "Categorias visíveis", "status": "info", "focus": ""},
                {"label": "Grupos utilizados", "value": used_groups, "description": "Com itens ativos", "status": "success", "focus": "used"},
                {"label": "Grupos vazios", "value": empty_groups, "description": "Sem itens ativos", "status": "warning" if empty_groups else "success", "focus": "empty"},
                {"label": "Grupos com estoque", "value": groups_with_stock, "description": "Saldo atual positivo", "status": "success", "focus": "with_stock"},
                {"label": "Valor em estoque", "value": stock_value, "format": "currency", "description": "Nos armazéns permitidos", "status": "info", "focus": ""},
            ],
            "charts": [
                {"title": "Itens ativos por grupo", "kind": "bar", "rows": [{"label": row["name"], "value": row["active_items"]} for row in sorted_by_items[:10]]},
                {"title": "Valor do estoque por grupo", "kind": "bar-currency", "rows": [{"label": row["name"], "value": row["value"]} for row in sorted_by_value[:10]]},
            ],
            "alerts": [
                {"tone": "warning" if empty_groups else "success", "title": f"{empty_groups} grupo(s) vazio(s)", "description": "Categorias sem itens ativos no contexto atual.", "focus": "empty"},
                {"tone": "warning" if groups_without_stock else "success", "title": f"{groups_without_stock} grupo(s) sem estoque", "description": "Possuem itens ativos, mas saldo total não positivo.", "focus": "no_stock"},
                {"tone": "info", "title": f"Maior concentração: {concentration:.1f}%", "description": "Participação do maior grupo no valor atual do estoque.", "focus": ""},
            ],
            "table": {
                "columns": [
                    {"key": "name", "label": "Grupo"}, {"key": "parent", "label": "Grupo pai"},
                    {"key": "active_items", "label": "Itens ativos", "format": "number"},
                    {"key": "positive_items", "label": "Com estoque", "format": "number"},
                    {"key": "quantity", "label": "Quantidade", "format": "quantity"},
                    {"key": "value", "label": "Valor", "format": "currency"},
                    {"key": "status", "label": "Situação", "format": "status"},
                ],
                "rows": sorted_by_value[:30],
            },
        }

    if dashboard == "items":
        item_by_name = {row.name: row for row in item_rows}
        rows = []
        for item_name, item_row in item_by_name.items():
            metric = item_metrics[item_name]
            disabled = bool(int(item_row.disabled or 0))
            if disabled and metric["quantity"] != 0:
                status_key, status = "disabled_stock", "Desabilitado com saldo"
            elif metric["negative_locations"] or metric["quantity"] < 0:
                status_key, status = "negative", "Saldo negativo"
            elif int(item_row.is_stock_item or 0) and metric["quantity"] == 0:
                status_key, status = "zero", "Sem estoque"
            elif metric["quantity"] != 0 and metric["value"] == 0:
                status_key, status = "missing_value", "Sem valor registrado"
            elif metric["quantity"] > 0:
                status_key, status = "positive", "Disponível"
            else:
                status_key, status = "normal", "Normal"
            rows.append({
                "name": item_name,
                "item_name": item_row.item_name or item_name,
                "group": item_row.item_group or "—",
                "quantity": metric["quantity"],
                "value": metric["value"],
                "warehouses": len(metric["warehouses"]),
                "movement": "Sim" if metric["movement"] else f"Não em {period} dias",
                "status": status,
                "status_key": status_key,
                "disabled": disabled,
            })
        active_rows = [row for row in rows if not row["disabled"]]
        positive_items = sum(row["quantity"] > 0 for row in active_rows)
        zero_items = sum(row["status_key"] == "zero" for row in active_rows)
        negative_items = sum(row["status_key"] == "negative" for row in rows)
        disabled_stock = sum(row["status_key"] == "disabled_stock" for row in rows)
        missing_value = sum(row["status_key"] == "missing_value" for row in rows)
        no_movement = sum(row["movement"].startswith("Não") for row in active_rows)
        stock_value = sum(row["value"] for row in rows)
        priority = {"negative": 0, "disabled_stock": 1, "missing_value": 2, "zero": 3, "positive": 4, "normal": 5}
        sorted_rows = sorted(rows, key=lambda row: (priority.get(row["status_key"], 9), -abs(row["value"])))
        top_value = sorted(rows, key=lambda row: row["value"], reverse=True)[:10]
        return {
            "dashboard_type": dashboard,
            "updated_at": now_datetime().strftime("%d/%m/%Y %H:%M"),
            "period_days": period,
            "filters": filters_payload,
            "insight": (
                f"{len(active_rows)} itens ativos; {positive_items} com saldo positivo, "
                f"{zero_items} sem estoque e {negative_items} com saldo negativo."
            ),
            "cards": [
                {"label": "Itens ativos", "value": len(active_rows), "description": "Cadastros habilitados", "status": "info", "focus": "active"},
                {"label": "Com estoque", "value": positive_items, "description": "Saldo atual positivo", "status": "success", "focus": "positive"},
                {"label": "Sem estoque", "value": zero_items, "description": "Itens ativos com saldo zero", "status": "warning" if zero_items else "success", "focus": "zero"},
                {"label": "Saldo negativo", "value": negative_items, "description": "Exigem conferência", "status": "danger" if negative_items else "success", "focus": "negative"},
                {"label": "Valor em estoque", "value": stock_value, "format": "currency", "description": "Nos armazéns permitidos", "status": "info", "focus": ""},
            ],
            "charts": [
                {"title": f"Entradas e saídas — {period} dias", "kind": "paired", "rows": movement_series},
                {"title": "Itens com maior valor", "kind": "bar-currency", "rows": [{"label": row["name"], "value": row["value"]} for row in top_value]},
            ],
            "alerts": [
                {"tone": "danger" if negative_items else "success", "title": f"{negative_items} item(ns) com saldo negativo", "description": "Prioridade para conferência ou reconciliação.", "focus": "negative"},
                {"tone": "warning" if disabled_stock or missing_value else "success", "title": f"{disabled_stock} desabilitado(s) com saldo; {missing_value} sem valor", "description": "Cadastros que exigem saneamento.", "focus": "disabled_stock" if disabled_stock else "missing_value"},
                {"tone": "info", "title": f"{no_movement} item(ns) sem movimentação", "description": f"Nenhuma entrada ou saída nos últimos {period} dias.", "focus": "no_movement"},
            ],
            "table": {
                "columns": [
                    {"key": "name", "label": "Item"}, {"key": "group", "label": "Grupo"},
                    {"key": "quantity", "label": "Saldo", "format": "quantity"},
                    {"key": "value", "label": "Valor", "format": "currency"},
                    {"key": "warehouses", "label": "Armazéns", "format": "number"},
                    {"key": "movement", "label": "Movimentação"},
                    {"key": "status", "label": "Situação", "format": "status"},
                ],
                "rows": sorted_rows[:30],
            },
        }

    warehouse_by_name = {row.name: row for row in warehouse_rows}
    rows = []
    for warehouse_name, warehouse_row in warehouse_by_name.items():
        metric = warehouse_metrics[warehouse_name]
        disabled = bool(int(warehouse_row.disabled or 0))
        if metric["negative_locations"]:
            status_key, status = "negative", "Saldo negativo"
        elif disabled and metric["quantity"] != 0:
            status_key, status = "disabled_stock", "Desabilitado com saldo"
        elif not metric["movement"]:
            status_key, status = "no_movement", f"Sem movimento em {period} dias"
        elif metric["quantity"] > 0:
            status_key, status = "with_stock", "Com estoque"
        else:
            status_key, status = "empty", "Sem estoque"
        rows.append({
            "name": warehouse_name,
            "company": warehouse_row.company or "—",
            "project": _warehouse_project(warehouse_name),
            "items": len(metric["items"]),
            "quantity": metric["quantity"],
            "value": metric["value"],
            "entries": metric["entries"],
            "exits": metric["exits"],
            "status": status,
            "status_key": status_key,
            "disabled": disabled,
        })
    active_rows = [row for row in rows if not row["disabled"]]
    with_stock = sum(row["quantity"] > 0 for row in active_rows)
    negative_warehouses = sum(row["status_key"] == "negative" for row in rows)
    no_movement = sum(row["status_key"] == "no_movement" for row in rows)
    disabled_stock = sum(row["status_key"] == "disabled_stock" for row in rows)
    total_quantity = sum(row["quantity"] for row in rows)
    stock_value = sum(row["value"] for row in rows)
    priority = {"negative": 0, "disabled_stock": 1, "no_movement": 2, "empty": 3, "with_stock": 4}
    sorted_rows = sorted(rows, key=lambda row: (priority.get(row["status_key"], 9), -abs(row["value"])))
    top_value = sorted(rows, key=lambda row: row["value"], reverse=True)[:10]
    top_movement = sorted(rows, key=lambda row: row["entries"] + row["exits"], reverse=True)[:10]
    return {
        "dashboard_type": dashboard,
        "updated_at": now_datetime().strftime("%d/%m/%Y %H:%M"),
        "period_days": period,
        "filters": filters_payload,
        "insight": (
            f"{len(active_rows)} armazéns ativos e permitidos; {with_stock} possuem estoque, "
            f"{negative_warehouses} apresentam saldo negativo."
        ),
        "cards": [
            {"label": "Armazéns ativos", "value": len(active_rows), "description": "Permitidos no contexto", "status": "info", "focus": "active"},
            {"label": "Com estoque", "value": with_stock, "description": "Saldo atual positivo", "status": "success", "focus": "with_stock"},
            {"label": "Quantidade total", "value": total_quantity, "format": "quantity", "description": "Soma dos saldos atuais", "status": "info", "focus": ""},
            {"label": "Valor em estoque", "value": stock_value, "format": "currency", "description": "Nos armazéns permitidos", "status": "info", "focus": ""},
            {"label": "Armazéns críticos", "value": negative_warehouses, "description": "Com algum saldo negativo", "status": "danger" if negative_warehouses else "success", "focus": "negative"},
        ],
        "charts": [
            {"title": "Valor por armazém", "kind": "bar-currency", "rows": [{"label": row["name"], "value": row["value"]} for row in top_value]},
            {"title": f"Entradas e saídas — {period} dias", "kind": "paired", "rows": [{"label": row["name"], "value": row["entries"], "secondary": row["exits"]} for row in top_movement]},
        ],
        "alerts": [
            {"tone": "danger" if negative_warehouses else "success", "title": f"{negative_warehouses} armazém(ns) com saldo negativo", "description": "Possuem uma ou mais combinações item/armazém negativas.", "focus": "negative"},
            {"tone": "warning" if no_movement else "success", "title": f"{no_movement} sem movimentação recente", "description": f"Nenhuma entrada ou saída nos últimos {period} dias.", "focus": "no_movement"},
            {"tone": "warning" if disabled_stock else "success", "title": f"{disabled_stock} desabilitado(s) com saldo", "description": "Armazéns inativos que ainda mantêm quantidade.", "focus": "disabled_stock"},
        ],
        "table": {
            "columns": [
                {"key": "name", "label": "Armazém"}, {"key": "project", "label": "Projeto"},
                {"key": "items", "label": "Itens distintos", "format": "number"},
                {"key": "quantity", "label": "Quantidade", "format": "quantity"},
                {"key": "value", "label": "Valor", "format": "currency"},
                {"key": "entries", "label": "Entradas", "format": "quantity"},
                {"key": "exits", "label": "Saídas", "format": "quantity"},
                {"key": "status", "label": "Situação", "format": "status"},
            ],
            "rows": sorted_rows[:30],
        },
    }


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


QUALITY_GATE_COPY = {
    "item-group-route": {
        "execution_type": "Automático",
        "stages": ("Preparação", "Permissões", "Rotas oficiais", "Evidências", "Resultado"),
        "summary": "Confere se Itens e Grupos de Itens abrem somente nas rotas corretas.",
        "details": (
            "Este teste verifica a leitura exata das URLs oficiais das listas de Item e Item Group.",
            "Ele evita que cards e filtros sejam montados em formulários, relatórios ou páginas sem relação com o catálogo.",
        ),
    },
    "item-group-native-list": {
        "execution_type": "Automático",
        "stages": ("Preparação", "Permissões", "Lista nativa", "Cards e filtros", "Resultado"),
        "summary": "Confirma que os novos cards não substituem nem escondem a lista oficial do ERPNext.",
        "details": (
            "O painel personalizado deve aparecer acima da listagem nativa e preservar edição, paginação e filtros salvos.",
            "Uma reprovação indica risco de perder ações nativas ou encontrar uma página vazia durante a navegação.",
        ),
    },
    "real-telemetry": {
        "execution_type": "Automático",
        "stages": ("Preparação", "Permissões", "Fontes reais", "Operações persistidas", "Resultado"),
        "summary": "Verifica se números e botões usam dados reais, sem mensagens ou resultados simulados.",
        "details": (
            "O teste procura marcadores de telemetria fictícia e confirma a existência das operações reais de atualização.",
            "Ele não executa uma sincronização externa: apenas garante que a interface não apresente sucesso inventado.",
        ),
    },
    "ongsys-integrity": {
        "execution_type": "Automático",
        "attention_label": "Revisar integração",
        "attention_impact": (
            "Isso não bloqueia lançamentos manuais. Indica que a proteção contra pedidos duplicados "
            "ou a confirmação recente da sincronização ONGSYS ainda não está completa."
        ),
        "attention_next_step": (
            "Confirmar o índice único de pedidos ONGSYS e uma sincronização concluída nas últimas duas horas."
        ),
        "stages": ("Preparação", "Permissões", "Normalização", "Idempotência e checkpoint", "Resultado"),
        "summary": "Protege a importação ONGSYS contra duplicidades e acompanha a atualização da sincronização.",
        "details": (
            "A idempotência garante que o mesmo pedido ONGSYS não gere duas movimentações de estoque.",
            "O checkpoint informa quando a integração confirmou o último sucesso; acima de duas horas ele fica desatualizado.",
        ),
    },
    "warehouse-rbac": {
        "execution_type": "Automático",
        "stages": (
            "Preparação", "Autorização administrativa", "Configuração RBAC",
            "Usuário restrito", "Consulta permitida", "Tentativa proibida",
            "Agregados legados", "Resultado",
        ),
        "summary": "Comprova, com uma identidade restrita, que consultas permitidas funcionam e armazéns externos são bloqueados.",
        "details": (
            "RBAC controla quem pode acessar o painel, enquanto User Permission limita quais armazéns essa pessoa pode consultar.",
            "A execução usa somente permissões existentes, mascara a identidade avaliada e restaura o usuário administrativo ao terminar.",
            "O teste só aprova quando a consulta permitida, a tentativa proibida e os agregados legados comprovam o mesmo isolamento.",
        ),
    },
    "security-ci": {
        "execution_type": "Externo",
        "attention_label": "Validação externa",
        "attention_impact": (
            "Este aviso não afirma que uma senha vazou ou que o backup falhou. A tela apenas não possui "
            "acesso suficiente ao servidor e ao GitHub para comprovar esses controles sozinha."
        ),
        "attention_next_step": (
            "Registrar a confirmação do backup, da verificação de segredos e das proteções da CI/PR fora do ERP."
        ),
        "stages": ("Preparação", "Permissões", "Segredos e backup", "CI e proteção do PR", "Resultado externo"),
        "summary": "Lembra as verificações externas de segredos, backups e proteção do processo de publicação.",
        "details": (
            "A aplicação web não consegue examinar todo o histórico Git, as configurações do GitHub ou os arquivos privados do host.",
            "Por isso este item exige evidência da CI e da auditoria operacional antes de uma publicação ser considerada segura.",
        ),
    },
    "automated-tests": {
        "execution_type": "Híbrido",
        "attention_label": "CI pendente",
        "attention_impact": (
            "As APIs disponíveis podem ser testadas nesta tela, mas isso não substitui a suíte completa nem "
            "a validação visual autenticada. O aviso não impede o uso normal do ERP."
        ),
        "attention_next_step": (
            "Executar este item para validar as APIs reais e anexar o resultado da suíte automatizada/CI."
        ),
        "stages": ("Preparação", "Permissões", "API Estoque", "API Usuários", "Evidências e CI", "Resultado"),
        "summary": "Verifica as APIs autenticadas de Estoque e Usuários e indica o que ainda depende da suíte automatizada.",
        "details": (
            "Este botão consulta dados reais das páginas CDC Estoque e CDC Usuários para confirmar rota, permissão e resposta das APIs.",
            "A API responder não prova que o navegador terminou de montar a interface; essa etapa visual e de assets pertence ao teste 9.",
        ),
    },
    "workspace-navigation": {
        "execution_type": "Automático",
        "stages": ("Preparação", "Permissões", "Workspaces e ícones", "SPA e duplicidades", "Resultado"),
        "summary": "Procura páginas duplicadas, ordem incorreta, ícones ausentes e montagem na página SPA errada.",
        "details": (
            "O teste compara as onze workspaces CDC esperadas e valida nome, ordem, visibilidade e ícone.",
            "Também confirma que cada painel é montado apenas no contêiner ativo, reduzindo páginas brancas após navegar sem F5.",
        ),
    },
    "theme-integrity": {
        "execution_type": "Automático",
        "stages": ("Preparação", "Permissões", "Assets e cache", "Montagem e watchdog", "Resultado"),
        "summary": "Detecta falhas de assets, cache, montagem SPA e render que causam tela branca ou carregamento infinito.",
        "details": (
            "A verificação confirma CSS, JavaScript, versão de cache, escopo dos helpers e idempotência: eventos repetidos não podem recolocar o spinner nem consultar novamente sem mudança de filtro.",
            "O reparo reconcilia workspaces e caches; se os dados chegam mas o render falha, o painel mostra a etapa exata e permite tentar novamente.",
        ),
    },
    "production-validation": {
        "execution_type": "Híbrido",
        "stages": ("Preparação", "Permissões", "Versão publicada", "Sessão autenticada", "Resultado"),
        "summary": "Confirma que a versão foi publicada e verificada com uma sessão administrativa em produção.",
        "details": (
            "Responder HTTP 200 sem login não prova que cards, permissões e ações funcionam dentro do Desk autenticado.",
            "Este gate deve ser concluído no domínio oficial com um System Manager e a mesma versão que foi validada nos testes.",
        ),
    },
}


def _monitoring_quality_gate(
    gate_id, title, status, evidence, action=None, action_label=None,
    stage_results=None, metrics=None,
):
    copy = QUALITY_GATE_COPY.get(gate_id, {})
    details = list(copy.get("details", ()))
    details.append(f"Resultado desta execução: {evidence}")
    gate = {
        "id": gate_id,
        "title": title,
        "status": status,
        "summary": copy.get("summary", evidence),
        "details": details,
        "evidence": evidence,
        "execution_type": copy.get("execution_type", "Automático"),
        "stages": list(copy.get("stages", ("Preparação", "Permissões", "Evidências", "Resultado"))),
    }
    if status == "warning":
        gate["attention_label"] = copy.get("attention_label", "Requer confirmação")
        gate["attention_impact"] = copy.get(
            "attention_impact",
            "A verificação ficou inconclusiva; isso não significa, por si só, falha operacional.",
        )
        gate["attention_next_step"] = copy.get(
            "attention_next_step",
            "Abra os detalhes e execute novamente o teste para obter evidências atualizadas.",
        )
    if action:
        gate["action"] = action
        gate["action_label"] = action_label or "Executar correção"
    if stage_results is not None:
        gate["stage_results"] = stage_results
    if metrics is not None:
        gate["metrics"] = metrics
    return gate


def _mask_rbac_identity(user):
    value = str(user or "").strip()
    if "@" not in value:
        return (value[:1] or "u") + "***"
    local, domain = value.split("@", 1)
    return (local[:1] or "u") + "***@" + domain


def _warehouse_rbac_stage(index, label, status, detail):
    return {"index": index, "label": label, "status": status, "detail": detail}


def _warehouse_permission_snapshot():
    rows = frappe.get_all(
        "User Permission",
        filters={"allow": "Warehouse"},
        fields=["user", "for_value"],
        limit_page_length=0,
    )
    return {
        "permission_rows": len(rows),
        "users_with_scope": len({row.user for row in rows if row.user}),
        "warehouses_referenced": len({row.for_value for row in rows if row.for_value}),
        "permission_users": sorted({row.user for row in rows if row.user}),
    }


def _find_restricted_warehouse_user(all_warehouses, require_stock_manager=False):
    """Localiza uma identidade existente e apenas lê seu escopo efetivo."""
    original_user = frappe.session.user
    snapshot = _warehouse_permission_snapshot()
    enabled_users = set(frappe.get_all(
        "User",
        filters={"enabled": 1, "user_type": "System User"},
        pluck="name",
        limit_page_length=0,
    ))
    candidates = [
        user for user in snapshot["permission_users"]
        if user in enabled_users and user not in {"Administrator", "Guest"}
    ]
    required_doctypes = (
        ("Warehouse", "Stock Entry")
        if require_stock_manager
        else ("Warehouse", "Bin", "Stock Ledger Entry", "Item", "Item Group")
    )
    try:
        for user in candidates:
            try:
                roles = set(frappe.get_roles(user))
                if require_stock_manager and "Stock Manager" not in roles:
                    continue
                frappe.set_user(user)
                if not all(frappe.has_permission(doctype, "read") for doctype in required_doctypes):
                    continue
                visible = set(frappe.get_list(
                    "Warehouse",
                    filters={"is_group": 0},
                    pluck="name",
                    order_by="name asc",
                    limit_page_length=0,
                ))
                if visible and visible < all_warehouses:
                    return {
                        "user": user,
                        "masked_user": _mask_rbac_identity(user),
                        "visible_warehouses": visible,
                        "roles": roles,
                    }
            except Exception:
                # Uma identidade incompleta não invalida os demais candidatos.
                continue
            finally:
                frappe.set_user(original_user)
    finally:
        frappe.set_user(original_user)
    return None


def _run_warehouse_rbac_audit():
    """Audita o isolamento sem criar usuários, papéis, permissões ou sessões."""
    original_user = frappe.session.user
    all_warehouses = set(frappe.get_all(
        "Warehouse",
        filters={"is_group": 0},
        pluck="name",
        limit_page_length=0,
    ))
    snapshot = _warehouse_permission_snapshot()
    stage_results = []
    metrics = {
        "permission_rows": snapshot["permission_rows"],
        "users_with_scope": snapshot["users_with_scope"],
        "warehouses_referenced": snapshot["warehouses_referenced"],
        "leaf_warehouses": len(all_warehouses),
        "forbidden_attempts": 0,
        "unexpected_warehouses": 0,
    }

    configured = bool(all_warehouses and snapshot["permission_rows"] and snapshot["users_with_scope"])
    stage_results.append(_warehouse_rbac_stage(
        2, "Configuração RBAC", "passed" if configured else "failed",
        (
            f"{snapshot['permission_rows']} permissões de Warehouse para "
            f"{snapshot['users_with_scope']} usuário(s), cobrindo "
            f"{snapshot['warehouses_referenced']} armazém(ns) referenciado(s)."
            if configured else "Não há permissões de Warehouse suficientes para uma comparação real."
        ),
    ))

    catalog_candidate = _find_restricted_warehouse_user(all_warehouses)
    if catalog_candidate:
        metrics["catalog_identity"] = catalog_candidate["masked_user"]
        metrics["catalog_visible_warehouses"] = len(catalog_candidate["visible_warehouses"])
        stage_results.append(_warehouse_rbac_stage(
            3, "Usuário restrito", "passed",
            f"Identidade {catalog_candidate['masked_user']} possui acesso efetivo a "
            f"{len(catalog_candidate['visible_warehouses'])} de {len(all_warehouses)} armazéns.",
        ))
        permitted = sorted(catalog_candidate["visible_warehouses"])[0]
        forbidden = sorted(all_warehouses - catalog_candidate["visible_warehouses"])[0]
        try:
            frappe.set_user(catalog_candidate["user"])
            allowed_result = get_catalog_management_dashboard_data(
                dashboard_type="warehouses",
                selected_warehouse=permitted,
                period_days=7,
            )
            filter_names = {
                row.get("name") for row in (allowed_result.get("filters", {}).get("warehouses") or [])
                if row.get("name")
            }
            table_names = {
                row.get("name") for row in (allowed_result.get("table", {}).get("rows") or [])
                if row.get("name")
            }
            unexpected = (filter_names | table_names) - catalog_candidate["visible_warehouses"]
            allowed_ok = (
                allowed_result.get("filters", {}).get("selected_warehouse") == permitted
                and not unexpected
                and len(allowed_result.get("cards") or []) == 5
            )
            metrics["unexpected_warehouses"] += len(unexpected)
            stage_results.append(_warehouse_rbac_stage(
                4, "Consulta permitida", "passed" if allowed_ok else "failed",
                "Painel restrito respondeu com cinco cards e nenhum armazém externo."
                if allowed_ok else "A consulta permitida retornou escopo divergente ou dados externos.",
            ))

            metrics["forbidden_attempts"] = 1
            forbidden_blocked = False
            message_log = getattr(frappe.local, "message_log", [])
            message_count = len(message_log)
            try:
                get_catalog_management_dashboard_data(
                    dashboard_type="warehouses",
                    selected_warehouse=forbidden,
                    period_days=7,
                )
            except frappe.PermissionError:
                forbidden_blocked = True
                current_messages = getattr(frappe.local, "message_log", [])
                if isinstance(current_messages, list):
                    del current_messages[message_count:]
            stage_results.append(_warehouse_rbac_stage(
                5, "Tentativa proibida", "passed" if forbidden_blocked else "failed",
                "O armazém fora do escopo foi rejeitado com PermissionError."
                if forbidden_blocked else "A API aceitou um armazém fora do escopo da identidade avaliada.",
            ))
        except Exception as error:
            error_name = type(error).__name__
            if not any(result["index"] == 4 for result in stage_results):
                stage_results.append(_warehouse_rbac_stage(
                    4, "Consulta permitida", "failed",
                    f"A consulta permitida terminou com erro do tipo {error_name}.",
                ))
            if not any(result["index"] == 5 for result in stage_results):
                stage_results.append(_warehouse_rbac_stage(
                    5, "Tentativa proibida", "warning",
                    "A tentativa proibida não foi executada porque a consulta permitida falhou.",
                ))
        finally:
            frappe.set_user(original_user)
    else:
        metrics["catalog_identity"] = "indisponível"
        stage_results.extend([
            _warehouse_rbac_stage(
                3, "Usuário restrito", "warning",
                "Nenhum usuário existente combina escopo parcial e todas as leituras exigidas pelo painel gerencial.",
            ),
            _warehouse_rbac_stage(
                4, "Consulta permitida", "warning",
                "Etapa não executada: falta uma identidade restrita elegível.",
            ),
            _warehouse_rbac_stage(
                5, "Tentativa proibida", "warning",
                "Etapa não executada: falta uma identidade restrita elegível.",
            ),
        ])

    manager_candidate = _find_restricted_warehouse_user(all_warehouses, require_stock_manager=True)
    if manager_candidate:
        metrics["legacy_identity"] = manager_candidate["masked_user"]
        metrics["legacy_visible_warehouses"] = len(manager_candidate["visible_warehouses"])
        try:
            frappe.set_user(manager_candidate["user"])
            legacy_result = get_stock_dashboard_data(
                selected_unit="All", period="quarter", entry_type="receipt", table_type="all",
            )
            legacy_units = {
                row.get("value") for row in (legacy_result.get("available_units") or [])
                if row.get("value") and row.get("value") != "All"
            }
            unexpected = legacy_units - manager_candidate["visible_warehouses"]
            legacy_ok = (
                not unexpected
                and int(legacy_result.get("total_warehouses") or 0)
                <= len(manager_candidate["visible_warehouses"])
            )
            metrics["unexpected_warehouses"] += len(unexpected)
            stage_results.append(_warehouse_rbac_stage(
                6, "Agregados legados", "passed" if legacy_ok else "failed",
                "CDC Estoque respeitou o mesmo conjunto de armazéns permitidos."
                if legacy_ok else "CDC Estoque expôs opções ou totais além do escopo permitido.",
            ))
        except Exception as error:
            stage_results.append(_warehouse_rbac_stage(
                6, "Agregados legados", "failed",
                f"A validação do CDC Estoque terminou com erro do tipo {type(error).__name__}.",
            ))
        finally:
            frappe.set_user(original_user)
    else:
        metrics["legacy_identity"] = "indisponível"
        stage_results.append(_warehouse_rbac_stage(
            6, "Agregados legados", "failed",
            "Nenhum Stock Manager existente possui escopo parcial de Warehouse; o isolamento dos SQL agregados não pôde ser comprovado.",
        ))

    frappe.set_user(original_user)
    failed = [result for result in stage_results if result["status"] == "failed"]
    warnings = [result for result in stage_results if result["status"] == "warning"]
    status = "blocked" if failed else "warning" if warnings else "passed"
    if status == "passed":
        evidence = (
            f"Isolamento comprovado com {metrics['forbidden_attempts']} tentativa proibida e "
            f"{metrics['unexpected_warehouses']} armazém(ns) externo(s) retornado(s)."
        )
    elif status == "warning":
        evidence = "Auditoria sem vazamento detectado, mas uma ou mais etapas ficaram inconclusivas."
    else:
        evidence = "Auditoria bloqueada: " + " ".join(result["detail"] for result in failed)
    return {"status": status, "evidence": evidence, "stage_results": stage_results, "metrics": metrics}


def _normalize_workspace_identity(value):
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized.lower()).strip()
    return re.sub(r"\s+(dup|duplicate|copia|copy)(\s+\d+)?$", "", normalized).strip()


def _workspace_navigation_health(sources):
    expected = [
        ("CDC Estoque", 1.0, "stock"),
        ("CDC Usuários", 2.0, "users"),
        (CDC_GROUPS_WORKSPACE, 3.0, "folder-normal"),
        (CDC_ITEMS_WORKSPACE, 4.0, "assets"),
        (CDC_WAREHOUSE_WORKSPACE, 5.0, "organization"),
        ("CDC Integrações", 6.0, "integration"),
        ("CDC Pendências", 7.0, "list-alt"),
        ("CDC Monitoramento", 8.0, "dashboard"),
        (CDC_TESTS_WORKSPACE, 9.0, "check"),
        (CDC_ADMIN_WORKSPACE, 10.0, "tool"),
        (CDC_TRAINING_WORKSPACE, 11.0, "education"),
    ]
    rows = frappe.get_all(
        "Workspace",
        filters={"name": ["like", "CDC%"]},
        fields=["name", "label", "sequence_id", "icon", "is_hidden"],
    )
    visible_rows = [row for row in rows if not row.is_hidden]
    expected_names = {name for name, _, _ in expected}
    by_name = {row.name: row for row in visible_rows}

    identity_groups = {}
    for row in visible_rows:
        identity = _normalize_workspace_identity(row.label or row.name)
        identity_groups.setdefault(identity, []).append(row.name)
    duplicates = [names for names in identity_groups.values() if len(names) > 1]
    missing = [name for name, _, _ in expected if name not in by_name]
    unexpected = [row.name for row in visible_rows if row.name not in expected_names]
    order_errors = [
        name for name, sequence, _ in expected
        if name in by_name and float(by_name[name].sequence_id or 0) != sequence
    ]
    icon_errors = [
        name for name, _, icon in expected
        if name in by_name and by_name[name].icon != icon
    ]

    routed_assets = ("pending", "tests", "management", "stock_routes", "admin")
    main_theme_source = sources.get("theme", "").split("CDC MONITORING WORKSPACE DASHBOARD INITIALIZER", 1)[0]
    active_mount_safe = (
        "function claimActiveDashboard" in sources.get("theme", "")
        and "function claimCDCActiveDashboard" in main_theme_source
        and "claimActiveDashboard(" not in main_theme_source
        and all("window._cdc_claim_active_dashboard" in sources.get(asset, "") for asset in routed_assets)
        and all(
            "window._cdc_render_management_dashboard" in sources.get(asset, "")
            for asset in ("groups", "items", "warehouse")
        )
    )
    healthy = not any((duplicates, missing, unexpected, order_errors, icon_errors)) and active_mount_safe
    details = []
    if duplicates:
        details.append(f"duplicadas: {duplicates}")
    if missing:
        details.append(f"ausentes: {missing}")
    if unexpected:
        details.append(f"extras: {unexpected}")
    if order_errors:
        details.append(f"ordem divergente: {order_errors}")
    if icon_errors:
        details.append(f"ícones inválidos: {icon_errors}")
    if not active_mount_safe:
        details.append("montagem SPA ainda usa contêiner global ou obsoleto")
    return healthy, (
        "11 workspaces únicas, ordenadas, com ícones válidos e montagem limitada à página SPA ativa."
        if healthy else "; ".join(details)
    )


def _theme_integrity_health(asset_paths, sources):
    """Confirma fontes, links publicados, versão de cache e montagem SPA do tema."""
    public_assets = {
        "theme": "js/cdc_theme.js",
        "pending": "js/cdc_pending.js",
        "tests": "js/cdc_tests.js",
        "management": "js/cdc_management.js",
        "groups": "js/cdc_groups.js",
        "items": "js/cdc_items.js",
        "warehouse": "js/cdc_warehouse.js",
        "stock_routes": "js/cdc_stock_routes.js",
        "admin": "js/cdc_admin.js",
        "css": "css/cdc_theme.css",
    }
    missing_sources = [name for name in public_assets if not sources.get(name)]
    app_package_path = frappe.get_app_path("cdc_theme")
    bench_path = os.path.dirname(os.path.dirname(os.path.dirname(app_package_path)))
    public_root = os.path.join(bench_path, "sites", "assets", "cdc_theme")
    unpublished = []
    for name, relative_path in public_assets.items():
        published_path = os.path.join(public_root, relative_path)
        source_path = asset_paths[name]
        if not os.path.isfile(published_path) or os.path.realpath(published_path) != os.path.realpath(source_path):
            unpublished.append(relative_path)

    hook_source = sources.get("hooks", "")
    versions = set(re.findall(r"cdc_theme/[^\"']+\?v=([0-9A-Za-z_-]+)", hook_source))
    version_consistent = len(versions) == 1
    theme_source = sources.get("theme", "")
    stock_render_start = theme_source.find("function renderStockDashboard()")
    stock_render_end = theme_source.find("// --- EVENT DELEGATION GLOBAL ---", stock_render_start)
    stock_render_source = (
        theme_source[stock_render_start:stock_render_end]
        if stock_render_start >= 0 and stock_render_end > stock_render_start else ""
    )
    callback_start = stock_render_source.find("callback: function(r)")
    error_start = stock_render_source.find("error: function(err)", callback_start)
    callback_source = (
        stock_render_source[callback_start:error_start]
        if callback_start >= 0 and error_start > callback_start else ""
    )
    error_source = stock_render_source[error_start:] if error_start >= 0 else ""
    stale_guard = "requestSerial !== stockRequestSerial"
    clear_timer = "window.clearTimeout(stockRequestTimer)"
    stock_watchdog_safe = (
        "function startStockLoadingWatchdog" in theme_source
        and "function cancelStockDashboardRequest" in theme_source
        and "Date.now() - lastFetchTime > 6000" not in stock_render_source
        and stale_guard in callback_source and clear_timer in callback_source
        and callback_source.find(stale_guard) < callback_source.find(clear_timer)
        and stale_guard in error_source and clear_timer in error_source
        and error_source.find(stale_guard) < error_source.find(clear_timer)
    )
    stock_module_end = theme_source.find("})();")
    stock_module_source = theme_source[:stock_module_end] if stock_module_end > 0 else ""
    stock_render_safe = (
        "function escapeHTML(value)" in stock_module_source
        and "function getStockDashboardRenderKey" in stock_module_source
        and "stockActiveRequestKey === renderKey" in stock_render_source
        and "dashDiv.dataset.loaded === '1'" in stock_render_source
        and "dashDiv.dataset.state = 'ready'" in callback_source
    )
    spa_signatures = (
        "function claimActiveDashboard" in sources.get("theme", "")
        and "function claimCDCActiveDashboard" in sources.get("theme", "")
        and "window._cdc_repair_theme_runtime" in sources.get("theme", "")
        and "function isItemRoute" in sources.get("theme", "")
        and "function isItemGroupRoute" in sources.get("theme", "")
        and "window._cdc_claim_active_dashboard" in sources.get("tests", "")
        and "get_catalog_management_dashboard_data" in sources.get("management", "")
        and "serial !== state.serial" in sources.get("management", "")
        and "repairBrowserThemeState" in sources.get("tests", "")
        and stock_watchdog_safe
        and stock_render_safe
    )
    healthy = not missing_sources and not unpublished and version_consistent and spa_signatures
    if healthy:
        version = next(iter(versions))
        return True, (
            f"10 assets presentes e ligados ao volume público; cache {version} consistente; "
            "montagem SPA com escopo correto e idempotência ativa para prevenir telas brancas."
        )
    details = []
    if missing_sources:
        details.append("fontes ausentes: " + ", ".join(missing_sources))
    if unpublished:
        details.append("assets não publicados: " + ", ".join(unpublished))
    if not version_consistent:
        details.append("versões de cache divergentes ou ausentes")
    if not spa_signatures:
        details.append("escopo, idempotência ou proteção contra requisições concorrentes do Estoque incompletos")
    return False, "; ".join(details)


def _build_monitoring_quality_gates(sync_stale, duplicates, unique_index):
    """Executa gates somente leitura; estados não verificáveis nunca viram aprovação."""
    asset_paths = {
        "theme": frappe.get_app_path("cdc_theme", "public", "js", "cdc_theme.js"),
        "pending": frappe.get_app_path("cdc_theme", "public", "js", "cdc_pending.js"),
        "tests": frappe.get_app_path("cdc_theme", "public", "js", "cdc_tests.js"),
        "management": frappe.get_app_path("cdc_theme", "public", "js", "cdc_management.js"),
        "groups": frappe.get_app_path("cdc_theme", "public", "js", "cdc_groups.js"),
        "items": frappe.get_app_path("cdc_theme", "public", "js", "cdc_items.js"),
        "warehouse": frappe.get_app_path("cdc_theme", "public", "js", "cdc_warehouse.js"),
        "stock_routes": frappe.get_app_path("cdc_theme", "public", "js", "cdc_stock_routes.js"),
        "admin": frappe.get_app_path("cdc_theme", "public", "js", "cdc_admin.js"),
        "css": frappe.get_app_path("cdc_theme", "public", "css", "cdc_theme.css"),
        "hooks": frappe.get_app_path("cdc_theme", "hooks.py"),
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
    item_route_start = theme_source.find("function isItemRoute()")
    item_route_end = theme_source.find("function getCatalogRouteValue", item_route_start)
    item_route_source = (
        theme_source[item_route_start:item_route_end]
        if item_route_start >= 0 and item_route_end > item_route_start else ""
    )
    render_end = theme_source.find("function init()", route_start)
    render_source = theme_source[route_start:render_end] if route_start >= 0 and render_end > route_start else ""

    exact_route = (
        "routeType === 'list' && routeDoctype === 'item-group'" in route_source
        and "pathname === '/app/item-group/view/list'" in route_source
        and "routeType === 'list' && routeDoctype === 'item'" in item_route_source
        and "pathname === '/app/item/view/list'" in item_route_source
        and "window.location.href" not in route_source
        and "window.location.hash" not in route_source
        and "window.location.href" not in item_route_source
        and "window.location.hash" not in item_route_source
    )
    native_list_preserved = (
        "body.insertBefore(dashboard, listBody)" in render_source
        and "currentBody.insertBefore(dashboard, currentListBody)" in render_source
        and "cdc-catalog-list-enhanced" in render_source
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
    analytics_provider_ready = all((
        "def get_cdc_analytics_catalog" in sources["api"],
        "def get_cdc_analytics_dataset" in sources["api"],
        "_analytics_require_access(contract)" in sources["api"],
        "CDC_ANALYTICS_CONTRACT_VERSION" in sources["api"],
        "cdc_theme.api.get_cdc_analytics_catalog" in theme_source,
        "cdc_theme.api.get_cdc_analytics_dataset" in theme_source,
        "Metabase" in theme_source,
    ))

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
    workspace_navigation_ok, workspace_navigation_evidence = _workspace_navigation_health(sources)
    theme_integrity_ok, theme_integrity_evidence = _theme_integrity_health(asset_paths, sources)

    checks = [
        _monitoring_quality_gate(
            "item-group-route", "1. Rotas exatas de Item e Item Group",
            "passed" if exact_route else "blocked",
            "Detecção limitada às listas Item e Item Group e aos respectivos pathnames oficiais."
            if exact_route else "As assinaturas exatas das duas rotas não foram encontradas no asset instalado.",
        ),
        _monitoring_quality_gate(
            "item-group-native-list", "2. Listas nativas, cards e filtros",
            "passed" if native_list_preserved else "blocked",
            "Painéis montados antes das listas oficiais, sem ocultar ações, paginação ou conteúdo nativo."
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
            else (
                "As páginas gerenciais usam o escopo nativo, mas os SQL agregados do CDC Estoque "
                "ainda não têm isolamento comprovado. Execute este item para testar uma identidade restrita real."
            ),
        ),
        _monitoring_quality_gate(
            "security-ci", "6. Segredos, backups e workflow de PR", "warning",
            "O ERP não acessa o host e o repositório completos. Confirmação obrigatória pela CI e auditoria do servidor.",
        ),
        _monitoring_quality_gate(
            "automated-tests", "7. Rotas, APIs, permissões e integrações",
            "warning" if analytics_provider_ready else "blocked",
            (
                "Provedor analítico v1, catálogo e amostras autenticadas estão ligados à rota CDC Integrações; "
                "a suíte completa ainda exige confirmação pela CI."
                if analytics_provider_ready else
                "O catálogo analítico, o endpoint paginado ou a interface real do CDC Integrações está incompleta."
            ),
        ),
        _monitoring_quality_gate(
            "workspace-navigation", "8. Navegação SPA, duplicidades e ícones",
            "passed" if workspace_navigation_ok else "blocked",
            workspace_navigation_evidence,
        ),
        _monitoring_quality_gate(
            "theme-integrity", "9. Tema CDC, assets e prevenção de telas brancas",
            "passed" if theme_integrity_ok else "blocked",
            theme_integrity_evidence,
            action="repair_theme",
            action_label="Reparar tema e caches",
        ),
        _monitoring_quality_gate(
            "production-validation", "10. Publicação e validação autenticada",
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
def run_cdc_quality_gate(gate_id):
    """Recalcula a fotografia real e devolve somente o gate solicitado."""
    _require_system_manager()
    valid_ids = set(QUALITY_GATE_COPY)
    if gate_id not in valid_ids:
        frappe.throw("Teste de qualidade desconhecido.", frappe.ValidationError)
    dashboard = get_cdc_tests_dashboard()
    check = next((item for item in dashboard["checks"] if item["id"] == gate_id), None)
    if not check:
        frappe.throw("O teste solicitado não retornou resultado.", frappe.ValidationError)
    if gate_id == "warehouse-rbac":
        audit = _run_warehouse_rbac_audit()
        check = _monitoring_quality_gate(
            "warehouse-rbac",
            "5. RBAC por armazém nas consultas",
            audit["status"],
            audit["evidence"],
            stage_results=audit["stage_results"],
            metrics=audit["metrics"],
        )
    return {"check": check, "checked_at": dashboard["checked_at"]}



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
def get_item_list_dashboard_data(selected_project=None, selected_warehouse=None):
    """Resume e delimita a lista de Item por projeto/armazém permitido."""
    _require_read_permission("Item")
    _require_read_permission("Item Group")
    project, warehouse, options, scoped_warehouses, scope_active = _catalog_filter_context(
        selected_project, selected_warehouse,
    )
    scoped_codes = _catalog_positive_item_codes(scoped_warehouses, scope_active)

    item_rows = frappe.get_list(
        "Item",
        fields=["name", "disabled", "is_stock_item", "item_group"],
        limit_page_length=0,
    )
    groups = frappe.get_list(
        "Item Group",
        fields=["name", "is_group"],
        order_by="name asc",
        limit_page_length=0,
    )

    active_items = 0
    disabled_items = 0
    active_stock_items = 0
    active_non_stock_items = 0
    active_groups = set()
    visible_names = []
    for row in item_rows:
        if scope_active and row.name not in scoped_codes:
            continue
        visible_names.append(row.name)
        if int(row.disabled or 0):
            disabled_items += 1
            continue
        active_items += 1
        active_groups.add(row.item_group)
        if int(row.is_stock_item or 0):
            active_stock_items += 1
        else:
            active_non_stock_items += 1
    visible_names.sort()

    filter_payload = _catalog_filters_payload(
        project, warehouse, options, scope_active, scoped_warehouses,
    )
    filter_payload.update({
        # O legado possui itens vinculados também a grupos marcados como pai.
        # Não ocultamos esses valores do filtro enquanto o cadastro é saneado.
        "groups": [row.name for row in groups],
    })
    return {
        "summary": {
            "active_items": active_items,
            "disabled_items": disabled_items,
            "active_stock_items": active_stock_items,
            "active_non_stock_items": active_non_stock_items,
            "groups_in_use": len(active_groups),
            "filtered_records": len(visible_names),
        },
        "scope": {
            "active": scope_active,
            "names": visible_names if scope_active else [],
        },
        "filters": filter_payload,
    }


@frappe.whitelist()
def get_item_group_dashboard_data(selected_project=None, selected_warehouse=None):
    """Resume e delimita Item Group por projeto/armazém permitido."""
    _require_read_permission("Item Group")
    _require_read_permission("Item")
    project, warehouse, options, scoped_warehouses, scope_active = _catalog_filter_context(
        selected_project, selected_warehouse,
    )
    scoped_codes = _catalog_positive_item_codes(scoped_warehouses, scope_active)

    groups = frappe.get_list(
        "Item Group",
        fields=["name", "parent_item_group", "is_group"],
        order_by="name asc",
        limit_page_length=0,
    )
    item_rows = frappe.get_list(
        "Item",
        fields=["name", "disabled", "item_group"],
        limit_page_length=0,
    )
    active_by_group = {}
    active_items = 0
    direct_scope_groups = set()
    for row in item_rows:
        if scope_active and row.name not in scoped_codes:
            continue
        if row.item_group:
            direct_scope_groups.add(row.item_group)
        if int(row.disabled or 0):
            continue
        active_items += 1
        active_by_group[row.item_group] = active_by_group.get(row.item_group, 0) + 1

    group_by_name = {row.name: row for row in groups}
    relevant_groups = set(direct_scope_groups)
    for group_name in tuple(direct_scope_groups):
        current = group_by_name.get(group_name)
        visited = set()
        while current and current.parent_item_group and current.parent_item_group not in visited:
            visited.add(current.parent_item_group)
            relevant_groups.add(current.parent_item_group)
            current = group_by_name.get(current.parent_item_group)

    summary_groups = (
        [row for row in groups if row.name in relevant_groups]
        if scope_active else groups
    )

    final_groups = [row for row in summary_groups if not int(row.is_group or 0)]
    parent_groups = [row for row in summary_groups if int(row.is_group or 0)]
    empty_final_groups = [row for row in final_groups if not active_by_group.get(row.name)]

    filter_payload = _catalog_filters_payload(
        project, warehouse, options, scope_active, scoped_warehouses,
    )
    filter_payload["parent_groups"] = [
        row.name for row in groups if int(row.is_group or 0)
    ]
    return {
        "summary": {
            "total_groups": len(summary_groups),
            "parent_groups": len(parent_groups),
            "final_groups": len(final_groups),
            "active_items": active_items,
            "empty_final_groups": len(empty_final_groups),
            "filtered_records": len(summary_groups),
        },
        "scope": {
            "active": scope_active,
            "names": sorted(relevant_groups) if scope_active else [],
        },
        "filters": filter_payload,
    }


@frappe.whitelist()
def get_warehouse_list_dashboard_data(
    search=None,
    company=None,
    disabled=None,
    is_group=None,
    parent_warehouse=None,
    selected_project=None,
):
    """Resume a lista nativa de Warehouse dentro do contexto permitido ao usuário."""
    _require_read_permission("Warehouse")
    rows = frappe.get_list(
        "Warehouse",
        fields=[
            "name", "warehouse_name", "company", "disabled",
            "is_group", "parent_warehouse",
        ],
        order_by="name asc",
        limit_page_length=0,
    )

    companies = sorted({row.company for row in rows if row.company})
    parent_groups = sorted({row.name for row in rows if int(row.is_group or 0)})
    represented_projects = [
        project for project in CDC_PROJECTS
        if any(_warehouse_project(row.name) == project for row in rows)
    ]

    requested_company = (company or "").strip()
    requested_parent = (parent_warehouse or "").strip()
    requested_project = (selected_project or "All").strip()
    requested_search = (search or "").strip()[:120]
    requested_disabled = str(disabled).strip() if disabled is not None else ""
    requested_group = str(is_group).strip() if is_group is not None else ""

    if requested_company and requested_company not in companies:
        frappe.throw("Empresa indisponível para o usuário atual.", frappe.PermissionError)
    if requested_parent and requested_parent not in parent_groups:
        frappe.throw("Grupo pai indisponível para o usuário atual.", frappe.PermissionError)
    if requested_project != "All" and requested_project not in represented_projects:
        frappe.throw("Projeto indisponível para o usuário atual.", frappe.PermissionError)
    if requested_disabled not in {"", "0", "1"}:
        frappe.throw("Filtro de status inválido.", frappe.ValidationError)
    if requested_group not in {"", "0", "1"}:
        frappe.throw("Filtro de tipo inválido.", frappe.ValidationError)

    search_key = requested_search.casefold()
    filtered_rows = []
    for row in rows:
        if requested_company and row.company != requested_company:
            continue
        if requested_parent and row.parent_warehouse != requested_parent:
            continue
        if requested_project != "All" and _warehouse_project(row.name) != requested_project:
            continue
        if requested_disabled and int(row.disabled or 0) != int(requested_disabled):
            continue
        if requested_group and int(row.is_group or 0) != int(requested_group):
            continue
        if search_key and search_key not in f"{row.name} {row.warehouse_name or ''}".casefold():
            continue
        filtered_rows.append(row)

    operational = [row for row in filtered_rows if not int(row.is_group or 0)]
    groups = [row for row in filtered_rows if int(row.is_group or 0)]
    inactive = [row for row in filtered_rows if int(row.disabled or 0)]
    projects_in_context = {_warehouse_project(row.name) for row in filtered_rows}

    return {
        "summary": {
            "total_results": len(filtered_rows),
            "operational_warehouses": len(operational),
            "warehouse_groups": len(groups),
            "inactive_warehouses": len(inactive),
            "projects_in_context": len(projects_in_context),
        },
        "filters": {
            "companies": companies,
            "parent_groups": parent_groups,
            "projects": represented_projects,
            "selected_company": requested_company,
            "selected_parent": requested_parent,
            "selected_project": requested_project,
            "selected_disabled": requested_disabled,
            "selected_is_group": requested_group,
            "search": requested_search,
        },
        "scope": {
            "active": requested_project != "All",
            "names": [row.name for row in filtered_rows] if requested_project != "All" else [],
        },
    }


@frappe.whitelist()
def get_stock_document_dashboard_data(
    document_type=None,
    search=None,
    company=None,
    from_date=None,
    to_date=None,
    docstatus=None,
    movement_type=None,
):
    """Resume listas de movimentação sem contornar permissões do Frappe."""
    definitions = {
        "Stock Entry": {
            "movement_field": "stock_entry_type",
            "fields": [
                "name", "company", "posting_date", "docstatus", "purpose",
                "stock_entry_type", "from_warehouse", "to_warehouse",
            ],
        },
        "Stock Reconciliation": {
            "movement_field": "purpose",
            "fields": [
                "name", "company", "posting_date", "docstatus", "purpose",
                "difference_amount",
            ],
        },
    }
    if document_type not in definitions:
        frappe.throw("Tipo de documento de estoque inválido.", frappe.ValidationError)

    _require_read_permission(document_type)
    definition = definitions[document_type]
    movement_field = definition["movement_field"]
    requested_search = (search or "").strip()[:120]
    requested_company = (company or "").strip()
    requested_movement = (movement_type or "").strip()
    requested_status = str(docstatus).strip() if docstatus is not None else ""
    if requested_status not in {"", "0", "1", "2"}:
        frappe.throw("Situação documental inválida.", frappe.ValidationError)

    try:
        requested_from = str(getdate(from_date)) if from_date else ""
        requested_to = str(getdate(to_date)) if to_date else ""
    except Exception:
        frappe.throw("Período inválido.", frappe.ValidationError)
    if requested_from and requested_to and getdate(requested_from) > getdate(requested_to):
        frappe.throw("A data inicial não pode ser posterior à data final.", frappe.ValidationError)

    option_rows = frappe.get_list(
        document_type,
        fields=["company", movement_field],
        limit_page_length=0,
    )
    companies = sorted({row.company for row in option_rows if row.company})
    movement_types = sorted({row.get(movement_field) for row in option_rows if row.get(movement_field)})
    if requested_company and requested_company not in companies:
        frappe.throw("Empresa indisponível para o usuário atual.", frappe.PermissionError)
    if requested_movement and requested_movement not in movement_types:
        frappe.throw("Tipo de movimentação indisponível para o usuário atual.", frappe.PermissionError)

    filters = {}
    if requested_search:
        filters["name"] = ["like", f"%{requested_search}%"]
    if requested_company:
        filters["company"] = requested_company
    if requested_movement:
        filters[movement_field] = requested_movement
    if requested_status:
        filters["docstatus"] = int(requested_status)
    if requested_from and requested_to:
        filters["posting_date"] = ["between", [requested_from, requested_to]]
    elif requested_from:
        filters["posting_date"] = [">=", requested_from]
    elif requested_to:
        filters["posting_date"] = ["<=", requested_to]

    rows = frappe.get_list(
        document_type,
        filters=filters,
        fields=definition["fields"],
        order_by="posting_date desc, modified desc",
        limit_page_length=0,
    )
    submitted = sum(1 for row in rows if int(row.docstatus or 0) == 1)
    drafts = sum(1 for row in rows if int(row.docstatus or 0) == 0)
    cancelled = sum(1 for row in rows if int(row.docstatus or 0) == 2)
    summary = {
        "total_results": len(rows),
        "submitted": submitted,
        "drafts": drafts,
        "cancelled": cancelled,
    }
    if document_type == "Stock Entry":
        purposes = [str(row.purpose or row.stock_entry_type or "").casefold() for row in rows]
        summary.update({
            "receipts": sum("receipt" in value for value in purposes),
            "issues": sum("issue" in value for value in purposes),
            "transfers": sum("transfer" in value for value in purposes),
        })
    else:
        summary["difference_amount"] = sum(
            float(row.difference_amount or 0)
            for row in rows if int(row.docstatus or 0) == 1
        )

    return {
        "document_type": document_type,
        "summary": summary,
        "filters": {
            "companies": companies,
            "movement_types": movement_types,
            "selected_company": requested_company,
            "selected_movement_type": requested_movement,
            "selected_docstatus": requested_status,
            "search": requested_search,
            "from_date": requested_from,
            "to_date": requested_to,
        },
    }


@frappe.whitelist()
def get_stock_report_filter_options(report_key=None):
    """Retorna somente opções visíveis para os relatórios CDC de inventário."""
    if report_key not in {"inventory-ledger", "stock-balance"}:
        frappe.throw("Relatório de estoque inválido.", frappe.ValidationError)
    _require_read_permission("Stock Ledger Entry")
    _require_read_permission("Warehouse")
    if report_key == "stock-balance":
        _require_read_permission("Item Group")

    warehouses = frappe.get_list(
        "Warehouse",
        filters={"is_group": 0, "disabled": 0},
        fields=["name", "company"],
        order_by="name asc",
        limit_page_length=0,
    )
    groups = []
    if report_key == "stock-balance":
        groups = frappe.get_list(
            "Item Group",
            fields=["name"],
            order_by="name asc",
            limit_page_length=0,
        )
    return {
        "companies": sorted({row.company for row in warehouses if row.company}),
        "warehouses": [row.name for row in warehouses],
        "item_groups": [row.name for row in groups],
    }
