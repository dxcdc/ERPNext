"""Catalogo e avaliacao central de acesso das paginas CDC.

Esta camada complementa, mas nao substitui, Role, Role Profile, permissoes de
DocType e User Permission do Frappe.
"""

from collections import OrderedDict
from datetime import timedelta

import frappe
from frappe.utils import getdate, now_datetime, today


SYSTEM_MANAGER_ROLE = "System Manager"
MANAGER_ROLES = frozenset({SYSTEM_MANAGER_ROLE, "Stock Manager", "Gestor de Estoque"})
OPERATOR_ROLES = frozenset({*MANAGER_ROLES, "Stock User", "Operador"})
COMMON_ROLES = frozenset({
    *MANAGER_ROLES,
    "CDC Estoque Restrito",
    "Stock User",
    "Operador",
    "Consulta",
})

ACTIONS = OrderedDict((
    ("view", "Visualizar"),
    ("create", "Criar"),
    ("edit", "Editar"),
    ("submit", "Finalizar/aprovar"),
    ("cancel", "Cancelar"),
    ("export", "Exportar"),
    ("delete", "Excluir"),
))


def _page(
    key, label, workspace, route, roles, actions=("view",), native_routes=(),
    action_roles=None, exception_grantable=True,
):
    configured_action_roles = {"view": frozenset(roles)}
    for action in actions:
        configured_action_roles.setdefault(action, frozenset(roles))
    for action, allowed_roles in (action_roles or {}).items():
        configured_action_roles[action] = frozenset(allowed_roles)
    return {
        "key": key,
        "program": "cdc-stock",
        "program_label": "CDC Estoque",
        "label": label,
        "workspace": workspace,
        "route": route,
        "route_aliases": tuple(native_routes),
        "default_roles": frozenset(roles),
        "action_roles": configured_action_roles,
        "actions": tuple(actions),
        "exception_grantable": bool(exception_grantable),
    }


PAGE_CATALOG = OrderedDict((page["key"], page) for page in (
    _page(
        "stock", "Estoque", "CDC Estoque", "/app/cdc-estoque", COMMON_ROLES,
        ("view", "create", "edit", "submit", "cancel", "export"),
        ("/app/stock-entry", "/app/stock-ledger-entry", "/app/bin"),
        {
            "create": OPERATOR_ROLES,
            "edit": OPERATOR_ROLES,
            "submit": OPERATOR_ROLES,
            "cancel": MANAGER_ROLES,
            "export": COMMON_ROLES,
        },
    ),
    _page("users", "Usuários", "CDC Usuários", "/app/cdc-usuarios", COMMON_ROLES),
    _page("groups", "Grupos", "CDC Grupos", "/app/cdc-grupos", COMMON_ROLES, ("view", "export"), ("/app/item-group",)),
    _page("items", "Itens", "CDC Itens", "/app/cdc-itens", COMMON_ROLES, ("view", "export"), ("/app/item",)),
    _page("warehouses", "Armazéns", "CDC Armazém", "/app/cdc-armazem", COMMON_ROLES, ("view", "export"), ("/app/warehouse",)),
    _page("reports", "Relatórios", "CDC Relatórios", "/app/cdc-relatorios", COMMON_ROLES, ("view", "export"), ("/app/stock-entry/view/report",)),
    _page("integrations", "Integrações", "CDC Integrações", "/app/cdc-integracoes", MANAGER_ROLES, ("view", "edit")),
    _page("pending", "Pendências", "CDC Pendências", "/app/cdc-pendencias", COMMON_ROLES),
    _page("monitoring", "Monitoramento", "CDC Monitoramento", "/app/cdc-monitoramento", (SYSTEM_MANAGER_ROLE,), exception_grantable=False),
    _page("tests", "Testes", "CDC Testes", "/app/cdc-testes", (SYSTEM_MANAGER_ROLE,), ("view", "submit"), exception_grantable=False),
    _page("admin", "Administração", "CDC Admin", "/app/cdc-admin", (SYSTEM_MANAGER_ROLE,), ("view", "edit", "submit"), exception_grantable=False),
    _page("training", "Treinamento", "CDC Treinamento", "/app/cdc-treinamento", COMMON_ROLES),
))

