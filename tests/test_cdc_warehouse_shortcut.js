'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'apps', 'cdc_theme', 'cdc_theme', 'public', 'js', 'cdc_warehouse.js'),
    'utf8'
);
const normalizeStart = source.indexOf('function normalize(');
const routeStart = source.indexOf('function isWarehouseShortcutRoute()');
const routeEnd = source.indexOf('function removeDashboard()', routeStart);
assert.ok(normalizeStart >= 0 && routeStart > normalizeStart && routeEnd > routeStart, 'detector do atalho CDC Armazém não encontrado');

const normalizeEnd = source.indexOf('\n    }', normalizeStart) + '\n    }'.length;
const detectorSource = `${source.slice(normalizeStart, normalizeEnd)}\n${source.slice(routeStart, routeEnd)}`;
function detects(route, pathname) {
    const fakeWindow = {
        location: {pathname},
        frappe: {get_route() { return route; }}
    };
    return new Function(
        'window', 'frappe',
        `${detectorSource}; return isWarehouseShortcutRoute();`
    )(fakeWindow, fakeWindow.frappe);
}

assert.equal(detects([], '/app/cdc-armazem'), true, 'rota sem acento deve abrir o atalho');
assert.equal(detects([], '/app/cdc-armazém'), true, 'rota canônica acentuada deve abrir o atalho');
assert.equal(detects(['Workspaces', 'CDC Armazém'], '/app'), true, 'rota SPA deve abrir o atalho');
assert.equal(detects(['List', 'Warehouse', 'List'], '/app/warehouse'), false, 'lista oficial não pode receber o painel do atalho');
assert.match(source, /_cdc_claim_active_dashboard\('cdc-warehouse-shortcut-dashboard'/, 'painel deve usar somente o contêiner SPA ativo');
assert.match(source, /frappe\.set_route\('List', 'Warehouse', 'List', \{disabled: 0, company: 'CDC'\}\)/, 'botão deve abrir a lista oficial no contexto CDC ativo');
assert.doesNotMatch(source, /frappe\.call|frappe\.db/, 'atalho não pode copiar ou consultar dados');

console.log('CDC Warehouse shortcut route and safety test: OK');
