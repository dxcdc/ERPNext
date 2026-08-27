import ast
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
THEME_JS = ROOT / "apps/cdc_theme/cdc_theme/public/js/cdc_theme.js"
PENDING_JS = ROOT / "apps/cdc_theme/cdc_theme/public/js/cdc_pending.js"
TESTS_JS = ROOT / "apps/cdc_theme/cdc_theme/public/js/cdc_tests.js"
THEME_CSS = ROOT / "apps/cdc_theme/cdc_theme/public/css/cdc_theme.css"
GROUPS_JS = ROOT / "apps/cdc_theme/cdc_theme/public/js/cdc_groups.js"
ITEMS_JS = ROOT / "apps/cdc_theme/cdc_theme/public/js/cdc_items.js"
ADMIN_JS = ROOT / "apps/cdc_theme/cdc_theme/public/js/cdc_admin.js"
API_PY = ROOT / "apps/cdc_theme/cdc_theme/api.py"
COMPOSE_YML = ROOT / "docker-compose.yml"
TERRAFORM_VARIABLES = ROOT / "terraform/variables.tf"
TERRAFORM_TELEMETRY = ROOT / "terraform/telemetry.tf"
TERRAFORM_MAIN = ROOT / "terraform/main.tf"
TROUBLESHOOTING_DOC = ROOT / "docs/troubleshooting.md"