ACCESS_EXCEPTION_DOCTYPE = "CDC Access Exception"
ACCESS_ACTION_DOCTYPE = "CDC Access Exception Action"
ACCESS_WAREHOUSE_DOCTYPE = "CDC Access Exception Warehouse"
ACCESS_AUDIT_DOCTYPE = "CDC Access Audit Log"
PREVIEW_TTL_SECONDS = 30 * 60
PREVIEW_CACHE_PREFIX = "cdc_access_preview"


def normalize_page_key(value):
    value = str(value or "").strip().lower()
    if value not in PAGE_CATALOG:
        frappe.throw("Pagina CDC invalida.", frappe.ValidationError)
    return value


def normalize_action(value, page_key=None):
    value = str(value or "view").strip().lower()
    if value not in ACTIONS:
        frappe.throw("Acao CDC invalida.", frappe.ValidationError)
    if page_key and value not in PAGE_CATALOG[normalize_page_key(page_key)]["actions"]:
        frappe.throw("Acao indisponivel para esta pagina.", frappe.ValidationError)
    return value


def catalog_payload():
    return {
        "programs": [{"key": "cdc-stock", "label": "CDC Estoque"}],
        "actions": [{"key": key, "label": label} for key, label in ACTIONS.items()],
        "pages": [{
            key: value for key, value in page.items()
            if key not in {"default_roles", "action_roles", "route_aliases"}
        } | {
            "default_roles": sorted(page["default_roles"]),
            "action_roles": {
                action: sorted(roles) for action, roles in page["action_roles"].items()
            },
            "route_aliases": list(page["route_aliases"]),
        } for page in PAGE_CATALOG.values()],
    }


def roles_for_user(user):
    return set(frappe.get_roles(user))


def role_profile_for_user(user):
    return frappe.db.get_value("User", user, "role_profile_name") or ""


def roles_for_profile(role_profile):
    if not role_profile:
        return set()
    return set(frappe.get_all(
        "Has Role",
        filters={"parenttype": "Role Profile", "parent": role_profile},
        pluck="role",
    ))


def baseline_allowed(roles, page_key, action="view"):
    page = PAGE_CATALOG[normalize_page_key(page_key)]
    action = normalize_action(action, page_key)
    return bool(set(roles).intersection(page["action_roles"].get(action, ())))


def exception_is_active(row, reference_date=None):
    if not int(row.get("enabled") or 0):
        return False
    reference_date = getdate(reference_date or today())
    valid_from = getdate(row.get("valid_from")) if row.get("valid_from") else None
    valid_until = getdate(row.get("valid_until")) if row.get("valid_until") else None
    return not ((valid_from and reference_date < valid_from) or (valid_until and reference_date > valid_until))


def _value(row, field, default=None):
    if isinstance(row, dict):
        return row.get(field, default)
    return getattr(row, field, default)


def _doctype_ready(doctype):
    return bool(frappe.db.exists("DocType", doctype))


def _expand_warehouse_names(selected):
    selected = set(selected or ())
    if not selected:
        return set()
    flags = getattr(frappe, "flags", None)
    rows = getattr(flags, "cdc_access_warehouse_rows", None) if flags else None
    if rows is None:
        rows = frappe.get_all(
            "Warehouse",
            fields=["name", "is_group", "lft", "rgt"],
            order_by="lft asc",
            limit_page_length=0,
        )
        if flags is not None:
            flags.cdc_access_warehouse_rows = rows
    by_name = {_value(row, "name"): row for row in rows}
    expanded = set()
    for name in selected:
        warehouse = by_name.get(name)
        if not warehouse:
            continue
        if not int(_value(warehouse, "is_group") or 0):
            expanded.add(name)
            continue
        left = _value(warehouse, "lft")
        right = _value(warehouse, "rgt")
        expanded.update(
            _value(row, "name") for row in rows
            if not int(_value(row, "is_group") or 0)
            and left is not None and right is not None
            and _value(row, "lft") is not None and _value(row, "rgt") is not None
            and left < _value(row, "lft") and _value(row, "rgt") < right
        )
    return expanded


