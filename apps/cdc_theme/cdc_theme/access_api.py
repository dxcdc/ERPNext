"""API administrativa da matriz de acesso CDC."""

import json

import frappe
from frappe.utils import cint, getdate, now_datetime, today

from cdc_theme.access_control import (
    ACCESS_AUDIT_DOCTYPE,
    ACCESS_EXCEPTION_DOCTYPE,
    PAGE_CATALOG,
    audit_event,
    catalog_payload,
    end_preview,
    effective_access_matrix,
    evaluate_access,
    get_preview_context,
    is_system_manager,
    native_warehouse_scope,
    normalize_action,
    normalize_page_key,
    require_system_manager,
    roles_for_profile,
    roles_for_user,
    start_preview,
)


PROTECTED_PROFILE_USERS = {"Administrator", "Guest"}


def _json_value(value, default=None):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (TypeError, ValueError):
            frappe.throw("Conteúdo administrativo inválido.", frappe.ValidationError)
    return value if value is not None else default


def _exception_payload(doc):
    active = bool(doc.enabled)
    if doc.valid_from and getdate(doc.valid_from) > getdate(today()):
        status = "scheduled"
    elif doc.valid_until and getdate(doc.valid_until) < getdate(today()):
        status = "expired"
    elif active:
        status = "active"
    else:
        status = "disabled"
    return {
        "name": doc.name,
        "subject_type": doc.subject_type,
        "user": doc.user or "",
        "role_profile": doc.role_profile or "",
        "page_key": doc.page_key,
        "effect": doc.effect,
        "all_actions": bool(doc.all_actions),
        "actions": [row.action for row in (doc.actions or [])],
        "all_warehouses": bool(doc.all_warehouses),
        "warehouses": [row.warehouse for row in (doc.warehouses or [])],
        "valid_from": str(doc.valid_from) if doc.valid_from else "",
        "valid_until": str(doc.valid_until) if doc.valid_until else "",
        "enabled": active,
        "status": status,
        "justification": doc.justification or "",
        "approved_by": doc.approved_by or "",
        "approved_at": str(doc.approved_at) if doc.approved_at else "",
        "modified": str(doc.modified) if doc.modified else "",
    }


def _subject_matrix(user=None, role_profile=None):
    if user:
        roles = roles_for_user(user)
        role_profile = frappe.db.get_value("User", user, "role_profile_name") or ""
        native_scope = native_warehouse_scope(user, roles)
    else:
        roles = roles_for_profile(role_profile)
        native_scope = set()
    matrix = effective_access_matrix(
        user=user or "",
        roles=roles,
        role_profile=role_profile or "",
        warehouse_scope=native_scope,
    )
    return {
        "roles": sorted(roles),
        "role_profile": role_profile or "",
        "warehouse_count": len(native_scope),
        "warehouses": sorted(native_scope),
        "pages": {
            page_key: {
                "view": values.get("view", {}),
                "actions": values,
            }
            for page_key, values in matrix.items()
        },
    }


def _assigned_roles_for_user(user):
    return set(frappe.get_all(
        "Has Role",
        filters={"parenttype": "User", "parent": user},
        pluck="role",
        limit_page_length=0,
    ))


def _profile_comparison(current_roles, profile_name, profile_roles):
    current_roles = set(current_roles or ())
    profile_roles = set(profile_roles or ())
    matched = current_roles.intersection(profile_roles)
    union = current_roles.union(profile_roles)
    return {
        "name": profile_name,
        "roles": sorted(profile_roles),
        "matched_roles": sorted(matched),
        "added_roles": sorted(profile_roles - current_roles),
        "removed_roles": sorted(current_roles - profile_roles),
        "match_count": len(matched),
        "match_percent": round((len(matched) / len(union)) * 100) if union else 100,
    }


def _warehouse_permission_snapshot(user):
    rows = frappe.get_all(
        "User Permission",
        filters={"user": user, "allow": "Warehouse"},
        fields=["name", "for_value", "applicable_for", "is_default", "hide_descendants"],
        order_by="name asc",
        limit_page_length=0,
    )
    return [
        tuple(row.get(field) for field in (
            "name", "for_value", "applicable_for", "is_default", "hide_descendants",
        ))
        for row in rows
    ]


