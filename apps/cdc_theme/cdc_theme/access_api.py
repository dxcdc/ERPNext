"""API administrativa da matriz de acesso CDC."""

import json

import frappe
from frappe.utils import getdate, now_datetime, today

from cdc_theme.access_control import (
    ACCESS_AUDIT_DOCTYPE,
    ACCESS_EXCEPTION_DOCTYPE,
    PAGE_CATALOG,
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