def native_warehouse_scope(user, roles=None):
    """Resolve o escopo nativo sem usar a excecao de pagina para amplia-lo."""
    roles = set(roles if roles is not None else roles_for_user(user))
    flags = getattr(frappe, "flags", None)
    scope_cache = getattr(flags, "cdc_access_native_scope_cache", None) if flags else None
    if scope_cache is None:
        scope_cache = {}
        if flags is not None:
            flags.cdc_access_native_scope_cache = scope_cache
    cache_key = (str(user or ""), tuple(sorted(roles)))
    if cache_key in scope_cache:
        return set(scope_cache[cache_key])
    if roles.intersection(MANAGER_ROLES):
        result = set(frappe.get_all(
            "Warehouse",
            filters={"is_group": 0, "disabled": 0},
            pluck="name",
            order_by="name asc",
            limit_page_length=0,
        ))
    else:
        linked = set(frappe.get_all(
            "User Permission",
            filters={"user": user, "allow": "Warehouse"},
            pluck="for_value",
        ))
        result = _expand_warehouse_names(linked)
    scope_cache[cache_key] = tuple(sorted(result))
    return result


def _active_exception_catalog(reference_date=None):
    if not _doctype_ready(ACCESS_EXCEPTION_DOCTYPE):
        return []
    flags = getattr(frappe, "flags", None)
    cache_key = str(getdate(reference_date or today()))
    cached = getattr(flags, "cdc_access_exception_cache", None) if flags else None
    if cached and cached.get("key") == cache_key:
        return cached["rows"]
    rows = frappe.get_all(
        ACCESS_EXCEPTION_DOCTYPE,
        filters={"enabled": 1},
        fields=[
            "name", "subject_type", "user", "role_profile", "page_key", "effect",
            "all_actions", "all_warehouses", "valid_from", "valid_until", "enabled",
            "justification", "approved_by", "approved_at", "modified",
        ],
        order_by="modified desc, name desc",
        limit_page_length=0,
    )
    rows = [row for row in rows if exception_is_active(row, reference_date)]
    names = [_value(row, "name") for row in rows]
    actions_by_parent = {name: set() for name in names}
    warehouses_by_parent = {name: set() for name in names}
    if names:
        for child in frappe.get_all(
            ACCESS_ACTION_DOCTYPE,
            filters={"parent": ["in", names], "parenttype": ACCESS_EXCEPTION_DOCTYPE},
            fields=["parent", "action"],
            limit_page_length=0,
        ):
            actions_by_parent.setdefault(_value(child, "parent"), set()).add(_value(child, "action"))
        for child in frappe.get_all(
            ACCESS_WAREHOUSE_DOCTYPE,
            filters={"parent": ["in", names], "parenttype": ACCESS_EXCEPTION_DOCTYPE},
            fields=["parent", "warehouse"],
            limit_page_length=0,
        ):
            warehouses_by_parent.setdefault(_value(child, "parent"), set()).add(_value(child, "warehouse"))
    result = []
    for row in rows:
        name = _value(row, "name")
        data = dict(row) if isinstance(row, dict) else row.as_dict()
        row_page_key = _value(row, "page_key")
        if row_page_key not in PAGE_CATALOG:
            continue
        data["actions_set"] = set(PAGE_CATALOG[row_page_key]["actions"]) if int(_value(row, "all_actions") or 0) else actions_by_parent.get(name, set())
        data["warehouse_set"] = None if int(_value(row, "all_warehouses") or 0) else _expand_warehouse_names(warehouses_by_parent.get(name, set()))
        result.append(data)
    if flags is not None:
        flags.cdc_access_exception_cache = {"key": cache_key, "rows": result}
    return result


def _load_active_exceptions(user, role_profile, page_key, reference_date=None):
    if not PAGE_CATALOG[page_key].get("exception_grantable", True):
        return []
    return [row for row in _active_exception_catalog(reference_date) if (
        row.get("page_key") == page_key
        and (
            (row.get("subject_type") == "User" and user and row.get("user") == user)
            or (
                row.get("subject_type") == "Role Profile"
                and role_profile and row.get("role_profile") == role_profile
            )
        )
    )]


def _exception_rank(row):
    individual = _value(row, "subject_type") == "User"
    blocked = _value(row, "effect") == "Block"
    if individual and blocked:
        return 40
    if individual:
        return 30
    if blocked:
        return 20
    return 10


def _decision_for_context(baseline, exceptions, action, warehouse=None):
    candidates = []
    for row in exceptions:
        if action not in row.get("actions_set", set()):
            continue
        scope = row.get("warehouse_set")
        if warehouse is None and scope is not None:
            continue
        if warehouse is not None and scope is not None and warehouse not in scope:
            continue
        candidates.append(row)
    if not candidates:
        return bool(baseline), "native" if baseline else "none", None
    winner = max(candidates, key=lambda row: (_exception_rank(row), str(row.get("modified") or ""), row.get("name") or ""))
    return winner.get("effect") == "Allow", "exception", winner