class StaticSafetyTest(unittest.TestCase):
    def test_item_group_route_does_not_match_query_parameters(self):
        source = THEME_JS.read_text()
        route_block = source[source.index("function isItemGroupRoute"):source.index("function removeItemGroupDashboard")]
        self.assertNotIn("window.location.href", route_block)
        self.assertNotIn("window.location.hash", route_block)
        self.assertNotIn("item_group", route_block)

    def test_item_and_item_group_explicit_list_paths_are_supported(self):
        source = THEME_JS.read_text()
        item_route = source[source.index("function isItemRoute"):source.index("function getCatalogRouteValue")]
        self.assertIn("pathname === '/app/item/view/list'", item_route)
        self.assertIn("routeDoctype === 'item'", item_route)
        self.assertNotIn("window.location.href", item_route)
        group_route = source[source.index("function isItemGroupRoute"):source.index("function removeItemGroupDashboard")]
        self.assertIn("pathname === '/app/item-group/view/list'", group_route)

    def test_catalog_dashboards_preserve_native_lists_and_real_filters(self):
        theme_source = THEME_JS.read_text()
        api_source = API_PY.read_text()
        catalog_block = theme_source[
            theme_source.index("function isItemGroupRoute"):
            theme_source.index("function init()", theme_source.index("function isItemGroupRoute"))
        ]
        self.assertIn("body.insertBefore(dashboard, listBody)", catalog_block)
        self.assertIn("currentBody.insertBefore(dashboard, currentListBody)", catalog_block)
        self.assertIn("frappe.set_route('List', 'Item', 'List', filters)", catalog_block)
        self.assertIn("frappe.set_route('List', 'Item Group', 'List', filters)", catalog_block)
        self.assertIn("cdc-catalog-list-enhanced", catalog_block)
        self.assertNotIn("tabBin", ast.get_source_segment(
            api_source,
            next(node for node in ast.parse(api_source).body
                 if isinstance(node, ast.FunctionDef) and node.name == "get_item_group_dashboard_data"),
        ))
        self.assertIn("get_item_list_dashboard_data", api_source)

    def test_catalog_project_and_warehouse_scope_uses_permitted_positive_stock(self):
        theme_source = THEME_JS.read_text()
        api_source = API_PY.read_text()
        tree = ast.parse(api_source)
        context_function = next(
            node for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "_catalog_filter_context"
        )
        stock_function = next(
            node for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "_catalog_positive_item_codes"
        )
        context_body = ast.get_source_segment(api_source, context_function)
        stock_body = ast.get_source_segment(api_source, stock_function)
        self.assertIn('frappe.get_list(', context_body)
        self.assertNotIn('frappe.get_all(', context_body)
        self.assertIn('"Warehouse"', context_body)
        self.assertIn('"Bin"', stock_body)
        self.assertIn('"actual_qty": [">", 0]', stock_body)
        self.assertIn('data-cdc-catalog-project', theme_source)
        self.assertIn('data-cdc-catalog-warehouse', theme_source)
        self.assertIn("filters.push([this.doctype, 'name', 'in', names])", theme_source)
        self.assertIn('window.cur_list', theme_source)

    def test_item_group_never_mounts_on_document_body(self):
        source = THEME_JS.read_text()
        render_block = source[source.index("function renderItemGroup"):source.index("function init()", source.index("function renderItemGroup"))]
        self.assertNotIn("document.body", render_block)
        self.assertNotIn("cdc-custom-item-group-active", render_block)
        self.assertNotIn("getDiagnosticPanelHTML", render_block)
        self.assertNotIn("bindDiagnosticActions", render_block)

    def test_warehouse_list_has_permission_scoped_cards_and_native_filters(self):
        theme_source = THEME_JS.read_text()
        api_source = API_PY.read_text()
        warehouse_block = theme_source[
            theme_source.index("function isWarehouseListRoute()"):
            theme_source.index("function init()", theme_source.index("function isWarehouseListRoute()"))
        ]
        self.assertIn("routeType === 'list' && routeDoctype === 'warehouse'", warehouse_block)
        self.assertIn("pathname === '/app/warehouse/view/list'", warehouse_block)
        self.assertNotIn("window.location.href", warehouse_block)
        self.assertIn("body.insertBefore(dashboard, listBody)", warehouse_block)
        self.assertIn("currentBody.insertBefore(dashboard, currentListBody)", warehouse_block)
        self.assertIn("frappe.set_route('List', 'Warehouse', 'List', routeFilters)", warehouse_block)
        self.assertIn("data.scope", warehouse_block)
        self.assertIn("fieldname === 'name' && operator === 'in'", warehouse_block)
        self.assertIn("JSON.parse(value)", warehouse_block)
        self.assertIn("filters.search ? escapeHTML(filters.search) : ''", warehouse_block)
        self.assertIn("list.$result && typeof list.refresh === 'function'", warehouse_block)
        router_block = theme_source[theme_source.index("frappe.router.on('change'"):]
        self.assertNotIn("warehouseDashboard.dataset.loaded = '0'", router_block)
        for control_id in (
            "cdc-warehouse-search", "cdc-warehouse-project", "cdc-warehouse-company",
            "cdc-warehouse-status", "cdc-warehouse-kind", "cdc-warehouse-parent",
        ):
            self.assertIn(control_id, warehouse_block)

        tree = ast.parse(api_source)
        endpoint = next(
            node for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "get_warehouse_list_dashboard_data"
        )
        endpoint_source = ast.get_source_segment(api_source, endpoint)
        self.assertIn('_require_read_permission("Warehouse")', endpoint_source)
        self.assertIn('frappe.get_list(', endpoint_source)
        self.assertNotIn('frappe.get_all(', endpoint_source)
        self.assertIn('"scope"', endpoint_source)

    def test_fake_sync_messages_are_absent(self):
        source = PENDING_JS.read_text()
        self.assertNotIn("58 pendências atualizadas", source)
        self.assertNotIn("Sincronização concluída com sucesso (Código 0", source)

    def test_theme_preserves_user_browser_state(self):
        source = THEME_JS.read_text()
        self.assertNotIn("sessionStorage.clear()", source)
        self.assertNotIn("frappe.boot.user.desk_theme = 'Light'", source)
        self.assertNotIn("UPDATE tabUser SET desk_theme", TERRAFORM_MAIN.read_text())

    def test_stock_request_watchdog_cannot_be_cancelled_by_stale_response(self):
        source = THEME_JS.read_text()
        stock_module = source[:source.index("})();")]
        stock_block = source[
            source.index("function renderStockDashboard()"):
            source.index("// --- EVENT DELEGATION GLOBAL ---")
        ]
        callback_block = stock_block[
            stock_block.index("callback: function(r)"):
            stock_block.index("error: function(err)")
        ]
        self.assertLess(
            callback_block.index("requestSerial !== stockRequestSerial"),
            callback_block.index("window.clearTimeout(stockRequestTimer)"),
        )
        self.assertNotIn("Date.now() - lastFetchTime > 6000", stock_block)
        self.assertIn("function cancelStockDashboardRequest()", source)
        self.assertIn("function escapeHTML(value)", stock_module)
        self.assertIn("function getStockDashboardRenderKey(pilotProject)", stock_module)
        self.assertIn("stockActiveRequestKey === renderKey", stock_block)
        self.assertIn("dashDiv.dataset.loaded === '1'", stock_block)
        self.assertIn("dashDiv.dataset.state = 'ready'", callback_block)

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

    def test_cdc_tests_page_exposes_ten_honest_quality_gates_and_theme_repair(self):
        api_source = API_PY.read_text()
        theme_source = THEME_JS.read_text()
        tests_source = TESTS_JS.read_text()
        css_source = THEME_CSS.read_text()
        expected_ids = (
            "item-group-route", "item-group-native-list", "real-telemetry",
            "ongsys-integrity", "warehouse-rbac", "security-ci",
            "automated-tests", "production-validation",
            "workspace-navigation", "theme-integrity",
        )
        for gate_id in expected_ids:
            with self.subTest(gate_id=gate_id):
                self.assertEqual(api_source.count(f'"{gate_id}"'), 2)
        self.assertIn('"ready_to_publish"', api_source)
        self.assertIn("get_cdc_tests_dashboard", api_source)
        self.assertNotIn("tab-validacoes", theme_source)
        self.assertIn("Executar testes novamente", tests_source)
        self.assertIn("Reparar tema e caches", api_source)
        self.assertIn("data-cdc-tests-action", tests_source)
        self.assertIn("CDC Test Runner", tests_source)
        self.assertIn("runVisibleTestExecution", tests_source)
        self.assertIn("cdc_theme.api.get_cdc_admin_diagnostics", tests_source)
        self.assertIn("data-cdc-test-terminal-output", tests_source)
        self.assertIn("data-cdc-run-gate", tests_source)
        self.assertIn("data-cdc-gate-terminal", tests_source)
        self.assertIn("appendGateLog", tests_source)
        self.assertIn("data-cdc-action-gate", tests_source)
        self.assertIn("data-cdc-overall-progress", tests_source)
        self.assertIn("data-cdc-gate-progress", tests_source)
        self.assertIn("cdc-stage-activity-bar", tests_source)
        self.assertIn("Execução sequencial autenticada", tests_source)
        self.assertIn("Aguardando resposta do servidor", tests_source)
        self.assertIn(".cdc-overall-metro", css_source)
        self.assertIn(".cdc-gate-metro", css_source)
        self.assertIn(".cdc-stage-activity-bar", css_source)
        self.assertIn("@keyframes cdcStageActivity", css_source)
        self.assertIn("Entender este teste", tests_source)
        self.assertIn("Executar este teste", tests_source)
        self.assertIn("cdc_theme.api.run_cdc_quality_gate", tests_source)
        self.assertIn("def run_cdc_quality_gate", api_source)
        self.assertIn("stock_watchdog_safe", api_source)
        self.assertIn("proteção contra requisições concorrentes", api_source)
        tree = ast.parse(api_source)
        copy_node = next(
            node for node in tree.body
            if isinstance(node, ast.Assign)
            and any(isinstance(target, ast.Name) and target.id == "QUALITY_GATE_COPY" for target in node.targets)
        )
        gate_copy = ast.literal_eval(copy_node.value)
        self.assertEqual(set(gate_copy), set(expected_ids))
        for gate_id, copy in gate_copy.items():
            with self.subTest(explanation_gate=gate_id):
                self.assertTrue(copy["summary"])
                self.assertEqual(len(copy["details"]), 2)
                self.assertIn(copy["execution_type"], {"Automático", "Híbrido", "Externo"})
                self.assertGreaterEqual(len(copy["stages"]), 5)
                self.assertEqual(copy["stages"][0], "Preparação")
                self.assertIn("Resultado", copy["stages"][-1])
        self.assertIn('details.append(f"Resultado desta execução: {evidence}")', api_source)
        self.assertIn("repairBrowserThemeState", tests_source)
        self.assertIn("window.location.reload()", tests_source)
        self.assertIn("window._cdc_repair_theme_runtime", theme_source)
        self.assertIn("claimCDCActiveDashboard", theme_source)
        main_theme_source = theme_source.split("CDC MONITORING WORKSPACE DASHBOARD INITIALIZER", 1)[0]
        self.assertNotIn("var claim = claimActiveDashboard", main_theme_source)
        self.assertIn('"repair_theme"', api_source)
        self.assertIn("_theme_integrity_health", api_source)
        self.assertNotIn("Todos os testes foram aprovados", tests_source)

    def test_cdc_groups_is_only_a_shortcut_to_native_item_group(self):
        source = GROUPS_JS.read_text()
        self.assertIn("frappe.set_route('List', 'Item Group', 'List')", source)
        self.assertNotIn("get_item_group_dashboard_data", source)
        self.assertNotIn("frappe.db", source)

    def test_cdc_items_is_only_a_shortcut_to_native_item_list(self):
        source = ITEMS_JS.read_text()
        self.assertIn("frappe.set_route('List', 'Item', 'List')", source)
        self.assertNotIn("frappe.call", source)
        self.assertNotIn("frappe.db", source)

    def test_new_workspaces_are_preserved_in_backend_sidebar_and_terraform(self):
        api_source = API_PY.read_text()
        theme_source = THEME_JS.read_text()
        terraform_source = TERRAFORM_MAIN.read_text()
        for workspace in ("CDC Testes", "CDC Grupos", "CDC Itens"):
            with self.subTest(workspace=workspace):
                self.assertIn(workspace, api_source)
                self.assertIn(workspace, terraform_source)
        self.assertIn("'cdc testes'", theme_source)
        self.assertIn("'cdc grupos'", theme_source)
        self.assertIn("'cdc itens'", theme_source)

    def test_sidebar_orders_groups_and_items_after_users(self):
        api_source = API_PY.read_text()
        self.assertIn('_ensure_cdc_workspace("CDC Usuários", "users", 2.0)', api_source)
        self.assertIn('_ensure_cdc_workspace(CDC_GROUPS_WORKSPACE, "folder-normal", 3.0)', api_source)
        self.assertIn('_ensure_cdc_workspace(CDC_ITEMS_WORKSPACE, "assets", 4.0)', api_source)

    def test_spa_dashboards_claim_only_the_active_page_container(self):
        theme_source = THEME_JS.read_text()
        self.assertIn("function claimActiveDashboard", theme_source)
        for asset in (PENDING_JS, TESTS_JS, GROUPS_JS, ITEMS_JS, ADMIN_JS):
            with self.subTest(asset=asset.name):
                self.assertIn("window._cdc_claim_active_dashboard", asset.read_text())


if __name__ == "__main__":
    unittest.main()
