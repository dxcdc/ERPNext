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
const dashboard = {dataset: {}, innerHTML: ''};

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
const fakeFrappe = {
    get_route() { return ['cdc-testes']; },
    call(options) {
        calls.push(options.method);
        if (options.method === 'cdc_theme.api.get_cdc_tests_dashboard') {
            options.callback({message: {
                checked_at: 'agora',
                summary: {total: 2, passed: 1, warnings: 1, blocked: 0},
                checks: [
                    {id: 'route', title: 'Rotas', evidence: 'Rotas válidas', status: 'passed'},
                    {id: 'theme', title: 'Tema', evidence: 'Validação externa pendente', status: 'warning'}
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
        }
    },
    show_alert() {},
    router: {on() {}},
    user_roles: ['System Manager']
};
const fakeWindow = {
    frappe: fakeFrappe,
    location: {pathname: '/app/cdc-testes'},
    _cdc_get_breadcrumb_html() { return ''; }
};

new Function('window', 'document', 'frappe', '$', '__', 'sessionStorage', source)(
    fakeWindow,
    fakeDocument,
    fakeFrappe,
    jquery,
    value => value,
    {removeItem() {}}
);

const click = handlers.get('click:[data-cdc-tests-refresh]');
assert.equal(typeof click, 'function', 'o clique do botão Executar testes deve estar registrado');
click.call(executionButton);

assert.deepEqual(calls, [
    'cdc_theme.api.get_cdc_tests_dashboard',
    'cdc_theme.api.get_cdc_admin_diagnostics'
], 'o botão deve consultar gates e diagnósticos reais');
assert.match(terminalOutput.textContent, /\[START\].*Execução autenticada iniciada/s);
assert.match(terminalOutput.textContent, /\[PASS\] Rotas — Rotas válidas/);
assert.match(terminalOutput.textContent, /\[WARN\] Tema — Validação externa pendente/);
assert.match(terminalOutput.textContent, /\[PASS\] Banco — Conectado/);
assert.match(terminalOutput.textContent, /\[DONE\] Execução finalizada/);
assert.equal(executionButton.disabled, false, 'o botão deve ser reativado ao final');
assert.equal(executionButton.textContent, 'Executar testes novamente');
assert.equal(terminalStatus.textContent, 'PRONTO');

console.log('CDC tests console interaction test: OK');