def _preview_cache_key():
    sid = getattr(frappe.session, "sid", None)
    return f"{PREVIEW_CACHE_PREFIX}:{sid}" if sid else ""


def _frappe_cache():
    cache = frappe.cache
    return cache() if callable(cache) and not hasattr(cache, "get_value") else cache


def get_preview_context():
    """Retorna o contexto curto da sessao sem confiar em parametros do cliente."""
    key = _preview_cache_key()
    current_user = getattr(frappe.session, "user", None)
    if not key or not current_user or SYSTEM_MANAGER_ROLE not in roles_for_user(current_user):
        return None
    cache = _frappe_cache()
    raw = cache.get_value(key)
    if not raw:
        return None
    try:
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        context = frappe.parse_json(raw) if isinstance(raw, str) else raw
    except Exception:
        cache.delete_value(key)
        return None
    if not isinstance(context, dict) or context.get("started_by") != current_user:
        cache.delete_value(key)
        return None
    expires_at = context.get("expires_at")
    if expires_at and now_datetime() >= frappe.utils.get_datetime(expires_at):
        cache.delete_value(key)
        return None
    return context


def start_preview(target_type, target, warehouses=None, proposed_role_profile=None):
    require_system_manager(allow_preview=True)
    target_type = str(target_type or "").strip()
    target = str(target or "").strip()
    selected = set(warehouses or ())
    if target_type == "User":
        if not frappe.db.exists("User", target):
            frappe.throw("Usuário não encontrado.", frappe.DoesNotExistError)
        roles = roles_for_user(target)
        role_profile = role_profile_for_user(target)
        scope = native_warehouse_scope(target, roles)
        preview_user = target
    elif target_type == "User Role Profile":
        if not frappe.db.exists("User", target):
            frappe.throw("Usuário não encontrado.", frappe.DoesNotExistError)
        proposed_role_profile = str(proposed_role_profile or "").strip()
        if not proposed_role_profile or not frappe.db.exists("Role Profile", proposed_role_profile):
            frappe.throw("Perfil/cargo não encontrado.", frappe.DoesNotExistError)
        roles = roles_for_profile(proposed_role_profile)
        role_profile = proposed_role_profile
        scope = native_warehouse_scope(target, roles)
        preview_user = target
    elif target_type == "Role Profile":
        if not frappe.db.exists("Role Profile", target):
            frappe.throw("Perfil/cargo não encontrado.", frappe.DoesNotExistError)
        roles = roles_for_profile(target)
        role_profile = target
        all_leaves = set(frappe.get_all(
            "Warehouse",
            filters={"is_group": 0, "disabled": 0},
            pluck="name",
            limit_page_length=0,
        ))
        if not selected:
            frappe.throw("Selecione ao menos um armazém para simular um perfil/cargo.", frappe.ValidationError)
        if not selected.issubset(all_leaves):
            frappe.throw("Um dos armazéns de pré-visualização é inválido.", frappe.PermissionError)
        scope = selected
        preview_user = ""
    else:
        frappe.throw("Tipo de pré-visualização inválido.", frappe.ValidationError)

    started_at = now_datetime()
    context = {
        "target_type": target_type,
        "target": target,
        "user": preview_user,
        "role_profile": role_profile,
        "roles": sorted(roles),
        "warehouse_scope": sorted(scope),
        "started_by": frappe.session.user,
        "started_at": str(started_at),
        "expires_at": str(started_at + timedelta(seconds=PREVIEW_TTL_SECONDS)),
        "read_only": True,
    }
    key = _preview_cache_key()
    if not key:
        frappe.throw("Sessão inválida para pré-visualização.", frappe.ValidationError)
    # Audita antes de ativar o bloqueio global de escrita desta sessao.
    audit_event("Preview started", context, target_user=preview_user or None, target_profile=role_profile or None)
    _frappe_cache().set_value(key, frappe.as_json(context), expires_in_sec=PREVIEW_TTL_SECONDS)
    return context


