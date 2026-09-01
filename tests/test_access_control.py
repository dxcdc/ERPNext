import importlib.util
import json
import sys
import types
import unittest
from datetime import date, datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "apps/cdc_theme/cdc_theme/access_control.py"


def load_access_control(roles=None):
    roles = roles or {}
    frappe = types.ModuleType("frappe")
    frappe.ValidationError = type("ValidationError", (Exception,), {})
    frappe.PermissionError = type("PermissionError", (Exception,), {})
    frappe.throw = lambda message, error=None: (_ for _ in ()).throw((error or Exception)(message))
    frappe.session = types.SimpleNamespace(user="current@example.com", sid="test-session")
    cache_values = {}
    frappe.cache = types.SimpleNamespace(
        get_value=lambda key: cache_values.get(key),
        set_value=lambda key, value, **kwargs: cache_values.__setitem__(key, value),
        delete_value=lambda key: cache_values.pop(key, None),
    )
    frappe.parse_json = json.loads
    frappe.get_roles = lambda user=None: list(roles.get(user or frappe.session.user, ()))
    frappe.get_all = lambda *args, **kwargs: []
    frappe.get_doc = lambda value: types.SimpleNamespace(insert=lambda **kwargs: None)
    frappe.as_json = lambda value, **kwargs: json.dumps(value, default=str)
    frappe.db = types.SimpleNamespace(
        get_value=lambda *args, **kwargs: "",
        exists=lambda *args, **kwargs: False,
    )
    frappe.utils = types.ModuleType("frappe.utils")
    frappe.utils.getdate = lambda value=None: value if isinstance(value, date) else date.fromisoformat(str(value))
    frappe.utils.today = lambda: "2026-09-01"
    frappe.utils.now_datetime = lambda: datetime(2026, 9, 1, 9, 0, 0)
    frappe.utils.get_datetime = lambda value: value if isinstance(value, datetime) else datetime.fromisoformat(str(value))

    previous = {name: sys.modules.get(name) for name in ("frappe", "frappe.utils")}
    sys.modules.update({"frappe": frappe, "frappe.utils": frappe.utils})
    try:
        spec = importlib.util.spec_from_file_location("cdc_access_control_test", MODULE_PATH)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        for name, value in previous.items():
            if value is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = value