def _validate_profile_assignment_user(user):
    user = str(user or "").strip()
    if not user or not frappe.db.exists("User", user):
        frappe.throw("Usuário não encontrado.", frappe.DoesNotExistError)
    if user in PROTECTED_PROFILE_USERS:
        frappe.throw("A conta administrativa nativa não recebe perfil por esta matriz.", frappe.PermissionError)
    if user == frappe.session.user:
        frappe.throw("Por segurança, altere seu próprio perfil pelo cadastro nativo de Usuário.", frappe.PermissionError)
    if frappe.db.get_value("User", user, "user_type") != "System User":
        frappe.throw("Somente usuários do sistema podem receber um perfil.", frappe.ValidationError)
    return user


@frappe.whitelist()
def get_current_access_context():
    preview = get_preview_context()
    pages = {}
    for page_key in PAGE_CATALOG:
        decision = evaluate_access(page_key, "view")
        pages[page_key] = {
            "allowed": bool(decision["allowed"]),
            "source": decision["source"],
            "warehouse_count": decision["warehouse_count"],
        }
    return {
        "is_system_manager": is_system_manager(),
        "preview": preview,
        "catalog": catalog_payload(),
        "pages": pages,
    }


@frappe.whitelist()
def get_preview_options():
    require_system_manager(allow_preview=True)
    users = frappe.get_all(
        "User",
        filters={"user_type": "System User", "enabled": 1},
        fields=["name", "full_name", "email", "role_profile_name"],
        order_by="full_name asc, name asc",
        limit_page_length=0,
    )
    profiles = frappe.get_all("Role Profile", pluck="name", order_by="name asc", limit_page_length=0)
    warehouses = frappe.get_all(
        "Warehouse",
        filters={"is_group": 0, "disabled": 0},
        fields=["name", "warehouse_name"],
        order_by="name asc",
        limit_page_length=0,
    )
    return {"users": users, "profiles": profiles, "warehouses": warehouses}


@frappe.whitelist()
def start_access_preview(target_type, target, warehouses=None):
    selected = _json_value(warehouses, []) or []
    return start_preview(target_type, target, selected)


@frappe.whitelist()
def end_access_preview():
    return end_preview()


@frappe.whitelist()
def get_access_admin_data(search=None, role_profile=None, page_key=None, status=None):
    require_system_manager()
    requested_search = str(search or "").strip().casefold()[:120]
    requested_profile = str(role_profile or "").strip()
    requested_page = normalize_page_key(page_key) if page_key else ""
    requested_status = str(status or "").strip().lower()
    if requested_status and requested_status not in {"active", "scheduled", "expired", "disabled"}:
        frappe.throw("Situação de exceção inválida.", frappe.ValidationError)

    users = frappe.get_all(
        "User",
        filters={"user_type": "System User"},
        fields=["name", "full_name", "email", "enabled", "role_profile_name"],
        order_by="full_name asc, name asc",
        limit_page_length=0,
    )
    if requested_profile:
        users = [row for row in users if row.role_profile_name == requested_profile]
    if requested_search:
        users = [row for row in users if requested_search in " ".join((
            row.name or "", row.full_name or "", row.email or "", row.role_profile_name or "",
        )).casefold()]

    matrix = []
    for row in users:
        subject = _subject_matrix(user=row.name)
        cells = {}
        for key, values in subject["pages"].items():
            if requested_page and key != requested_page:
                continue
            view = values["view"]
            cells[key] = {
                "allowed": bool(view.get("allowed")),
                "source": view.get("source"),
                "exception": view.get("exception"),
                "warehouse_count": view.get("warehouse_count", 0),
            }
        matrix.append({
            "name": row.name,
            "full_name": row.full_name or row.name,
            "email": row.email or row.name,
            "enabled": bool(row.enabled),
            "role_profile": row.role_profile_name or "",
            "roles": subject["roles"],
            "assigned_roles": sorted(_assigned_roles_for_user(row.name)),
            "is_native_admin": row.name == "Administrator",
            "can_assign_profile": row.name not in PROTECTED_PROFILE_USERS and row.name != frappe.session.user,
            "warehouse_count": subject["warehouse_count"],
            "cells": cells,
        })

    exceptions = []
    if frappe.db.exists("DocType", ACCESS_EXCEPTION_DOCTYPE):
        names = frappe.get_all(
            ACCESS_EXCEPTION_DOCTYPE,
            pluck="name",
            order_by="modified desc",
            limit_page_length=0,
        )
        exceptions = [_exception_payload(frappe.get_doc(ACCESS_EXCEPTION_DOCTYPE, name)) for name in names]
        if requested_page:
            exceptions = [row for row in exceptions if row["page_key"] == requested_page]
        if requested_status:
            exceptions = [row for row in exceptions if row["status"] == requested_status]

    profiles = frappe.get_all("Role Profile", pluck="name", order_by="name asc", limit_page_length=0)
    warehouses = frappe.get_all(
        "Warehouse",
        filters={"disabled": 0},
        fields=["name", "warehouse_name", "is_group", "parent_warehouse"],
        order_by="lft asc",
        limit_page_length=0,
    )
    return {
        "catalog": catalog_payload(),
        "users": matrix,
        "profiles": profiles,
        "warehouses": warehouses,
        "exceptions": exceptions,
        "filters": {
            "search": search or "",
            "role_profile": requested_profile,
            "page_key": requested_page,
            "status": requested_status,
        },
    }


