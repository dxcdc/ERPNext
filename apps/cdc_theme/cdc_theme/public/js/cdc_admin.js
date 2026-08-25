(function() {
    'use strict';

    var loading = false;
    var generation = 0;

    function normalizedRoute() {
        return decodeURIComponent(window.location.pathname || '')
            .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function isAdminRoute() {
        var route = window.frappe && frappe.get_route ? frappe.get_route() : [];
        return normalizedRoute().indexOf('/app/cdc-admin') !== -1 ||
            (route || []).some(function(part) {
                return String(part).toLowerCase().replace(/\s+/g, '-') === 'cdc-admin';
            });
    }

    function escapeHTML(value) {
        var el = document.createElement('div');
        el.textContent = value === null || value === undefined ? '—' : String(value);
        return el.innerHTML;
    }

    function remove() {
        var dashboard = document.getElementById('cdc-admin-dashboard');
        if (dashboard) dashboard.remove();
        document.querySelectorAll('.layout-main-section, .workspace-page-content').forEach(function(el) {
            el.classList.remove('cdc-custom-admin-active');
        });
    }

    function statusIcon(status) {
        return status === 'ok' ? '✓' : '!';
    }

    function renderDashboard(dashboard, data) {
        var summary = data.summary || {};
        var checks = data.checks || [];
        dashboard.innerHTML = `
            ${window._cdc_get_breadcrumb_html ? window._cdc_get_breadcrumb_html('Admin', 'Diagnóstico e Correções') : ''}
            <div class="cdc-admin-shell">
                <header class="cdc-admin-header">
                    <div>
                        <span class="cdc-admin-eyebrow">Administração técnica</span>
                        <h1>CDC Admin</h1>
                        <p>Diagnósticos conhecidos e correções controladas do ambiente NextERP.</p>
                    </div>
                    <button class="btn btn-primary" data-cdc-admin-refresh>Atualizar diagnóstico</button>
                </header>

                <div class="cdc-admin-summary">
                    <article class="cdc-admin-metric is-primary"><span>Verificações</span><strong>${summary.total || 0}</strong></article>
                    <article class="cdc-admin-metric is-success"><span>Saudáveis</span><strong>${summary.ok || 0}</strong></article>
                    <article class="cdc-admin-metric is-warning"><span>Avisos</span><strong>${summary.warnings || 0}</strong></article>
                    <article class="cdc-admin-metric is-danger"><span>Falhas</span><strong>${summary.errors || 0}</strong></article>
                </div>

                <section class="cdc-admin-section">
                    <div class="cdc-admin-section-title"><div><h2>Saúde do ambiente</h2><p>Última leitura: ${escapeHTML(data.checked_at)}</p></div></div>
                    <div class="cdc-admin-check-grid">
                        ${checks.map(function(check) {
                            return `<article class="cdc-admin-check is-${check.status}">
                                <div class="cdc-admin-check-icon">${statusIcon(check.status)}</div>
                                <div class="cdc-admin-check-body"><h3>${escapeHTML(check.label)}</h3><p>${escapeHTML(check.detail)}</p></div>
                                ${check.repair ? `<button class="btn btn-xs btn-default" data-cdc-admin-action="${escapeHTML(check.repair)}">Corrigir</button>` : ''}
                            </article>`;
                        }).join('')}
                    </div>
                </section>

                <section class="cdc-admin-section">
                    <div class="cdc-admin-section-title"><div><h2>Correções rápidas</h2><p>Ações limitadas, com confirmação e sem comandos livres.</p></div></div>
                    <div class="cdc-admin-action-grid">
                        <article class="cdc-admin-action"><span class="cdc-admin-action-icon">↻</span><h3>Limpar caches</h3><p>Atualiza cache do Frappe e páginas web após mudanças no tema.</p><button class="btn btn-default" data-cdc-admin-action="clear_cache">Executar</button></article>
                        <article class="cdc-admin-action"><span class="cdc-admin-action-icon">▦</span><h3>Reparar workspaces</h3><p>Restaura Monitoramento, Testes, Grupos e Admin quando estiverem ausentes ou ocultas.</p><button class="btn btn-default" data-cdc-admin-action="repair_workspace">Executar</button></article>
                        <article class="cdc-admin-action"><span class="cdc-admin-action-icon">☀</span><h3>Reaplicar tema claro</h3><p>Corrige a preferência visual apenas do usuário conectado.</p><button class="btn btn-default" data-cdc-admin-action="apply_light_theme">Executar</button></article>
                    </div>
                </section>

                <section class="cdc-admin-terminal">
                    <div><h2>Recuperação completa</h2><p>Se backend, Redis ou frontend estiverem fora do ar, execute no terminal do servidor:</p></div>
                    <code>${escapeHTML(data.repair_command)}</code>
                    <button class="btn btn-sm btn-default" data-cdc-copy-command>Copiar comando</button>
                </section>
                <p class="cdc-admin-footnote">Acesso restrito a System Manager · usuário ${escapeHTML(data.user)}</p>
            </div>`;
    }

    function load(force) {
        if (!isAdminRoute()) { remove(); return; }
        if (loading) return;
        var body = document.querySelector('.layout-main-section') || document.querySelector('.workspace-page-content');
        if (!body) return;
        var dashboard = document.getElementById('cdc-admin-dashboard') || document.createElement('section');
        dashboard.id = 'cdc-admin-dashboard';
        if (!dashboard.parentNode) body.insertBefore(dashboard, body.firstChild);
        body.classList.add('cdc-custom-admin-active');
        if ((frappe.user_roles || []).indexOf('System Manager') === -1) {
            dashboard.innerHTML = '<div class="cdc-admin-loading is-error">Acesso restrito a administradores do sistema.</div>';
            return;
        }
        if (dashboard.dataset.loaded === '1' && !force) return;
        loading = true;
        var requestGeneration = generation;
        dashboard.innerHTML = '<div class="cdc-admin-loading">Executando diagnósticos seguros...</div>';
        frappe.call({
            method: 'cdc_theme.api.get_cdc_admin_diagnostics',
            callback: function(response) {
                loading = false;
                if (requestGeneration !== generation || !isAdminRoute()) return;
                if (!response.message) {
                    dashboard.innerHTML = '<div class="cdc-admin-loading is-error">Não foi possível carregar os diagnósticos.</div>';
                    return;
                }
                dashboard.dataset.loaded = '1';
                renderDashboard(dashboard, response.message);
            },
            error: function() { loading = false; }
        });
    }

    function runAction(action) {
        var labels = {
            clear_cache: 'limpar os caches do sistema',
            repair_workspace: 'reparar as workspaces de suporte do CDC',
            apply_light_theme: 'reaplicar o tema claro ao seu usuário'
        };
        frappe.confirm('Deseja ' + (labels[action] || 'executar esta correção') + '?', function() {
            frappe.call({
                method: 'cdc_theme.api.run_cdc_admin_action',
                args: {action: action}, freeze: true, freeze_message: 'Aplicando correção...',
                callback: function(response) {
                    if (response.message && response.message.ok) {
                        frappe.show_alert({message: response.message.message, indicator: 'green'}, 6);
                        var dashboard = document.getElementById('cdc-admin-dashboard');
                        if (dashboard) dashboard.dataset.loaded = '0';
                        load(true);
                    }
                }
            });
        });
    }

    $(document).on('click', '[data-cdc-admin-refresh]', function() { load(true); });
    $(document).on('click', '[data-cdc-admin-action]', function() { runAction(this.dataset.cdcAdminAction); });
    $(document).on('click', '[data-cdc-copy-command]', function() {
        navigator.clipboard.writeText('./scripts/reparar_tema.sh').then(function() {
            frappe.show_alert({message: 'Comando copiado.', indicator: 'green'});
        });
    });

    function schedule() {
        generation += 1;
        [0, 200, 700].forEach(function(delay) { setTimeout(function() { load(false); }, delay); });
    }
    $(document).ready(schedule);
    $(document).on('page-change', schedule);
    if (window.frappe && frappe.router && frappe.router.on) frappe.router.on('change', schedule);
})();