class AccessCatalogTest(unittest.TestCase):
    def test_catalog_contains_every_cdc_workspace(self):
        access = load_access_control()
        self.assertEqual(12, len(access.PAGE_CATALOG))
        self.assertEqual(
            {
                "CDC Estoque", "CDC Usuários", "CDC Grupos", "CDC Itens",
                "CDC Armazém", "CDC Relatórios", "CDC Integrações",
                "CDC Pendências", "CDC Monitoramento", "CDC Testes",
                "CDC Admin", "CDC Treinamento",
            },
            {page["workspace"] for page in access.PAGE_CATALOG.values()},
        )

    def test_common_profile_sees_common_pages_but_not_admin_pages(self):
        access = load_access_control()
        roles = {"Consulta"}
        self.assertTrue(access.baseline_allowed(roles, "stock"))
        self.assertTrue(access.baseline_allowed(roles, "reports"))
        self.assertFalse(access.baseline_allowed(roles, "integrations"))
        self.assertFalse(access.baseline_allowed(roles, "admin"))

    def test_consulta_cannot_inherit_stock_writes(self):
        access = load_access_control()
        self.assertFalse(access.baseline_allowed({"Consulta"}, "stock", "create"))
        self.assertTrue(access.baseline_allowed({"Operador"}, "stock", "create"))
        self.assertFalse(access.baseline_allowed({"Operador"}, "stock", "cancel"))
        self.assertTrue(access.baseline_allowed({"Gestor de Estoque"}, "stock", "cancel"))

    def test_exception_period_is_inclusive(self):
        access = load_access_control()
        row = {"enabled": 1, "valid_from": "2026-09-01", "valid_until": "2026-09-30"}
        self.assertTrue(access.exception_is_active(row, "2026-09-01"))
        self.assertTrue(access.exception_is_active(row, "2026-09-30"))
        self.assertFalse(access.exception_is_active(row, "2026-10-01"))

    def _configure_exceptions(self, access, exceptions, actions, warehouses):
        access.frappe.db.exists = lambda doctype, name: name == access.ACCESS_EXCEPTION_DOCTYPE

        warehouse_rows = [
            {"name": "A - C", "is_group": 0, "lft": 2, "rgt": 3},
            {"name": "B - C", "is_group": 0, "lft": 4, "rgt": 5},
            {"name": "C - C", "is_group": 0, "lft": 6, "rgt": 7},
        ]

        def get_all(doctype, **kwargs):
            if doctype == access.ACCESS_EXCEPTION_DOCTYPE:
                return list(exceptions)
            if doctype == access.ACCESS_ACTION_DOCTYPE:
                return list(actions)
            if doctype == access.ACCESS_WAREHOUSE_DOCTYPE:
                return list(warehouses)
            if doctype == "Warehouse":
                return list(warehouse_rows)
            return []

        access.frappe.get_all = get_all

    def test_individual_block_precedes_native_profile(self):
        access = load_access_control()
        self._configure_exceptions(access, [{
            "name": "BLOCK-1", "subject_type": "User", "user": "current@example.com",
            "role_profile": None, "page_key": "reports", "effect": "Block",
            "all_actions": 0, "all_warehouses": 1, "enabled": 1,
            "valid_from": None, "valid_until": None, "modified": "2026-09-01",
        }], [{"parent": "BLOCK-1", "action": "view"}], [])
        decision = access.evaluate_access(
            "reports", user="current@example.com", roles={"Consulta"},
            role_profile="Consulta", warehouse_scope={"A - C"},
        )
        self.assertFalse(decision["allowed"])
        self.assertEqual("BLOCK-1", decision["exception"])

    def test_system_pages_do_not_accept_exception_grants(self):
        access = load_access_control()
        self._configure_exceptions(access, [{
            "name": "ALLOW-ADMIN", "subject_type": "User", "user": "current@example.com",
            "role_profile": None, "page_key": "admin", "effect": "Allow",
            "all_actions": 0, "all_warehouses": 1, "enabled": 1,
            "valid_from": None, "valid_until": None, "modified": "2026-09-01",
        }], [{"parent": "ALLOW-ADMIN", "action": "view"}], [])
        decision = access.evaluate_access(
            "admin", user="current@example.com", roles={"Consulta"},
            role_profile="Consulta", warehouse_scope={"A - C"},
        )
        self.assertFalse(decision["allowed"])

    def test_system_manager_cannot_be_reduced_by_exception(self):
        access = load_access_control()
        self._configure_exceptions(access, [{
            "name": "BLOCK-SYSTEM", "subject_type": "Role Profile", "user": None,
            "role_profile": "Administradores", "page_key": "reports", "effect": "Block",
            "all_actions": 1, "all_warehouses": 1, "enabled": 1,
            "valid_from": None, "valid_until": None, "modified": "2026-09-01",
        }], [], [])
        decision = access.evaluate_access(
            "reports", user="admin@example.com", roles={"System Manager"},
            role_profile="Administradores", warehouse_scope={"A - C"},
        )
        self.assertTrue(decision["allowed"])
        self.assertEqual("system-manager", decision["source"])

    def test_native_direct_request_is_closed_when_page_is_denied(self):
        access = load_access_control()
        access.frappe.form_dict = {
            "cmd": "frappe.desk.reportview.get",
            "doctype": "Item",
        }
        with self.assertRaises(access.frappe.PermissionError):
            access.enforce_cdc_request_access()

    def test_scoped_exception_does_not_expand_native_warehouses(self):
        access = load_access_control()
        self._configure_exceptions(access, [{
            "name": "ALLOW-1", "subject_type": "User", "user": "current@example.com",
            "role_profile": None, "page_key": "integrations", "effect": "Allow",
            "all_actions": 0, "all_warehouses": 0, "enabled": 1,
            "valid_from": None, "valid_until": None, "modified": "2026-09-01",
        }], [{"parent": "ALLOW-1", "action": "view"}], [
            {"parent": "ALLOW-1", "warehouse": "A - C"},
            {"parent": "ALLOW-1", "warehouse": "C - C"},
        ])
        decision = access.evaluate_access(
            "integrations", user="current@example.com", roles={"Consulta"},
            role_profile="Consulta", warehouse_scope={"A - C", "B - C"},
        )
        self.assertTrue(decision["allowed"])
        self.assertEqual(["A - C"], decision["warehouses"])
        self.assertNotIn("C - C", decision["warehouses"])

    def test_individual_allow_precedes_profile_block(self):
        access = load_access_control()
        common = {
            "page_key": "reports", "all_actions": 0, "all_warehouses": 1,
            "enabled": 1, "valid_from": None, "valid_until": None,
        }
        self._configure_exceptions(access, [
            {**common, "name": "PROFILE-BLOCK", "subject_type": "Role Profile",
             "user": None, "role_profile": "Consulta", "effect": "Block", "modified": "2026-09-01"},
            {**common, "name": "USER-ALLOW", "subject_type": "User",
             "user": "current@example.com", "role_profile": None, "effect": "Allow", "modified": "2026-08-01"},
        ], [
            {"parent": "PROFILE-BLOCK", "action": "view"},
            {"parent": "USER-ALLOW", "action": "view"},
        ], [])
        decision = access.evaluate_access(
            "reports", user="current@example.com", roles={"Consulta"},
            role_profile="Consulta", warehouse_scope={"A - C"},
        )
        self.assertTrue(decision["allowed"])
        self.assertEqual("USER-ALLOW", decision["exception"])

    def test_preview_profile_is_server_scoped_and_read_only(self):
        access = load_access_control(roles={
            "current@example.com": {"System Manager"},
        })
        access.frappe.db.exists = lambda doctype, name: (
            (doctype == "Role Profile" and name == "Consulta")
            or (doctype == "DocType" and name == access.ACCESS_EXCEPTION_DOCTYPE)
        )

        def get_all(doctype, **kwargs):
            if doctype == "Has Role":
                return ["Consulta"]
            if doctype == "Warehouse" and kwargs.get("pluck") == "name":
                return ["A - C", "B - C"]
            if doctype == access.ACCESS_EXCEPTION_DOCTYPE:
                return []
            return []

        access.frappe.get_all = get_all
        context = access.start_preview("Role Profile", "Consulta", ["A - C"])
        self.assertTrue(context["read_only"])
        self.assertEqual(["A - C"], context["warehouse_scope"])
        decision = access.evaluate_access("reports")
        self.assertTrue(decision["allowed"])
        self.assertTrue(decision["preview"])
        self.assertEqual(["A - C"], decision["warehouses"])
        with self.assertRaises(access.frappe.PermissionError):
            access.block_preview_document_write(types.SimpleNamespace(doctype="Stock Entry"))
        access.frappe.form_dict = {"cmd": "frappe.client.save"}
        with self.assertRaises(access.frappe.PermissionError):
            access.block_preview_mutations()
        ended = access.end_preview()
        self.assertEqual("Consulta", ended["target"])
        self.assertIsNone(access.get_preview_context())

    def test_proposed_user_profile_preview_uses_real_user_warehouse_scope(self):
        access = load_access_control(roles={
            "current@example.com": {"System Manager"},
        })
        access.frappe.db.exists = lambda doctype, name: (
            (doctype == "User" and name == "operator@example.com")
            or (doctype == "Role Profile" and name == "Operação")
        )

        def get_all(doctype, **kwargs):
            if doctype == "Has Role":
                return ["Consulta", "Operador"]
            if doctype == "User Permission":
                return ["A - C"]
            if doctype == "Warehouse":
                return [{"name": "A - C", "is_group": 0, "lft": 1, "rgt": 2}]
            return []

        access.frappe.get_all = get_all
        context = access.start_preview(
            "User Role Profile", "operator@example.com",
            proposed_role_profile="Operação",
        )
        self.assertEqual("operator@example.com", context["user"])
        self.assertEqual("Operação", context["role_profile"])
        self.assertEqual(["Consulta", "Operador"], context["roles"])
        self.assertEqual(["A - C"], context["warehouse_scope"])
        self.assertTrue(context["read_only"])


if __name__ == "__main__":
    unittest.main()
