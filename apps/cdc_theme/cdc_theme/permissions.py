"""Limites de leitura para usuários CDC comuns, inclusive em rotas nativas."""

import frappe

from cdc_theme.api import (
    _explicit_leaf_warehouses,
    _has_unrestricted_cdc_scope,
    _permitted_warehouse_tree_names,
)


READ_TYPES = {None, "read", "select", "report", "export", "print", "email"}


def _sql_values(values):
    return ", ".join(frappe.db.escape(value) for value in sorted(set(values)))


def _scope(user=None):
    user = user or frappe.session.user
    return None if _has_unrestricted_cdc_scope(user) else _explicit_leaf_warehouses(user)


def _scoped_users(user=None):
    user = user or frappe.session.user
    if _has_unrestricted_cdc_scope(user):
        return None
    warehouses = _explicit_leaf_warehouses(user)
    allowed = {user}
    if not warehouses:
        return allowed
    candidates = set(frappe.get_all(
        "User Permission",
        filters={"allow": "Warehouse"},
        pluck="user",
    ))
    allowed.update(
        candidate for candidate in candidates
        if _explicit_leaf_warehouses(candidate).intersection(warehouses)
    )
    return allowed


def warehouse_query(user=None):
    if _has_unrestricted_cdc_scope(user):
        return ""
    names = _permitted_warehouse_tree_names(user)
    return f"`tabWarehouse`.`name` IN ({_sql_values(names)})" if names else "1=0"


def warehouse_has_permission(doc, user=None, permission_type=None):
    if permission_type not in READ_TYPES or _has_unrestricted_cdc_scope(user):
        return None
    return doc.name in _permitted_warehouse_tree_names(user)


def user_query(user=None):
    names = _scoped_users(user)
    if names is None:
        return ""
    return f"`tabUser`.`name` IN ({_sql_values(names)})" if names else "1=0"


def user_has_permission(doc, user=None, permission_type=None):
    if permission_type not in READ_TYPES:
        return None
    names = _scoped_users(user)
    return None if names is None else doc.name in names


def stock_entry_query(user=None):
    warehouses = _scope(user)
    if warehouses is None:
        return ""
    if not warehouses:
        return "1=0"
    values = _sql_values(warehouses)
    return f"""(
        `tabStock Entry`.`from_warehouse` IN ({values})
        OR `tabStock Entry`.`to_warehouse` IN ({values})
        OR EXISTS (
            SELECT 1 FROM `tabStock Entry Detail` cdc_scope_detail
            WHERE cdc_scope_detail.parent = `tabStock Entry`.`name`
              AND (
                cdc_scope_detail.s_warehouse IN ({values})
                OR cdc_scope_detail.t_warehouse IN ({values})
              )
        )
    )"""


def stock_entry_has_permission(doc, user=None, permission_type=None):
    if permission_type not in READ_TYPES:
        return None
    warehouses = _scope(user)
    if warehouses is None:
        return None
    if not warehouses:
        return False
    if doc.get("from_warehouse") in warehouses or doc.get("to_warehouse") in warehouses:
        return True
    details = doc.get("items") or frappe.get_all(
        "Stock Entry Detail",
        filters={"parent": doc.name},
        fields=["s_warehouse", "t_warehouse"],
    )
    return any(
        row.get("s_warehouse") in warehouses or row.get("t_warehouse") in warehouses
        for row in details
    )


def bin_query(user=None):
    warehouses = _scope(user)
    if warehouses is None:
        return ""
    return f"`tabBin`.`warehouse` IN ({_sql_values(warehouses)})" if warehouses else "1=0"


def bin_has_permission(doc, user=None, permission_type=None):
    if permission_type not in READ_TYPES:
        return None
    warehouses = _scope(user)
    return None if warehouses is None else doc.get("warehouse") in warehouses


def stock_ledger_entry_query(user=None):
    warehouses = _scope(user)
    if warehouses is None:
        return ""
    return (
        f"`tabStock Ledger Entry`.`warehouse` IN ({_sql_values(warehouses)})"
        if warehouses else "1=0"
    )


def stock_ledger_entry_has_permission(doc, user=None, permission_type=None):
    if permission_type not in READ_TYPES:
        return None
    warehouses = _scope(user)
    return None if warehouses is None else doc.get("warehouse") in warehouses


def deny_common_query(user=None):
    return "" if _has_unrestricted_cdc_scope(user) else "1=0"


def deny_common_has_permission(doc, user=None, permission_type=None):
    if permission_type not in READ_TYPES or _has_unrestricted_cdc_scope(user):
        return None
    return False
