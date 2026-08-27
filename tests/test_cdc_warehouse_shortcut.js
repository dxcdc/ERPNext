'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'apps', 'cdc_theme', 'cdc_theme', 'public', 'js', 'cdc_warehouse.js'),
    'utf8'
);
const managementSource = fs.readFileSync(
    path.join(__dirname, '..', 'apps', 'cdc_theme', 'cdc_theme', 'public', 'js', 'cdc_management.js'),
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
assert.equal(detects([], '/app/cdc-armazémo'), true, 'alias histórico com grafia divergente deve abrir o painel canônico');
assert.equal(detects(['Workspaces', 'CDC Armazém'], '/app'), true, 'rota SPA deve abrir o atalho');
assert.equal(detects(['List', 'Warehouse', 'List'], '/app/warehouse'), false, 'lista oficial não pode receber o painel do atalho');
assert.match(source, /_cdc_render_management_dashboard/, 'rota deve delegar ao painel gerencial compartilhado');
assert.match(managementSource, /_cdc_claim_active_dashboard/, 'painel deve usar somente o contêiner SPA ativo');
assert.match(managementSource, /get_catalog_management_dashboard_data/, 'painel deve consultar o endpoint gerencial real');
assert.match(managementSource, /frappe\.set_route\('List', 'Warehouse', 'List'/, 'botão deve abrir a lista oficial no contexto ativo');
assert.doesNotMatch(source + managementSource, /frappe\.db/, 'navegador não pode consultar o banco diretamente');

console.log('CDC Warehouse shortcut route and safety test: OK');
