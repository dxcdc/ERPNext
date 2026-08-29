(function() {
    'use strict';

    var loading = false;
    var generation = 0;
    var executionRunning = false;
    var executionLogs = [];
    var latestDashboardData = null;
    var executionStartedAt = 0;
    var runningGateId = null;
    var gateExecutionLogs = Object.create(null);
    var gateExecutionStatus = Object.create(null);
    var gateExecutionStartedAt = Object.create(null);
    var gateProgressState = Object.create(null);
    var progressMode = 'history';
    var activityTicker = null;

    var FINAL_PROGRESS_STATES = ['passed', 'warning', 'failed'];

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

    function findCheck(gateId) {
        return ((latestDashboardData && latestDashboardData.checks) || []).find(function(check) {
            return check.id === gateId;
        }) || null;
    }

    function resultProgressStatus(status) {
        if (status === 'passed') return 'passed';
        if (status === 'warning') return 'warning';
        return 'failed';
    }

    function progressStatusLabel(status) {
        return {
            pending: 'Aguardando', queued: 'Na fila', running: 'Executando',
            passed: 'Aprovado', warning: 'Atenção', failed: 'Falhou'
        }[status] || 'Aguardando';
    }

    function progressStatusSymbol(status) {
        return {
            pending: '○', queued: '○', running: '◉', passed: '✓', warning: '!', failed: '×'
        }[status] || '○';
    }

    function stageDefinitions(check) {
        var labels = check && Array.isArray(check.stages) && check.stages.length
            ? check.stages
            : ['Preparação', 'Permissões', 'Evidências', 'Resultado'];
        return labels.map(function(label, index) {
            return {id: `stage-${index + 1}`, label: String(label)};
        });
    }

    function resetGateProgress(check, queued) {
        var now = performance.now();
        gateProgressState[check.id] = {
            gateId: check.id,
            status: queued ? 'queued' : 'pending',
            startedAt: 0,
            finishedAt: 0,
            stages: stageDefinitions(check).map(function(stage) {
                return {
                    id: stage.id,
                    label: stage.label,
                    status: 'pending',
                    detail: 'Aguardando a etapa anterior.',
                    startedAt: 0,
                    updatedAt: now,
                    finishedAt: 0
                };
            })
        };
        return gateProgressState[check.id];
    }

    function setGateStage(gateId, index, status, detail) {
        var state = gateProgressState[gateId];
        var stage = state && state.stages[index];
        if (!stage) return;
        var now = performance.now();
        if (status === 'running' && !stage.startedAt) stage.startedAt = now;
        stage.status = status;
        stage.detail = detail || stage.detail;
        stage.updatedAt = now;
        if (FINAL_PROGRESS_STATES.indexOf(status) !== -1) stage.finishedAt = now;
        if (status === 'running') {
            state.status = 'running';
            if (!state.startedAt) state.startedAt = now;
        }
        syncProgressUI(gateId);
    }

    function completeGateProgress(gateId, status) {
        var state = gateProgressState[gateId];
        if (!state) return;
        state.status = status;
        state.finishedAt = performance.now();
        syncProgressUI(gateId);
    }

    function elapsedLabel(milliseconds) {
        if (!milliseconds || milliseconds < 0) return '—';
        return milliseconds < 1000
            ? `${Math.max(1, Math.round(milliseconds))}ms`
            : `${(milliseconds / 1000).toFixed(1)}s`;
    }

    function stageDuration(stage) {
        if (!stage.startedAt) return '—';
        return elapsedLabel((stage.finishedAt || performance.now()) - stage.startedAt);
    }

    function overallProgressContentHTML(checks) {
        var hasLiveState = Object.keys(gateProgressState).length > 0;
        var stationStates = checks.map(function(check) {
            var runtime = gateProgressState[check.id];
            return runtime ? runtime.status : resultProgressStatus(check.status);
        });
        var completed = stationStates.filter(function(status) {
            return FINAL_PROGRESS_STATES.indexOf(status) !== -1;
        }).length;
        var total = checks.length || 1;
        var percent = Math.round((completed / total) * 100);
        var currentIndex = stationStates.indexOf('running');
        var headline = progressMode === 'suite' && currentIndex >= 0
            ? `Executando teste ${currentIndex + 1} de ${total}`
            : (progressMode === 'single' && currentIndex >= 0
                ? `Execução individual — teste ${currentIndex + 1}`
                : (hasLiveState ? 'Execução concluída' : 'Última avaliação registrada'));
        var stations = checks.map(function(check, index) {
            var state = stationStates[index];
            var shortTitle = String(check.title || '').replace(/^\d+\.\s*/, '');
            return `<li class="is-${state}" data-cdc-overall-station="${escapeHTML(check.id)}" title="${escapeHTML(check.title)} — ${progressStatusLabel(state)}">
                <span class="cdc-metro-node" aria-hidden="true">${progressStatusSymbol(state)}</span>
                <strong>${index + 1}</strong>
                <small>${escapeHTML(shortTitle)}</small>
                <em>${progressStatusLabel(state)}</em>
            </li>`;
        }).join('');
        return `<div class="cdc-overall-progress-head">
                <div><strong>${escapeHTML(headline)}</strong><span>${completed} de ${checks.length} testes concluídos — ${percent}%</span></div>
                <b>${percent}%</b>
            </div>
            <div class="cdc-progress-track" role="progressbar" aria-label="Progresso geral dos testes" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><i style="width:${percent}%"></i></div>
            <ol class="cdc-overall-metro">${stations}</ol>
            <footer class="cdc-progress-legend" aria-label="Legenda dos estados">
                <span><i class="is-pending">○</i> Aguardando</span><span><i class="is-running">◉</i> Executando</span><span><i class="is-passed">✓</i> Aprovado</span><span><i class="is-warning">!</i> Atenção</span><span><i class="is-failed">×</i> Falhou</span>
                <em>Percentuais avançam somente após eventos reais.</em>
            </footer>`;
    }

    function overallProgressHTML(checks) {
        return `<section class="cdc-overall-progress ${executionRunning ? 'is-running' : ''}" data-cdc-overall-progress aria-live="polite">${overallProgressContentHTML(checks)}</section>`;
    }

    function gateProgressContentHTML(check) {
        var state = gateProgressState[check.id];
        var stages = state ? state.stages : stageDefinitions(check).map(function(stage) {
            return {id: stage.id, label: stage.label, status: 'pending', detail: 'Aguardando execução detalhada.', startedAt: 0, updatedAt: 0, finishedAt: 0};
        });
        var completed = stages.filter(function(stage) {
            return FINAL_PROGRESS_STATES.indexOf(stage.status) !== -1;
        }).length;
        var percent = Math.round((completed / Math.max(stages.length, 1)) * 100);
        var activeIndex = stages.findIndex(function(stage) { return stage.status === 'running'; });
        var stations = stages.map(function(stage, index) {
            var duration = stage.status === 'running'
                ? `<span data-cdc-stage-elapsed="${escapeHTML(check.id)}:${index}">${stageDuration(stage)}</span>`
                : stageDuration(stage);
            return `<li class="is-${stage.status}">
                <span class="cdc-stage-node" aria-hidden="true">${progressStatusSymbol(stage.status)}</span>
                <strong>${escapeHTML(stage.label)}</strong>
                <small>${progressStatusLabel(stage.status)} · ${duration}</small>
                <div class="cdc-stage-mini-progress ${stage.status === 'running' ? 'is-indeterminate' : ''}"><i style="width:${FINAL_PROGRESS_STATES.indexOf(stage.status) !== -1 ? '100' : '0'}%"></i></div>
            </li>`;
        }).join('');
        var activeStage = activeIndex >= 0 ? stages[activeIndex] : null;
        var activity = activeStage ? `<div class="cdc-active-stage" data-cdc-active-stage="${escapeHTML(check.id)}:${activeIndex}">
                <div><strong>${escapeHTML(activeStage.label)}</strong><span data-cdc-stage-health>Executando normalmente</span></div>
                <div class="cdc-stage-activity-bar" aria-label="Atividade da etapa ${escapeHTML(activeStage.label)}"><i></i></div>
                <p>${escapeHTML(activeStage.detail)} <span>Último evento há <b data-cdc-last-event>0s</b>.</span></p>
            </div>` : `<p class="cdc-gate-progress-message">${state && FINAL_PROGRESS_STATES.indexOf(state.status) !== -1 ? `Execução finalizada: ${progressStatusLabel(state.status)}.` : 'Execute este teste para acompanhar cada etapa em tempo real.'}</p>`;
        return `<header>
                <div><strong>Linha deste teste</strong><span class="cdc-execution-type">${escapeHTML(check.execution_type || 'Automático')}</span></div>
                <span>${completed} de ${stages.length} etapas — ${percent}%</span>
            </header>
            <div class="cdc-progress-track is-small" role="progressbar" aria-label="Progresso do teste ${escapeHTML(check.title)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><i style="width:${percent}%"></i></div>
            <ol class="cdc-gate-metro">${stations}</ol>
            ${activity}`;
    }

    function gateProgressHTML(check) {
        return `<section class="cdc-gate-progress" data-cdc-gate-progress="${escapeHTML(check.id)}" aria-live="polite">${gateProgressContentHTML(check)}</section>`;
    }

    function syncProgressUI(gateId) {
        var checks = (latestDashboardData && latestDashboardData.checks) || [];
        var overall = document.querySelector('[data-cdc-overall-progress]');
        if (overall) overall.innerHTML = overallProgressContentHTML(checks);
        var ids = gateId ? [gateId] : checks.map(function(check) { return check.id; });
        ids.forEach(function(id) {
            var check = findCheck(id);
            var element = document.querySelector(`[data-cdc-gate-progress="${id}"]`);
            if (check && element) element.innerHTML = gateProgressContentHTML(check);
        });
        refreshElapsedIndicators();
    }

    function refreshElapsedIndicators() {
        if (!isTestsRoute()) return;
        document.querySelectorAll('[data-cdc-stage-elapsed]').forEach(function(element) {
            var parts = String(element.getAttribute('data-cdc-stage-elapsed') || '').split(':');
            var state = gateProgressState[parts[0]];
            var stage = state && state.stages[Number(parts[1])];
            if (stage) element.textContent = stageDuration(stage);
        });
        document.querySelectorAll('[data-cdc-active-stage]').forEach(function(element) {
            var parts = String(element.getAttribute('data-cdc-active-stage') || '').split(':');
            var state = gateProgressState[parts[0]];
            var stage = state && state.stages[Number(parts[1])];
            if (!stage) return;
            var elapsed = performance.now() - stage.startedAt;
            var sinceEvent = performance.now() - stage.updatedAt;
            var health = element.querySelector('[data-cdc-stage-health]');
            var lastEvent = element.querySelector('[data-cdc-last-event]');
            var gateElement = document.querySelector(`[data-cdc-gate-progress="${parts[0]}"]`);
            var stageElements = gateElement && gateElement.querySelectorAll('.cdc-gate-metro li');
            var stageElement = stageElements && stageElements[Number(parts[1])];
            var overallStation = document.querySelector(`[data-cdc-overall-station="${parts[0]}"]`);
            element.classList.toggle('is-slow', elapsed >= 10000);
            element.classList.toggle('is-waiting', sinceEvent >= 5000);
            if (stageElement) {
                stageElement.classList.toggle('is-slow', elapsed >= 10000);
                stageElement.classList.toggle('is-waiting', sinceEvent >= 5000);
            }
            if (overallStation) {
                overallStation.classList.toggle('is-slow', elapsed >= 10000);
                overallStation.classList.toggle('is-waiting', sinceEvent >= 5000);
            }
            if (health) health.textContent = elapsed >= 10000
                ? 'Demorando mais que o esperado, mas a solicitação continua ativa'
                : (sinceEvent >= 5000 ? 'Aguardando resposta do servidor' : 'Executando normalmente');
            if (lastEvent) lastEvent.textContent = elapsedLabel(sinceEvent);
        });
    }

    function ensureActivityTicker() {
        if (activityTicker || typeof window.setInterval !== 'function') return;
        activityTicker = window.setInterval(refreshElapsedIndicators, 1000);
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

    function gateTerminalHTML(gateId, title) {
        var logs = gateExecutionLogs[gateId] || [];
        var status = gateExecutionStatus[gateId] || 'PRONTO';
        var output = logs.length
            ? escapeHTML(logs.join('\n'))
            : `$ Aguardando “Executar este teste” para validar ${escapeHTML(title)}...`;
        return `<section class="cdc-gate-terminal ${status === 'EXECUTANDO' ? 'is-running' : ''}" data-cdc-gate-terminal="${escapeHTML(gateId)}" aria-label="Console do teste ${escapeHTML(title)}" aria-live="polite">
            <header><span class="cdc-terminal-lights"><i></i><i></i><i></i></span><strong>console / ${escapeHTML(gateId)}</strong><span data-cdc-gate-terminal-status>${escapeHTML(status)}</span></header>
            <pre data-cdc-gate-terminal-output>${output}</pre>
        </section>`;
    }

    function syncGateTerminal(gateId) {
        var terminal = document.querySelector(`[data-cdc-gate-terminal="${gateId}"]`);
        if (!terminal) return;
        var output = terminal.querySelector('[data-cdc-gate-terminal-output]');
        var status = terminal.querySelector('[data-cdc-gate-terminal-status]');
        var logs = gateExecutionLogs[gateId] || [];
        var currentStatus = gateExecutionStatus[gateId] || 'PRONTO';
        terminal.classList.toggle('is-running', currentStatus === 'EXECUTANDO');
        if (status) status.textContent = currentStatus;
        if (output) {
            output.textContent = logs.length ? logs.join('\n') : '$ Aguardando “Executar este teste”...';
            output.scrollTop = output.scrollHeight;
        }
    }

    function appendGateLog(gateId, level, message) {
        if (!gateExecutionLogs[gateId]) gateExecutionLogs[gateId] = [];
        gateExecutionLogs[gateId].push(`[${executionTime()}] [${level}] ${message}`);
        if (gateExecutionLogs[gateId].length > 80) gateExecutionLogs[gateId] = gateExecutionLogs[gateId].slice(-80);
        syncGateTerminal(gateId);
    }

    function startGateConsole(gateId, message) {
        gateExecutionLogs[gateId] = [];
        gateExecutionStatus[gateId] = 'EXECUTANDO';
        gateExecutionStartedAt[gateId] = performance.now();
        appendGateLog(gateId, 'START', message);
    }

    function finishGateConsole(gateId, status, message) {
        var startedAt = gateExecutionStartedAt[gateId];
        var elapsed = startedAt ? ((performance.now() - startedAt) / 1000).toFixed(2) : '0.00';
        appendGateLog(gateId, status === 'FALHOU' ? 'FAIL' : 'DONE', `${message} Duração: ${elapsed}s.`);
        gateExecutionStatus[gateId] = status;
        syncGateTerminal(gateId);
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
        var labels = {passed: 'Aprovado', warning: 'Atenção', blocked: 'Pendente'};
        var checksHTML = (data.checks || []).map(function(check) {
            var status = ['passed', 'warning', 'blocked'].indexOf(check.status) !== -1 ? check.status : 'warning';
            var details = Array.isArray(check.details) ? check.details : [check.evidence];
            var detailsHTML = details.map(function(paragraph) {
                return `<p>${escapeHTML(paragraph)}</p>`;
            }).join('');
            var actionHTML = check.action
                ? `<button type="button" class="btn btn-xs btn-default" data-cdc-tests-action="${escapeHTML(check.action)}" data-cdc-action-gate="${escapeHTML(check.id)}">${escapeHTML(check.action_label || 'Executar correção')}</button>`
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
                ${gateProgressHTML(check)}
                ${gateTerminalHTML(check.id, check.title)}
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
                        <p>Validações técnicas para liberar a próxima atualização do sistema.</p>
                    </div>
                    <div class="cdc-tests-release-state">
                        <span>${summary.ready_to_publish ? '✓' : '!'}</span>
                        <div><strong>${summary.ready_to_publish ? 'Atualização pronta para publicação' : 'Validação da próxima atualização incompleta'}</strong><small>${summary.passed || 0} de ${summary.total || 10} verificações aprovadas</small></div>
                    </div>
                </header>

                <p class="cdc-quality-note"><strong>O uso do ERP continua liberado:</strong> estas pendências técnicas não bloqueiam lançamentos, entradas, saídas nem as demais operações do sistema.</p>

                <section class="cdc-tests-summary" aria-label="Resumo dos testes">
                    <article><span>Total de verificações</span><strong>${summary.total || 0}</strong><small>Critérios técnicos monitorados</small></article>
                    <article class="is-passed"><span>Aprovados</span><strong>${summary.passed || 0}</strong><small>Com evidência confirmada</small></article>
                    <article class="is-warning"><span>Atenções</span><strong>${summary.warnings || 0}</strong><small>Dependem de validação externa</small></article>
                    <article class="is-blocked"><span>Pendências técnicas</span><strong>${summary.blocked || 0}</strong><small>Antes da próxima atualização</small></article>
                </section>

                <section class="cdc-tests-toolbar">
                    <div><strong>Última execução</strong><span>${escapeHTML(data.checked_at || 'não informada')}</span></div>
                    <div class="cdc-tests-toolbar-actions">
                        <a class="btn btn-sm btn-default" href="/app/cdc-monitoramento">Abrir Monitoramento</a>
                        <button type="button" class="btn btn-sm btn-primary" data-cdc-tests-refresh>Executar testes novamente</button>
                    </div>
                </section>

                ${overallProgressHTML(data.checks || [])}

                ${terminalHTML()}

                <section class="cdc-quality-gates" aria-label="Gates de qualidade para publicação">
                    ${checksHTML || '<div class="cdc-tests-state is-error">Nenhum teste retornado pelo servidor.</div>'}
                </section>
                <p class="cdc-quality-note"><strong>Recuperação do tema:</strong> o botão “Reparar tema e caches” atua quando o ERP está acessível. Se o Desk ou o backend não carregarem, use no servidor <code>./scripts/reparar_tema.sh</code>, que também verifica sintaxe, serviços e publicação dos assets.</p>
                <p class="cdc-quality-note"><strong>Política:</strong> resultados indisponíveis permanecem como atenção ou pendência técnica. Esta tela não bloqueia operações, não executa sincronizações externas e não publica código.</p>
            </div>`;
        setExecutionButtonState();
        syncTerminal();
        Object.keys(gateExecutionLogs).forEach(syncGateTerminal);
        syncProgressUI();
        ensureActivityTicker();
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

    function renderGateResult(gateId, openDetails) {
        var dashboard = document.getElementById('cdc-tests-dashboard');
        if (!dashboard || !latestDashboardData || !isTestsRoute()) {
            setExecutionButtonState();
            return;
        }
        renderDashboard(dashboard, latestDashboardData);
        var card = dashboard.querySelector(`[data-quality-gate="${gateId}"]`);
        var details = card && card.querySelector('details');
        if (details && openDetails) details.open = true;
    }

    function finishGateRun(gateId, result, runtimeFailed, options, done) {
        var resultStatus = runtimeFailed ? 'failed' : resultProgressStatus(result.check.status);
        var state = gateProgressState[gateId];
        var lastIndex = state.stages.length - 1;
        setGateStage(gateId, lastIndex, 'running', 'Consolidando o resultado e as evidências desta execução.');
        setGateStage(gateId, lastIndex, resultStatus, result.check.evidence);
        completeGateProgress(gateId, resultStatus);
        var consoleStatus = runtimeFailed ? 'FALHOU' : (result.check.status === 'passed' ? 'APROVADO' : (result.check.status === 'blocked' ? 'BLOQUEADO' : 'ATENÇÃO'));
        finishGateConsole(gateId, consoleStatus, runtimeFailed ? 'A verificação terminou com falha.' : 'Verificação concluída.');
        runningGateId = null;
        renderGateResult(gateId, !options.fromSuite);
        if (typeof done === 'function') done(runtimeFailed ? new Error('runtime-failed') : null, result);
    }

    function finishGenericEvidence(gateId, result, options, done) {
        var state = gateProgressState[gateId];
        var resultStatus = resultProgressStatus(result.check.status);
        for (var index = 2; index < state.stages.length - 1; index++) {
            setGateStage(gateId, index, 'running', `Validando ${state.stages[index].label.toLowerCase()} com a resposta real do servidor.`);
            setGateStage(gateId, index, resultStatus, result.check.evidence);
        }
        finishGateRun(gateId, result, false, options, done);
    }

    function executeWarehouseRbacStages(gateId, result, options, done) {
        var stageResults = Array.isArray(result.check.stage_results)
            ? result.check.stage_results.slice().sort(function(left, right) {
                return Number(left.index) - Number(right.index);
            })
            : [];
        if (!stageResults.length) {
            appendGateLog(gateId, 'WARN', 'O servidor não devolveu as etapas detalhadas da auditoria RBAC.');
            finishGenericEvidence(gateId, result, options, done);
            return;
        }
        var position = 0;
        function advance() {
            if (position >= stageResults.length) {
                finishGateRun(gateId, result, false, options, done);
                return;
            }
            var stage = stageResults[position];
            var index = Number(stage.index);
            var status = stage.status === 'passed' ? 'passed' : (stage.status === 'warning' ? 'warning' : 'failed');
            var level = status === 'passed' ? 'PASS' : (status === 'warning' ? 'WARN' : 'FAIL');
            var detail = String(stage.detail || 'Etapa concluída sem evidência descritiva.');
            setGateStage(gateId, index, 'running', `Processando a evidência real de ${String(stage.label || 'RBAC').toLowerCase()}.`);
            appendGateLog(gateId, 'RUN', `${stage.label || 'Etapa RBAC'}: analisando resultado retornado pelo servidor...`);
            window.setTimeout(function() {
                setGateStage(gateId, index, status, detail);
                appendGateLog(gateId, level, `${stage.label || 'Etapa RBAC'} — ${detail}`);
                position += 1;
                advance();
            }, 120);
        }
        advance();
    }

    function executeAutomatedRouteStages(gateId, result, options, done) {
        var state = gateProgressState[gateId];
        var stockIndex = 2;
        var usersIndex = 3;
        var evidenceIndex = Math.min(4, state.stages.length - 2);
        var routeFailed = false;
        setGateStage(gateId, stockIndex, 'running', 'Consultando dados reais e permissões dos armazéns.');
        appendGateLog(gateId, 'RUN', 'Consultando a API autenticada de CDC Estoque...');
        frappe.call({
            method: 'cdc_theme.api.get_stock_dashboard_data',
            args: {selected_unit: 'All', period: 'quarter', entry_type: 'receipt', table_type: 'all'},
            callback: function(stockResponse) {
                var stock = stockResponse && stockResponse.message;
                routeFailed = !stock;
                setGateStage(gateId, stockIndex, stock ? 'passed' : 'failed', stock
                    ? `Resposta real: ${stock.total_items || 0} itens e ${stock.total_warehouses || 0} armazéns.`
                    : 'A API não retornou dados para montar CDC Estoque.');
                appendGateLog(gateId, stock ? 'PASS' : 'FAIL', stock
                    ? `CDC Estoque respondeu: ${stock.total_items || 0} itens e ${stock.total_warehouses || 0} armazéns.`
                    : 'CDC Estoque não retornou dados para montar a página.');
                setGateStage(gateId, usersIndex, 'running', 'Consultando usuários reais e filtros permitidos.');
                frappe.call({
                    method: 'cdc_theme.api.get_users_dashboard_data',
                    args: {selected_project: 'All', selected_warehouse: 'All'},
                    callback: function(usersResponse) {
                        var users = usersResponse && usersResponse.message;
                        routeFailed = routeFailed || !users;
                        setGateStage(gateId, usersIndex, users ? 'passed' : 'failed', users
                            ? `Resposta real: ${(users.summary || {}).total || 0} usuários.`
                            : 'A API não retornou dados para montar CDC Usuários.');
                        appendGateLog(gateId, users ? 'PASS' : 'FAIL', users
                            ? `CDC Usuários respondeu: ${(users.summary || {}).total || 0} usuários.`
                            : 'CDC Usuários não retornou dados para montar a página.');
                        setGateStage(gateId, evidenceIndex, 'running', 'Consolidando APIs verificadas e a dependência externa da CI.');
                        setGateStage(gateId, evidenceIndex, routeFailed ? 'failed' : resultProgressStatus(result.check.status), result.check.evidence);
                        finishGateRun(gateId, result, routeFailed, options, done);
                    },
                    error: function() {
                        routeFailed = true;
                        setGateStage(gateId, usersIndex, 'failed', 'Falha autenticada ao consultar CDC Usuários.');
                        appendGateLog(gateId, 'FAIL', 'Falha autenticada ao consultar CDC Usuários.');
                        setGateStage(gateId, evidenceIndex, 'failed', 'As APIs obrigatórias não foram concluídas.');
                        finishGateRun(gateId, result, true, options, done);
                    }
                });
            },
            error: function() {
                setGateStage(gateId, stockIndex, 'failed', 'Falha autenticada ao consultar CDC Estoque.');
                appendGateLog(gateId, 'FAIL', 'Falha autenticada ao consultar CDC Estoque.');
                finishGateRun(gateId, result, true, options, done);
            }
        });
    }

    function executeGate(gateId, options, done) {
        options = options || {};
        var check = findCheck(gateId);
        if (!check) {
            if (typeof done === 'function') done(new Error('unknown-gate'));
            return;
        }
        runningGateId = gateId;
        resetGateProgress(check, false);
        startGateConsole(gateId, `${options.fromSuite ? 'Execução sequencial' : 'Execução individual'} autenticada do teste ${gateId}.`);
        setExecutionButtonState();
        setGateStage(gateId, 0, 'running', 'Preparando contexto, identificação do teste e solicitação autenticada.');
        appendExecutionLog('RUN', `Executando ${check.title}...`);
        appendGateLog(gateId, 'RUN', 'Preparando a solicitação e aguardando o servidor...');
        frappe.call({
            method: 'cdc_theme.api.run_cdc_quality_gate',
            args: {gate_id: gateId},
            callback: function(response) {
                var result = response && response.message;
                if (!result || !result.check) {
                    setGateStage(gateId, 0, 'failed', 'O servidor não retornou o gate solicitado.');
                    appendExecutionLog('FAIL', `O teste ${gateId} não retornou resultado.`);
                    finishGateConsole(gateId, 'FALHOU', 'O servidor não retornou o resultado do gate.');
                    completeGateProgress(gateId, 'failed');
                    runningGateId = null;
                    setExecutionButtonState();
                    if (typeof done === 'function') done(new Error('empty-result'));
                    return;
                }
                setGateStage(gateId, 0, 'passed', 'Contexto preparado e resposta recebida do servidor.');
                setGateStage(gateId, 1, 'running', 'Confirmando autorização administrativa da execução.');
                setGateStage(gateId, 1, 'passed', 'Permissão System Manager confirmada pelo endpoint protegido.');
                updateSingleGate(result.check, result.checked_at);
                appendExecutionLog(
                    result.check.status === 'passed' ? 'PASS' : (result.check.status === 'blocked' ? 'BLOCK' : 'WARN'),
                    `${result.check.title} — ${result.check.evidence}`
                );
                appendGateLog(
                    gateId,
                    result.check.status === 'passed' ? 'PASS' : (result.check.status === 'blocked' ? 'BLOCK' : 'WARN'),
                    result.check.evidence
                );
                if (gateId === 'warehouse-rbac') {
                    executeWarehouseRbacStages(gateId, result, options, done);
                } else if (gateId === 'automated-tests') {
                    executeAutomatedRouteStages(gateId, result, options, done);
                } else {
                    finishGenericEvidence(gateId, result, options, done);
                }
            },
            error: function() {
                setGateStage(gateId, 0, 'failed', 'Falha de comunicação durante a preparação.');
                appendExecutionLog('FAIL', `Falha de comunicação ao executar o teste ${gateId}.`);
                finishGateConsole(gateId, 'FALHOU', 'Falha de comunicação com o servidor.');
                completeGateProgress(gateId, 'failed');
                runningGateId = null;
                setExecutionButtonState();
                if (typeof done === 'function') done(new Error('request-failed'));
            }
        });
    }

    function runFinalDiagnostics(dashboard, failed) {
        appendExecutionLog('RUN', 'Finalizando com diagnósticos de banco, Redis, app, assets, workspaces e logs...');
        frappe.call({
            method: 'cdc_theme.api.get_cdc_admin_diagnostics',
            callback: function(response) {
                var diagnostics = response && response.message;
                if (!diagnostics) {
                    appendExecutionLog('FAIL', 'Os diagnósticos administrativos não retornaram resultado.');
                    finishVisibleExecution(dashboard, latestDashboardData, true);
                    return;
                }
                (diagnostics.checks || []).forEach(function(check) {
                    appendExecutionLog(check.status === 'ok' ? 'PASS' : 'FAIL', `${check.label} — ${check.detail}`);
                });
                var summary = diagnostics.summary || {};
                appendExecutionLog('INFO', `Diagnósticos finais: ${summary.ok || 0}/${summary.total || 0} saudáveis; ${summary.errors || 0} erros.`);
                finishVisibleExecution(dashboard, latestDashboardData, failed || Number(summary.errors || 0) > 0);
            },
            error: function() {
                appendExecutionLog('FAIL', 'Falha de comunicação nos diagnósticos administrativos finais.');
                finishVisibleExecution(dashboard, latestDashboardData, true);
            }
        });
    }

    function runVisibleTestExecution() {
        if (executionRunning || runningGateId) {
            frappe.show_alert({message: __('Os testes já estão em execução.'), indicator: 'orange'}, 3);
            return;
        }
        var dashboard = document.getElementById('cdc-tests-dashboard');
        var checks = (latestDashboardData && latestDashboardData.checks) || [];
        if (!dashboard || !isTestsRoute() || !checks.length) return;
        executionRunning = true;
        progressMode = 'suite';
        executionStartedAt = performance.now();
        executionLogs = [];
        gateExecutionLogs = Object.create(null);
        gateExecutionStatus = Object.create(null);
        gateProgressState = Object.create(null);
        checks.forEach(function(check) {
            gateExecutionStatus[check.id] = 'AGUARDANDO';
            resetGateProgress(check, true);
        });
        renderDashboard(dashboard, latestDashboardData);
        appendExecutionLog('START', 'Execução sequencial autenticada dos 10 testes iniciada.');
        appendExecutionLog('INFO', 'Cada estação avançará somente após a operação real correspondente responder.');
        var index = 0;
        var failed = false;

        function nextGate() {
            if (!isTestsRoute()) {
                executionRunning = false;
                runningGateId = null;
                return;
            }
            if (index >= checks.length) {
                runningGateId = null;
                syncProgressUI();
                var summary = latestDashboardData.summary || {};
                appendExecutionLog('INFO', `Resultado dos gates: ${summary.passed || 0} aprovados, ${summary.warnings || 0} atenções e ${summary.blocked || 0} bloqueios.`);
                runFinalDiagnostics(dashboard, failed);
                return;
            }
            var check = checks[index++];
            executeGate(check.id, {fromSuite: true}, function(error) {
                failed = failed || !!error;
                nextGate();
            });
        }
        nextGate();
    }

    function runSingleGate(gateId) {
        if (executionRunning || runningGateId) {
            frappe.show_alert({message: __('Aguarde a execução atual terminar.'), indicator: 'orange'}, 3);
            return;
        }
        progressMode = 'single';
        executeGate(gateId, {fromSuite: false}, function() {
            runningGateId = null;
            setExecutionButtonState();
            syncProgressUI(gateId);
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
        var gateId = button.getAttribute('data-cdc-action-gate') || 'theme-integrity';
        if (action !== 'repair_theme') return;
        frappe.confirm(
            __('Reconciliar as workspaces CDC e limpar os caches do tema agora?'),
            function() {
                button.disabled = true;
                progressMode = 'single';
                runningGateId = gateId;
                var repairCheck = findCheck(gateId);
                if (repairCheck) resetGateProgress(repairCheck, false);
                startGateConsole(gateId, 'Reparo controlado do tema solicitado pelo usuário.');
                setGateStage(gateId, 0, 'running', 'Preparando a reconciliação controlada do tema.');
                appendGateLog(gateId, 'RUN', 'Reconciliando workspaces, caches e assets no servidor...');
                frappe.call({
                    method: 'cdc_theme.api.run_cdc_admin_action',
                    args: {action: action},
                    callback: function(response) {
                        var result = response && response.message;
                        if (!result || !result.ok) {
                            button.disabled = false;
                            setGateStage(gateId, 0, 'failed', 'O servidor não confirmou o reparo solicitado.');
                            completeGateProgress(gateId, 'failed');
                            runningGateId = null;
                            finishGateConsole(gateId, 'FALHOU', 'O servidor não confirmou o reparo.');
                            frappe.msgprint(__('O reparo do tema não foi confirmado pelo servidor.'));
                            return;
                        }
                        setGateStage(gateId, 0, 'passed', 'Solicitação preparada e processada pelo servidor.');
                        setGateStage(gateId, 1, 'running', 'Confirmando autorização administrativa.');
                        setGateStage(gateId, 1, 'passed', 'Permissão System Manager confirmada.');
                        button.textContent = 'Revalidando tema...';
                        var repairSummary = result.diagnostics && result.diagnostics.summary;
                        if (repairSummary) {
                            appendExecutionLog(
                                Number(repairSummary.errors || 0) === 0 ? 'PASS' : 'WARN',
                                `Pós-reparo no servidor: ${repairSummary.ok || 0}/${repairSummary.total || 0} diagnósticos saudáveis.`
                            );
                            appendGateLog(gateId, Number(repairSummary.errors || 0) === 0 ? 'PASS' : 'WARN', `Servidor: ${repairSummary.ok || 0}/${repairSummary.total || 0} diagnósticos saudáveis.`);
                        }
                        setGateStage(gateId, 2, 'running', 'Reconciliando assets, workspaces e caches no servidor.');
                        setGateStage(gateId, 2, repairSummary && Number(repairSummary.errors || 0) > 0 ? 'warning' : 'passed', repairSummary
                            ? `${repairSummary.ok || 0}/${repairSummary.total || 0} diagnósticos saudáveis após o reparo.`
                            : 'Servidor reconciliado; diagnóstico detalhado indisponível.');
                        if (result.repair_complete === false) {
                            if (result.theme_gate) updateSingleGate(result.theme_gate, null);
                            var pendingEvidence = result.theme_gate && result.theme_gate.evidence
                                ? result.theme_gate.evidence
                                : 'O servidor não confirmou a integridade dos assets.';
                            setGateStage(gateId, 3, 'warning', 'A limpeza de caches não resolve a pendência identificada nos assets publicados.');
                            setGateStage(gateId, 4, 'failed', pendingEvidence);
                            completeGateProgress(gateId, 'failed');
                            appendExecutionLog('WARN', `Reparo parcial: ${pendingEvidence}`);
                            appendGateLog(gateId, 'WARN', `Reparo no servidor necessário — ${pendingEvidence}`);
                            runningGateId = null;
                            finishGateConsole(gateId, 'PENDENTE', 'O reparo pelo ERP foi concluído, mas o gate 9 continua pendente e exige ação no servidor.');
                            button.disabled = false;
                            button.textContent = 'Reparar tema e caches';
                            renderGateResult(gateId, true);
                            frappe.msgprint(__(result.message));
                            return;
                        }
                        setGateStage(gateId, 3, 'running', 'Limpando o estado local e preparando a remontagem SPA.');
                        appendExecutionLog('REPAIR', 'Servidor reconciliado; limpando o estado do navegador e revalidando os assets...');
                        appendGateLog(gateId, 'REPAIR', 'Servidor reconciliado; limpando o estado local e revalidando assets...');
                        repairBrowserThemeState().then(function() {
                            appendExecutionLog('DONE', 'Reparo concluído. Recarregando o Desk para remontar as páginas CDC.');
                            setGateStage(gateId, 3, 'passed', 'Estado local limpo; o watchdog será revalidado após recarregar.');
                            setGateStage(gateId, 4, 'running', 'Consolidando o resultado do reparo.');
                            setGateStage(gateId, 4, 'passed', 'Reparo concluído; o Desk será recarregado.');
                            completeGateProgress(gateId, 'passed');
                            runningGateId = null;
                            finishGateConsole(gateId, 'APROVADO', 'Reparo concluído; o Desk será recarregado.');
                            frappe.show_alert({message: __(result.message + ' O Desk será recarregado.'), indicator: 'green'}, 6);
                            button.disabled = false;
                            button.textContent = 'Reparar tema e caches';
                            window.setTimeout(function() { window.location.reload(); }, 1800);
                        }).catch(function() {
                            appendExecutionLog('WARN', 'O navegador não confirmou toda a limpeza; o Desk ainda será recarregado.');
                            setGateStage(gateId, 3, 'warning', 'O navegador não confirmou toda a limpeza local.');
                            setGateStage(gateId, 4, 'warning', 'Recarregamento necessário para concluir a validação.');
                            completeGateProgress(gateId, 'warning');
                            runningGateId = null;
                            finishGateConsole(gateId, 'ATENÇÃO', 'O navegador não confirmou toda a limpeza; o Desk será recarregado.');
                            button.disabled = false;
                            button.textContent = 'Reparar tema e caches';
                            window.setTimeout(function() { window.location.reload(); }, 1800);
                        });
                    },
                    error: function() {
                        button.disabled = false;
                        setGateStage(gateId, 0, 'failed', 'Falha de comunicação durante o reparo.');
                        completeGateProgress(gateId, 'failed');
                        runningGateId = null;
                        finishGateConsole(gateId, 'FALHOU', 'Falha de comunicação durante o reparo.');
                        frappe.msgprint(__('Falha ao executar o reparo controlado do tema.'));
                    }
                });
            }
        );
    });
    function schedule() {
        generation += 1;
        [0, 200, 700].forEach(function(delay) { window.setTimeout(function() { load(false); }, delay); });
    }
    $(document).ready(schedule);
    $(document).on('page-change', schedule);
    if (window.frappe && frappe.router && frappe.router.on) frappe.router.on('change', schedule);
})();
