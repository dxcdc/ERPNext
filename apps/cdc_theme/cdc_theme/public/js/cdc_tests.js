(function() {
    'use strict';

    var loading = false;
    var generation = 0;

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

    function removeDashboard() {
        document.querySelectorAll('#cdc-tests-dashboard').forEach(function(dashboard) { dashboard.remove(); });
        document.querySelectorAll('.layout-main-section, .workspace-page-content').forEach(function(element) {
            element.classList.remove('cdc-custom-tests-active');
        });
    }

    function renderDashboard(dashboard, data) {
        var summary = data.summary || {};
        var labels = {passed: 'Aprovado', warning: 'Atenção', blocked: 'Bloqueado'};
        var checksHTML = (data.checks || []).map(function(check) {
            var status = ['passed', 'warning', 'blocked'].indexOf(check.status) !== -1 ? check.status : 'warning';
            var actionHTML = check.action
                ? `<button type="button" class="btn btn-xs btn-default" data-cdc-tests-action="${escapeHTML(check.action)}">${escapeHTML(check.action_label || 'Executar correção')}</button>`
                : '';
            return `<article class="cdc-quality-gate is-${status}" data-quality-gate="${escapeHTML(check.id)}">
                <div class="cdc-quality-gate-status">${status === 'passed' ? '✓' : (status === 'blocked' ? '×' : '!')}</div>
                <div class="cdc-quality-gate-copy"><h3>${escapeHTML(check.title)}</h3><p>${escapeHTML(check.evidence)}</p></div>
                <div class="cdc-quality-gate-actions"><span class="cdc-quality-gate-badge">${labels[status]}</span>${actionHTML}</div>
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

                <section class="cdc-quality-gates" aria-label="Gates de qualidade para publicação">
                    ${checksHTML || '<div class="cdc-tests-state is-error">Nenhum teste retornado pelo servidor.</div>'}
                </section>
                <p class="cdc-quality-note"><strong>Recuperação do tema:</strong> o botão “Reparar tema e caches” atua quando o ERP está acessível. Se o Desk ou o backend não carregarem, use no servidor <code>./scripts/reparar_tema.sh</code>, que também verifica sintaxe, serviços e publicação dos assets.</p>
                <p class="cdc-quality-note"><strong>Política:</strong> resultados indisponíveis permanecem como atenção ou bloqueio. Esta tela não executa sincronizações externas nem publica código.</p>
            </div>`;
    }

    function load(force) {
        if (!isTestsRoute()) { removeDashboard(); return; }
        var claim = window._cdc_claim_active_dashboard && window._cdc_claim_active_dashboard('cdc-tests-dashboard', 'section');
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
                var currentClaim = window._cdc_claim_active_dashboard && window._cdc_claim_active_dashboard('cdc-tests-dashboard', 'section');
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

    $(document).on('click', '[data-cdc-tests-refresh]', function() {
        var dashboard = document.getElementById('cdc-tests-dashboard');
        if (dashboard) dashboard.dataset.loaded = '0';
        load(true);
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
                        button.disabled = false;
                        var result = response && response.message;
                        if (!result || !result.ok) {
                            frappe.msgprint(__('O reparo do tema não foi confirmado pelo servidor.'));
                            return;
                        }
                        ['cdc_catalog_project', 'cdc_catalog_warehouse'].forEach(function(key) {
                            sessionStorage.removeItem(key);
                        });
                        frappe.show_alert({message: __(result.message), indicator: 'green'}, 6);
                        var dashboard = document.getElementById('cdc-tests-dashboard');
                        if (dashboard) dashboard.dataset.loaded = '0';
                        load(true);
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