@frappe.whitelist()
def get_role_profile_assignment_options(user):
    require_system_manager()
    user = _validate_profile_assignment_user(user)
    current_profile = frappe.db.get_value("User", user, "role_profile_name") or ""
    current_roles = _assigned_roles_for_user(user)
    current_scope = native_warehouse_scope(user, roles_for_user(user))
    profile_names = frappe.get_all("Role Profile", pluck="name", order_by="name asc", limit_page_length=0)
    comparisons = []
    for profile in profile_names:
        profile_roles = roles_for_profile(profile)
        comparison = _profile_comparison(current_roles, profile, profile_roles)
        proposed_scope = native_warehouse_scope(user, profile_roles)
        comparison["warehouse_scope_preserved"] = proposed_scope == current_scope
        comparison["resulting_warehouse_count"] = len(proposed_scope)
        comparisons.append(comparison)
    ranked = sorted(
        [item for item in comparisons if item["warehouse_scope_preserved"]],
        key=lambda item: (
            -item["match_count"],
            len(item["added_roles"]) + len(item["removed_roles"]),
            item["name"].casefold(),
        ),
    )
    suggested_name = ranked[0]["name"] if ranked and ranked[0]["match_count"] else ""
    for comparison in comparisons:
        comparison["suggested"] = comparison["name"] == suggested_name
    full_name = frappe.db.get_value("User", user, "full_name") or user
    return {
        "user": user,
        "full_name": full_name,
        "current_profile": current_profile,
        "current_roles": sorted(current_roles),
        "warehouse_count": len(current_scope),
        "suggested_profile": suggested_name,
        "profiles": comparisons,
    }


@frappe.whitelist()
def start_role_profile_assignment_preview(user, role_profile):
    require_system_manager(allow_preview=True)
    user = _validate_profile_assignment_user(user)
    role_profile = str(role_profile or "").strip()
    if not frappe.db.exists("Role Profile", role_profile):
        frappe.throw("Perfil/cargo não encontrado.", frappe.DoesNotExistError)
    return start_preview("User Role Profile", user, proposed_role_profile=role_profile)


@frappe.whitelist()
def assign_role_profile(user, role_profile, justification, confirmed=0):
    require_system_manager()
    user = _validate_profile_assignment_user(user)
    role_profile = str(role_profile or "").strip()
    if not frappe.db.exists("Role Profile", role_profile):
        frappe.throw("Perfil/cargo não encontrado.", frappe.DoesNotExistError)
    if not cint(confirmed):
        frappe.throw("Confirme que as funções adicionadas e removidas foram revisadas.", frappe.ValidationError)
    justification = str(justification or "").strip()
    if len(justification) < 8:
        frappe.throw("Informe uma justificativa com pelo menos 8 caracteres.", frappe.ValidationError)

    doc = frappe.get_doc("User", user)
    previous_profile = doc.role_profile_name or ""
    if previous_profile == role_profile:
        frappe.throw("Este perfil já está atribuído ao usuário.", frappe.ValidationError)
    previous_roles = _assigned_roles_for_user(user)
    previous_scope = native_warehouse_scope(user, roles_for_user(user))
    warehouse_permissions = _warehouse_permission_snapshot(user)
    comparison = _profile_comparison(previous_roles, role_profile, roles_for_profile(role_profile))

    doc.role_profile_name = role_profile
    doc.save()
    frappe.clear_cache(user=user)
    assigned_roles = _assigned_roles_for_user(user)
    resulting_scope = native_warehouse_scope(user, roles_for_user(user))
    if _warehouse_permission_snapshot(user) != warehouse_permissions or resulting_scope != previous_scope:
        frappe.throw("A operação foi cancelada porque alteraria o escopo de armazéns.", frappe.ValidationError)

    audit_event(
        "Role profile assigned",
        {
            "previous_profile": previous_profile,
            "new_profile": role_profile,
            "added_roles": comparison["added_roles"],
            "removed_roles": comparison["removed_roles"],
            "warehouse_permissions_preserved": True,
            "warehouse_count": len(resulting_scope),
            "justification": justification,
        },
        target_user=user,
        target_profile=role_profile,
    )
    return {
        "user": user,
        "role_profile": role_profile,
        "assigned_roles": sorted(assigned_roles),
        "warehouse_permissions_preserved": True,
    }


