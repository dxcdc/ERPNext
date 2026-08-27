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

// Reproduz a causa confirmada no Chrome autenticado: o Estoque chamava
// escapeHTML, mas o helper existia apenas no segundo IIFE (Monitoramento).
const legacyEscapeCall = new Function(`'use strict'; return escapeHTML('Armazém');`);
assert.throws(
    legacyEscapeCall,
    error => error && error.name === 'ReferenceError',
    'a ausência do helper no módulo do Estoque deve reproduzir o spinner permanente'
);
assert.match(
    mainThemeSource,
    /function escapeHTML\(value\)/,
    'escapeHTML precisa estar no mesmo módulo fechado que renderiza o Estoque'
);
assert.doesNotMatch(
    mainThemeSource,
    /(^|[^A-Za-z0-9_])claimActiveDashboard\(/m,
    'componentes do tema não podem voltar a chamar o helper privado diretamente'
);
assert.match(mainThemeSource, /claimCDCActiveDashboard\('cdc-stock-exec-dashboard', 'div'\)/);
assert.match(mainThemeSource, /claimCDCActiveDashboard\('cdc-users-dashboard', 'section'\)/);
assert.match(mainThemeSource, /Carregando o painel de estoque/);
assert.match(mainThemeSource, /renderStockDashboardFailure/);
assert.match(mainThemeSource, /stockRequestTimer/);
assert.match(mainThemeSource, /Tempo limite ao aguardar a resposta do painel de estoque/);
assert.match(mainThemeSource, /function cancelStockDashboardRequest\(\)/);
assert.match(mainThemeSource, /function getStockDashboardRenderKey\(pilotProject\)/);
assert.match(mainThemeSource, /stockActiveRequestKey === renderKey/);
assert.match(mainThemeSource, /dashDiv\.dataset\.loaded === '1'/);
assert.match(mainThemeSource, /dashDiv\.dataset\.state = 'ready'/);
assert.doesNotMatch(mainThemeSource, /Date\.now\(\) - lastFetchTime > 6000/);
assert.match(mainThemeSource, /stockRenderStage = 'montagem do conteúdo no navegador'/);
assert.match(mainThemeSource, /Falha ao montar o painel na etapa:/);
assert.match(mainThemeSource, /data-cdc-dashboard-retry="stock"/);
assert.match(mainThemeSource, /data-cdc-dashboard-retry="users"/);
assert.match(mainThemeSource, /window\._cdc_repair_theme_runtime/);

assert.match(testsSource, /function getTestsDashboardClaim\(\)/);
assert.match(testsSource, /function repairBrowserThemeState\(\)/);
assert.match(testsSource, /cdc_theme\.api\.get_stock_dashboard_data/);
assert.match(testsSource, /cdc_theme\.api\.get_users_dashboard_data/);
assert.match(testsSource, /window\.location\.reload\(\)/);
assert.match(testsSource, /Revalidando tema/);

// Reproduz o segundo incidente: a chamada permanece em carregamento e nunca
// conclui. O watchdog real deve transformar o spinner infinito em falha visível.
const watchdogStart = mainThemeSource.indexOf('function startStockLoadingWatchdog(');
const watchdogEnd = mainThemeSource.indexOf('\n\n    function renderStockDashboard()', watchdogStart);
assert.ok(watchdogStart >= 0 && watchdogEnd > watchdogStart, 'watchdog do Estoque não encontrado');
const watchdogSource = mainThemeSource.slice(watchdogStart, watchdogEnd);
let pendingTimeout = null;
const watchdogWindow = {
    clearTimeout() {},
    setTimeout(callback, delay) {
        assert.equal(delay, 12000);
        pendingTimeout = callback;
        return 1;
    }
};
const watchdog = new Function('window', `
    var stockRequestTimer = null;
    var stockRequestSerial = 3;
    var isDashboardLoading = true;
    var failureMessage = '';
    function renderStockDashboardFailure(message) { failureMessage = message; isDashboardLoading = false; }
    ${watchdogSource}
    return {start: startStockLoadingWatchdog, failure: function() { return failureMessage; }};
`)(watchdogWindow);
watchdog.start(3);
assert.equal(typeof pendingTimeout, 'function');
pendingTimeout();
assert.equal(watchdog.failure(), 'Tempo limite ao aguardar a resposta do painel de estoque.');

// Reproduz a corrida da terceira ocorrência: uma resposta antiga chegava após
// uma nova solicitação e cancelava o watchdog novo antes de conferir o serial.
const stockRenderStart = mainThemeSource.indexOf('function renderStockDashboard()');
const stockRenderEnd = mainThemeSource.indexOf('// --- EVENT DELEGATION GLOBAL ---', stockRenderStart);
const stockRenderSource = mainThemeSource.slice(stockRenderStart, stockRenderEnd);
const stockCallbackStart = stockRenderSource.indexOf('callback: function(r)');
const stockErrorStart = stockRenderSource.indexOf('error: function(err)', stockCallbackStart);
const stockCallbackSource = stockRenderSource.slice(stockCallbackStart, stockErrorStart);
const stockErrorSource = stockRenderSource.slice(stockErrorStart);
assert.ok(
    stockCallbackSource.indexOf('requestSerial !== stockRequestSerial') < stockCallbackSource.indexOf('window.clearTimeout(stockRequestTimer)'),
    'uma resposta antiga deve ser ignorada antes de tocar no watchdog da solicitação atual'
);
assert.ok(
    stockErrorSource.indexOf('requestSerial !== stockRequestSerial') < stockErrorSource.indexOf('window.clearTimeout(stockRequestTimer)'),
    'um erro antigo deve ser ignorado antes de tocar no watchdog da solicitação atual'
);
const popstateStart = mainThemeSource.indexOf("window.addEventListener('popstate'");
const popstateEnd = mainThemeSource.indexOf("$(document).on('page-change', scheduleThemeRender)", popstateStart);
assert.doesNotMatch(
    mainThemeSource.slice(popstateStart, popstateEnd),
    /isDashboardLoading\s*=\s*false/,
    'popstate não pode liberar uma segunda consulta enquanto a atual ainda está protegida'
);

console.log('Theme blank-page reproduction and recovery test: OK');
