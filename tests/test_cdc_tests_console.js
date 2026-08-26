'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'apps', 'cdc_theme', 'cdc_theme', 'public', 'js', 'cdc_tests.js'),
    'utf8'
);

const handlers = new Map();
function jquery() {
    return {
        on(event, selector, handler) {
            handlers.set(`${event}:${selector}`, handler);
            return this;
        },
        ready(handler) {
            handlers.set('ready', handler);
            return this;
        }
    };
}

const terminalOutput = {textContent: '', scrollTop: 0, scrollHeight: 100};
const terminalStatus = {textContent: ''};
const terminal = {
    classList: {toggle() {}},
    querySelector(selector) {
        if (selector === '[data-cdc-test-terminal-output]') return terminalOutput;
        if (selector === '[data-cdc-terminal-status]') return terminalStatus;
        return null;
    }
};
const executionButton = {disabled: false, textContent: 'Executar testes novamente'};
const expandedGateDetails = {open: false};
const dashboard = {
    dataset: {},
    innerHTML: '',
    querySelector(selector) {
        if (selector.indexOf('[data-quality-gate=') === 0) {
            return {querySelector(innerSelector) { return innerSelector === 'details' ? expandedGateDetails : null; }};
        }
        return null;
    }
};

const fakeDocument = {
    createElement() {
        let value = '';
        return {
            set textContent(text) { value = String(text); },
            get innerHTML() { return value; }
        };
    },
    getElementById(id) {
        return id === 'cdc-tests-dashboard' ? dashboard : null;
    },
    querySelector(selector) {
        return selector === '.cdc-test-terminal' ? terminal : null;
    },
    querySelectorAll(selector) {
        return selector === '[data-cdc-tests-refresh]' ? [executionButton] : [];
    }
};

const calls = [];
let browserRepairCalls = 0;
let reloadCalls = 0;
const fakeFrappe = {
    get_route() { return ['cdc-testes']; },
    call(options) {
        calls.push(options.method);
        if (options.method === 'cdc_theme.api.get_cdc_tests_dashboard') {
            options.callback({message: {
                checked_at: 'agora',
                summary: {total: 2, passed: 1, warnings: 1, blocked: 0},
                checks: [
                    {id: 'item-group-route', title: 'Rotas', summary: 'Rotas corretas.', details: ['Um', 'Dois', 'Três'], evidence: 'Rotas válidas', status: 'passed'},
                    {id: 'theme-integrity', title: 'Tema', summary: 'Tema íntegro.', details: ['Um', 'Dois', 'Três'], evidence: 'Validação externa pendente', status: 'warning'}
                ]
            }});
            return;
        }
        if (options.method === 'cdc_theme.api.get_cdc_admin_diagnostics') {
            options.callback({message: {
                summary: {total: 2, ok: 2, errors: 0},
                checks: [
                    {label: 'Banco', detail: 'Conectado', status: 'ok'},
                    {label: 'Assets', detail: 'Publicados', status: 'ok'}
                ]
            }});
            return;
        }
        if (options.method === 'cdc_theme.api.get_stock_dashboard_data') {
            options.callback({message: {total_items: 41, total_warehouses: 6}});
            return;
        }
        if (options.method === 'cdc_theme.api.get_users_dashboard_data') {
            options.callback({message: {summary: {total: 12}}});
            return;
        }
        if (options.method === 'cdc_theme.api.run_cdc_quality_gate') {
            options.callback({message: {
                checked_at: 'agora mesmo',
                check: {
                    id: options.args.gate_id,
                    title: 'Rotas',
                    summary: 'Rotas corretas.',
                    details: ['Explicação 1', 'Explicação 2', 'Resultado atual'],
                    evidence: 'Rotas válidas novamente',
                    status: 'passed'
                }
            }});
            return;
        }
        if (options.method === 'cdc_theme.api.run_cdc_admin_action') {
            options.callback({message: {
                ok: true,
                message: 'Tema reparado.',
                diagnostics: {summary: {total: 7, ok: 7, errors: 0}}
            }});
        }
    },
    show_alert() {},
    msgprint() {},
    confirm(message, callback) { callback(); },
    router: {on() {}},
    user_roles: ['System Manager']
};
const fakeWindow = {
    frappe: fakeFrappe,
    location: {pathname: '/app/cdc-testes', reload() { reloadCalls += 1; }},
    setTimeout(callback) { callback(); },
    _cdc_get_breadcrumb_html() { return ''; },
    _cdc_repair_theme_runtime() {
        browserRepairCalls += 1;
        return Promise.resolve([]);
    }
};