def end_preview():
    require_system_manager(allow_preview=True)
    context = get_preview_context()
    key = _preview_cache_key()
    if key:
        _frappe_cache().delete_value(key)
    if context:
        audit_event(
            "Preview ended", context,
            target_user=context.get("user") or None,
            target_profile=context.get("role_profile") or None,
        )
    return context


def block_preview_document_write(doc, method=None):
    if get_preview_context() and getattr(doc, "doctype", None) != ACCESS_AUDIT_DOCTYPE:
        frappe.throw(
            "A pré-visualização é somente leitura. Encerre-a para alterar dados.",
            frappe.PermissionError,
        )


PREVIEW_MUTATION_COMMANDS = frozenset({
    "frappe.desk.form.save.savedocs",
    "frappe.client.insert",
    "frappe.client.save",
    "frappe.client.set_value",
    "frappe.model.delete_doc.delete_doc",
    "frappe.desk.doctype.bulk_update.bulk_update.submit_cancel_or_update_docs",
    "cdc_theme.access_api.save_access_exception",
    "cdc_theme.access_api.disable_access_exception",
    "cdc_theme.api.configure_restricted_stock_user",
    "cdc_theme.api.request_ongsys_mapping_discovery",
    "cdc_theme.api.start_ongsys_mapping_discovery",
    "cdc_theme.api.record_ongsys_mapping_discovery",
    "cdc_theme.api.activate_ongsys_warehouse_mappings",
    "cdc_theme.api.save_ongsys_warehouse_mapping",
    "cdc_theme.api.activate_ongsys_warehouse_mapping",
    "cdc_theme.api.manually_activate_ongsys_warehouse_mapping",
    "cdc_theme.api.manually_activate_ongsys_warehouse_mappings",
    "cdc_theme.api.run_cdc_admin_action",
    "cdc_theme.api.test_mattermost_config",
    "cdc_theme.api.run_cdc_quality_gate",
})

DOCTYPE_PAGE_MAP = {
    "Warehouse": "warehouses",
    "Item": "items",
    "Item Group": "groups",
    "Stock Entry": "stock",
    "Stock Reconciliation": "stock",
    "Stock Ledger Entry": "stock",
    "Bin": "stock",
    "User": "users",
}

READ_COMMANDS = frozenset({
    "frappe.desk.reportview.get",
    "frappe.client.get_list",
    "frappe.client.get",
    "frappe.client.get_value",
    "frappe.desk.form.load.getdoc",
})


def _request_doctype(command):
    form = getattr(frappe, "form_dict", {})
    doctype = form.get("doctype")
    if doctype:
        return str(doctype)
    if command in {"frappe.desk.form.save.savedocs", "frappe.client.insert", "frappe.client.save"} and form.get("doc"):
        try:
            payload = frappe.parse_json(form.get("doc"))
            return str((payload or {}).get("doctype") or "")
        except Exception:
            return ""
    return ""


def enforce_cdc_request_access():
    """Fecha chamadas nativas diretas quando a pagina ou acao CDC foi negada."""
    form = getattr(frappe, "form_dict", {})
    command = str(form.get("cmd") or "")
    doctype = _request_doctype(command)
    page_key = DOCTYPE_PAGE_MAP.get(doctype)
    if not page_key:
        return
    action = "view"
    if command == "frappe.desk.form.save.savedocs":
        requested_action = str(form.get("action") or "").lower()
        if requested_action == "submit":
            action = "submit"
        elif requested_action == "cancel":
            action = "cancel"
        else:
            action = "edit"
    elif command == "frappe.client.insert":
        action = "create"
    elif command in {"frappe.client.save", "frappe.client.set_value"}:
        action = "edit"
    elif command == "frappe.model.delete_doc.delete_doc":
        action = "delete"
    elif command not in READ_COMMANDS:
        return
    if action not in PAGE_CATALOG[page_key]["actions"]:
        # A camada CDC nao amplia operacoes ausentes do catalogo; o Frappe
        # continua sendo a autoridade nativa para essas operacoes.
        action = "view"
    decision = evaluate_access(page_key, action)
    if not decision["allowed"]:
        frappe.throw(
            "Página ou ação indisponível para o acesso atual.",
            frappe.PermissionError,
        )


def block_preview_mutations():
    context = get_preview_context()
    if not context:
        return
    command = str(getattr(frappe, "form_dict", {}).get("cmd") or "")
    if command in PREVIEW_MUTATION_COMMANDS:
        frappe.throw(
            "A pré-visualização é somente leitura. Encerre-a para alterar dados.",
            frappe.PermissionError,
        )


