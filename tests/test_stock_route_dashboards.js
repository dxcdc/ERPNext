'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'apps', 'cdc_theme', 'cdc_theme', 'public', 'js', 'cdc_stock_routes.js'),
    'utf8'
);

const definitionsStart = source.indexOf('var ROUTES =');
const detectorEnd = source.indexOf('function removeDashboard()');
assert.ok(definitionsStart >= 0 && detectorEnd > definitionsStart, 'detector contextual das quatro rotas não encontrado');
const detectorSource = source.slice(definitionsStart, detectorEnd);

function detect(route, pathname, search = '') {
    const fakeWindow = {
        location: {pathname, search},
        frappe: {get_route() { return route; }}
    };
    return new Function(
        'window', 'frappe', 'document',
        `${detectorSource}; const result = routeDefinition(); return result && result.key;`
    )(fakeWindow, fakeWindow.frappe, {});
}

assert.equal(
    detect(['List', 'Stock Entry', 'Report', 'Lancamento no Estoque - CDC'], '/app'),
    'stock-entry-report',
    'Report Builder de lançamentos deve ser detectado pela rota SPA'
);
assert.equal(
    detect([], '/app/stock-entry/view/report/Lancamento no Estoque - CDC'),
    'stock-entry-report',
    'URL direta de lançamentos deve ser detectada'
);
assert.equal(
    detect(['List', 'Stock Reconciliation', 'List'], '/app/stock-reconciliation'),
    'stock-reconciliation',
    'lista de conciliações deve ser detectada'
);
assert.equal(
    detect(['query-report', 'Livro de Inventarios - CDC'], '/app'),
    'inventory-ledger',
    'Livro de Inventários deve ser detectado'
);
assert.equal(
    detect([], '/app/query-report/Balanço de Estoque - CDC'),
    'stock-balance',
    'Balanço de Estoque deve aceitar URL acentuada'
);
assert.equal(detect(['List', 'Stock Entry', 'List'], '/app/stock-entry'), null, 'lista comum de Stock Entry não pode receber o painel');
assert.equal(detect(['Form', 'Stock Reconciliation', 'MAT-RECO-1'], '/app/stock-reconciliation/MAT-RECO-1'), null, 'formulário individual não pode receber o painel');
assert.equal(detect(['query-report', 'Stock Balance'], '/app/query-report/Stock Balance'), null, 'relatório padrão não relacionado não pode ser alterado');

assert.match(source, /_cdc_claim_active_dashboard\('cdc-stock-route-dashboard'/, 'painel deve usar apenas o contêiner SPA ativo');
assert.match(source, /get_stock_document_dashboard_data/, 'cards documentais devem vir do endpoint real');
assert.match(source, /get_stock_report_filter_options/, 'opções dos relatórios devem respeitar o backend');
assert.match(source, /frappe\.set_route\('List', 'Stock Entry', 'Report'/, 'filtros de lançamentos devem atualizar o relatório nativo');
assert.match(source, /frappe\.set_route\('List', 'Stock Reconciliation', 'List'/, 'filtros de conciliação devem atualizar a lista nativa');
assert.match(source, /setNativeReportFilter\(report, 'warehouse'/, 'armazém deve atualizar o filtro oficial do Query Report');
assert.match(source, /setNativeReportFilter\(report, 'item_code'/, 'pesquisa deve atualizar o item oficial do Query Report');
assert.match(source, /setNativeReportFilter\(report, 'warehouse', options\.warehouses\)/, 'relatório sem armazém deve receber todo o escopo permitido');
assert.match(source, /Todos os armazéns permitidos/, 'filtro deve explicar o escopo RBAC aplicado');
assert.match(source, /!Array\.isArray\(queryReport\.filters\) \|\| !queryReport\.filters\.length/, 'painel deve aguardar os filtros nativos antes de executar');
assert.match(source, /typeof report\.refresh === 'function' \? report\.refresh\(\)/, 'relatório deve ser reexecutado após filtros');
assert.match(source, /serial !== requestSerial/, 'respostas antigas de navegação SPA devem ser descartadas');
assert.doesNotMatch(source, /frappe\.db/, 'o navegador não pode consultar o banco diretamente');

for (const control of [
    'data-cdc-stock-search', 'data-cdc-stock-company', 'data-cdc-stock-from',
    'data-cdc-stock-to', 'data-cdc-stock-status', 'data-cdc-stock-movement',
    'data-cdc-report-item', 'data-cdc-report-warehouse', 'data-cdc-report-group'
]) {
    assert.ok(source.includes(control), `controle contextual ausente: ${control}`);
}

console.log('CDC stock routes dashboard detection and safety test: OK');
