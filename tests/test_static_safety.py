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
WAREHOUSE_JS = ROOT / "apps/cdc_theme/cdc_theme/public/js/cdc_warehouse.js"
STOCK_ROUTES_JS = ROOT / "apps/cdc_theme/cdc_theme/public/js/cdc_stock_routes.js"
ADMIN_JS = ROOT / "apps/cdc_theme/cdc_theme/public/js/cdc_admin.js"
MANAGEMENT_JS = ROOT / "apps/cdc_theme/cdc_theme/public/js/cdc_management.js"
API_PY = ROOT / "apps/cdc_theme/cdc_theme/api.py"
COMPOSE_YML = ROOT / "docker-compose.yml"
TERRAFORM_VARIABLES = ROOT / "terraform/variables.tf"
TERRAFORM_TELEMETRY = ROOT / "terraform/telemetry.tf"
TERRAFORM_MAIN = ROOT / "terraform/main.tf"
TROUBLESHOOTING_DOC = ROOT / "docs/troubleshooting.md"


class StaticSafetyTest(unittest.TestCase):
    def test_ongsys_admin_mapping_and_resilient_importer_are_guarded(self):
        api_source = API_PY.read_text()
        admin_source = (ROOT / "apps/cdc_theme/cdc_theme/public/js/cdc_admin.js").read_text()
        common_source = (ROOT / "extractor/common.py").read_text()
        importer_source = (ROOT / "extractor/5_extrator_requisicoes_v2.py").read_text()
        discovery_source = (ROOT / "extractor/6_discover_ongsys_mappings.py").read_text()
        discovery_service = (ROOT / "deploy/systemd/cdc-ongsys-mapping-discovery.service").read_text()
        mapping_json = (ROOT / "apps/cdc_theme/cdc_theme/cdc_theme/doctype/cdc_ongsys_warehouse_mapping/cdc_ongsys_warehouse_mapping.json").read_text()
        self.assertIn('ONGSYS_MAPPING_DOCTYPE = "CDC ONGSYS Warehouse Mapping"', api_source)
        for endpoint in (
            "get_cdc_admin_ongsys_dashboard", "save_ongsys_warehouse_mapping",
            "validate_ongsys_warehouse_mapping", "activate_ongsys_warehouse_mapping",
            "get_ongsys_warehouse_mappings_for_extractor",
            "request_ongsys_mapping_discovery", "record_ongsys_mapping_discovery",
            "activate_ongsys_warehouse_mappings",
        ):
            self.assertIn(f"def {endpoint}", api_source)
        self.assertIn("_require_system_manager()", api_source)
        self.assertIn('"track_changes": 1', mapping_json)
        self.assertIn('"unique":1', mapping_json)
        self.assertIn("data-cdc-admin-ongsys", admin_source)
        self.assertIn("Nenhuma movimentação de estoque será criada", admin_source)
        self.assertIn("data-cdc-map-search", admin_source)
        self.assertIn("data-cdc-map-status", admin_source)
        self.assertIn("data-cdc-map-warehouse", admin_source)
        self.assertIn("data-cdc-map-toggle", admin_source)
        self.assertIn("Ao desativar, o vínculo fica Bloqueado", admin_source)
        self.assertIn("Integração ONGSYS atualizada", admin_source)
        self.assertIn("Validar pendentes automaticamente", admin_source)
        self.assertIn("data-cdc-map-activate-selected", admin_source)
        self.assertIn("Nenhum estoque será criado", admin_source)
        self.assertIn("Retry(", common_source)
        self.assertIn("status_forcelist=(429, 500, 502, 503, 504, 520, 522, 524)", common_source)
        self.assertIn('parser.add_argument("--dry-run"', importer_source)
        self.assertIn('parser.add_argument("--order-id"', importer_source)
        self.assertIn("def preflight_orders", importer_source)
        self.assertIn("api/method/cdc_theme.api.get_ongsys_warehouse_mappings_for_extractor", importer_source)
        self.assertIn('row.get("status") == "Bloqueado"', importer_source)
        self.assertIn('FINAL_STATUS = "Ordem finalizada"', discovery_source)
        self.assertIn("is_product_order", discovery_source)
        self.assertNotIn("Stock Entry", discovery_source)
        self.assertIn('"read-only"', discovery_source)
        self.assertIn("NoNewPrivileges=true", discovery_service)
        self.assertNotIn("5_extrator_requisicoes_v2.py", discovery_service)
        self.assertIn('doc.status = "Validado"', api_source)
        self.assertIn('doc.enabled = 0', api_source)

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
        self.assertIn("function scheduleWarehouseRender(delay)", theme_source)
        self.assertIn("clearTimeout(warehouseRenderTimer)", theme_source)
        self.assertIn("warehousePendingContextUntil = Date.now() + 1200", warehouse_block)
        self.assertIn("return Object.assign({}, warehousePendingContext)", warehouse_block)
        self.assertIn("bindWarehouseNativeScope(warehouseLastScope)", warehouse_block)
        self.assertIn("warehouseLastScope = data.scope", warehouse_block)
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

    def test_stock_routes_preserve_native_components_and_permission_scoped_data(self):
        source = STOCK_ROUTES_JS.read_text()
        api_source = API_PY.read_text()
        self.assertIn("window._cdc_claim_active_dashboard('cdc-stock-route-dashboard'", source)
        self.assertIn("cdc-stock-route-native", source)
        self.assertIn("frappe.set_route('List', 'Stock Entry', 'Report'", source)
        self.assertIn("frappe.set_route('List', 'Stock Entry', 'List'", source)
        self.assertIn("path === '/app/stock-entry'", source)
        self.assertIn("path === '/app/stock-entry/view/list'", source)
        self.assertIn("definition.doctype === 'Stock Entry'", source)
        self.assertIn("frappe.set_route('List', 'Stock Reconciliation', 'List'", source)
        self.assertIn("setNativeReportFilter(report, 'warehouse'", source)
        self.assertIn("setNativeReportFilter(report, 'warehouse', options.warehouses)", source)
        self.assertIn("Todos os armazéns permitidos", source)
        self.assertIn("warehouse ? [warehouse] : permittedWarehouses", source)
        self.assertIn("!Array.isArray(queryReport.filters) || !queryReport.filters.length", source)
        self.assertIn("setNativeReportFilter(report, 'item_code'", source)
        self.assertIn("report.refresh()", source)
        self.assertIn("outQty += Math.abs(Number(row.out_qty || 0))", source)
        self.assertNotIn("frappe.db", source)

        tree = ast.parse(api_source)
        document_endpoint = next(
            node for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "get_stock_document_dashboard_data"
        )
        report_endpoint = next(
            node for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "get_stock_report_filter_options"
        )
        document_source = ast.get_source_segment(api_source, document_endpoint)
        report_source = ast.get_source_segment(api_source, report_endpoint)
        self.assertIn("_require_read_permission(document_type)", document_source)
        self.assertIn("frappe.get_list(", document_source)
        self.assertNotIn("frappe.get_all(", document_source)
        for doctype in ("Stock Ledger Entry", "Warehouse", "Item Group"):
            self.assertIn(f'_require_read_permission("{doctype}")', report_source)
        self.assertIn('if report_key == "stock-balance"', report_source)
        self.assertIn("frappe.get_list(", report_source)
        self.assertNotIn("frappe.get_all(", report_source)

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
                self.assertGreaterEqual(api_source.count(f'"{gate_id}"'), 2)
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
                self.assertGreaterEqual(len(copy["details"]), 2)
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

    def test_warehouse_rbac_gate_runs_read_only_behavioral_audit(self):
        api_source = API_PY.read_text()
        tests_source = TESTS_JS.read_text()
        tree = ast.parse(api_source)
        audit_node = next(
            node for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "_run_warehouse_rbac_audit"
        )
        audit_source = ast.get_source_segment(api_source, audit_node)
        finder_node = next(
            node for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "_find_restricted_warehouse_user"
        )
        finder_source = ast.get_source_segment(api_source, finder_node)

        self.assertIn("stage_results", audit_source)
        self.assertIn("get_catalog_management_dashboard_data", audit_source)
        self.assertIn("get_stock_dashboard_data", audit_source)
        self.assertIn("except frappe.PermissionError", audit_source)
        self.assertIn('getattr(frappe.local, "message_log", [])', audit_source)
        self.assertIn("del current_messages[message_count:]", audit_source)
        self.assertIn("frappe.set_user", audit_source)
        self.assertIn("finally:", audit_source)
        self.assertIn("finally:", finder_source)
        self.assertIn("frappe.set_user(original_user)", finder_source)
        self.assertIn("require_stock_manager=True", audit_source)
        self.assertIn("Nenhum Stock Manager existente possui escopo parcial", audit_source)
        for forbidden_mutation in (
            "frappe.db.set_value", ".save(", ".insert(", "frappe.new_doc",
            'frappe.get_doc({"doctype": "User Permission"',
        ):
            with self.subTest(forbidden_mutation=forbidden_mutation):
                self.assertNotIn(forbidden_mutation, audit_source + finder_source)

        self.assertIn("function executeWarehouseRbacStages", tests_source)
        self.assertIn("result.check.stage_results", tests_source)
        self.assertIn("gateId === 'warehouse-rbac'", tests_source)

    def test_cdc_groups_uses_permission_scoped_management_dashboard(self):
        source = GROUPS_JS.read_text()
        management = MANAGEMENT_JS.read_text()
        self.assertIn("_cdc_render_management_dashboard", source)
        self.assertIn("get_catalog_management_dashboard_data", management)
        self.assertIn("frappe.set_route('List', 'Item Group', 'List'", management)
        self.assertNotIn("frappe.db", source + management)

    def test_cdc_items_uses_management_dashboard_and_native_drilldown(self):
        source = ITEMS_JS.read_text()
        management = MANAGEMENT_JS.read_text()
        self.assertIn("_cdc_render_management_dashboard", source)
        self.assertIn("frappe.set_route('List', 'Item', 'List'", management)
        self.assertIn("frappe.set_route('Form', 'Item', name)", management)
        self.assertNotIn("frappe.db", source + management)

    def test_cdc_warehouse_uses_management_dashboard_and_aliases(self):
        source = WAREHOUSE_JS.read_text()
        management = MANAGEMENT_JS.read_text()
        theme_source = THEME_JS.read_text()
        self.assertIn("_cdc_render_management_dashboard", source)
        self.assertIn("cdc-armazemo", source)
        self.assertIn("frappe.set_route('List', 'Warehouse', 'List'", management)
        self.assertIn("window._cdc_claim_active_dashboard", management)
        self.assertNotIn("frappe.db", source + management)
        self.assertIn("function redirectCDCWarehouseWorkspaceAlias()", theme_source)
        self.assertIn("function dismissCDCWarehouseAliasNotFound()", theme_source)
        self.assertIn("pagina cdc-armazem nao encontrado", theme_source)
        self.assertIn("warehouseWorkspaceAliasObserver.observe(document.body", theme_source)
        self.assertIn("modal.remove()", theme_source)
        self.assertIn("frappe.set_route('Workspaces', 'CDC Armazém')", theme_source)
        self.assertIn("href: '/app/cdc-armazém'", theme_source)

    def test_management_endpoint_uses_native_permissions_and_real_data(self):
        api_source = API_PY.read_text()
        endpoint = next(
            node for node in ast.parse(api_source).body
            if isinstance(node, ast.FunctionDef)
            and node.name == "get_catalog_management_dashboard_data"
        )
        endpoint_source = ast.get_source_segment(api_source, endpoint)
        for doctype in ("Item Group", "Item", "Warehouse", "Bin", "Stock Ledger Entry"):
            self.assertIn(f'"{doctype}"', endpoint_source)
        self.assertIn("_require_read_permission(doctype)", endpoint_source)
        self.assertIn("frappe.get_list(", endpoint_source)
        self.assertNotIn("frappe.get_all(", endpoint_source)
        self.assertNotIn("frappe.db.sql(", endpoint_source)
        self.assertIn('period not in {7, 30, 90}', api_source)
        self.assertIn('"cards"', endpoint_source)
        self.assertIn('"charts"', endpoint_source)
        self.assertIn('"alerts"', endpoint_source)
        self.assertIn('"table"', endpoint_source)

    def test_management_frontend_has_filters_feedback_and_spa_guards(self):
        source = MANAGEMENT_JS.read_text()
        for control in (
            "data-cdc-manager-search", "data-cdc-manager-company",
            "data-cdc-manager-project", "data-cdc-manager-warehouse",
            "data-cdc-manager-group", "data-cdc-manager-period",
        ):
            self.assertIn(control, source)
        self.assertIn("serial !== state.serial", source)
        self.assertIn("A consulta ultrapassou 15 segundos", source)
        self.assertIn("window.history.replaceState", source)
        self.assertIn("O período altera movimentações", source)
        self.assertIn("nenhuma informação é simulada", source)
        self.assertNotIn("frappe.db", source)

    def test_new_workspaces_are_preserved_in_backend_sidebar_and_terraform(self):
        api_source = API_PY.read_text()
        theme_source = THEME_JS.read_text()
        terraform_source = TERRAFORM_MAIN.read_text()
        for workspace in ("CDC Testes", "CDC Grupos", "CDC Itens", "CDC Armazém", "CDC Treinamento"):
            with self.subTest(workspace=workspace):
                self.assertIn(workspace, api_source)
                self.assertIn(workspace, terraform_source)
        self.assertIn("'cdc testes'", theme_source)
        self.assertIn("'cdc grupos'", theme_source)
        self.assertIn("'cdc itens'", theme_source)
        self.assertIn("'cdc armazem'", theme_source)
        self.assertIn("'cdc treinamento'", theme_source)

    def test_sidebar_orders_groups_items_and_warehouse_after_users(self):
        api_source = API_PY.read_text()
        terraform_source = TERRAFORM_MAIN.read_text()
        self.assertIn('_ensure_cdc_workspace("CDC Usuários", "users", 2.0)', api_source)
        self.assertIn('_ensure_cdc_workspace(CDC_GROUPS_WORKSPACE, "folder-normal", 3.0)', api_source)
        self.assertIn('_ensure_cdc_workspace(CDC_ITEMS_WORKSPACE, "assets", 4.0)', api_source)
        self.assertIn('_ensure_cdc_workspace(CDC_WAREHOUSE_WORKSPACE, "organization", 5.0)', api_source)
        self.assertNotIn('_ensure_cdc_workspace(CDC_WAREHOUSE_WORKSPACE, "home", 5.0)', api_source)
        self.assertIn("'CDC Armazém', 'CDC Armazém', 5.0, 'Core', 'organization'", terraform_source)
        self.assertNotIn("SET icon = 'home' WHERE name = 'CDC Armazém'", terraform_source)

    def test_training_preview_is_last_has_icon_and_does_not_simulate_courses(self):
        api_source = API_PY.read_text()
        theme_source = THEME_JS.read_text()
        css_source = THEME_CSS.read_text()
        terraform_source = TERRAFORM_MAIN.read_text()
        self.assertIn('CDC_TRAINING_WORKSPACE = "CDC Treinamento"', api_source)
        self.assertIn('_ensure_cdc_workspace(CDC_TRAINING_WORKSPACE, "education", 11.0)', api_source)
        self.assertIn('(CDC_TRAINING_WORKSPACE, 11.0, "education")', api_source)
        self.assertIn("'CDC Treinamento', 'CDC Treinamento', 11.0, 'Core', 'education'", terraform_source)
        self.assertIn("SET icon = 'education' WHERE name = 'CDC Treinamento'", terraform_source)
        self.assertIn("{label: 'Treinamento', href: '/app/cdc-treinamento'}", theme_source)
        self.assertIn("function isTrainingPage()", theme_source)
        training_block = theme_source[
            theme_source.index("function removeTrainingPreview()"):
            theme_source.index("// --- SUÍTE DE INQUÉRITO", theme_source.index("function removeTrainingPreview()"))
        ]
        self.assertIn("claimCDCActiveDashboard('cdc-training-dashboard'", training_block)
        self.assertIn("Cenário A · Onboarding &amp; Capacitação Interna", training_block)
        self.assertIn("Em breve", training_block)
        self.assertIn("Nenhum curso ou resultado de capacitação está sendo simulado", training_block)
        self.assertNotIn("frappe.call", training_block)
        self.assertIn(".cdc-custom-training-active > :not(#cdc-training-dashboard)", css_source)
        self.assertIn(".cdc-training-status {", css_source)
        self.assertIn("color: #fdba74; background: rgba(249,115,22,.18);", css_source)
        self.assertIn("background: #fb923c; box-shadow: 0 0 0 5px rgba(251,146,60,.16);", css_source)

    def test_spa_dashboards_claim_only_the_active_page_container(self):
        theme_source = THEME_JS.read_text()
        self.assertIn("function claimActiveDashboard", theme_source)
        for asset in (PENDING_JS, TESTS_JS, MANAGEMENT_JS, STOCK_ROUTES_JS, ADMIN_JS):
            with self.subTest(asset=asset.name):
                self.assertIn("window._cdc_claim_active_dashboard", asset.read_text())
        for asset in (GROUPS_JS, ITEMS_JS, WAREHOUSE_JS):
            with self.subTest(delegated_asset=asset.name):
                self.assertIn("window._cdc_render_management_dashboard", asset.read_text())

    def test_integrations_exposes_real_read_only_analytics_provider(self):
        api_source = API_PY.read_text()
        theme_source = THEME_JS.read_text()
        css_source = THEME_CSS.read_text()
        tree = ast.parse(api_source)
        functions = {
            node.name: ast.get_source_segment(api_source, node)
            for node in tree.body if isinstance(node, ast.FunctionDef)
        }
        catalog = functions["get_cdc_analytics_catalog"]
        dataset = functions["get_cdc_analytics_dataset"]
        access = functions["_analytics_require_access"]
        cursor = functions["_analytics_decode_cursor"]

        for dataset_id in (
            "warehouses", "item-groups", "items", "stock-balances", "stock-movements",
        ):
            self.assertIn(f'"{dataset_id}"', api_source)
        self.assertIn("_require_stock_dashboard_access()", access)
        self.assertIn("_require_read_permission(doctype)", access)
        self.assertIn("_catalog_filter_context", catalog)
        self.assertIn("_catalog_filter_context", dataset)
        self.assertIn("frappe.get_list(", dataset)
        self.assertNotIn("frappe.get_all(", dataset)
        self.assertNotIn(".save(", dataset)
        self.assertNotIn(".insert(", dataset)
        self.assertNotIn("frappe.db.commit", dataset)
        self.assertIn("limit < 1 or limit > 200", functions["_analytics_page_limit"])
        self.assertIn("checkpoint > now_datetime()", cursor)
        self.assertIn('"write_operations": False', catalog)
        self.assertIn('"core_client": "pending"', catalog)

        integrations = theme_source[
            theme_source.index("function analyticsDatasetMarkup"):
            theme_source.index("// --- SUÍTE DE INQUÉRITO", theme_source.index("function analyticsDatasetMarkup"))
        ]
        self.assertIn("cdc_theme.api.get_cdc_analytics_catalog", integrations)
        self.assertIn("cdc_theme.api.get_cdc_analytics_dataset", integrations)
        self.assertIn("Metabase", integrations)
        self.assertIn("Cliente M2M pendente", integrations)
        self.assertIn("Leitura real concluída", integrations)
        self.assertNotIn("Power BI", integrations)
        self.assertNotIn("Google Data Studio", integrations)
        self.assertNotIn("Microsoft Fabric", integrations)
        self.assertNotIn("Databricks", integrations)
        self.assertIn("#cdc-analytics-provider", css_source)
        self.assertIn(".cdc-analytics-terminal", css_source)


if __name__ == "__main__":
    unittest.main()
