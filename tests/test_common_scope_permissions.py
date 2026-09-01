import importlib.util
import sys
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "apps/cdc_theme/cdc_theme/permissions.py"


def load_permissions(scope=None, unrestricted=False, candidates=None):
    scope = set(scope or ())
    candidates = candidates or {}
    frappe = types.ModuleType("frappe")
    frappe.session = types.SimpleNamespace(user="current@example.com")
    frappe.db = types.SimpleNamespace(escape=lambda value: "'" + str(value).replace("'", "''") + "'")
    frappe.get_all = lambda doctype, **kwargs: list(candidates) if doctype == "User Permission" else []

    api = types.ModuleType("cdc_theme.api")
    api._has_unrestricted_cdc_scope = lambda user=None: unrestricted
    api._explicit_leaf_warehouses = lambda user=None: set(candidates.get(user or frappe.session.user, scope))
    api._permitted_warehouse_tree_names = lambda user=None: set(candidates.get(user or frappe.session.user, scope))
    package = types.ModuleType("cdc_theme")
    package.__path__ = []

    previous = {name: sys.modules.get(name) for name in ("frappe", "cdc_theme", "cdc_theme.api")}
    sys.modules.update({"frappe": frappe, "cdc_theme": package, "cdc_theme.api": api})
    try:
        spec = importlib.util.spec_from_file_location("cdc_permissions_test", MODULE_PATH)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        for name, value in previous.items():
            if value is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = value


class CommonScopePermissionsTest(unittest.TestCase):
    def test_common_user_without_link_gets_closed_queries(self):
        permissions = load_permissions()
        self.assertEqual("1=0", permissions.warehouse_query())
        self.assertEqual("1=0", permissions.stock_entry_query())
        self.assertEqual("1=0", permissions.bin_query())
        self.assertEqual("1=0", permissions.stock_ledger_entry_query())
        self.assertEqual("1=0", permissions.deny_common_query())

    def test_common_user_queries_only_linked_scope_and_colleagues(self):
        permissions = load_permissions(candidates={
            "current@example.com": {"A - C"},
            "colleague@example.com": {"A - C", "B - C"},
            "outside@example.com": {"C - C"},
        })
        warehouse_condition = permissions.warehouse_query()
        self.assertIn("A - C", warehouse_condition)
        self.assertNotIn("B - C", warehouse_condition)
        stock_condition = permissions.stock_entry_query()
        self.assertIn("cdc_scope_detail.s_warehouse", stock_condition)
        user_condition = permissions.user_query()
        self.assertIn("current@example.com", user_condition)
        self.assertIn("colleague@example.com", user_condition)
        self.assertNotIn("outside@example.com", user_condition)

    def test_unrestricted_user_keeps_native_permission_flow(self):
        permissions = load_permissions(unrestricted=True)
        self.assertEqual("", permissions.warehouse_query())
        self.assertEqual("", permissions.user_query())
        self.assertEqual("", permissions.stock_entry_query())
        self.assertIsNone(permissions.bin_has_permission({"warehouse": "ANY - C"}))


if __name__ == "__main__":
    unittest.main()