def evaluate_access(
    page_key, action="view", user=None, roles=None, role_profile=None,
    reference_date=None, warehouse_scope=None,
):
    """Retorna a decisao e o escopo efetivo sem alterar a sessao do Frappe."""
    page_key = normalize_page_key(page_key)
    action = normalize_action(action, page_key)
    explicit_subject = user is not None or roles is not None or role_profile is not None or warehouse_scope is not None
    preview = None if explicit_subject else get_preview_context()
    if preview:
        user = preview.get("user") or ""
        roles = set(preview.get("roles") or ())
        role_profile = preview.get("role_profile") or ""
        warehouse_scope = set(preview.get("warehouse_scope") or ())
    else:
        user = user or frappe.session.user
        roles = set(roles if roles is not None else roles_for_user(user))
        role_profile = role_profile if role_profile is not None else role_profile_for_user(user)
    baseline = baseline_allowed(roles, page_key, action)
    if SYSTEM_MANAGER_ROLE in roles:
        native_scope = set(
            warehouse_scope if warehouse_scope is not None
            else native_warehouse_scope(user, roles)
        )
        return {
            "allowed": True,
            "page_key": page_key,
            "action": action,
            "source": "system-manager",
            "exception": None,
            "native_warehouses": sorted(native_scope),
            "warehouses": sorted(native_scope),
            "warehouse_count": len(native_scope),
            "preview": bool(preview),
        }
    exceptions = _load_active_exceptions(user, role_profile, page_key, reference_date)

    allowed, source, winner = _decision_for_context(baseline, exceptions, action)
    if not allowed and source == "none":
        scoped_allows = [
            row for row in exceptions
            if action in row.get("actions_set", set())
            and row.get("effect") == "Allow"
            and row.get("warehouse_set") is not None
        ]
        if scoped_allows:
            allowed, source, winner = True, "exception", max(
                scoped_allows,
                key=lambda row: (_exception_rank(row), str(row.get("modified") or ""), row.get("name") or ""),
            )

    native_scope = set(
        warehouse_scope if warehouse_scope is not None
        else native_warehouse_scope(user, roles)
    )
    effective_scope = set()
    if allowed:
        for warehouse in native_scope:
            warehouse_allowed, _warehouse_source, _warehouse_winner = _decision_for_context(
                baseline, exceptions, action, warehouse,
            )
            if warehouse_allowed:
                effective_scope.add(warehouse)

    return {
        "allowed": bool(allowed),
        "page_key": page_key,
        "action": action,
        "source": source,
        "exception": winner.get("name") if winner else None,
        "native_warehouses": sorted(native_scope),
        "warehouses": sorted(effective_scope),
        "warehouse_count": len(effective_scope),
        "preview": bool(preview),
    }


def effective_access_matrix(user=None, roles=None, role_profile=None, warehouse_scope=None):
    return {
        page_key: {
            action: evaluate_access(
                page_key, action, user=user, roles=roles, role_profile=role_profile,
                warehouse_scope=warehouse_scope,
            )
            for action in page["actions"]
        }
        for page_key, page in PAGE_CATALOG.items()
    }


def is_system_manager(user=None):
    return SYSTEM_MANAGER_ROLE in roles_for_user(user or frappe.session.user)


def require_system_manager(allow_preview=False):
    if not is_system_manager():
        frappe.throw("Operacao restrita aos administradores do sistema.", frappe.PermissionError)
    if not allow_preview and get_preview_context():
        frappe.throw(
            "Função administrativa indisponível durante a pré-visualização.",
            frappe.PermissionError,
        )


def audit_event(event, details=None, reference=None, target_user=None, target_profile=None):
    """Registra auditoria quando o DocType ja existe; nunca bloqueia migracoes."""
    if not frappe.db.exists("DocType", ACCESS_AUDIT_DOCTYPE):
        return
    frappe.get_doc({
        "doctype": ACCESS_AUDIT_DOCTYPE,
        "event": event,
        "reference_exception": reference,
        "target_user": target_user,
        "target_role_profile": target_profile,
        "actor": frappe.session.user,
        "occurred_at": now_datetime(),
        "details": frappe.as_json(details or {}, indent=None),
    }).insert(ignore_permissions=True)
