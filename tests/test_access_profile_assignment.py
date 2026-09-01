import importlib.util
import sys
import types
import unittest
from datetime import date, datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "apps/cdc_theme/cdc_theme/access_api.py"


def load_access_api():
    state = {
        "profiles": {
            "Consulta padrão": {"Consulta"},
            "Operação": {"Consulta", "Operador"},
        },
        "users": {
            "person@example.com": {
                "full_name": "Pessoa Teste",
                "user_type": "System User",
                "role_profile_name": "",
                "roles": {"Consulta"},
            },
        },
        "warehouse_permissions": [{
            "name": "UP-1", "for_value": "A - C", "applicable_for": None,
            "is_default": 0, "hide_descendants": 0,
        }],
        "audit": [],
        "cache_cleared": [],
    }

    frappe = types.ModuleType("frappe")
    frappe.ValidationError = type("ValidationError", (Exception,), {})
    frappe.PermissionError = type("PermissionError", (Exception,), {})
    frappe.DoesNotExistError = type("DoesNotExistError", (Exception,), {})
    frappe.throw = lambda message, error=None: (_ for _ in ()).throw((error or Exception)(message))
    frappe.whitelist = lambda *args, **kwargs: (lambda function: function)
    frappe.session = types.SimpleNamespace(user="admin@example.com")

    def exists(doctype, name):
        if doctype == "User":
            return name in state["users"] or name in {"Administrator", "Guest"}
        if doctype == "Role Profile":
            return name in state["profiles"]
        return False

    def get_value(doctype, name, field):
        if doctype != "User":
            return None
        if name in {"Administrator", "Guest"}:
            return "System User" if field == "user_type" else ""
        return state["users"][name].get(field)

    frappe.db = types.SimpleNamespace(exists=exists, get_value=get_value)

    def get_all(doctype, filters=None, fields=None, pluck=None, **kwargs):
        filters = filters or {}
        if doctype == "Has Role":
            if filters.get("parenttype") == "User":
                return sorted(state["users"][filters["parent"]]["roles"])
            if filters.get("parenttype") == "Role Profile":
                return sorted(state["profiles"][filters["parent"]])
        if doctype == "Role Profile" and pluck == "name":
            return sorted(state["profiles"])
        if doctype == "User Permission":
            return [dict(row) for row in state["warehouse_permissions"]]
        return []

    frappe.get_all = get_all

    class UserDoc:
        def __init__(self, user):
            self.name = user
            self.role_profile_name = state["users"][user]["role_profile_name"]

        def save(self):
            state["users"][self.name]["role_profile_name"] = self.role_profile_name
            state["users"][self.name]["roles"] = set(state["profiles"][self.role_profile_name])

    frappe.get_doc = lambda doctype, name=None: UserDoc(name) if doctype == "User" else None
    frappe.clear_cache = lambda user=None: state["cache_cleared"].append(user)
    frappe.utils = types.ModuleType("frappe.utils")
    frappe.utils.cint = lambda value: int(bool(int(value))) if isinstance(value, str) else int(bool(value))
    frappe.utils.getdate = lambda value=None: value if isinstance(value, date) else date.fromisoformat(str(value))
    frappe.utils.now_datetime = lambda: datetime(2026, 9, 1, 10, 0, 0)
    frappe.utils.today = lambda: "2026-09-01"

    control = types.ModuleType("cdc_theme.access_control")
    control.ACCESS_AUDIT_DOCTYPE = "CDC Access Audit Log"
    control.ACCESS_EXCEPTION_DOCTYPE = "CDC Access Exception"
    control.PAGE_CATALOG = {}
    control.audit_event = lambda event, details=None, **kwargs: state["audit"].append((event, details, kwargs))
    control.catalog_payload = lambda: {}
    control.end_preview = lambda: None
    control.effective_access_matrix = lambda **kwargs: {}
    control.evaluate_access = lambda *args, **kwargs: {}
    control.get_preview_context = lambda: None
    control.is_system_manager = lambda: True
    control.native_warehouse_scope = lambda user, roles=None: {"A - C"}
    control.normalize_action = lambda action, page=None: action
    control.normalize_page_key = lambda page: page
    control.require_system_manager = lambda allow_preview=False: None
    control.roles_for_profile = lambda profile: set(state["profiles"].get(profile, ()))
    control.roles_for_user = lambda user: set(state["users"].get(user, {}).get("roles", ()))
    control.start_preview = lambda *args, **kwargs: {"args": args, "kwargs": kwargs}

    package = types.ModuleType("cdc_theme")
    package.__path__ = []
    previous = {name: sys.modules.get(name) for name in ("frappe", "frappe.utils", "cdc_theme", "cdc_theme.access_control")}
    sys.modules.update({
        "frappe": frappe,
        "frappe.utils": frappe.utils,
        "cdc_theme": package,
        "cdc_theme.access_control": control,
    })
    try:
        spec = importlib.util.spec_from_file_location("cdc_access_api_test", MODULE_PATH)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module._test_state = state
        return module
    finally:
        for name, value in previous.items():
            if value is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = value


class AccessProfileAssignmentTest(unittest.TestCase):
    def test_comparison_exposes_added_removed_and_match(self):
        api = load_access_api()
        comparison = api._profile_comparison(
            {"Consulta", "Relatórios"}, "Operação", {"Consulta", "Operador"},
        )
        self.assertEqual(["Operador"], comparison["added_roles"])
        self.assertEqual(["Relatórios"], comparison["removed_roles"])
        self.assertEqual(["Consulta"], comparison["matched_roles"])
        self.assertEqual(33, comparison["match_percent"])

    def test_options_suggest_closest_real_profile_without_applying_it(self):
        api = load_access_api()
        options = api.get_role_profile_assignment_options("person@example.com")
        self.assertEqual("Consulta padrão", options["suggested_profile"])
        self.assertEqual("", api._test_state["users"]["person@example.com"]["role_profile_name"])
        self.assertEqual(1, options["warehouse_count"])
        self.assertTrue(next(row for row in options["profiles"] if row["name"] == "Operação")["warehouse_scope_preserved"])

    def test_assignment_uses_native_save_audits_and_preserves_warehouses(self):
        api = load_access_api()
        result = api.assign_role_profile(
            "person@example.com", "Operação", "Adequação à atividade", confirmed=1,
        )
        self.assertEqual("Operação", result["role_profile"])
        self.assertEqual(["Consulta", "Operador"], result["assigned_roles"])
        self.assertTrue(result["warehouse_permissions_preserved"])
        self.assertEqual("person@example.com", api._test_state["cache_cleared"][-1])
        self.assertEqual("Role profile assigned", api._test_state["audit"][-1][0])

    def test_native_administrator_is_protected(self):
        api = load_access_api()
        with self.assertRaises(api.frappe.PermissionError):
            api.get_role_profile_assignment_options("Administrator")

    def test_assignment_is_cancelled_when_roles_change_effective_scope(self):
        api = load_access_api()
        api.native_warehouse_scope = lambda user, roles=None: (
            {"A - C", "B - C"} if "Operador" in set(roles or ()) else {"A - C"}
        )
        with self.assertRaises(api.frappe.ValidationError):
            api.assign_role_profile(
                "person@example.com", "Operação", "Adequação à atividade", confirmed=1,
            )

    def test_assignment_requires_confirmation_and_justification(self):
        api = load_access_api()
        with self.assertRaises(api.frappe.ValidationError):
            api.assign_role_profile("person@example.com", "Operação", "Curta", confirmed=0)


if __name__ == "__main__":
    unittest.main()
