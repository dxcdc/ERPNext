(function() {
    'use strict';

    var loading = false;
    var generation = 0;
    var ongsysLoading = false;
    var ongsysData = null;
    var ongsysFilters = {search: '', status: 'Todos', warehouse: 'Todos'};
    var selectedMappings = {};
    var ongsysPollTimer = null;

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
        if (ongsysPollTimer) window.clearTimeout(ongsysPollTimer);
        ongsysPollTimer = null;
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

    function mappingMatchesFilters(row) {
        var search = ongsysFilters.search.toLowerCase();
        var searchable = [row.cost_center_code, row.description, row.warehouse, row.evidence_order_id]
            .map(function(value) { return String(value || ''); }).join(' ').toLowerCase();
        return (!search || searchable.indexOf(search) !== -1) &&
            (ongsysFilters.status === 'Todos' || row.status === ongsysFilters.status) &&
            (ongsysFilters.warehouse === 'Todos' || row.warehouse === ongsysFilters.warehouse);
    }

    function mappingActions(row) {
        var actions = [`<button class="btn btn-xs btn-default" data-cdc-map-log="${escapeHTML(row.name)}" title="Abrir análise">+</button>`];
        if (['Ativo', 'Ativo automático', 'Ativo manual', 'Bloqueado'].indexOf(row.status) === -1) {
            actions.push(`<button class="btn btn-xs btn-default" data-cdc-map-validate="${escapeHTML(row.name)}">Validar</button>`);
        }
        if (row.status === 'Validado') {
            actions.push(`<button class="btn btn-xs btn-primary" data-cdc-map-toggle="${escapeHTML(row.name)}" data-enabled="1">Ativar</button>`);
        }
        if (row.status !== 'Bloqueado') {
            actions.push(`<button class="btn btn-xs btn-danger" data-cdc-map-toggle="${escapeHTML(row.name)}" data-enabled="0">Desativar</button>`);
        }
        if (['Ativo', 'Ativo automático', 'Ativo manual', 'Bloqueado'].indexOf(row.status) === -1) actions.push(`<button class="btn btn-xs btn-default" data-cdc-map-manual="${escapeHTML(row.name)}">Ativar manual</button>`);
        return actions.join('');
    }

    function applyMappingFilters() {
        var rows = document.querySelectorAll('[data-cdc-map-row]');
        var visible = 0;
        rows.forEach(function(row) {
            var matches = (!ongsysFilters.search || row.dataset.search.indexOf(ongsysFilters.search.toLowerCase()) !== -1) &&
                (ongsysFilters.status === 'Todos' || row.dataset.status === ongsysFilters.status) &&
                (ongsysFilters.warehouse === 'Todos' || row.dataset.warehouse === ongsysFilters.warehouse);
            row.hidden = !matches;
            if (matches) visible += 1;
        });
        var result = document.querySelector('[data-cdc-map-results]');
        if (result) result.textContent = 'Exibindo ' + visible + ' de ' + rows.length + ' mapeamentos.';
        var empty = document.querySelector('[data-cdc-map-filter-empty]');
        if (empty) empty.hidden = visible !== 0;
    }

    function renderOngsysDashboard(data) {
        var host = document.querySelector('[data-cdc-admin-ongsys]');
        if (!host) return;
        var summary = data.summary || {};
        var sync = data.sync || {};
        var discovery = data.discovery || {};
        var mappings = data.mappings || [];
        var visibleMappings = mappings.filter(mappingMatchesFilters);
        var statuses = ['Todos'].concat(Array.from(new Set(mappings.map(function(row) { return row.status; }).filter(Boolean))));
        var warehouses = ['Todos'].concat(Array.from(new Set(mappings.map(function(row) { return row.warehouse; }).filter(Boolean))).sort());
        host.innerHTML = `
            <div class="cdc-admin-section-title"><div><h2>Integração ONGSYS</h2><p>Leitura persistida em ${escapeHTML(data.checked_at)} · importador de estoque ${escapeHTML(sync.executor)}</p></div><div class="cdc-admin-ongsys-title-actions"><button class="btn btn-sm btn-default" data-cdc-analysis-toggle>Análise</button> <button class="btn btn-sm btn-default" data-cdc-ongsys-refresh>Atualizar</button> <button class="btn btn-sm btn-primary" data-cdc-ongsys-discover${['Aguardando', 'Executando'].indexOf(discovery.discovery_status) !== -1 ? ' disabled' : ''}>Validar pendentes automaticamente</button> <button class="btn btn-sm btn-default" data-cdc-ongsys-new>Novo mapeamento</button></div></div>
            <div class="cdc-admin-analysis-console" data-cdc-analysis-console hidden><pre>STATUS: ${escapeHTML(discovery.discovery_status || 'Nunca executada')}\nESTRATÉGIA: ${escapeHTML(discovery.discovery_strategy || '—')}\nCONSULTAS DIRETAS: ${escapeHTML(discovery.discovery_direct_orders || 0)}\nPÁGINAS: ${escapeHTML(discovery.discovery_pages || 0)}\nEVIDÊNCIAS: ${escapeHTML(discovery.discovery_matches || 0)}\nERROS: ${escapeHTML(discovery.discovery_error || 'Nenhum erro registrado')}</pre></div>
            <div class="cdc-admin-ongsys-summary">
                <article><span>Mapeamentos</span><strong>${summary.mappings || 0}</strong></article>
                <article><span>Ativos</span><strong>${summary.active || 0}</strong></article>
                <article><span>Pendentes</span><strong>${summary.pending || 0}</strong></article>
                <article><span>Pedidos importados</span><strong>${summary.imported_orders || 0}</strong></article>
            </div>
            <div class="cdc-admin-sync-note"><strong>Último checkpoint:</strong> ${escapeHTML(sync.last_success_at)} · ${escapeHTML(sync.last_mode)} · página ${escapeHTML(sync.last_page)}. <strong>Agendamento automático:</strong> ${sync.automatic_schedule ? 'ativo' : 'bloqueado até confirmação do executor único'}.</div>
            <div class="cdc-admin-discovery-note"><strong>Assistente automático:</strong> ${escapeHTML(discovery.discovery_status || 'Nunca executada')} · última conclusão ${escapeHTML(discovery.discovery_completed_at || '—')} · estratégia ${escapeHTML(discovery.discovery_strategy || 'não registrada')} · ${escapeHTML(discovery.discovery_direct_orders || 0)} consulta(s) direta(s), ${escapeHTML(discovery.discovery_pages || 0)} página(s), ${escapeHTML(discovery.discovery_orders || 0)} pedido(s) paginados e ${escapeHTML(discovery.discovery_matches || 0)} evidência(s). ${discovery.discovery_error ? `<small>${escapeHTML(discovery.discovery_error)}</small>` : ''}</div>
            <div class="cdc-admin-pending-note"><strong>O que significa Pendente?</strong> O vínculo veio do cadastro legado, mas ainda precisa de armazém, pedido de evidência e validação. Enquanto estiver pendente, o CSV restrito permanece como contingência. Ao desativar, o vínculo fica Bloqueado e deixa de ser usado também pela contingência.</div>
            <div class="cdc-admin-map-filters">
                <label><span>Pesquisar na tabela</span><input type="search" data-cdc-map-search value="${escapeHTML(ongsysFilters.search)}" placeholder="Código, descrição, armazém ou pedido"></label>
                <label><span>Situação</span><select data-cdc-map-status>${statuses.map(function(status) { return `<option value="${escapeHTML(status)}"${status === ongsysFilters.status ? ' selected' : ''}>${escapeHTML(status)}</option>`; }).join('')}</select></label>
                <label><span>Armazém</span><select data-cdc-map-warehouse>${warehouses.map(function(warehouse) { return `<option value="${escapeHTML(warehouse)}"${warehouse === ongsysFilters.warehouse ? ' selected' : ''}>${escapeHTML(warehouse)}</option>`; }).join('')}</select></label>
                <button class="btn btn-sm btn-default" data-cdc-map-clear>Limpar filtros</button>
            </div>
            <div class="cdc-admin-map-bulk"><p class="cdc-admin-map-results" data-cdc-map-results>Exibindo ${visibleMappings.length} de ${mappings.length} mapeamentos.</p><div><button class="btn btn-sm btn-default" data-cdc-map-validate-selected>Validar selecionados</button> <button class="btn btn-sm btn-primary" data-cdc-map-activate-selected>Ativar validados</button></div></div>
            <div class="cdc-admin-map-table-wrap"><table class="cdc-admin-map-table"><thead><tr><th class="cdc-admin-map-select"><input type="checkbox" data-cdc-map-select-all aria-label="Selecionar todos os validados"></th><th>Centro ONGSYS</th><th>Armazém</th><th>Situação</th><th>Evidência</th><th>Confiança</th><th>Ações</th></tr></thead><tbody>
                ${mappings.length ? mappings.map(function(row) { var visible = mappingMatchesFilters(row); var selectable = ['Descoberto', 'Pendente', 'Validado'].indexOf(row.status) !== -1; return `<tr data-cdc-map-row data-name="${escapeHTML(row.name)}" data-search="${escapeHTML([row.cost_center_code, row.description, row.warehouse, row.evidence_order_id].join(' ').toLowerCase())}" data-status="${escapeHTML(row.status)}" data-warehouse="${escapeHTML(row.warehouse || '')}"${visible ? '' : ' hidden'}>
                    <td class="cdc-admin-map-select"><input type="checkbox" data-cdc-map-select="${escapeHTML(row.name)}"${selectedMappings[row.name] ? ' checked' : ''}${selectable ? '' : ' disabled'} aria-label="Selecionar ${escapeHTML(row.cost_center_code)}"></td>
                    <td><strong>${escapeHTML(row.cost_center_code)}</strong><small>${escapeHTML(row.description || '')}</small></td>
                    <td>${escapeHTML(row.warehouse || 'Não selecionado')}</td><td>${mappingBadge(row.status)}</td>
                    <td>${escapeHTML(row.evidence_order_id || 'Pendente')}<small>${escapeHTML(row.evidence_order_title || '')}</small></td>
                    <td>${row.confidence !== null && row.confidence !== undefined ? escapeHTML(row.confidence) + '%' : '—'}<small>${escapeHTML(row.validation_detail || '')}</small></td>
                    <td><div class="cdc-admin-map-actions">${mappingActions(row)}</div></td>
                </tr><tr class="cdc-admin-map-log-row" data-cdc-map-log-row="${escapeHTML(row.name)}" hidden><td colspan="7"><pre>${escapeHTML(row.analysis_log || 'Nenhuma análise registrada para este armazém.')}</pre></td></tr>`; }).join('') : '<tr><td colspan="7" class="cdc-admin-map-empty">Nenhum mapeamento migrado.</td></tr>'}
                ${mappings.length ? `<tr data-cdc-map-filter-empty${visibleMappings.length ? ' hidden' : ''}><td colspan="7" class="cdc-admin-map-empty">Nenhum mapeamento corresponde aos filtros.</td></tr>` : ''}
            </tbody></table></div>`;
        if (ongsysPollTimer) window.clearTimeout(ongsysPollTimer);
        if (['Aguardando', 'Executando'].indexOf(discovery.discovery_status) !== -1) {
            ongsysPollTimer = window.setTimeout(loadOngsysDashboard, 10000);
        }
    }

    function loadOngsysDashboard() {
        if (ongsysLoading) return;
        ongsysLoading = true;
        var refreshButton = document.querySelector('[data-cdc-ongsys-refresh]');
        if (refreshButton) { refreshButton.disabled = true; refreshButton.textContent = 'Atualizando...'; }
        frappe.call({method: 'cdc_theme.api.get_cdc_admin_ongsys_dashboard', callback: function(r) {
            ongsysLoading = false;
            if (r.message) {
                ongsysData = r.message;
                renderOngsysDashboard(ongsysData);
                frappe.show_alert({message: 'Integração ONGSYS atualizada.', indicator: 'green'}, 4);
            }
        }, error: function() {
            ongsysLoading = false;
            var host = document.querySelector('[data-cdc-admin-ongsys]');
            var loadingMessage = host && host.querySelector('.cdc-admin-loading');
            if (loadingMessage) loadingMessage.textContent = 'Cadastro ONGSYS indisponível até a migração do aplicativo.';
            if (refreshButton) { refreshButton.disabled = false; refreshButton.textContent = 'Atualizar'; }
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

    function requestAutomaticDiscovery(names) {
        names = Array.isArray(names) ? names : [];
        var scope = names.length ? names.length + ' mapeamento(s) selecionado(s)' : 'todos os mapeamentos pendentes';
        frappe.confirm('Deseja consultar o ONGSYS para ' + scope + '? Nenhum estoque será criado e nenhum vínculo será ativado.', function() {
            frappe.call({method: 'cdc_theme.api.request_ongsys_mapping_discovery', type: 'POST', args: {names: JSON.stringify(names)}, freeze: true, callback: function(r) {
                if (r.message) frappe.show_alert({message: r.message.message, indicator: 'green'}, 7);
                loadOngsysDashboard();
            }});
        });
    }

    function validateSelectedMappings() {
        var names = Object.keys(selectedMappings).filter(function(name) {
            if (!selectedMappings[name] || !ongsysData) return false;
            var row = (ongsysData.mappings || []).find(function(item) { return item.name === name; });
            return row && ['Descoberto', 'Pendente', 'Validado'].indexOf(row.status) !== -1;
        });
        if (!names.length) { frappe.msgprint('Selecione ao menos um mapeamento pendente ou validado.'); return; }
        requestAutomaticDiscovery(names);
    }

    function activateSelectedMappings() {
        var names = Object.keys(selectedMappings).filter(function(name) {
            if (!selectedMappings[name] || !ongsysData) return false;
            var row = (ongsysData.mappings || []).find(function(item) { return item.name === name; });
            return row && row.status === 'Validado' && Number(row.confidence || 0) >= 100;
        });
        if (!names.length) { frappe.msgprint('Entre os itens selecionados, nenhum está validado com 100% de confiança.'); return; }
        frappe.confirm('Ativar ' + names.length + ' mapeamento(s) validado(s)? Esta ação não cria estoque.', function() {
            frappe.call({method: 'cdc_theme.api.activate_ongsys_warehouse_mappings', type: 'POST', args: {names: JSON.stringify(names)}, freeze: true, callback: function(r) {
                selectedMappings = {};
                if (r.message) frappe.show_alert({message: r.message.message, indicator: 'green'}, 7);
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

    $(document).on('click', '[data-cdc-admin-refresh]', function(event) { event.preventDefault(); this.disabled = true; this.textContent = 'Atualizando...'; var dashboard = document.getElementById('cdc-admin-dashboard'); if (dashboard) dashboard.dataset.loaded = '0'; load(true); });
    $(document).on('click', '[data-cdc-ongsys-refresh]', function(event) { event.preventDefault(); loadOngsysDashboard(); });
    $(document).on('click', '[data-cdc-ongsys-new]', newMapping);
    $(document).on('click', '[data-cdc-ongsys-discover]', function() { requestAutomaticDiscovery([]); });
    $(document).on('change', '[data-cdc-map-select]', function() { selectedMappings[this.dataset.cdcMapSelect] = this.checked; });
    $(document).on('change', '[data-cdc-map-select-all]', function() { var checked = this.checked; document.querySelectorAll('[data-cdc-map-row]:not([hidden]) [data-cdc-map-select]:not(:disabled)').forEach(function(input) { input.checked = checked; selectedMappings[input.dataset.cdcMapSelect] = checked; }); });
    $(document).on('click', '[data-cdc-map-activate-selected]', activateSelectedMappings);
    $(document).on('click', '[data-cdc-map-validate-selected]', validateSelectedMappings);
    $(document).on('input', '[data-cdc-map-search]', function() { ongsysFilters.search = this.value; applyMappingFilters(); });
    $(document).on('change', '[data-cdc-map-status]', function() { ongsysFilters.status = this.value; applyMappingFilters(); });
    $(document).on('change', '[data-cdc-map-warehouse]', function() { ongsysFilters.warehouse = this.value; applyMappingFilters(); });
    $(document).on('click', '[data-cdc-map-clear]', function() { ongsysFilters = {search: '', status: 'Todos', warehouse: 'Todos'}; if (ongsysData) renderOngsysDashboard(ongsysData); });
    $(document).on('click', '[data-cdc-map-validate]', function() { mappingAction('cdc_theme.api.validate_ongsys_warehouse_mapping', this.dataset.cdcMapValidate); });
    $(document).on('click', '[data-cdc-map-toggle]', function() { mappingAction('cdc_theme.api.activate_ongsys_warehouse_mapping', this.dataset.cdcMapToggle, this.dataset.enabled); });
    $(document).on('click', '[data-cdc-map-log]', function() { var row = document.querySelector('[data-cdc-map-log-row="' + CSS.escape(this.dataset.cdcMapLog) + '"]'); if (row) row.hidden = !row.hidden; });
    $(document).on('click', '[data-cdc-map-manual]', function() { var name = this.dataset.cdcMapManual; frappe.prompt([{fieldname:'reason',fieldtype:'Small Text',label:'Justificativa obrigatória',reqd:1}], function(v) { frappe.call({method:'cdc_theme.api.manually_activate_ongsys_warehouse_mapping',type:'POST',args:{name:name,reason:v.reason},freeze:true,callback:loadOngsysDashboard}); }, 'Ativação manual auditada', 'Ativar'); });
    $(document).on('click', '[data-cdc-analysis-toggle]', function() { var panel = document.querySelector('[data-cdc-analysis-console]'); if (panel) panel.hidden = !panel.hidden; });
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
