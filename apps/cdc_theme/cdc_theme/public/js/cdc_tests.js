(function() {
    'use strict';

    var loading = false;
    var generation = 0;
    var executionRunning = false;
    var executionLogs = [];
    var latestDashboardData = null;
    var executionStartedAt = 0;
    var runningGateId = null;

    function normalize(value) {
        return decodeURIComponent(String(value || '')).toLowerCase().normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
    }

    function isTestsRoute() {
        var route = window.frappe && frappe.get_route ? frappe.get_route() : [];
        return normalize(window.location.pathname) === '/app/cdc-testes' ||
            (route || []).some(function(part) { return normalize(part) === 'cdc-testes'; });
    }

    function escapeHTML(value) {
        var element = document.createElement('div');
        element.textContent = value === null || value === undefined ? '—' : String(value);
        return element.innerHTML;
    }

    function executionTime() {
        return new Date().toLocaleTimeString('pt-BR', {hour12: false});
    }

    function terminalHTML() {
        var output = executionLogs.length
            ? escapeHTML(executionLogs.join('\n'))
            : '$ Aguardando o comando “Executar testes novamente”...';
        return `<section class="cdc-test-terminal ${executionRunning ? 'is-running' : ''}" aria-label="Console da execução dos testes" aria-live="polite">
            <header><span class="cdc-terminal-lights"><i></i><i></i><i></i></span><strong>CDC Test Runner</strong><span data-cdc-terminal-status>${executionRunning ? 'EXECUTANDO' : 'PRONTO'}</span><button type="button" data-cdc-tests-terminal-clear>Limpar</button></header>
            <pre data-cdc-test-terminal-output>${output}</pre>
        </section>`;
    }

    function syncTerminal() {
        var terminal = document.querySelector('.cdc-test-terminal');
        var output = terminal && terminal.querySelector('[data-cdc-test-terminal-output]');
        var status = terminal && terminal.querySelector('[data-cdc-terminal-status]');
        if (!terminal || !output) return;
        terminal.classList.toggle('is-running', executionRunning);
        output.textContent = executionLogs.length
            ? executionLogs.join('\n')
            : '$ Aguardando o comando “Executar testes novamente”...';
        if (status) status.textContent = executionRunning ? 'EXECUTANDO' : 'PRONTO';
        output.scrollTop = output.scrollHeight;
    }

    function appendExecutionLog(level, message) {
        executionLogs.push(`[${executionTime()}] [${level}] ${message}`);
        if (executionLogs.length > 250) executionLogs = executionLogs.slice(-250);
        syncTerminal();
    }

    function setExecutionButtonState() {
        document.querySelectorAll('[data-cdc-tests-refresh]').forEach(function(button) {
            button.disabled = executionRunning || !!runningGateId;
            button.textContent = executionRunning ? 'Executando testes...' : 'Executar testes novamente';
        });
        document.querySelectorAll('[data-cdc-run-gate]').forEach(function(button) {
            var isCurrent = button.getAttribute('data-cdc-run-gate') === runningGateId;
            button.disabled = executionRunning || !!runningGateId;
            button.textContent = isCurrent ? 'Executando...' : 'Executar este teste';
        });
    }

    function getTestsDashboardClaim() {
        if (typeof window._cdc_claim_active_dashboard === 'function') {
            return window._cdc_claim_active_dashboard('cdc-tests-dashboard', 'section');
        }
        var currentPage = window.frappe && frappe.container && frappe.container.page;
        var body = currentPage && currentPage.querySelector && (
            currentPage.querySelector('.layout-main-section') ||
            currentPage.querySelector('.workspace-page-content') ||
            currentPage.querySelector('.page-body')
        );
        if (!body || !body.isConnected) return null;
        var dashboard = body.querySelector('#cdc-tests-dashboard');
        if (!dashboard) {
            dashboard = document.createElement('section');
            dashboard.id = 'cdc-tests-dashboard';
            body.insertBefore(dashboard, body.firstChild);
        }
        return {body: body, dashboard: dashboard};
    }

    function repairBrowserThemeState() {
        if (typeof window._cdc_repair_theme_runtime === 'function') {
            return Promise.resolve(window._cdc_repair_theme_runtime());
        }
        try {
            ['desktop:workspaces', 'workspace_sidebar_items', 'frappe:boot', 'cdc_theme_version'].forEach(function(key) {
                localStorage.removeItem(key);
            });
            [
                'cdc_unit', 'cdc_period', 'cdc_occ_type', 'cdc_table_type',
                'cdc_project_filter', 'cdc_users_project', 'cdc_users_warehouse',
                'cdc_catalog_project', 'cdc_catalog_warehouse'
            ].forEach(function(key) { sessionStorage.removeItem(key); });
        } catch (error) {}
        return Promise.resolve([]);
    }

    function removeDashboard() {
        document.querySelectorAll('#cdc-tests-dashboard').forEach(function(dashboard) { dashboard.remove(); });
        document.querySelectorAll('.layout-main-section, .workspace-page-content').forEach(function(element) {
            element.classList.remove('cdc-custom-tests-active');
        });
    }

    function renderDashboard(dashboard, data) {
        latestDashboardData = data;
        var summary = data.summary || {};
        var labels = {passed: 'Aprovado', warning: 'Atenção', blocked: 'Bloqueado'};
        var checksHTML = (data.checks || []).map(function(check) {
            var status = ['passed', 'warning', 'blocked'].indexOf(check.status) !== -1 ? check.status : 'warning';
            var details = Array.isArray(check.details) ? check.details : [check.evidence];
            var detailsHTML = details.map(function(paragraph) {
                return `<p>${escapeHTML(paragraph)}</p>`;
            }).join('');
            var actionHTML = check.action
                ? `<button type="button" class="btn btn-xs btn-default" data-cdc-tests-action="${escapeHTML(check.action)}">${escapeHTML(check.action_label || 'Executar correção')}</button>`
                : '';
            return `<article class="cdc-quality-gate is-${status}" data-quality-gate="${escapeHTML(check.id)}">
                <div class="cdc-quality-gate-status">${status === 'passed' ? '✓' : (status === 'blocked' ? '×' : '!')}</div>
                <div class="cdc-quality-gate-copy">
                    <h3>${escapeHTML(check.title)}</h3>
                    <p class="cdc-quality-gate-summary">${escapeHTML(check.summary || check.evidence)}</p>
                    <details class="cdc-quality-gate-details">
                        <summary><span aria-hidden="true">+</span> Entender este teste</summary>
                        <div>${detailsHTML}</div>
                    </details>
                </div>
                <div class="cdc-quality-gate-actions">
                    <span class="cdc-quality-gate-badge">${labels[status]}</span>
                    <button type="button" class="btn btn-xs btn-primary" data-cdc-run-gate="${escapeHTML(check.id)}">${runningGateId === check.id ? 'Executando...' : 'Executar este teste'}</button>
                    ${actionHTML}
                </div>
            </article>`;
        }).join('');

        dashboard.innerHTML = `
            ${window._cdc_get_breadcrumb_html ? window._cdc_get_breadcrumb_html('Testes', 'Qualidade e Publicação') : ''}
            <div class="cdc-tests-shell">
                <header class="cdc-tests-hero ${summary.ready_to_publish ? 'is-ready' : 'is-blocked'}">
                    <div class="cdc-tests-hero-icon" aria-hidden="true">🧪</div>
                    <div class="cdc-tests-hero-copy">
                        <span class="cdc-quality-eyebrow">Qualidade operacional</span>
                        <h1>CDC Testes</h1>
                        <p>Validações de rotas, integrações, segurança e critérios obrigatórios antes da publicação.</p>
                    </div>
                    <div class="cdc-tests-release-state">
                        <span>${summary.ready_to_publish ? '✓' : '!'}</span>
                        <div><strong>${summary.ready_to_publish ? 'Pronto para publicar' : 'Publicação bloqueada'}</strong><small>${summary.passed || 0} de ${summary.total || 10} gates aprovados</small></div>
                    </div>
                </header>

                <section class="cdc-tests-summary" aria-label="Resumo dos testes">
                    <article><span>Total de gates</span><strong>${summary.total || 0}</strong><small>Critérios monitorados</small></article>
                    <article class="is-passed"><span>Aprovados</span><strong>${summary.passed || 0}</strong><small>Com evidência confirmada</small></article>
                    <article class="is-warning"><span>Atenções</span><strong>${summary.warnings || 0}</strong><small>Dependem de validação externa</small></article>
                    <article class="is-blocked"><span>Bloqueios</span><strong>${summary.blocked || 0}</strong><small>Impedem a publicação</small></article>
                </section>

                <section class="cdc-tests-toolbar">
                    <div><strong>Última execução</strong><span>${escapeHTML(data.checked_at || 'não informada')}</span></div>
                    <div class="cdc-tests-toolbar-actions">
                        <a class="btn btn-sm btn-default" href="/app/cdc-monitoramento">Abrir Monitoramento</a>
                        <button type="button" class="btn btn-sm btn-primary" data-cdc-tests-refresh>Executar testes novamente</button>
                    </div>
                </section>

                ${terminalHTML()}

                <section class="cdc-quality-gates" aria-label="Gates de qualidade para publicação">
                    ${checksHTML || '<div class="cdc-tests-state is-error">Nenhum teste retornado pelo servidor.</div>'}
                </section>
                <p class="cdc-quality-note"><strong>Recuperação do tema:</strong> o botão “Reparar tema e caches” atua quando o ERP está acessível. Se o Desk ou o backend não carregarem, use no servidor <code>./scripts/reparar_tema.sh</code>, que também verifica sintaxe, serviços e publicação dos assets.</p>
                <p class="cdc-quality-note"><strong>Política:</strong> resultados indisponíveis permanecem como atenção ou bloqueio. Esta tela não executa sincronizações externas nem publica código.</p>
            </div>`;
        setExecutionButtonState();
        syncTerminal();
    }

    function load(force) {
        if (!isTestsRoute()) { removeDashboard(); return; }
        var claim = getTestsDashboardClaim();
        if (!claim || loading) return;
        var body = claim.body;
        var dashboard = claim.dashboard;
        body.classList.add('cdc-custom-tests-active');
        if ((frappe.user_roles || []).indexOf('System Manager') === -1) {
            dashboard.innerHTML = '<div class="cdc-tests-state is-error">Acesso restrito a administradores do sistema.</div>';
            return;
        }
        if (dashboard.dataset.loaded === '1' && !force) return;
        loading = true;
        var requestGeneration = generation;
        dashboard.innerHTML = '<div class="cdc-tests-state">Executando verificações somente leitura...</div>';
        frappe.call({
            method: 'cdc_theme.api.get_cdc_tests_dashboard',
            callback: function(response) {
                loading = false;
                if (requestGeneration !== generation || !isTestsRoute()) return;
                var currentClaim = getTestsDashboardClaim();
                if (!currentClaim) return;
                body = currentClaim.body;
                dashboard = currentClaim.dashboard;
                body.classList.add('cdc-custom-tests-active');
                if (!response.message) {
                    dashboard.innerHTML = '<div class="cdc-tests-state is-error">Não foi possível executar os testes.</div>';
                    return;
                }
                dashboard.dataset.loaded = '1';
                renderDashboard(dashboard, response.message);
            },
            error: function() {
                loading = false;
                dashboard.innerHTML = '<div class="cdc-tests-state is-error">Falha ao consultar os testes no servidor.</div>';
            }
        });
    }

    function finishVisibleExecution(dashboard, testData, failed) {
        executionRunning = false;
        var elapsed = executionStartedAt ? ((performance.now() - executionStartedAt) / 1000).toFixed(2) : '0.00';
        appendExecutionLog(failed ? 'FAIL' : 'DONE', `Execução finalizada em ${elapsed}s.`);
        if (testData && dashboard && isTestsRoute()) {
            dashboard.dataset.loaded = '1';
            renderDashboard(dashboard, testData);
        } else {
            setExecutionButtonState();
            syncTerminal();
        }
    }

    function runWorkspaceDataDiagnostics(dashboard, testData, failed) {
        appendExecutionLog('RUN', 'Validando as fontes reais das páginas CDC Estoque e CDC Usuários...');
        var routeFailed = !!failed;

        function checkUsersRoute() {
            frappe.call({
                method: 'cdc_theme.api.get_users_dashboard_data',
                args: {selected_project: 'All', selected_warehouse: 'All'},
                callback: function(response) {
                    var data = response && response.message;
                    if (!data) {
                        routeFailed = true;
                        appendExecutionLog('FAIL', 'CDC Usuários — a API não retornou dados para montar a página.');
                    } else {
                        var summary = data.summary || {};
                        appendExecutionLog('PASS', `CDC Usuários — API respondeu com ${summary.total || 0} usuários e filtros permitidos.`);
                    }
                    finishVisibleExecution(dashboard, testData, routeFailed);
                },
                error: function() {
                    appendExecutionLog('FAIL', 'CDC Usuários — falha autenticada ao consultar a API da página.');
                    finishVisibleExecution(dashboard, testData, true);
                }
            });
        }

        frappe.call({
            method: 'cdc_theme.api.get_stock_dashboard_data',
            args: {selected_unit: 'All', period: 'quarter', entry_type: 'receipt', table_type: 'all'},
            callback: function(response) {
                var data = response && response.message;
                if (!data) {
                    routeFailed = true;
                    appendExecutionLog('FAIL', 'CDC Estoque — a API não retornou dados para montar a página.');
                } else {
                    appendExecutionLog('PASS', `CDC Estoque — API respondeu com ${data.total_items || 0} itens e ${data.total_warehouses || 0} armazéns no escopo.`);
                }
                checkUsersRoute();
            },
            error: function() {
                routeFailed = true;
                appendExecutionLog('FAIL', 'CDC Estoque — falha autenticada ao consultar a API da página.');
                checkUsersRoute();
            }
        });
    }

    function runVisibleTestExecution() {
        if (executionRunning || runningGateId) {
            frappe.show_alert({message: __('Os testes já estão em execução.'), indicator: 'orange'}, 3);
            return;
        }
        var dashboard = document.getElementById('cdc-tests-dashboard');
        if (!dashboard || !isTestsRoute()) return;
        executionRunning = true;
        executionStartedAt = performance.now();
        executionLogs = [];
        setExecutionButtonState();
        syncTerminal();
        appendExecutionLog('START', 'Execução autenticada iniciada pelo usuário atual.');
        appendExecutionLog('RUN', 'Consultando os 10 gates de qualidade no servidor...');

        frappe.call({
            method: 'cdc_theme.api.get_cdc_tests_dashboard',
            callback: function(response) {
                if (!isTestsRoute()) {
                    executionRunning = false;
                    return;
                }
                var testData = response && response.message;
                if (!testData) {
                    appendExecutionLog('FAIL', 'O servidor não retornou o resultado dos gates.');
                    finishVisibleExecution(dashboard, latestDashboardData, true);
                    return;
                }
                (testData.checks || []).forEach(function(check) {
                    var level = check.status === 'passed' ? 'PASS' : (check.status === 'blocked' ? 'BLOCK' : 'WARN');
                    appendExecutionLog(level, `${check.title} — ${check.evidence}`);
                });
                var summary = testData.summary || {};
                appendExecutionLog('INFO', `Gates: ${summary.passed || 0} aprovados, ${summary.warnings || 0} atenções, ${summary.blocked || 0} bloqueios.`);
                appendExecutionLog('RUN', 'Executando diagnósticos de banco, Redis, app, assets, workspaces e logs...');

                frappe.call({
                    method: 'cdc_theme.api.get_cdc_admin_diagnostics',
                    callback: function(diagnosticResponse) {
                        var diagnostics = diagnosticResponse && diagnosticResponse.message;
                        if (!diagnostics) {
                            appendExecutionLog('FAIL', 'Os diagnósticos administrativos não retornaram resultado.');
                            finishVisibleExecution(dashboard, testData, true);
                            return;
                        }
                        (diagnostics.checks || []).forEach(function(check) {
                            appendExecutionLog(check.status === 'ok' ? 'PASS' : 'FAIL', `${check.label} — ${check.detail}`);
                        });
                        var diagnosticSummary = diagnostics.summary || {};
                        appendExecutionLog('INFO', `Diagnósticos: ${diagnosticSummary.ok || 0}/${diagnosticSummary.total || 0} saudáveis; ${diagnosticSummary.errors || 0} erros.`);
                        runWorkspaceDataDiagnostics(dashboard, testData, Number(diagnosticSummary.errors || 0) > 0);
                    },
                    error: function() {
                        appendExecutionLog('FAIL', 'Falha de comunicação ao executar os diagnósticos administrativos.');
                        finishVisibleExecution(dashboard, testData, true);
                    }
                });
            },
            error: function() {
                appendExecutionLog('FAIL', 'Falha de comunicação ao executar os gates de qualidade.');
                finishVisibleExecution(dashboard, latestDashboardData, true);
            }
        });
    }

    function updateSingleGate(gate, checkedAt) {
        if (!latestDashboardData || !gate) return;
        var checks = latestDashboardData.checks || [];
        latestDashboardData.checks = checks.map(function(item) {
            return item.id === gate.id ? gate : item;
        });
        latestDashboardData.checked_at = checkedAt || latestDashboardData.checked_at;
        latestDashboardData.summary = {
            total: latestDashboardData.checks.length,
            passed: latestDashboardData.checks.filter(function(item) { return item.status === 'passed'; }).length,
            warnings: latestDashboardData.checks.filter(function(item) { return item.status === 'warning'; }).length,
            blocked: latestDashboardData.checks.filter(function(item) { return item.status === 'blocked'; }).length
        };
        latestDashboardData.summary.ready_to_publish = latestDashboardData.summary.warnings === 0 && latestDashboardData.summary.blocked === 0;
    }

    function runSingleGate(gateId) {
        if (executionRunning || runningGateId) {
            frappe.show_alert({message: __('Aguarde a execução atual terminar.'), indicator: 'orange'}, 3);
            return;
        }
        runningGateId = gateId;
        setExecutionButtonState();
        appendExecutionLog('RUN', `Executando individualmente o teste ${gateId}...`);
        frappe.call({
            method: 'cdc_theme.api.run_cdc_quality_gate',
            args: {gate_id: gateId},
            callback: function(response) {
                var result = response && response.message;
                if (!result || !result.check) {
                    appendExecutionLog('FAIL', `O teste ${gateId} não retornou resultado.`);
                    runningGateId = null;
                    setExecutionButtonState();
                    return;
                }
                updateSingleGate(result.check, result.checked_at);
                appendExecutionLog(
                    result.check.status === 'passed' ? 'PASS' : (result.check.status === 'blocked' ? 'BLOCK' : 'WARN'),
                    `${result.check.title} — ${result.check.evidence}`
                );
                runningGateId = null;
                var dashboard = document.getElementById('cdc-tests-dashboard');
                if (dashboard && latestDashboardData) {
                    renderDashboard(dashboard, latestDashboardData);
                    var card = dashboard.querySelector(`[data-quality-gate="${gateId}"]`);
                    var details = card && card.querySelector('details');
                    if (details) details.open = true;
                } else {
                    setExecutionButtonState();
                }
            },
            error: function() {
                appendExecutionLog('FAIL', `Falha de comunicação ao executar o teste ${gateId}.`);
                runningGateId = null;
                setExecutionButtonState();
            }
        });
    }

    $(document).on('click', '[data-cdc-tests-refresh]', function() {
        runVisibleTestExecution();
    });
    $(document).on('click', '[data-cdc-run-gate]', function() {
        runSingleGate(this.getAttribute('data-cdc-run-gate'));
    });
    $(document).on('click', '[data-cdc-tests-terminal-clear]', function() {
        if (executionRunning) return;
        executionLogs = [];
        syncTerminal();
    });
    $(document).on('click', '[data-cdc-tests-action]', function() {
        var button = this;
        var action = button.getAttribute('data-cdc-tests-action');
        if (action !== 'repair_theme') return;
        frappe.confirm(
            __('Reconciliar as workspaces CDC e limpar os caches do tema agora?'),
            function() {
                button.disabled = true;
                frappe.call({
                    method: 'cdc_theme.api.run_cdc_admin_action',
                    args: {action: action},
                    callback: function(response) {
                        var result = response && response.message;
                        if (!result || !result.ok) {
                            button.disabled = false;
                            frappe.msgprint(__('O reparo do tema não foi confirmado pelo servidor.'));
                            return;
                        }
                        button.textContent = 'Revalidando tema...';
                        var repairSummary = result.diagnostics && result.diagnostics.summary;
                        if (repairSummary) {
                            appendExecutionLog(
                                Number(repairSummary.errors || 0) === 0 ? 'PASS' : 'WARN',
                                `Pós-reparo no servidor: ${repairSummary.ok || 0}/${repairSummary.total || 0} diagnósticos saudáveis.`
                            );
                        }
                        appendExecutionLog('REPAIR', 'Servidor reconciliado; limpando o estado do navegador e revalidando os assets...');
                        repairBrowserThemeState().then(function() {
                            appendExecutionLog('DONE', 'Reparo concluído. Recarregando o Desk para remontar as páginas CDC.');
                            frappe.show_alert({message: __(result.message + ' O Desk será recarregado.'), indicator: 'green'}, 6);
                            button.disabled = false;
                            button.textContent = 'Reparar tema e caches';
                            window.setTimeout(function() { window.location.reload(); }, 900);
                        }).catch(function() {
                            appendExecutionLog('WARN', 'O navegador não confirmou toda a limpeza; o Desk ainda será recarregado.');
                            button.disabled = false;
                            button.textContent = 'Reparar tema e caches';
                            window.setTimeout(function() { window.location.reload(); }, 900);
                        });
                    },
                    error: function() {
                        button.disabled = false;
                        frappe.msgprint(__('Falha ao executar o reparo controlado do tema.'));
                    }
                });
            }
        );
    });
    function schedule() {
        generation += 1;
        [0, 200, 700].forEach(function(delay) { setTimeout(function() { load(false); }, delay); });
    }
    $(document).ready(schedule);
    $(document).on('page-change', schedule);
    if (window.frappe && frappe.router && frappe.router.on) frappe.router.on('change', schedule);
})();
