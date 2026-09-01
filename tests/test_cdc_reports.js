const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const reports = fs.readFileSync(path.join(root, 'apps', 'cdc_theme', 'cdc_theme', 'public', 'js', 'cdc_reports.js'), 'utf8');
const theme = fs.readFileSync(path.join(root, 'apps', 'cdc_theme', 'cdc_theme', 'public', 'js', 'cdc_theme.js'), 'utf8');

assert(reports.includes("cdc_theme.reports.get_stock_movement_report_options"));
assert(reports.includes("cdc_theme.reports.preview_stock_movement_report"));
assert(reports.includes("cdc_theme.reports.download_stock_movement_report"));
assert(reports.includes("Um ou mais armazéns"));
assert(reports.includes("PDF gerencial"));
assert(reports.includes("XLSX detalhado"));
assert(reports.includes("CSV detalhado"));
assert(reports.includes("Somente lançamentos confirmados são considerados"));
assert(reports.includes("if (optionsLoading)"));
assert(reports.includes("optionsRequestSerial"));
assert(reports.includes("OPTIONS_TIMEOUT_MS = 15000"));
assert(reports.includes("data-cdc-reports-retry"));
assert(reports.includes("Seu perfil não possui acesso aos relatórios de estoque"));
assert(theme.includes("Exportar movimentações"));
assert(theme.includes("frappe.set_route('Workspaces', 'CDC Relatórios')"));
assert(theme.includes("['cdc estoque', 'cdc relatorios']"));
assert(theme.includes("function canUseStockReports()"));
assert(theme.includes("'CDC Estoque Restrito', 'Stock User'"));
assert(theme.includes("isReportsWorkspace && !canUseStockReports()"));
assert(theme.includes("requiredTokens = requiredTokens.filter"));

console.log('CDC reports workspace test: OK');
