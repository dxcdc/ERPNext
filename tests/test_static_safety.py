import ast
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
THEME_JS = ROOT / "apps/cdc_theme/cdc_theme/public/js/cdc_theme.js"
PENDING_JS = ROOT / "apps/cdc_theme/cdc_theme/public/js/cdc_pending.js"
API_PY = ROOT / "apps/cdc_theme/cdc_theme/api.py"
COMPOSE_YML = ROOT / "docker-compose.yml"
TERRAFORM_VARIABLES = ROOT / "terraform/variables.tf"
TERRAFORM_TELEMETRY = ROOT / "terraform/telemetry.tf"
TROUBLESHOOTING_DOC = ROOT / "docs/troubleshooting.md"


class StaticSafetyTest(unittest.TestCase):
    def test_item_group_route_does_not_match_query_parameters(self):
        source = THEME_JS.read_text()
        route_block = source[source.index("function isItemGroupRoute"):source.index("function removeItemGroupDashboard")]
        self.assertNotIn("window.location.href", route_block)
        self.assertNotIn("window.location.hash", route_block)
        self.assertNotIn("item_group", route_block)

    def test_item_group_never_mounts_on_document_body(self):
        source = THEME_JS.read_text()
        render_block = source[source.index("function renderItemGroup"):source.index("function init()", source.index("function renderItemGroup"))]
        self.assertNotIn("document.body", render_block)
        self.assertNotIn("cdc-custom-item-group-active", render_block)
        self.assertNotIn("getDiagnosticPanelHTML", render_block)
        self.assertNotIn("bindDiagnosticActions", render_block)

    def test_fake_sync_messages_are_absent(self):
        source = PENDING_JS.read_text()
        self.assertNotIn("58 pendências atualizadas", source)
        self.assertNotIn("Sincronização concluída com sucesso (Código 0", source)

    def test_theme_preserves_user_browser_state(self):
        source = THEME_JS.read_text()
        self.assertNotIn("sessionStorage.clear()", source)
        self.assertNotIn("frappe.boot.user.desk_theme = 'Light'", source)

    def test_infrastructure_has_no_default_admin_password(self):
        self.assertNotIn("MYSQL_ROOT_PASSWORD: admin", COMPOSE_YML.read_text())
        self.assertNotIn('default     = "admin"', TERRAFORM_VARIABLES.read_text())
        self.assertNotIn("-p'admin'", TERRAFORM_TELEMETRY.read_text())
        self.assertNotIn("IDENTIFIED BY '", TROUBLESHOOTING_DOC.read_text())

    def test_public_monitoring_endpoint_uses_persisted_data(self):
        source = API_PY.read_text()
        self.assertNotIn("_legacy_ongsys_monitoring_dashboard_demo", source)
        tree = ast.parse(source)
        endpoint = next(
            node for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "get_ongsys_monitoring_dashboard"
        )
        body = ast.get_source_segment(source, endpoint)
        self.assertIn("CDC ONGSYS Pending Order", body)
        self.assertIn("CDC ONGSYS Sync State", body)
        self.assertIn("_require_system_manager", body)

    def test_monitoring_exposes_eight_honest_quality_gates(self):
        api_source = API_PY.read_text()
        theme_source = THEME_JS.read_text()
        expected_ids = (
            "item-group-route", "item-group-native-list", "real-telemetry",
            "ongsys-integrity", "warehouse-rbac", "security-ci",
            "automated-tests", "production-validation",
        )
        for gate_id in expected_ids:
            with self.subTest(gate_id=gate_id):
                self.assertEqual(api_source.count(f'"{gate_id}"'), 1)
        self.assertIn('"ready_to_publish"', api_source)
        self.assertIn("tab-validacoes", theme_source)
        self.assertIn("Executar testes novamente", theme_source)
        self.assertNotIn("Todos os testes foram aprovados", theme_source)


if __name__ == "__main__":
    unittest.main()
