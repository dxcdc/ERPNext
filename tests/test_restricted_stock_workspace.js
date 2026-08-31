'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'apps', 'cdc_theme', 'cdc_theme', 'public', 'js', 'cdc_theme.js'),
    'utf8'
);

const start = source.indexOf('function isRestrictedStockWorkspaceUser()');
const end = source.indexOf('// SANITIZAÇÃO DINÂMICA DA SIDEBAR', start);
assert.ok(start >= 0 && end > start, 'guardas do workspace restrito não encontrados');
const guardSource = source.slice(start, end);

function evaluateGuard(roles, pathname) {
    const routes = [];
    const fakeWindow = {
        location: {pathname, replace(value) { routes.push(['replace', value]); }},
        frappe: null
    };
    const frappe = {
        user_roles: roles,
        set_route(...args) { routes.push(args); }
    };
    fakeWindow.frappe = frappe;
    const guard = new Function(
        'window', 'frappe',
        `${guardSource}; return {isRestrictedStockWorkspaceUser, enforceRestrictedStockWorkspaceRoute};`
    )(fakeWindow, frappe);
    return {guard, routes};
}

const restricted = evaluateGuard(['CDC Estoque Restrito', 'Stock User'], '/app/cdc-monitoramento');
assert.equal(restricted.guard.isRestrictedStockWorkspaceUser(), true);
assert.equal(restricted.guard.enforceRestrictedStockWorkspaceRoute(), true);
assert.deepEqual(restricted.routes, [['Workspaces', 'CDC Estoque']]);

const stock = evaluateGuard(['CDC Estoque Restrito'], '/app/cdc-estoque');
assert.equal(stock.guard.enforceRestrictedStockWorkspaceRoute(), false, 'rota de estoque deve permanecer acessível');

const reports = evaluateGuard(['CDC Estoque Restrito'], '/app/cdc-relatorios');
assert.equal(reports.guard.enforceRestrictedStockWorkspaceRoute(), false, 'rota de relatórios deve permanecer acessível');

const manager = evaluateGuard(['CDC Estoque Restrito', 'System Manager'], '/app/cdc-monitoramento');
assert.equal(manager.guard.isRestrictedStockWorkspaceUser(), false, 'System Manager não deve ser restringido');
assert.equal(manager.guard.enforceRestrictedStockWorkspaceRoute(), false);

assert.match(source, /restrictedStockUser\s*\? \['cdc estoque', 'cdc relatorios'\]/, 'sidebar restrita deve manter estoque e relatórios');
assert.match(source, /isRestrictedStockWorkspaceUser\(\) \? \['cdc estoque', 'cdc relatorios'\]/, 'cache não deve restaurar workspaces proibidos');

console.log('CDC restricted stock workspace test: OK');