new Function('window', 'document', 'frappe', '$', '__', 'sessionStorage', source)(
    fakeWindow,
    fakeDocument,
    fakeFrappe,
    jquery,
    value => value,
    {removeItem() {}}
);

(async function() {
    const click = handlers.get('click:[data-cdc-tests-refresh]');
    assert.equal(typeof click, 'function', 'o clique do botão Executar testes deve estar registrado');
    click.call(executionButton);

    assert.deepEqual(calls, [
        'cdc_theme.api.get_cdc_tests_dashboard',
        'cdc_theme.api.get_cdc_admin_diagnostics',
        'cdc_theme.api.get_stock_dashboard_data',
        'cdc_theme.api.get_users_dashboard_data'
    ], 'o botão deve consultar gates, diagnósticos e as duas APIs das páginas afetadas');
    assert.match(terminalOutput.textContent, /\[START\].*Execução autenticada iniciada/s);
    assert.match(terminalOutput.textContent, /\[PASS\] Rotas — Rotas válidas/);
    assert.match(terminalOutput.textContent, /\[WARN\] Tema — Validação externa pendente/);
    assert.match(terminalOutput.textContent, /\[PASS\] Banco — Conectado/);
    assert.match(terminalOutput.textContent, /\[PASS\] CDC Estoque — API respondeu com 41 itens e 6 armazéns/);
    assert.match(terminalOutput.textContent, /\[PASS\] CDC Usuários — API respondeu com 12 usuários/);
    assert.match(terminalOutput.textContent, /\[DONE\] Execução finalizada/);
    assert.equal(executionButton.disabled, false, 'o botão deve ser reativado ao final');
    assert.equal(executionButton.textContent, 'Executar testes novamente');
    assert.equal(terminalStatus.textContent, 'PRONTO');

    const runGate = handlers.get('click:[data-cdc-run-gate]');
    const gateButton = {
        disabled: false,
        textContent: 'Executar este teste',
        getAttribute(name) { return name === 'data-cdc-run-gate' ? 'item-group-route' : null; }
    };
    assert.equal(typeof runGate, 'function', 'a execução individual deve estar registrada');
    runGate.call(gateButton);
    assert.equal(calls.at(-1), 'cdc_theme.api.run_cdc_quality_gate');
    assert.match(terminalOutput.textContent, /Rotas — Rotas válidas novamente/);
    assert.equal(expandedGateDetails.open, true, 'a explicação deve abrir após executar o item');

    const repair = handlers.get('click:[data-cdc-tests-action]');
    const repairButton = {
        disabled: false,
        textContent: 'Reparar tema e caches',
        getAttribute(name) { return name === 'data-cdc-tests-action' ? 'repair_theme' : null; }
    };
    assert.equal(typeof repair, 'function', 'o reparo do tema deve estar registrado');
    repair.call(repairButton);
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(calls.at(-1), 'cdc_theme.api.run_cdc_admin_action');
    assert.equal(browserRepairCalls, 1, 'o reparo deve limpar e revalidar o estado do navegador');
    assert.equal(reloadCalls, 1, 'o Desk deve ser recarregado depois do reparo');
    assert.match(terminalOutput.textContent, /Pós-reparo no servidor: 7\/7 diagnósticos saudáveis/);
    assert.match(terminalOutput.textContent, /Reparo concluído/);

    console.log('CDC tests console interaction test: OK');
})().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