@frappe.whitelist()
def get_access_subject_detail(subject_type, subject):
    require_system_manager()
    if subject_type == "User":
        if not frappe.db.exists("User", subject):
            frappe.throw("Usuário não encontrado.", frappe.DoesNotExistError)
        return _subject_matrix(user=subject)
    if subject_type == "Role Profile":
        if not frappe.db.exists("Role Profile", subject):
            frappe.throw("Perfil/cargo não encontrado.", frappe.DoesNotExistError)
        return _subject_matrix(role_profile=subject)
    frappe.throw("Tipo de destinatário inválido.", frappe.ValidationError)


@frappe.whitelist()
def save_access_exception(payload):
    require_system_manager()
    values = _json_value(payload, {}) or {}
    name = str(values.get("name") or "").strip()
    if name:
        if not frappe.db.exists(ACCESS_EXCEPTION_DOCTYPE, name):
            frappe.throw("Exceção não encontrada.", frappe.DoesNotExistError)
        doc = frappe.get_doc(ACCESS_EXCEPTION_DOCTYPE, name)
    else:
        doc = frappe.new_doc(ACCESS_EXCEPTION_DOCTYPE)

    doc.subject_type = values.get("subject_type")
    doc.user = values.get("user") or None
    doc.role_profile = values.get("role_profile") or None
    doc.page_key = normalize_page_key(values.get("page_key"))
    doc.effect = values.get("effect")
    doc.all_actions = 1 if values.get("all_actions") else 0
    doc.set("actions", [])
    for action in values.get("actions") or []:
        doc.append("actions", {"action": normalize_action(action, doc.page_key)})
    doc.all_warehouses = 1 if values.get("all_warehouses") else 0
    doc.set("warehouses", [])
    for warehouse in values.get("warehouses") or []:
        doc.append("warehouses", {"warehouse": str(warehouse or "").strip()})
    doc.valid_from = values.get("valid_from") or None
    doc.valid_until = values.get("valid_until") or None
    doc.enabled = 1 if values.get("enabled", True) else 0
    doc.justification = values.get("justification")
    doc.save()
    frappe.clear_cache(user=doc.user) if doc.user else frappe.clear_cache()
    return {"exception": _exception_payload(doc)}


@frappe.whitelist()
def disable_access_exception(name, reason):
    require_system_manager()
    reason = str(reason or "").strip()
    if len(reason) < 8:
        frappe.throw("Informe o motivo da desativação.", frappe.ValidationError)
    doc = frappe.get_doc(ACCESS_EXCEPTION_DOCTYPE, name)
    doc.enabled = 0
    doc.justification = f"{doc.justification}\nDesativada: {reason}".strip()
    doc.save()
    frappe.clear_cache(user=doc.user) if doc.user else frappe.clear_cache()
    return {"exception": _exception_payload(doc)}


@frappe.whitelist()
def get_access_audit(limit=100):
    require_system_manager()
    if not frappe.db.exists("DocType", ACCESS_AUDIT_DOCTYPE):
        return []
    limit = min(max(int(limit or 100), 1), 500)
    return frappe.get_all(
        ACCESS_AUDIT_DOCTYPE,
        fields=[
            "name", "event", "reference_exception", "target_user",
            "target_role_profile", "actor", "occurred_at", "details",
        ],
        order_by="occurred_at desc",
        limit_page_length=limit,
    )
