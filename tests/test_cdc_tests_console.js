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
            handler();
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
const gateTerminals = new Map();
function getGateTerminal(gateId) {
    if (!gateTerminals.has(gateId)) {
        const output = {textContent: '', scrollTop: 0, scrollHeight: 100};
        const status = {textContent: ''};
        gateTerminals.set(gateId, {
            output,
            status,
            classList: {toggle() {}},
            querySelector(selector) {
                if (selector === '[data-cdc-gate-terminal-output]') return output;
                if (selector === '[data-cdc-gate-terminal-status]') return status;
                return null;
            }
        });
    }
    return gateTerminals.get(gateId);
}
const overallProgress = {innerHTML: ''};
const gateProgress = {innerHTML: ''};
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
        if (selector === '.cdc-test-terminal') return terminal;
        if (selector === '[data-cdc-overall-progress]') return overallProgress;
        if (selector.indexOf('[data-cdc-gate-progress=') === 0) return gateProgress;
        if (selector.indexOf('[data-cdc-gate-terminal=') === 0) {
            const match = selector.match(/="([^"]+)"/);
            return getGateTerminal(match ? match[1] : 'unknown');
        }
        return null;
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
                summary: {total: 4, passed: 1, warnings: 2, blocked: 1},
                checks: [
                    {id: 'item-group-route', title: '1. Rotas', summary: 'Rotas corretas.', details: ['Um', 'Dois', 'Três'], evidence: 'Rotas válidas', status: 'passed', execution_type: 'Automático', stages: ['Preparação', 'Permissões', 'Rotas', 'Evidências', 'Resultado']},
                    {id: 'warehouse-rbac', title: '5. RBAC por armazém', summary: 'Isolamento por armazém.', details: ['Um', 'Dois', 'Três'], evidence: 'SQL legado ainda não comprovado', status: 'blocked', execution_type: 'Automático', stages: ['Preparação', 'Autorização administrativa', 'Configuração RBAC', 'Usuário restrito', 'Consulta permitida', 'Tentativa proibida', 'Agregados legados', 'Resultado']},
                    {id: 'automated-tests', title: '7. APIs', summary: 'APIs reais.', details: ['Um', 'Dois', 'Três'], evidence: 'CI externa pendente', status: 'warning', execution_type: 'Híbrido', stages: ['Preparação', 'Permissões', 'API Estoque', 'API Usuários', 'Evidências e CI', 'Resultado']},
                    {id: 'theme-integrity', title: '9. Tema', summary: 'Tema íntegro.', details: ['Um', 'Dois', 'Três'], evidence: 'Validação externa pendente', status: 'warning', execution_type: 'Automático', stages: ['Preparação', 'Permissões', 'Assets', 'Montagem', 'Resultado']}
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
            const sourceCheck = {
                'item-group-route': {title: '1. Rotas', evidence: 'Rotas válidas novamente', status: 'passed', execution_type: 'Automático', stages: ['Preparação', 'Permissões', 'Rotas', 'Evidências', 'Resultado']},
                'warehouse-rbac': {
                    title: '5. RBAC por armazém', evidence: 'Auditoria bloqueada: agregados legados sem identidade elegível.', status: 'blocked', execution_type: 'Automático',
                    stages: ['Preparação', 'Autorização administrativa', 'Configuração RBAC', 'Usuário restrito', 'Consulta permitida', 'Tentativa proibida', 'Agregados legados', 'Resultado'],
                    stage_results: [
                        {index: 2, label: 'Configuração RBAC', status: 'passed', detail: '89 permissões para 52 usuários e 20 armazéns.'},
                        {index: 3, label: 'Usuário restrito', status: 'passed', detail: 'Identidade u***@cdc.org possui acesso parcial.'},
                        {index: 4, label: 'Consulta permitida', status: 'passed', detail: 'Cinco cards e nenhum armazém externo.'},
                        {index: 5, label: 'Tentativa proibida', status: 'passed', detail: 'Armazém externo rejeitado com PermissionError.'},
                        {index: 6, label: 'Agregados legados', status: 'failed', detail: 'Nenhum Stock Manager restrito elegível.'}
                    ]
                },
                'automated-tests': {title: '7. APIs', evidence: 'CI externa pendente', status: 'warning', execution_type: 'Híbrido', stages: ['Preparação', 'Permissões', 'API Estoque', 'API Usuários', 'Evidências e CI', 'Resultado']},
                'theme-integrity': {title: '9. Tema', evidence: 'Tema íntegro novamente', status: 'passed', execution_type: 'Automático', stages: ['Preparação', 'Permissões', 'Assets', 'Montagem', 'Resultado']}
            }[options.args.gate_id];
            options.callback({message: {
                checked_at: 'agora mesmo',
                check: {
                    id: options.args.gate_id,
                    title: sourceCheck.title,
                    summary: 'Rotas corretas.',
                    details: ['Explicação 1', 'Explicação 2', 'Resultado atual'],
                    evidence: sourceCheck.evidence,
                    status: sourceCheck.status,
                    execution_type: sourceCheck.execution_type,
                    stages: sourceCheck.stages,
                    stage_results: sourceCheck.stage_results
                }
            }});
            return;
        }
        if (options.method === 'cdc_theme.api.run_cdc_admin_action') {
            options.callback({message: {
                ok: true,
                message: 'Tema reparado.',
                repair_complete: true,
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
    setInterval() { return 1; },
    _cdc_claim_active_dashboard() {
        return {body: {classList: {add() {}}}, dashboard};
    },
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
    assert.match(dashboard.innerHTML, /data-cdc-overall-progress/);
    assert.match(dashboard.innerHTML, /data-cdc-gate-progress="item-group-route"/);
    assert.match(dashboard.innerHTML, /Linha deste teste/);
    assert.match(dashboard.innerHTML, /Validação da próxima atualização incompleta/);
    assert.match(dashboard.innerHTML, /não bloqueiam lançamentos, entradas, saídas/);
    assert.match(dashboard.innerHTML, /Pendências técnicas/);
    click.call(executionButton);

    assert.deepEqual(calls, [
        'cdc_theme.api.get_cdc_tests_dashboard',
        'cdc_theme.api.run_cdc_quality_gate',
        'cdc_theme.api.run_cdc_quality_gate',
        'cdc_theme.api.run_cdc_quality_gate',
        'cdc_theme.api.get_stock_dashboard_data',
        'cdc_theme.api.get_users_dashboard_data',
        'cdc_theme.api.run_cdc_quality_gate',
        'cdc_theme.api.get_cdc_admin_diagnostics'
    ], 'o botão deve executar os gates em sequência, verificar as duas APIs reais e finalizar os diagnósticos');
    assert.match(terminalOutput.textContent, /\[START\].*Execução sequencial autenticada/s);
    assert.match(terminalOutput.textContent, /\[PASS\] 1\. Rotas — Rotas válidas novamente/);
    assert.match(terminalOutput.textContent, /\[BLOCK\] 5\. RBAC por armazém — Auditoria bloqueada/);
    assert.match(terminalOutput.textContent, /\[WARN\] 7\. APIs — CI externa pendente/);
    assert.match(terminalOutput.textContent, /\[PASS\] 9\. Tema — Tema íntegro novamente/);
    assert.match(terminalOutput.textContent, /\[PASS\] Banco — Conectado/);
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
    const itemTerminal = getGateTerminal('item-group-route');
    assert.match(itemTerminal.output.textContent, /\[START\].*Execução individual autenticada/s);
    assert.match(itemTerminal.output.textContent, /\[PASS\] Rotas válidas novamente/);
    assert.match(itemTerminal.output.textContent, /\[DONE\] Verificação concluída/);
    assert.equal(itemTerminal.status.textContent, 'APROVADO');
    assert.equal(expandedGateDetails.open, true, 'a explicação deve abrir após executar o item');

    const rbacGateButton = {
        disabled: false,
        textContent: 'Executar este teste',
        getAttribute(name) { return name === 'data-cdc-run-gate' ? 'warehouse-rbac' : null; }
    };
    runGate.call(rbacGateButton);
    const rbacTerminal = getGateTerminal('warehouse-rbac');
    assert.match(rbacTerminal.output.textContent, /Configuração RBAC — 89 permissões para 52 usuários e 20 armazéns/);
    assert.match(rbacTerminal.output.textContent, /Tentativa proibida — Armazém externo rejeitado com PermissionError/);
    assert.match(rbacTerminal.output.textContent, /Agregados legados — Nenhum Stock Manager restrito elegível/);
    assert.equal(rbacTerminal.status.textContent, 'BLOQUEADO');

    const automatedGateButton = {
        disabled: false,
        textContent: 'Executar este teste',
        getAttribute(name) { return name === 'data-cdc-run-gate' ? 'automated-tests' : null; }
    };
    runGate.call(automatedGateButton);
    assert.deepEqual(calls.slice(-3), [
        'cdc_theme.api.run_cdc_quality_gate',
        'cdc_theme.api.get_stock_dashboard_data',
        'cdc_theme.api.get_users_dashboard_data'
    ], 'o teste 7 individual deve verificar as duas APIs reais');
    const automatedTerminal = getGateTerminal('automated-tests');
    assert.match(automatedTerminal.output.textContent, /CDC Estoque respondeu: 41 itens e 6 armazéns/);
    assert.match(automatedTerminal.output.textContent, /CDC Usuários respondeu: 12 usuários/);
    assert.match(overallProgress.innerHTML, /Execução concluída/);
    assert.match(gateProgress.innerHTML, /cdc-gate-metro/);

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
