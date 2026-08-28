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
        document.querySelectorAll('#cdc-admin-dashboard').forEach(function(dashboard) { dashboard.remove(); });
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

                <section class="cdc-admin-section cdc-admin-ongsys" data-cdc-admin-ongsys>
                    <div class="cdc-admin-section-title"><div><h2>Integração ONGSYS</h2><p>Mapeamentos, checkpoint e operações controladas.</p></div><button class="btn btn-sm btn-default" data-cdc-ongsys-new>Novo mapeamento</button></div>
                    <div class="cdc-admin-loading">Carregando estado persistido da integração...</div>
                </section>

                <section class="cdc-admin-section">
                    <div class="cdc-admin-section-title"><div><h2>Correções rápidas</h2><p>Ações limitadas, com confirmação e sem comandos livres.</p></div></div>
                    <div class="cdc-admin-action-grid">
                        <article class="cdc-admin-action"><span class="cdc-admin-action-icon">↻</span><h3>Limpar caches</h3><p>Atualiza cache do Frappe e páginas web após mudanças no tema.</p><button class="btn btn-default" data-cdc-admin-action="clear_cache">Executar</button></article>
                        <article class="cdc-admin-action"><span class="cdc-admin-action-icon">▦</span><h3>Reparar workspaces</h3><p>Restaura Monitoramento, Testes, Grupos, Treinamento e Admin quando estiverem ausentes ou ocultas.</p><button class="btn btn-default" data-cdc-admin-action="repair_workspace">Executar</button></article>
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
        loadOngsysDashboard();
    }

    function mappingBadge(status) {
        return '<span class="cdc-admin-map-status is-' + escapeHTML(String(status || '').toLowerCase()) + '">' + escapeHTML(status || 'Descoberto') + '</span>';
    }

    function renderOngsysDashboard(data) {
        var host = document.querySelector('[data-cdc-admin-ongsys]');
        if (!host) return;
        var summary = data.summary || {};
        var sync = data.sync || {};
        var mappings = data.mappings || [];
        host.innerHTML = `
            <div class="cdc-admin-section-title"><div><h2>Integração ONGSYS</h2><p>Leitura persistida em ${escapeHTML(data.checked_at)} · executor ${escapeHTML(sync.executor)}</p></div><div><button class="btn btn-sm btn-default" data-cdc-ongsys-refresh>Atualizar</button> <button class="btn btn-sm btn-primary" data-cdc-ongsys-new>Novo mapeamento</button></div></div>
            <div class="cdc-admin-ongsys-summary">
                <article><span>Mapeamentos</span><strong>${summary.mappings || 0}</strong></article>
                <article><span>Ativos</span><strong>${summary.active || 0}</strong></article>
                <article><span>Pendentes</span><strong>${summary.pending || 0}</strong></article>
                <article><span>Pedidos importados</span><strong>${summary.imported_orders || 0}</strong></article>
            </div>
            <div class="cdc-admin-sync-note"><strong>Último checkpoint:</strong> ${escapeHTML(sync.last_success_at)} · ${escapeHTML(sync.last_mode)} · página ${escapeHTML(sync.last_page)}. <strong>Agendamento automático:</strong> ${sync.automatic_schedule ? 'ativo' : 'bloqueado até confirmação do executor único'}.</div>
            <div class="cdc-admin-map-table-wrap"><table class="cdc-admin-map-table"><thead><tr><th>Centro ONGSYS</th><th>Armazém</th><th>Situação</th><th>Evidência</th><th>Ações</th></tr></thead><tbody>
                ${mappings.length ? mappings.map(function(row) { return `<tr>
                    <td><strong>${escapeHTML(row.cost_center_code)}</strong><small>${escapeHTML(row.description || '')}</small></td>
                    <td>${escapeHTML(row.warehouse || 'Não selecionado')}</td><td>${mappingBadge(row.status)}</td>
                    <td>${escapeHTML(row.evidence_order_id || 'Pendente')}</td>
                    <td><div class="cdc-admin-map-actions">${row.status !== 'Ativo' ? `<button class="btn btn-xs btn-default" data-cdc-map-validate="${escapeHTML(row.name)}">Validar</button>` : ''}${row.status === 'Validado' ? `<button class="btn btn-xs btn-primary" data-cdc-map-toggle="${escapeHTML(row.name)}" data-enabled="1">Ativar</button>` : ''}${row.status === 'Ativo' ? `<button class="btn btn-xs btn-default" data-cdc-map-toggle="${escapeHTML(row.name)}" data-enabled="0">Desativar</button>` : ''}</div></td>
                </tr>`; }).join('') : '<tr><td colspan="5" class="cdc-admin-map-empty">Nenhum mapeamento migrado.</td></tr>'}
            </tbody></table></div>`;
    }

    function loadOngsysDashboard() {
        frappe.call({method: 'cdc_theme.api.get_cdc_admin_ongsys_dashboard', callback: function(r) {
            if (r.message) renderOngsysDashboard(r.message);
        }, error: function() {
            var host = document.querySelector('[data-cdc-admin-ongsys]');
            if (host) host.querySelector('.cdc-admin-loading').textContent = 'Cadastro ONGSYS indisponível até a migração do aplicativo.';
        }});
    }

    function newMapping() {
        frappe.prompt([
            {fieldname: 'cost_center_code', fieldtype: 'Data', label: 'Código do centro de custo', reqd: 1},
            {fieldname: 'description', fieldtype: 'Data', label: 'Descrição observada'},
            {fieldname: 'warehouse', fieldtype: 'Link', options: 'Warehouse', label: 'Armazém NextERP', reqd: 1},
            {fieldname: 'evidence_order_id', fieldtype: 'Data', label: 'Pedido ONGSYS de evidência', reqd: 1},
            {fieldname: 'notes', fieldtype: 'Small Text', label: 'Observações'}
        ], function(values) {
            frappe.call({method: 'cdc_theme.api.save_ongsys_warehouse_mapping', type: 'POST', args: values, freeze: true, callback: function(r) {
                if (r.message) frappe.show_alert({message: r.message.message, indicator: 'green'}, 6);
                loadOngsysDashboard();
            }});
        }, 'Novo mapeamento ONGSYS', 'Salvar como pendente');
    }

    function mappingAction(method, name, enabled) {
        frappe.confirm('Confirma esta operação no mapeamento? Nenhuma movimentação de estoque será criada.', function() {
            var args = {name: name};
            if (enabled !== undefined) args.enabled = enabled;
            frappe.call({method: method, type: 'POST', args: args, freeze: true, callback: function(r) {
                if (r.message) frappe.show_alert({message: r.message.message, indicator: 'green'}, 6);
                loadOngsysDashboard();
            }});
        });
    }

    function load(force) {
        if (!isAdminRoute()) { remove(); return; }
        if (loading) return;
        var claim = window._cdc_claim_active_dashboard && window._cdc_claim_active_dashboard('cdc-admin-dashboard', 'section');
        if (!claim) return;
        var body = claim.body;
        var dashboard = claim.dashboard;
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
                var currentClaim = window._cdc_claim_active_dashboard && window._cdc_claim_active_dashboard('cdc-admin-dashboard', 'section');
                if (!currentClaim) return;
                body = currentClaim.body;
                dashboard = currentClaim.dashboard;
                body.classList.add('cdc-custom-admin-active');
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
    $(document).on('click', '[data-cdc-ongsys-refresh]', loadOngsysDashboard);
    $(document).on('click', '[data-cdc-ongsys-new]', newMapping);
    $(document).on('click', '[data-cdc-map-validate]', function() { mappingAction('cdc_theme.api.validate_ongsys_warehouse_mapping', this.dataset.cdcMapValidate); });
    $(document).on('click', '[data-cdc-map-toggle]', function() { mappingAction('cdc_theme.api.activate_ongsys_warehouse_mapping', this.dataset.cdcMapToggle, this.dataset.enabled); });
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
