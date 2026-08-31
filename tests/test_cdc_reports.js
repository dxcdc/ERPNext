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
assert(theme.includes("Exportar movimentações"));
assert(theme.includes("frappe.set_route('Workspaces', 'CDC Relatórios')"));
assert(theme.includes("['cdc estoque', 'cdc relatorios']"));

console.log('CDC reports workspace test: OK');

