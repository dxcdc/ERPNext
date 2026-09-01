'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'apps', 'cdc_theme', 'cdc_theme', 'public', 'js', 'cdc_theme.js'),
    'utf8'
);

const helperStart = source.indexOf('function isCDCSystemManager()');
const helperEnd = source.indexOf('function getCDCBreadcrumbHTML', helperStart);
const start = source.indexOf('function isRestrictedStockWorkspaceUser()');
const end = source.indexOf('// SANITIZAÇÃO DINÂMICA DA SIDEBAR', start);
assert.ok(helperStart >= 0 && helperEnd > helperStart && start >= 0 && end > start, 'guardas do workspace restrito não encontrados');
const guardSource = source.slice(helperStart, helperEnd) + source.slice(start, end);

function accessContext(overrides = {}) {
    const keys = ['stock', 'users', 'groups', 'items', 'warehouses', 'reports', 'integrations', 'pending', 'monitoring', 'tests', 'admin', 'training'];
    const pages = {};
    keys.forEach(key => { pages[key] = {allowed: ['stock', 'users', 'groups', 'items', 'warehouses', 'reports', 'pending', 'training'].includes(key)}; });
    Object.entries(overrides).forEach(([key, allowed]) => { pages[key] = {allowed}; });
    return {
        pages,
        catalog: {pages: keys.map(key => ({key, route: `/app/cdc-${key === 'stock' ? 'estoque' : key}`, route_aliases: []}))}
    };
}

function evaluateGuard(roles, pathname, context = null) {
    const routes = [];
    const fakeWindow = {
        location: {pathname, replace(value) { routes.push(['replace', value]); }},
        frappe: null,
        _cdc_access_context: context
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

const restricted = evaluateGuard(['CDC Estoque Restrito', 'Stock User'], '/app/cdc-monitoramento', accessContext());
assert.equal(restricted.guard.isRestrictedStockWorkspaceUser(), true);
assert.equal(restricted.guard.enforceRestrictedStockWorkspaceRoute(), true);
assert.deepEqual(restricted.routes, [['replace', '/app/cdc-estoque']]);

const stock = evaluateGuard(['CDC Estoque Restrito'], '/app/cdc-estoque');
assert.equal(stock.guard.enforceRestrictedStockWorkspaceRoute(), false, 'rota de estoque deve permanecer acessível');

const reports = evaluateGuard(['CDC Estoque Restrito'], '/app/cdc-relatorios');
assert.equal(reports.guard.enforceRestrictedStockWorkspaceRoute(), false, 'rota de relatórios deve permanecer acessível');

for (const route of ['/app/cdc-usuarios', '/app/cdc-grupos', '/app/cdc-itens', '/app/cdc-armazem', '/app/cdc-pendencias', '/app/cdc-treinamento']) {
    const common = evaluateGuard(['Consulta', 'Operador'], route, accessContext());
    assert.equal(common.guard.enforceRestrictedStockWorkspaceRoute(), false, `${route} deve permanecer acessível`);
}

for (const route of ['/app/cdc-integracoes', '/app/cdc-monitoramento', '/app/cdc-testes', '/app/cdc-admin']) {
    const common = evaluateGuard(['Consulta', 'Operador'], route, accessContext());
    assert.equal(common.guard.enforceRestrictedStockWorkspaceRoute(), true, `${route} deve ser redirecionada`);
}

const manager = evaluateGuard(['CDC Estoque Restrito', 'System Manager'], '/app/cdc-monitoramento');
assert.equal(manager.guard.isRestrictedStockWorkspaceUser(), false, 'System Manager não deve ser restringido');
assert.equal(manager.guard.enforceRestrictedStockWorkspaceRoute(), false);

const stockManagerIntegration = evaluateGuard(['Stock Manager'], '/app/cdc-integracoes');
assert.equal(stockManagerIntegration.guard.enforceRestrictedStockWorkspaceRoute(), false, 'gestor operacional deve manter Integrações');
const stockManagerMonitoring = evaluateGuard(['Stock Manager'], '/app/cdc-monitoramento', accessContext({integrations: true}));
assert.equal(stockManagerMonitoring.guard.enforceRestrictedStockWorkspaceRoute(), true, 'Monitoramento permanece sistêmico');

const exceptionalIntegration = evaluateGuard(['Consulta'], '/app/cdc-integracoes', accessContext({integrations: true}));
assert.equal(exceptionalIntegration.guard.enforceRestrictedStockWorkspaceRoute(), false, 'exceção individual deve preservar a página especial');

const pendingContext = evaluateGuard(['Consulta'], '/app/cdc-monitoramento');
assert.equal(pendingContext.guard.enforceRestrictedStockWorkspaceRoute(), false, 'frontend deve aguardar o contexto efetivo sem negar uma possível exceção');

assert.match(source, /restrictedStockUser\s*\? \[\s*'cdc estoque', 'cdc usuarios', 'cdc grupos'/, 'sidebar comum deve manter as oito áreas operacionais');
assert.match(source, /isRestrictedStockWorkspaceUser\(\) \? \[\s*'cdc estoque', 'cdc usuarios'/, 'cache deve preservar somente as áreas operacionais comuns');

console.log('CDC restricted stock workspace test: OK');
