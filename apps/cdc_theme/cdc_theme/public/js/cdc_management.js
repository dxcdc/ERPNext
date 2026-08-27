(function() {
    'use strict';

    var states = {};
    var PAGE_CONFIG = {
        groups: {
            title: 'CDC Grupos',
            subtitle: 'Organização, utilização e valor do catálogo por grupo de itens',
            eyebrow: 'Estrutura do catálogo',
            icon: '🏷️',
            nativeLabel: 'Abrir grupos',
            emptySearch: 'Pesquisar grupo'
        },
        items: {
            title: 'CDC Itens',
            subtitle: 'Disponibilidade, valor e situações que exigem atenção',
            eyebrow: 'Saúde dos itens',
            icon: '📦',
            nativeLabel: 'Abrir itens',
            emptySearch: 'Código ou nome do item'
        },
        warehouses: {
            title: 'CDC Armazém',
            subtitle: 'Distribuição, movimentações e riscos nos armazéns permitidos',
            eyebrow: 'Posição do estoque',
            icon: '🏭',
            nativeLabel: 'Abrir armazéns',
            emptySearch: 'Nome ou código do armazém'
        }
    };

    function escapeHTML(value) {
        var node = document.createElement('div');
        node.textContent = value === null || value === undefined ? '' : String(value);
        return node.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function number(value, decimals) {
        return Number(value || 0).toLocaleString('pt-BR', {
            minimumFractionDigits: decimals || 0,
            maximumFractionDigits: decimals === undefined ? 0 : decimals
        });
    }

    function money(value) {
        return Number(value || 0).toLocaleString('pt-BR', {
            style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2
        });
    }

    function metric(value, format) {
        if (format === 'currency') return money(value);
        if (format === 'quantity') return number(value, 2);
        return number(value, 0);
    }

    function optionHTML(value, label, selected) {
        return `<option value="${escapeHTML(value)}"${String(value) === String(selected) ? ' selected' : ''}>${escapeHTML(label)}</option>`;
    }

    function queryContext() {
        var params = new URLSearchParams(window.location.search || '');
        return {
            search: params.get('search') || '',
            company: params.get('company') || '',
            selected_project: params.get('project') || 'All',
            selected_warehouse: params.get('warehouse') || 'All',
            selected_group: params.get('item_group') || 'All',
            period_days: params.get('period') || '30'
        };
    }

    function renderSkeleton(dashboard, config) {
        dashboard.innerHTML = `${window._cdc_get_breadcrumb_html ? window._cdc_get_breadcrumb_html(config.title.replace('CDC ', ''), 'Resumo gerencial') : ''}
            <div class="cdc-management-shell">
                <section class="cdc-management-hero is-loading">
                    <div class="cdc-management-hero-icon">${config.icon}</div>
                    <div><span>${escapeHTML(config.eyebrow)}</span><h1>${escapeHTML(config.title)}</h1><p>Consultando dados reais e permissões do usuário...</p></div>
                </section>
                <div class="cdc-management-skeleton-cards">${'<i></i>'.repeat(5)}</div>
                <div class="cdc-management-skeleton-grid"><i></i><i></i></div>
            </div>`;
    }

    function renderFailure(dashboard, config, message) {
        dashboard.dataset.loaded = 'error';
        dashboard.innerHTML = `${window._cdc_get_breadcrumb_html ? window._cdc_get_breadcrumb_html(config.title.replace('CDC ', ''), 'Resumo gerencial') : ''}
            <div class="cdc-management-shell">
                <div class="cdc-management-error" role="alert">
                    <strong>Não foi possível carregar o resumo gerencial.</strong>
                    <p>${escapeHTML(message || 'A consulta não respondeu. A fonte oficial continua disponível.')}</p>
                    <div><button type="button" class="btn btn-primary" data-cdc-manager-retry>Tentar novamente</button>
                    <button type="button" class="btn btn-default" data-cdc-manager-native>Abrir lista oficial</button></div>
                </div>
            </div>`;
        bindActions(dashboard, config, null);
    }

    function renderCards(cards) {
        return (cards || []).map(function(card) {
            var clickable = card.focus ? ' is-clickable' : '';
            return `<button type="button" class="cdc-management-card is-${escapeHTML(card.status || 'info')}${clickable}" data-cdc-manager-focus="${escapeHTML(card.focus || '')}"${card.focus ? '' : ' disabled'}>
                <span>${escapeHTML(card.label)}</span>
                <strong>${escapeHTML(metric(card.value, card.format))}</strong>
                <small>${escapeHTML(card.description || '')}</small>
            </button>`;
        }).join('');
    }

    function renderChart(chart) {
        var rows = chart.rows || [];
        var maxValue = Math.max.apply(null, rows.reduce(function(values, row) {
            values.push(Math.abs(Number(row.value || 0)));
            if (chart.kind === 'paired') values.push(Math.abs(Number(row.secondary || 0)));
            return values;
        }, [1]));
        var isCurrency = chart.kind === 'bar-currency';
        var body = rows.length ? rows.map(function(row) {
            var primary = Math.max(Math.abs(Number(row.value || 0)) / maxValue * 100, row.value ? 2 : 0);
            var secondary = Math.max(Math.abs(Number(row.secondary || 0)) / maxValue * 100, row.secondary ? 2 : 0);
            var primaryText = isCurrency ? money(row.value) : number(row.value, chart.kind === 'paired' ? 2 : 0);
            return `<div class="cdc-management-chart-row">
                <span title="${escapeHTML(row.label)}">${escapeHTML(row.label)}</span>
                <div class="cdc-management-chart-track">
                    <i class="is-primary" style="width:${primary.toFixed(2)}%"></i>
                    ${chart.kind === 'paired' ? `<i class="is-secondary" style="width:${secondary.toFixed(2)}%"></i>` : ''}
                </div>
                <strong>${escapeHTML(primaryText)}${chart.kind === 'paired' ? ` <em>/ ${escapeHTML(number(row.secondary, 2))}</em>` : ''}</strong>
            </div>`;
        }).join('') : '<div class="cdc-management-empty">Sem dados para este gráfico.</div>';
        return `<article class="cdc-management-chart">
            <header><h2>${escapeHTML(chart.title)}</h2>${chart.kind === 'paired' ? '<small><b></b> Entradas <b class="is-exit"></b> Saídas</small>' : ''}</header>
            <div class="cdc-management-chart-body">${body}</div>
        </article>`;
    }

    function renderAlerts(alerts) {
        return (alerts || []).map(function(alert) {
            return `<button type="button" class="cdc-management-alert is-${escapeHTML(alert.tone || 'info')}" data-cdc-manager-focus="${escapeHTML(alert.focus || '')}">
                <i aria-hidden="true"></i><span><strong>${escapeHTML(alert.title)}</strong><small>${escapeHTML(alert.description)}</small></span>
                ${alert.focus ? '<em>Ver recorte →</em>' : ''}
            </button>`;
        }).join('');
    }

    function tableCell(column, row) {
        var value = row[column.key];
        if (column.format === 'currency') return money(value);
        if (column.format === 'quantity') return number(value, 2);
        if (column.format === 'number') return number(value, 0);
        if (column.format === 'status') return `<span class="cdc-management-status is-${escapeHTML(row.status_key || 'normal')}">${escapeHTML(value)}</span>`;
        return escapeHTML(value === undefined || value === null ? '—' : value);
    }

    function renderTable(table, page) {
        var columns = table.columns || [];
        var rows = table.rows || [];
        var header = columns.map(function(column) { return `<th>${escapeHTML(column.label)}</th>`; }).join('');
        var body = rows.map(function(row) {
            var cells = columns.map(function(column) { return `<td>${tableCell(column, row)}</td>`; }).join('');
            return `<tr data-cdc-manager-row data-status="${escapeHTML(row.status_key || '')}" data-active="${row.disabled ? '0' : '1'}" data-used="${Number(row.active_items || 0) > 0 ? '1' : '0'}" data-positive="${Number(row.quantity || 0) > 0 ? '1' : '0'}" data-movement="${String(row.movement || '').indexOf('Não') === 0 ? '0' : '1'}">
                ${cells}<td><button type="button" class="btn btn-xs btn-default" data-cdc-manager-open="${escapeHTML(row.name)}">Abrir</button></td>
            </tr>`;
        }).join('');
        return `<section class="cdc-management-table-card">
            <header><div><h2>Resumo prioritário</h2><p>Até 30 registros ordenados por atenção e relevância.</p></div><span data-cdc-manager-table-focus></span></header>
            <div class="cdc-management-table-wrap"><table><thead><tr>${header}<th>Ação</th></tr></thead><tbody>${body || `<tr><td colspan="${columns.length + 1}">Nenhum registro corresponde ao contexto atual.</td></tr>`}</tbody></table></div>
            <footer><button type="button" class="btn btn-default" data-cdc-manager-native>Ver lista completa</button><small>Fonte oficial do ERPNext; nenhuma informação é simulada.</small></footer>
        </section>`;
    }

    function warehouseOptions(filters) {
        var project = filters.selected_project || 'All';
        var company = filters.selected_company || '';
        return (filters.warehouses || []).filter(function(row) {
            return (project === 'All' || row.project === project) && (!company || row.company === company);
        });
    }

    function renderDashboard(dashboard, config, data) {
        var filters = data.filters || {};
        var companyOptions = optionHTML('', 'Todas as empresas', filters.selected_company) + (filters.companies || []).map(function(value) {
            return optionHTML(value, value, filters.selected_company);
        }).join('');
        var projectOptions = optionHTML('All', 'Todos os projetos', filters.selected_project) + (filters.projects || []).map(function(value) {
            return optionHTML(value.value, value.label, filters.selected_project);
        }).join('');
        var warehouses = optionHTML('All', 'Todos os armazéns permitidos', filters.selected_warehouse) + warehouseOptions(filters).map(function(value) {
            return optionHTML(value.name, value.name, filters.selected_warehouse);
        }).join('');
        var groups = optionHTML('All', 'Todos os grupos', filters.selected_group) + (filters.groups || []).map(function(value) {
            return optionHTML(value, value, filters.selected_group);
        }).join('');
        dashboard.dataset.loaded = '1';
        dashboard.innerHTML = `${window._cdc_get_breadcrumb_html ? window._cdc_get_breadcrumb_html(config.title.replace('CDC ', ''), 'Resumo gerencial') : ''}
            <div class="cdc-management-shell">
                <section class="cdc-management-hero">
                    <div class="cdc-management-hero-icon" aria-hidden="true">${config.icon}</div>
                    <div><span>${escapeHTML(config.eyebrow)}</span><h1>${escapeHTML(config.title)}</h1><p>${escapeHTML(config.subtitle)}</p></div>
                    <div class="cdc-management-hero-actions"><small>Atualizado em ${escapeHTML(data.updated_at)}</small><button type="button" class="btn btn-primary" data-cdc-manager-native>${escapeHTML(config.nativeLabel)}</button><button type="button" class="btn btn-default" data-cdc-manager-refresh>↻ Atualizar</button></div>
                </section>
                <section class="cdc-management-filters" aria-label="Filtros gerenciais">
                    <label class="is-search"><span>Pesquisar</span><input type="search" data-cdc-manager-search value="${escapeHTML(filters.search || '')}" placeholder="${escapeHTML(config.emptySearch)}"></label>
                    <label><span>Empresa</span><select data-cdc-manager-company>${companyOptions}</select></label>
                    <label><span>Projeto</span><select data-cdc-manager-project>${projectOptions}</select></label>
                    <label><span>Armazém</span><select data-cdc-manager-warehouse>${warehouses}</select></label>
                    <label><span>Grupo</span><select data-cdc-manager-group>${groups}</select></label>
                    <label><span>Movimentações</span><select data-cdc-manager-period>${optionHTML('7', '7 dias', String(filters.period_days))}${optionHTML('30', '30 dias', String(filters.period_days))}${optionHTML('90', '90 dias', String(filters.period_days))}</select></label>
                    <button type="button" class="btn btn-primary" data-cdc-manager-apply>Aplicar</button>
                    <button type="button" class="btn btn-default" data-cdc-manager-clear>Limpar</button>
                </section>
                <div class="cdc-management-scope"><strong>${escapeHTML(filters.scope_label)}</strong><span>O período altera movimentações; saldos e valores representam a posição atual.</span></div>
                <p class="cdc-management-insight">${escapeHTML(data.insight)}</p>
                <section class="cdc-management-cards">${renderCards(data.cards)}</section>
                <section class="cdc-management-charts">${(data.charts || []).map(renderChart).join('')}</section>
                <section class="cdc-management-attention"><header><h2>Atenções do contexto</h2><p>Indicadores objetivos calculados com dados reais.</p></header><div>${renderAlerts(data.alerts)}</div></section>
                ${renderTable(data.table || {}, data.dashboard_type)}
            </div>`;
        dashboard._cdcManagementData = data;
        bindActions(dashboard, config, data);
    }

    function inputValue(dashboard, selector) {
        var input = dashboard.querySelector(selector);
        return input ? String(input.value || '').trim() : '';
    }

    function selectedContext(dashboard) {
        return {
            search: inputValue(dashboard, '[data-cdc-manager-search]'),
            company: inputValue(dashboard, '[data-cdc-manager-company]'),
            selected_project: inputValue(dashboard, '[data-cdc-manager-project]') || 'All',
            selected_warehouse: inputValue(dashboard, '[data-cdc-manager-warehouse]') || 'All',
            selected_group: inputValue(dashboard, '[data-cdc-manager-group]') || 'All',
            period_days: inputValue(dashboard, '[data-cdc-manager-period]') || '30'
        };
    }

    function updateURL(context) {
        var params = new URLSearchParams();
        if (context.search) params.set('search', context.search);
        if (context.company) params.set('company', context.company);
        if (context.selected_project !== 'All') params.set('project', context.selected_project);
        if (context.selected_warehouse !== 'All') params.set('warehouse', context.selected_warehouse);
        if (context.selected_group !== 'All') params.set('item_group', context.selected_group);
        if (String(context.period_days) !== '30') params.set('period', context.period_days);
        var query = params.toString();
        window.history.replaceState(window.history.state, '', window.location.pathname + (query ? '?' + query : ''));
    }

    function openNative(config, context) {
        var filters = {};
        if (config.page === 'groups') {
            if (context.selected_group !== 'All') filters.name = context.selected_group;
            if (context.search) filters.name = ['like', '%' + context.search + '%'];
            frappe.set_route('List', 'Item Group', 'List', filters);
        } else if (config.page === 'items') {
            filters.disabled = 0;
            if (context.selected_group !== 'All') filters.item_group = context.selected_group;
            if (context.search) filters.name = ['like', '%' + context.search + '%'];
            frappe.set_route('List', 'Item', 'List', filters);
        } else {
            filters.disabled = 0;
            if (context.company) filters.company = context.company;
            if (context.selected_warehouse !== 'All') filters.name = context.selected_warehouse;
            else if (context.search) filters.name = ['like', '%' + context.search + '%'];
            frappe.set_route('List', 'Warehouse', 'List', filters);
        }
    }

    function openRow(page, name) {
        if (page === 'groups') {
            frappe.set_route('List', 'Item', 'List', {item_group: name, disabled: 0});
        } else if (page === 'items') {
            frappe.set_route('Form', 'Item', name);
        } else {
            frappe.set_route('Form', 'Warehouse', name);
        }
    }

    function applyFocus(dashboard, focus) {
        var rows = Array.prototype.slice.call(dashboard.querySelectorAll('[data-cdc-manager-row]'));
        rows.forEach(function(row) {
            var visible = !focus;
            if (focus === 'active') visible = row.dataset.active === '1';
            else if (focus === 'used') visible = row.dataset.used === '1';
            else if (focus === 'with_stock') visible = row.dataset.positive === '1';
            else if (focus === 'no_stock') visible = row.dataset.status === 'no_stock' || row.dataset.status === 'zero';
            else if (focus === 'no_movement') visible = row.dataset.movement === '0' || row.dataset.status === 'no_movement';
            else if (focus) visible = row.dataset.status === focus;
            row.hidden = !visible;
        });
        var label = dashboard.querySelector('[data-cdc-manager-table-focus]');
        if (label) label.innerHTML = focus ? `Recorte ativo <button type="button" data-cdc-manager-focus="">× Limpar</button>` : '';
        var table = dashboard.querySelector('.cdc-management-table-card');
        if (focus && table) table.scrollIntoView({behavior: 'smooth', block: 'start'});
    }

    function bindActions(dashboard, config, data) {
        var retry = dashboard.querySelector('[data-cdc-manager-retry]');
        if (retry) retry.addEventListener('click', function() { load(config, queryContext(), true); });
        dashboard.querySelectorAll('[data-cdc-manager-native]').forEach(function(button) {
            button.addEventListener('click', function() { openNative(config, data ? selectedContext(dashboard) : queryContext()); });
        });
        var refresh = dashboard.querySelector('[data-cdc-manager-refresh]');
        if (refresh) refresh.addEventListener('click', function() { load(config, selectedContext(dashboard), true); });
        var apply = dashboard.querySelector('[data-cdc-manager-apply]');
        if (apply) apply.addEventListener('click', function() {
            var context = selectedContext(dashboard);
            updateURL(context);
            load(config, context, true);
        });
        var search = dashboard.querySelector('[data-cdc-manager-search]');
        if (search) search.addEventListener('keydown', function(event) { if (event.key === 'Enter') apply.click(); });
        var clear = dashboard.querySelector('[data-cdc-manager-clear]');
        if (clear) clear.addEventListener('click', function() {
            var context = {search: '', company: '', selected_project: 'All', selected_warehouse: 'All', selected_group: 'All', period_days: '30'};
            updateURL(context);
            load(config, context, true);
        });
        var project = dashboard.querySelector('[data-cdc-manager-project]');
        var company = dashboard.querySelector('[data-cdc-manager-company]');
        function refreshWarehouses() {
            if (!data) return;
            var filters = Object.assign({}, data.filters, {
                selected_project: project ? project.value : 'All',
                selected_company: company ? company.value : ''
            });
            var select = dashboard.querySelector('[data-cdc-manager-warehouse]');
            var previous = select.value;
            var options = warehouseOptions(filters);
            select.innerHTML = optionHTML('All', 'Todos os armazéns permitidos', previous) + options.map(function(value) {
                return optionHTML(value.name, value.name, previous);
            }).join('');
            if (!options.some(function(value) { return value.name === previous; })) select.value = 'All';
        }
        if (project) project.addEventListener('change', refreshWarehouses);
        if (company) company.addEventListener('change', refreshWarehouses);
        dashboard.querySelectorAll('[data-cdc-manager-focus]').forEach(function(button) {
            button.addEventListener('click', function() { applyFocus(dashboard, button.dataset.cdcManagerFocus || ''); });
        });
        dashboard.querySelectorAll('[data-cdc-manager-open]').forEach(function(button) {
            button.addEventListener('click', function() { openRow(config.page, button.dataset.cdcManagerOpen); });
        });
    }

    function load(config, context, force) {
        var claim = window._cdc_claim_active_dashboard && window._cdc_claim_active_dashboard(config.dashboardId, 'section');
        if (!claim) return;
        var dashboard = claim.dashboard;
        claim.body.classList.add(config.activeClass);
        var state = states[config.dashboardId] || {serial: 0, key: '', timer: null, pending: false};
        states[config.dashboardId] = state;
        var requestKey = config.page + '|' + JSON.stringify(context);
        if (!force && dashboard.dataset.loaded === '1' && state.key === requestKey) return;
        if (!force && state.pending && state.key === requestKey) return;
        state.serial += 1;
        var serial = state.serial;
        state.key = requestKey;
        state.pending = true;
        if (state.timer) window.clearTimeout(state.timer);
        renderSkeleton(dashboard, config);
        state.timer = window.setTimeout(function() {
            if (serial !== state.serial) return;
            state.pending = false;
            var currentClaim = window._cdc_claim_active_dashboard(config.dashboardId, 'section');
            if (currentClaim) renderFailure(currentClaim.dashboard, config, 'A consulta ultrapassou 15 segundos. Tente novamente ou abra a lista oficial.');
        }, 15000);
        frappe.call({
            method: 'cdc_theme.api.get_catalog_management_dashboard_data',
            args: Object.assign({dashboard_type: config.page}, context),
            callback: function(response) {
                if (serial !== state.serial) return;
                window.clearTimeout(state.timer);
                state.timer = null;
                state.pending = false;
                var currentClaim = window._cdc_claim_active_dashboard(config.dashboardId, 'section');
                if (!currentClaim) return;
                dashboard = currentClaim.dashboard;
                currentClaim.body.classList.add(config.activeClass);
                var data = response && response.message;
                if (!data) {
                    renderFailure(dashboard, config, 'O servidor não retornou dados para este contexto.');
                    return;
                }
                renderDashboard(dashboard, config, data);
            },
            error: function(error) {
                if (serial !== state.serial) return;
                window.clearTimeout(state.timer);
                state.timer = null;
                state.pending = false;
                var currentClaim = window._cdc_claim_active_dashboard(config.dashboardId, 'section');
                if (currentClaim) renderFailure(currentClaim.dashboard, config, error && error.message ? error.message : 'Falha ao consultar o resumo gerencial.');
            }
        });
    }

    window._cdc_render_management_dashboard = function(options) {
        var base = PAGE_CONFIG[options.page];
        if (!base) return;
        var config = Object.assign({}, base, options);
        load(config, queryContext(), false);
    };

    window._cdc_remove_management_dashboard = function(options) {
        var state = states[options.dashboardId];
        if (state) {
            state.serial += 1;
            if (state.timer) window.clearTimeout(state.timer);
            delete states[options.dashboardId];
        }
        document.querySelectorAll('#' + options.dashboardId).forEach(function(node) { node.remove(); });
        document.querySelectorAll('.layout-main-section, .workspace-page-content').forEach(function(node) {
            node.classList.remove(options.activeClass);
        });
    };
})();
