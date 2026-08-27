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

const valueStart = source.indexOf('function getWarehouseRouteValue(', routeEnd);
const valueEnd = source.indexOf('function getWarehouseListContext()', valueStart);
assert.ok(valueStart > routeEnd && valueEnd > valueStart, 'leitor seguro dos filtros não encontrado');
const valueSource = source.slice(valueStart, valueEnd);
function routeValue(fieldname, options, search = '') {
    const fakeWindow = {
        location: {search},
        frappe: {get_route_options() { return options; }}
    };
    const readValue = new Function(
        'window',
        'frappe',
        `${source.slice(normalizeStart, normalizeEnd)}\n${valueSource}; return getWarehouseRouteValue(${JSON.stringify(fieldname)});`
    );
    return readValue(fakeWindow, fakeWindow.frappe);
}
assert.equal(routeValue('name', {name: ['in', ['A - C', 'B - C']]}), '', 'filtro interno de escopo não pode alimentar a pesquisa');
assert.equal(routeValue('name', {name: ['like', '%Central%']}), '%Central%', 'pesquisa nativa deve ser preservada');
assert.equal(routeValue('company', {company: 'CDC'}), 'CDC', 'empresa da rota deve ser preservada');
assert.equal(routeValue('disabled', {}, '?disabled=0'), '0', 'query string deve prevalecer sobre estado interno');
assert.equal(routeValue('name', {}, '?name=%5B%22in%22%2C%5B%22A%20-%20C%22%5D%5D'), '', 'escopo serializado na URL deve ser ignorado pela pesquisa');
assert.equal(routeValue('name', {}, '?name=%5B%22like%22%2C%22%25Central%25%22%5D'), '%Central%', 'pesquisa serializada na URL deve ser restaurada');

const warehouseBlock = source.slice(routeStart, source.indexOf('function init()', routeStart));
assert.match(warehouseBlock, /get_warehouse_list_dashboard_data/, 'painel deve consultar o endpoint real');
assert.match(warehouseBlock, /body\.insertBefore\(dashboard, listBody\)/, 'painel deve ficar acima da lista nativa');
assert.match(warehouseBlock, /warehouseActiveRequestKey === contextKey/, 'requisições SPA duplicadas devem ser bloqueadas');
assert.match(source, /function scheduleWarehouseRender\(delay\)/, 'mudanças transitórias da rota devem ser consolidadas');
assert.match(source, /clearTimeout\(warehouseRenderTimer\)/, 'agendamento anterior deve ser cancelado');
assert.match(warehouseBlock, /warehousePendingContextUntil = Date\.now\(\) \+ 1200/, 'contexto escolhido deve sobreviver à transição do roteador');
assert.match(warehouseBlock, /return Object\.assign\(\{\}, warehousePendingContext\)/, 'consulta deve usar o contexto pendente estável');
assert.match(warehouseBlock, /requestSerial !== warehouseRequestSerial/, 'respostas antigas devem ser descartadas');
assert.match(warehouseBlock, /filters\.push\(\[this\.doctype, 'name', 'in', names\]\)/, 'projeto deve limitar a consulta nativa');
assert.doesNotMatch(warehouseBlock, /document\.body/, 'painel não pode ser montado no body global');
assert.match(warehouseBlock, /fieldname === 'name' && operator === 'in'/, 'escopo interno não pode virar texto de pesquisa');
assert.match(warehouseBlock, /filters\.search \? escapeHTML\(filters\.search\) : ''/, 'pesquisa vazia não pode receber marcador visual');
assert.match(warehouseBlock, /list\.\$result && typeof list\.refresh === 'function'/, 'lista só pode atualizar depois de pronta');
const routerBlock = source.slice(source.indexOf("frappe.router.on('change'", routeStart));
assert.doesNotMatch(routerBlock, /warehouseDashboard\.dataset\.loaded = '0'/, 'evento da rota não pode invalidar um contexto idêntico');

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
