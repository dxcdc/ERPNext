'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const themeSource = fs.readFileSync(
    path.join(__dirname, '..', 'apps', 'cdc_theme', 'cdc_theme', 'public', 'js', 'cdc_theme.js'),
    'utf8'
);
const testsSource = fs.readFileSync(
    path.join(__dirname, '..', 'apps', 'cdc_theme', 'cdc_theme', 'public', 'js', 'cdc_tests.js'),
    'utf8'
);

// Reproduz a causa do incidente: o helper existia apenas como propriedade de
// window, enquanto Estoque/Usuários tentavam acessá-lo como identificador global.
const legacyWindow = {_cdc_claim_active_dashboard() { return {body: {}, dashboard: {}}; }};
const legacyMount = new Function('window', `'use strict'; return claimActiveDashboard('cdc-stock-exec-dashboard', 'div');`);
assert.throws(
    () => legacyMount(legacyWindow),
    error => error && error.name === 'ReferenceError',
    'a chamada legada deve reproduzir a interrupção que deixava o painel branco'
);

const wrapperStart = themeSource.indexOf('function claimCDCActiveDashboard(');
const wrapperEnd = themeSource.indexOf('\n\n    function getPilotProjectContext', wrapperStart);
assert.ok(wrapperStart >= 0 && wrapperEnd > wrapperStart, 'wrapper seguro de montagem não encontrado');
const wrapperSource = themeSource.slice(wrapperStart, wrapperEnd);

let mountedId = '';
const fixedWindow = {
    _cdc_claim_active_dashboard(id, tagName) {
        mountedId = `${id}:${tagName}`;
        return {body: {isConnected: true}, dashboard: {id}};
    }
};
const fixedMount = new Function('window', `${wrapperSource}; return claimCDCActiveDashboard;`)(fixedWindow);
assert.equal(fixedMount('cdc-stock-exec-dashboard', 'div').dashboard.id, 'cdc-stock-exec-dashboard');
assert.equal(mountedId, 'cdc-stock-exec-dashboard:div');
assert.equal(
    new Function('window', `${wrapperSource}; return claimCDCActiveDashboard('cdc-users-dashboard', 'section');`)({}),
    null,
    'a troca SPA deve aguardar o helper sem lançar uma exceção'
);

const mainThemeSource = themeSource.split('CDC MONITORING WORKSPACE DASHBOARD INITIALIZER', 1)[0];
assert.doesNotMatch(
    mainThemeSource,
    /(^|[^A-Za-z0-9_])claimActiveDashboard\(/m,
    'componentes do tema não podem voltar a chamar o helper privado diretamente'
);
assert.match(mainThemeSource, /claimCDCActiveDashboard\('cdc-stock-exec-dashboard', 'div'\)/);
assert.match(mainThemeSource, /claimCDCActiveDashboard\('cdc-users-dashboard', 'section'\)/);
assert.match(mainThemeSource, /Carregando o painel de estoque/);
assert.match(mainThemeSource, /renderStockDashboardFailure/);
assert.match(mainThemeSource, /data-cdc-dashboard-retry="stock"/);
assert.match(mainThemeSource, /data-cdc-dashboard-retry="users"/);
assert.match(mainThemeSource, /window\._cdc_repair_theme_runtime/);

assert.match(testsSource, /function getTestsDashboardClaim\(\)/);
assert.match(testsSource, /function repairBrowserThemeState\(\)/);
assert.match(testsSource, /cdc_theme\.api\.get_stock_dashboard_data/);
assert.match(testsSource, /cdc_theme\.api\.get_users_dashboard_data/);
assert.match(testsSource, /window\.location\.reload\(\)/);
assert.match(testsSource, /Revalidando tema/);

console.log('Theme blank-page reproduction and recovery test: OK');
