'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'apps', 'cdc_theme', 'cdc_theme', 'public', 'js', 'cdc_theme.js'),
    'utf8'
);
const moduleStart = source.indexOf('CDC MONITORING WORKSPACE DASHBOARD INITIALIZER');
const routeStart = source.indexOf('function isWarehouseListRoute()', moduleStart);
const routeEnd = source.indexOf('function removeWarehouseDashboard()', routeStart);
assert.ok(moduleStart >= 0 && routeStart >= 0 && routeEnd > routeStart, 'detector da lista de Armazéns não encontrado');

const normalizeStart = source.lastIndexOf('function normalizeRoute(', routeStart);
const normalizeEnd = source.indexOf('\n    }', normalizeStart) + '\n    }'.length;
assert.ok(normalizeStart >= moduleStart && normalizeEnd > normalizeStart, 'normalizador da rota não encontrado');

const detectorSource = `${source.slice(normalizeStart, normalizeEnd)}\n${source.slice(routeStart, routeEnd)}`;
function detects(route, pathname) {
    const fakeWindow = {
        location: {pathname},
        frappe: {get_route() { return route; }}
    };
    const detector = new Function(
        'window',
        'frappe',
        `${detectorSource}; return isWarehouseListRoute();`
    );
    return detector(fakeWindow, fakeWindow.frappe);
}

assert.equal(detects(['List', 'Warehouse', 'List'], '/app/warehouse'), true, 'rota Frappe de Armazéns deve ser reconhecida');
assert.equal(detects([], '/app/warehouse/view/list'), true, 'URL canônica da lista deve ser reconhecida');
assert.equal(detects(['List', 'Item', 'List'], '/app/item'), false, 'lista de Itens não pode receber o painel de Armazéns');
assert.equal(detects([], '/app/item-group'), false, 'rota não relacionada não pode receber o painel');

const warehouseBlock = source.slice(routeStart, source.indexOf('function init()', routeStart));
assert.match(warehouseBlock, /get_warehouse_list_dashboard_data/, 'painel deve consultar o endpoint real');
assert.match(warehouseBlock, /body\.insertBefore\(dashboard, listBody\)/, 'painel deve ficar acima da lista nativa');
assert.match(warehouseBlock, /warehouseActiveRequestKey === contextKey/, 'requisições SPA duplicadas devem ser bloqueadas');
assert.match(warehouseBlock, /requestSerial !== warehouseRequestSerial/, 'respostas antigas devem ser descartadas');
assert.match(warehouseBlock, /filters\.push\(\[this\.doctype, 'name', 'in', names\]\)/, 'projeto deve limitar a consulta nativa');
assert.doesNotMatch(warehouseBlock, /document\.body/, 'painel não pode ser montado no body global');

for (const controlId of [
    'cdc-warehouse-search',
    'cdc-warehouse-project',
    'cdc-warehouse-company',
    'cdc-warehouse-status',
    'cdc-warehouse-kind',
    'cdc-warehouse-parent'
]) {
    assert.ok(warehouseBlock.includes(controlId), `controle ausente: ${controlId}`);
}

console.log('Warehouse list dashboard route and safety test: OK');
