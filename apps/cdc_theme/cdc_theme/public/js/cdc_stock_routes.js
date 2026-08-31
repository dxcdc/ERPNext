(function() {
    'use strict';

    var observer;
    var renderTimer;
    var requestSerial = 0;
    var activeRequestKey = '';
    var pendingDocumentContext = null;
    var pendingDocumentUntil = 0;

    var ROUTES = {
        'stock-entry-list': {
            kind: 'document',
            doctype: 'Stock Entry',
            movementField: 'stock_entry_type',
            title: 'Lançamentos de Estoque',
            subtitle: 'Indicadores e filtros aplicados à lista nativa de movimentações',
            icon: '📦'
        },
        'stock-entry-report': {
            kind: 'document',
            doctype: 'Stock Entry',
            movementField: 'stock_entry_type',
            title: 'Lançamentos no Estoque',
            subtitle: 'Indicadores e filtros aplicados ao relatório oficial de movimentações',
            icon: '📦'
        },
        'stock-reconciliation': {
            kind: 'document',
            doctype: 'Stock Reconciliation',
            movementField: 'purpose',
            title: 'Conciliação de Estoque',
            subtitle: 'Ajustes de saldo com situação documental e período de lançamento',
            icon: '⚖️'
        },
        'inventory-ledger': {
            kind: 'query-report',
            reportName: 'Livro de Inventarios - CDC',
            title: 'Livro de Inventários',
            subtitle: 'Entradas, saídas e saldo por item e armazém no período selecionado',
            icon: '📒'
        },
        'stock-balance': {
            kind: 'query-report',
            reportName: 'Balanço de Estoque - CDC',
            title: 'Balanço de Estoque',
            subtitle: 'Posição consolidada de quantidades por item, grupo e armazém',
            icon: '📊'
        }
    };

    function normalize(value) {
        return decodeURIComponent(String(value || ''))
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    function escapeHTML(value) {
        var node = document.createElement('div');
        node.textContent = value === null || value === undefined ? '' : String(value);
        return node.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function routeDefinition() {
        var route = window.frappe && frappe.get_route ? frappe.get_route() : [];
        var parts = (route || []).map(normalize);
        var path = decodeURIComponent(window.location.pathname || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        if (
            (parts[0] === 'list' && parts[1] === 'stock-entry' && parts[2] === 'report' && parts[3] === 'lancamento-no-estoque-cdc') ||
            path === '/app/stock-entry/view/report/lancamento no estoque - cdc'
        ) return Object.assign({key: 'stock-entry-report'}, ROUTES['stock-entry-report']);

        if (
            (parts[0] === 'list' && parts[1] === 'stock-entry' && parts[2] === 'list') ||
            path === '/app/stock-entry' || path === '/app/stock-entry/view/list'
        ) return Object.assign({key: 'stock-entry-list'}, ROUTES['stock-entry-list']);

        if (
            (parts[0] === 'list' && parts[1] === 'stock-reconciliation') ||
            path === '/app/stock-reconciliation' || path === '/app/stock-reconciliation/view/list'
        ) return Object.assign({key: 'stock-reconciliation'}, ROUTES['stock-reconciliation']);

        if (
            (parts[0] === 'query-report' && parts[1] === 'livro-de-inventarios-cdc') ||
            path === '/app/query-report/livro de inventarios - cdc'
        ) return Object.assign({key: 'inventory-ledger'}, ROUTES['inventory-ledger']);

        if (
            (parts[0] === 'query-report' && parts[1] === 'balanco-de-estoque-cdc') ||
            path === '/app/query-report/balanco de estoque - cdc'
        ) return Object.assign({key: 'stock-balance'}, ROUTES['stock-balance']);

        return null;
    }

    function removeDashboard() {
        requestSerial += 1;
        activeRequestKey = '';
        pendingDocumentContext = null;
        pendingDocumentUntil = 0;
        document.querySelectorAll('#cdc-stock-route-dashboard').forEach(function(node) { node.remove(); });
        document.querySelectorAll('.cdc-stock-route-native').forEach(function(node) {
            node.classList.remove('cdc-stock-route-native');
        });
        document.querySelectorAll('.cdc-stock-exact-report-active').forEach(function(node) {
            node.classList.remove('cdc-stock-exact-report-active');
        });
    }

    function claimDashboard() {
        if (typeof window._cdc_claim_active_dashboard !== 'function') return null;
        var claim = window._cdc_claim_active_dashboard('cdc-stock-route-dashboard', 'section');
        if (!claim || !claim.body || !claim.dashboard) return null;
        Array.prototype.slice.call(claim.body.children).forEach(function(child) {
            if (child !== claim.dashboard) child.classList.add('cdc-stock-route-native');
        });
        return claim;
    }

    function rawRouteValue(fieldname) {
        var params = new URLSearchParams(window.location.search || '');
        var routeOptions = window.frappe && frappe.get_route_options ? frappe.get_route_options() : (window.frappe && frappe.route_options);
        var value = params.has(fieldname) ? params.get(fieldname) : (routeOptions && routeOptions[fieldname]);
        if (typeof value === 'string' && value.trim().charAt(0) === '[') {
            try { value = JSON.parse(value); } catch (error) {}
        }
        return value;
    }

    function routeValue(fieldname) {
        var value = rawRouteValue(fieldname);
        if (Array.isArray(value)) {
            if (value.length === 2 && typeof value[0] === 'string' && ['like', '=', '>=', '<=', 'between'].indexOf(value[0].toLowerCase()) !== -1) {
                value = String(value[0]).toLowerCase() === 'between' ? '' : value[1];
            } else {
                value = value[0] || '';
            }
        }
        return value === undefined || value === null ? '' : String(value).replace(/^%|%$/g, '');
    }

    function nativeDocumentContext(definition) {
        var list = window.cur_list;
        if (!list || normalize(list.doctype) !== normalize(definition.doctype) || !list.filter_area || typeof list.filter_area.get !== 'function') {
            return null;
        }
        var managed = {};
        (list.filter_area.get() || []).forEach(function(filter) {
            if (!Array.isArray(filter) || normalize(filter[0]) !== normalize(definition.doctype)) return;
            managed[filter[1]] = {operator: String(filter[2] || '=').toLowerCase(), value: filter[3]};
        });
        function scalar(fieldname) {
            var filter = managed[fieldname];
            if (!filter) return '';
            var value = filter.value;
            if (Array.isArray(value)) value = value[0] || '';
            return String(value === undefined || value === null ? '' : value).replace(/^%|%$/g, '');
        }
        var posting = managed.posting_date;
        var fromDate = '';
        var toDate = '';
        if (posting && posting.operator === 'between' && Array.isArray(posting.value)) {
            fromDate = posting.value[0] || '';
            toDate = posting.value[1] || '';
        } else if (posting && posting.operator === '>=') {
            fromDate = scalar('posting_date');
        } else if (posting && posting.operator === '<=') {
            toDate = scalar('posting_date');
        }
        return {
            document_type: definition.doctype,
            search: scalar('name'),
            company: scalar('company'),
            from_date: fromDate || routeValue('from_date'),
            to_date: toDate || routeValue('to_date'),
            docstatus: scalar('docstatus') || routeValue('docstatus'),
            movement_type: scalar(definition.movementField) || routeValue(definition.movementField),
            warehouse: routeValue('warehouse')
        };
    }

    function getDocumentContext(definition) {
        var nativeContext = nativeDocumentContext(definition);
        var context = nativeContext || {
            document_type: definition.doctype,
            search: routeValue('name'),
            company: routeValue('company'),
            from_date: routeValue('posting_date') || routeValue('from_date'),
            to_date: routeValue('to_date'),
            docstatus: routeValue('docstatus'),
            movement_type: routeValue(definition.movementField),
            warehouse: routeValue('warehouse')
        };
        var postingDate = nativeContext ? null : rawRouteValue('posting_date');
        if (!nativeContext && Array.isArray(postingDate) && String(postingDate[0]).toLowerCase() === 'between' && Array.isArray(postingDate[1])) {
            context.from_date = postingDate[1][0] || '';
            context.to_date = postingDate[1][1] || '';
        }
        if (pendingDocumentContext && Date.now() < pendingDocumentUntil) {
            return Object.assign({}, pendingDocumentContext);
        }
        pendingDocumentContext = null;
        pendingDocumentUntil = 0;
        if (definition.key === 'stock-entry-report' && context.docstatus === '') context.docstatus = '1';
        return context;
    }

    function applyNativeDocumentFilters(definition, routeFilters) {
        var list = window.cur_list;
        if (!list || normalize(list.doctype) !== normalize(definition.doctype) || !list.filter_area) return null;
        var managedFields = ['name', 'company', 'posting_date', 'docstatus', definition.movementField];
        var preserved = typeof list.filter_area.get === 'function' ? (list.filter_area.get() || []).filter(function(filter) {
            return !Array.isArray(filter) || managedFields.indexOf(filter[1]) === -1;
        }) : [];
        var additions = Object.keys(routeFilters).map(function(fieldname) {
            var value = routeFilters[fieldname];
            var operator = '=';
            if (Array.isArray(value) && typeof value[0] === 'string') {
                operator = value[0];
                value = value[1];
            }
            return [definition.doctype, fieldname, operator, value];
        });
        return list.filter_area.clear(false).then(function() {
            return list.filter_area.add(preserved.concat(additions));
        });
    }

    function optionHTML(values, selected, emptyLabel) {
        return `<option value="">${escapeHTML(emptyLabel)}</option>` + (values || []).map(function(value) {
            return `<option value="${escapeHTML(value)}"${value === selected ? ' selected' : ''}>${escapeHTML(value)}</option>`;
        }).join('');
    }

    function number(value, decimals) {
        return Number(value || 0).toLocaleString('pt-BR', {
            minimumFractionDigits: decimals || 0,
            maximumFractionDigits: decimals || 0
        });
    }

    function card(label, value, description, status, metric) {
        return `<div class="cdc-stock-context-card ${status || 'is-info'}">
            <div class="cdc-card-label">${escapeHTML(label)}</div>
            <div class="cdc-card-value"${metric ? ` data-cdc-stock-metric="${metric}"` : ''}>${escapeHTML(value)}</div>
            <div class="cdc-card-desc">${escapeHTML(description)}</div>
        </div>`;
    }

    function breadcrumb(detail) {
        return window._cdc_get_breadcrumb_html ? window._cdc_get_breadcrumb_html('Estoque', detail) : '';
    }

    function documentCards(definition, summary) {
        if (definition.doctype === 'Stock Entry') {
            return [
                card('Resultados', number(summary.total_results), 'Documentos no contexto atual', 'is-info'),
                card('Confirmados', number(summary.submitted), 'Movimentações enviadas', 'is-status'),
                card('Rascunhos', number(summary.drafts), 'Aguardando confirmação', summary.drafts ? 'is-warning' : 'is-status'),
                card('Entradas / saídas', `${number(summary.receipts)} / ${number(summary.issues)}`, 'Recebimentos e baixas', 'is-info'),
                card('Transferências', number(summary.transfers), `${number(summary.cancelled)} cancelado(s) no contexto`, summary.cancelled ? 'is-warning' : 'is-status')
            ].join('');
        }
        return [
            card('Resultados', number(summary.total_results), 'Conciliações no contexto atual', 'is-info'),
            card('Confirmadas', number(summary.submitted), 'Ajustes enviados', 'is-status'),
            card('Rascunhos', number(summary.drafts), 'Aguardando conferência', summary.drafts ? 'is-warning' : 'is-status'),
            card('Canceladas', number(summary.cancelled), 'Documentos sem efeito contábil', summary.cancelled ? 'is-warning' : 'is-status'),
            card('Diferença confirmada', number(summary.difference_amount, 2), 'Soma dos ajustes enviados', 'is-info')
        ].join('');
    }

    function exactStockRows(rows) {
        var statusLabels = {0: 'Rascunho', 1: 'Confirmado', 2: 'Cancelado'};
        var body = (rows || []).map(function(row) {
            var purpose = row.purpose === 'Material Receipt' ? 'Entrada' :
                (row.purpose === 'Material Issue' ? 'Saída' :
                    (row.purpose === 'Material Transfer' ? 'Transferência' : row.movement_type));
            var warehouse = row.purpose === 'Material Issue' ? row.from_warehouse :
                (row.purpose === 'Material Receipt' ? row.to_warehouse : (row.from_warehouse || row.to_warehouse));
            return `<tr>
                <td><a class="cdc-doc-link" href="/app/stock-entry/${encodeURIComponent(row.name)}">${escapeHTML(row.name)}</a></td>
                <td>${escapeHTML(row.posting_date)}</td>
                <td>${escapeHTML(purpose)}</td>
                <td>${escapeHTML(warehouse || 'Registrado nas linhas')}</td>
                <td><span class="cdc-user-status ${Number(row.docstatus) === 1 ? 'is-enabled' : 'is-disabled'}">${escapeHTML(statusLabels[row.docstatus] || 'Desconhecido')}</span></td>
            </tr>`;
        }).join('');
        return `<div class="cdc-stock-exact-table-card">
            <div class="cdc-stock-exact-table-header"><h2>Documentos encontrados</h2><strong>${number((rows || []).length)}</strong></div>
            <div class="cdc-stock-exact-table-scroll"><table>
                <thead><tr><th>Documento</th><th>Data</th><th>Tipo</th><th>Armazém</th><th>Situação</th></tr></thead>
                <tbody>${body || '<tr><td colspan="5">Nenhum lançamento encontrado neste contexto.</td></tr>'}</tbody>
            </table></div>
        </div>`;
    }

    function renderDocument(definition) {
        var claim = claimDashboard();
        if (!claim) return;
        var dashboard = claim.dashboard;
        if (definition.key === 'stock-entry-report') claim.body.classList.add('cdc-stock-exact-report-active');
        var context = getDocumentContext(definition);
        var requestKey = definition.key + '|' + JSON.stringify(context);
        if (dashboard.dataset.loaded === '1' && dashboard.dataset.requestKey === requestKey) return;
        if (activeRequestKey === requestKey) return;
        activeRequestKey = requestKey;
        var serial = ++requestSerial;
        dashboard.dataset.loaded = '0';
        dashboard.dataset.requestKey = requestKey;
        dashboard.innerHTML = '<div class="cdc-stock-context-state">Carregando indicadores e filtros do estoque...</div>';

        frappe.call({
            method: 'cdc_theme.api.get_stock_document_dashboard_data',
            args: context,
            callback: function(response) {
                if (serial !== requestSerial) return;
                activeRequestKey = '';
                var current = routeDefinition();
                if (!current || current.key !== definition.key) {
                    removeDashboard();
                    return;
                }
                var currentClaim = claimDashboard();
                if (!currentClaim) return;
                dashboard = currentClaim.dashboard;
                var data = response && response.message;
                if (!data) {
                    dashboard.innerHTML = '<div class="cdc-stock-context-state is-error">Não foi possível obter os indicadores desta lista.</div>';
                    return;
                }
                var filters = data.filters || {};
                var companyOptions = optionHTML(filters.companies, filters.selected_company, 'Todas as empresas');
                var movementOptions = optionHTML(filters.movement_types, filters.selected_movement_type, 'Todos os tipos');
                var warehouseOptions = optionHTML(filters.warehouses, filters.selected_warehouse, 'Todos os armazéns permitidos');
                dashboard.innerHTML = `${breadcrumb(definition.title)}
                    <div class="cdc-stock-context-wrapper">
                        <div class="cdc-stock-context-header">
                            <div><h1>${definition.icon} ${escapeHTML(definition.title)}</h1><p>${escapeHTML(definition.subtitle)}</p></div>
                            <button type="button" class="btn btn-sm btn-default" data-cdc-stock-refresh>🔄 Atualizar indicadores</button>
                        </div>
                        <div class="cdc-stock-context-cards">${documentCards(definition, data.summary || {})}</div>
                        <div class="cdc-linked-filters cdc-stock-context-filters" aria-label="Pesquisa e filtros de ${escapeHTML(definition.title)}">
                            <label class="is-search"><span>Pesquisar documento</span><input type="search" data-cdc-stock-search value="${escapeHTML(filters.search || '')}" placeholder="Código ou identificador oficial"></label>
                            <label><span>Empresa</span><select data-cdc-stock-company>${companyOptions}</select></label>
                            <label><span>Data inicial</span><input type="date" data-cdc-stock-from value="${escapeHTML(filters.from_date || '')}"></label>
                            <label><span>Data final</span><input type="date" data-cdc-stock-to value="${escapeHTML(filters.to_date || '')}"></label>
                            <label><span>Situação</span><select data-cdc-stock-status><option value="">Todas</option><option value="0"${filters.selected_docstatus === '0' ? ' selected' : ''}>Rascunho</option><option value="1"${filters.selected_docstatus === '1' ? ' selected' : ''}>Confirmado</option><option value="2"${filters.selected_docstatus === '2' ? ' selected' : ''}>Cancelado</option></select></label>
                            <label><span>Tipo</span><select data-cdc-stock-movement>${movementOptions}</select></label>
                            ${definition.key === 'stock-entry-report' ? `<label><span>Armazém</span><select data-cdc-stock-warehouse>${warehouseOptions}</select></label>` : ''}
                            <button type="button" class="btn btn-sm btn-primary" data-cdc-stock-apply>Aplicar filtros</button>
                            <button type="button" class="btn btn-sm btn-default" data-cdc-stock-clear>Limpar filtros</button>
                        </div>
                        <p class="cdc-catalog-filter-note">${definition.key === 'stock-entry-report' ? 'Indicadores e documentos usam o mesmo período, situação e armazém exato. Entradas consideram destino; saídas consideram origem, inclusive nas linhas do lançamento.' : 'A pesquisa utiliza o identificador oficial. Cards, paginação, edição, exportação e ações permanecem ligados ao componente nativo do ERPNext.'}</p>
                        ${definition.key === 'stock-entry-report' ? exactStockRows(data.rows || []) : ''}
                    </div>`;
                dashboard.dataset.loaded = '1';
                dashboard.dataset.requestKey = requestKey;
                bindDocumentControls(dashboard, definition);
            },
            error: function(error) {
                if (serial !== requestSerial) return;
                activeRequestKey = '';
                var message = error && error.message ? error.message : 'Falha ao consultar o contexto desta lista.';
                dashboard.innerHTML = '<div class="cdc-stock-context-state is-error">' + escapeHTML(message) + '</div>';
            }
        });
    }

    function bindDocumentControls(dashboard, definition) {
        function value(selector) {
            var field = dashboard.querySelector(selector);
            return field ? field.value.trim() : '';
        }
        function apply() {
            var context = {
                document_type: definition.doctype,
                search: value('[data-cdc-stock-search]'),
                company: value('[data-cdc-stock-company]'),
                from_date: value('[data-cdc-stock-from]'),
                to_date: value('[data-cdc-stock-to]'),
                docstatus: value('[data-cdc-stock-status]'),
                movement_type: value('[data-cdc-stock-movement]'),
                warehouse: value('[data-cdc-stock-warehouse]')
            };
            if (context.from_date && context.to_date && context.from_date > context.to_date) {
                frappe.msgprint(__('A data inicial não pode ser posterior à data final.'));
                return;
            }
            var filters = {};
            if (context.search) filters.name = ['like', '%' + context.search + '%'];
            if (context.company) filters.company = context.company;
            if (context.from_date && context.to_date) filters.posting_date = ['between', [context.from_date, context.to_date]];
            else if (context.from_date) filters.posting_date = ['>=', context.from_date];
            else if (context.to_date) filters.posting_date = ['<=', context.to_date];
            if (context.docstatus !== '') filters.docstatus = Number(context.docstatus);
            if (context.movement_type) filters[definition.movementField] = context.movement_type;
            pendingDocumentContext = context;
            pendingDocumentUntil = Date.now() + 1600;
            dashboard.dataset.loaded = '0';
            if (definition.key === 'stock-entry-report') {
                renderDocument(definition);
                return;
            }
            var applied = applyNativeDocumentFilters(definition, filters);
            if (applied) {
                Promise.resolve(applied).finally(function() { scheduleRender(180); });
            } else if (definition.key === 'stock-entry-report') {
                frappe.set_route('List', 'Stock Entry', 'Report', 'Lancamento no Estoque - CDC', filters);
                scheduleRender(180);
            } else if (definition.key === 'stock-entry-list') {
                frappe.set_route('List', 'Stock Entry', 'List', filters);
                scheduleRender(180);
            } else {
                frappe.set_route('List', 'Stock Reconciliation', 'List', filters);
                scheduleRender(180);
            }
        }
        dashboard.querySelector('[data-cdc-stock-apply]').addEventListener('click', apply);
        dashboard.querySelector('[data-cdc-stock-search]').addEventListener('keydown', function(event) {
            if (event.key === 'Enter') apply();
        });
        dashboard.querySelector('[data-cdc-stock-clear]').addEventListener('click', function() {
            pendingDocumentContext = {
                document_type: definition.doctype, search: '', company: '', from_date: '',
                to_date: '', docstatus: definition.key === 'stock-entry-report' ? '1' : '', movement_type: '', warehouse: ''
            };
            pendingDocumentUntil = Date.now() + 1600;
            dashboard.dataset.loaded = '0';
            if (definition.key === 'stock-entry-report') {
                renderDocument(definition);
                return;
            }
            var cleared = applyNativeDocumentFilters(definition, {});
            if (cleared) {
                Promise.resolve(cleared).finally(function() { scheduleRender(180); });
            } else if (definition.key === 'stock-entry-report') {
                frappe.set_route('List', 'Stock Entry', 'Report', 'Lancamento no Estoque - CDC');
                scheduleRender(180);
            } else if (definition.key === 'stock-entry-list') {
                frappe.set_route('List', 'Stock Entry', 'List');
                scheduleRender(180);
            } else {
                frappe.set_route('List', 'Stock Reconciliation', 'List');
                scheduleRender(180);
            }
        });
        dashboard.querySelector('[data-cdc-stock-refresh]').addEventListener('click', function() {
            dashboard.dataset.loaded = '0';
            activeRequestKey = '';
            if (window.cur_list && typeof window.cur_list.refresh === 'function') window.cur_list.refresh();
            renderDocument(definition);
        });
    }

    function reportFilterValue(fieldname) {
        var report = window.frappe && frappe.query_report;
        var value = report && typeof report.get_filter_value === 'function' ? report.get_filter_value(fieldname) : '';
        if (value === undefined || value === null || value === '') value = new URLSearchParams(window.location.search || '').get(fieldname) || '';
        if (typeof value === 'string' && value.trim().charAt(0) === '[') {
            try { value = JSON.parse(value); } catch (error) {}
        }
        if (Array.isArray(value)) value = value[0] || '';
        return value === undefined || value === null ? '' : String(value);
    }

    function reportFilterValues(fieldname) {
        var report = window.frappe && frappe.query_report;
        var value = report && typeof report.get_filter_value === 'function' ? report.get_filter_value(fieldname) : '';
        if (value === undefined || value === null || value === '') value = new URLSearchParams(window.location.search || '').get(fieldname) || '';
        if (typeof value === 'string' && value.trim().charAt(0) === '[') {
            try { value = JSON.parse(value); } catch (error) {}
        }
        if (!Array.isArray(value)) value = value ? [value] : [];
        return value.map(String).filter(Boolean);
    }

    function getReportContext() {
        return {
            company: reportFilterValue('company'),
            from_date: reportFilterValue('from_date'),
            to_date: reportFilterValue('to_date'),
            warehouse: reportFilterValue('warehouse'),
            item_code: reportFilterValue('item_code'),
            item_group: reportFilterValue('item_group'),
            valuation_field_type: reportFilterValue('valuation_field_type') || 'Currency'
        };
    }

    function reportSummary(definition) {
        var data = (window.frappe && frappe.query_report && Array.isArray(frappe.query_report.data)) ? frappe.query_report.data : [];
        var rows = data.filter(function(row) { return row && !row.total_row; });
        var itemSet = {};
        var warehouseSet = {};
        var inQty = 0;
        var outQty = 0;
        var balanceQty = 0;
        var positive = 0;
        rows.forEach(function(row) {
            var item = row.item_code || row.item_name;
            if (item) itemSet[item] = true;
            if (row.warehouse) warehouseSet[row.warehouse] = true;
            inQty += Number(row.in_qty || 0);
            outQty += Math.abs(Number(row.out_qty || 0));
            var balance = Number(row.bal_qty !== undefined ? row.bal_qty : (row.qty_after_transaction || 0));
            balanceQty += balance;
            if (balance > 0) positive += 1;
        });
        return {
            rows: rows.length,
            items: Object.keys(itemSet).length,
            warehouses: Object.keys(warehouseSet).length,
            in_qty: inQty,
            out_qty: outQty,
            balance_qty: balanceQty,
            positive: positive
        };
    }

    function reportCards(definition, summary) {
        if (definition.key === 'stock-balance') {
            return [
                card('Linhas', number(summary.rows), 'Registros retornados pelo relatório', 'is-info', 'rows'),
                card('Itens', number(summary.items), 'Itens distintos no contexto', 'is-status', 'items'),
                card('Saldo', number(summary.balance_qty, 2), 'Quantidade consolidada exibida', 'is-info', 'balance_qty'),
                card('Entradas / saídas', `${number(summary.in_qty, 2)} / ${number(summary.out_qty, 2)}`, 'Movimentação no período', 'is-info', 'movement'),
                card('Saldos positivos', number(summary.positive), `${number(summary.warehouses)} armazém(ns)`, 'is-status', 'positive')
            ].join('');
        }
        return [
            card('Lançamentos', number(summary.rows), 'Linhas retornadas pelo relatório', 'is-info', 'rows'),
            card('Itens', number(summary.items), 'Itens distintos movimentados', 'is-status', 'items'),
            card('Armazéns', number(summary.warehouses), 'Armazéns presentes no resultado', 'is-info', 'warehouses'),
            card('Entradas', number(summary.in_qty, 2), 'Quantidade recebida no período', 'is-status', 'in_qty'),
            card('Saídas', number(summary.out_qty, 2), 'Quantidade baixada no período', summary.out_qty ? 'is-warning' : 'is-status', 'out_qty')
        ].join('');
    }

    function renderQueryReport(definition) {
        var claim = claimDashboard();
        if (!claim) return;
        var dashboard = claim.dashboard;
        var queryReport = window.frappe && frappe.query_report;
        if (!queryReport || !Array.isArray(queryReport.filters) || !queryReport.filters.length) {
            dashboard.dataset.loaded = '0';
            dashboard.innerHTML = '<div class="cdc-stock-context-state">Aguardando os filtros nativos do relatório...</div>';
            scheduleRender(220);
            return;
        }
        var context = getReportContext();
        var requestKey = definition.key + '|' + JSON.stringify(context);
        if (dashboard.dataset.loaded === '1' && dashboard.dataset.requestKey === requestKey) {
            updateReportMetrics(dashboard, definition);
            return;
        }
        if (activeRequestKey === requestKey) return;
        activeRequestKey = requestKey;
        var serial = ++requestSerial;
        dashboard.dataset.loaded = '0';
        dashboard.dataset.requestKey = requestKey;
        dashboard.innerHTML = '<div class="cdc-stock-context-state">Preparando filtros permitidos do relatório...</div>';
        frappe.call({
            method: 'cdc_theme.api.get_stock_report_filter_options',
            args: {report_key: definition.key},
            callback: function(response) {
                if (serial !== requestSerial) return;
                activeRequestKey = '';
                var current = routeDefinition();
                if (!current || current.key !== definition.key) {
                    removeDashboard();
                    return;
                }
                var currentClaim = claimDashboard();
                if (!currentClaim) return;
                dashboard = currentClaim.dashboard;
                var options = response && response.message;
                if (!options) {
                    dashboard.innerHTML = '<div class="cdc-stock-context-state is-error">Não foi possível carregar os filtros permitidos.</div>';
                    return;
                }
                dashboard._cdcPermittedWarehouses = (options.warehouses || []).slice();
                var report = window.frappe && frappe.query_report;
                var selectedWarehouses = reportFilterValues('warehouse');
                if (!selectedWarehouses.length && report && (options.warehouses || []).length) {
                    dashboard.innerHTML = '<div class="cdc-stock-context-state">Aplicando o escopo dos armazéns permitidos...</div>';
                    setNativeReportFilter(report, 'warehouse', options.warehouses);
                    var scopedRefresh = typeof report.refresh === 'function' ? report.refresh() : null;
                    Promise.resolve(scopedRefresh).finally(function() {
                        dashboard.dataset.loaded = '0';
                        scheduleRender(220);
                    });
                    return;
                }
                context = getReportContext();
                var allPermittedSelected = selectedWarehouses.length === (options.warehouses || []).length &&
                    selectedWarehouses.every(function(value) { return options.warehouses.indexOf(value) !== -1; });
                if (allPermittedSelected) context.warehouse = '';
                var companies = optionHTML(options.companies, context.company, 'Todas as empresas');
                var warehouses = optionHTML(options.warehouses, context.warehouse, 'Todos os armazéns permitidos');
                var groups = optionHTML(options.item_groups, context.item_group, 'Todos os grupos');
                var summary = reportSummary(definition);
                dashboard.innerHTML = `${breadcrumb(definition.title)}
                    <div class="cdc-stock-context-wrapper">
                        <div class="cdc-stock-context-header">
                            <div><h1>${definition.icon} ${escapeHTML(definition.title)}</h1><p>${escapeHTML(definition.subtitle)}</p></div>
                            <button type="button" class="btn btn-sm btn-default" data-cdc-stock-refresh>🔄 Executar novamente</button>
                        </div>
                        <div class="cdc-stock-context-cards" data-cdc-report-cards>${reportCards(definition, summary)}</div>
                        <div class="cdc-linked-filters cdc-stock-context-filters" aria-label="Pesquisa e filtros de ${escapeHTML(definition.title)}">
                            <label class="is-search"><span>Pesquisar item</span><input type="search" data-cdc-report-item value="${escapeHTML(context.item_code)}" placeholder="Código exato do item"></label>
                            <label><span>Empresa</span><select data-cdc-report-company>${companies}</select></label>
                            <label><span>Data inicial</span><input type="date" data-cdc-report-from value="${escapeHTML(context.from_date)}"></label>
                            <label><span>Data final</span><input type="date" data-cdc-report-to value="${escapeHTML(context.to_date)}"></label>
                            <label><span>Armazém</span><select data-cdc-report-warehouse>${warehouses}</select></label>
                            ${definition.key === 'stock-balance' ? `<label><span>Grupo de itens</span><select data-cdc-report-group>${groups}</select></label>` : ''}
                            <button type="button" class="btn btn-sm btn-primary" data-cdc-report-apply>Aplicar e executar</button>
                            <button type="button" class="btn btn-sm btn-default" data-cdc-report-clear>Limpar opcionais</button>
                        </div>
                        <p class="cdc-catalog-filter-note">Os controles atualizam os filtros oficiais do relatório. A tabela, totalizações, exportação e impressão continuam nativas.</p>
                    </div>`;
                dashboard.dataset.loaded = '1';
                dashboard.dataset.requestKey = requestKey;
                bindReportControls(dashboard, definition);
            },
            error: function(error) {
                if (serial !== requestSerial) return;
                activeRequestKey = '';
                var message = error && error.message ? error.message : 'Falha ao obter opções permitidas.';
                dashboard.innerHTML = '<div class="cdc-stock-context-state is-error">' + escapeHTML(message) + '</div>';
            }
        });
    }

    function setNativeReportFilter(report, fieldname, value) {
        if (!report || !Array.isArray(report.filters) || !report.filters.length || typeof report.set_filter_value !== 'function') return;
        if (typeof report.get_filter === 'function' && !report.get_filter(fieldname)) return;
        report.set_filter_value(fieldname, value);
    }

    function bindReportControls(dashboard, definition) {
        function value(selector) {
            var field = dashboard.querySelector(selector);
            return field ? field.value.trim() : '';
        }
        function execute(clearOptional) {
            var report = window.frappe && frappe.query_report;
            if (!report || !Array.isArray(report.filters) || !report.filters.length) {
                frappe.msgprint(__('O relatório ainda está sendo preparado. Tente novamente em instantes.'));
                return;
            }
            var fromDate = value('[data-cdc-report-from]');
            var toDate = value('[data-cdc-report-to]');
            if (fromDate && toDate && fromDate > toDate) {
                frappe.msgprint(__('A data inicial não pode ser posterior à data final.'));
                return;
            }
            var item = clearOptional ? '' : value('[data-cdc-report-item]');
            var warehouse = clearOptional ? '' : value('[data-cdc-report-warehouse]');
            var group = clearOptional ? '' : value('[data-cdc-report-group]');
            var permittedWarehouses = Array.isArray(dashboard._cdcPermittedWarehouses) ? dashboard._cdcPermittedWarehouses : [];
            setNativeReportFilter(report, 'company', value('[data-cdc-report-company]'));
            setNativeReportFilter(report, 'from_date', fromDate);
            setNativeReportFilter(report, 'to_date', toDate);
            setNativeReportFilter(report, 'warehouse', warehouse ? [warehouse] : permittedWarehouses);
            setNativeReportFilter(report, 'item_code', item ? [item] : []);
            if (definition.key === 'stock-balance') setNativeReportFilter(report, 'item_group', group ? [group] : []);
            dashboard.dataset.loaded = '1';
            dashboard.dataset.requestKey = definition.key + '|' + JSON.stringify(getReportContext());
            var result = typeof report.refresh === 'function' ? report.refresh() : null;
            Promise.resolve(result).finally(function() {
                window.setTimeout(function() { updateReportMetrics(dashboard, definition); }, 220);
            });
        }
        dashboard.querySelector('[data-cdc-report-apply]').addEventListener('click', function() { execute(false); });
        dashboard.querySelector('[data-cdc-report-item]').addEventListener('keydown', function(event) {
            if (event.key === 'Enter') execute(false);
        });
        dashboard.querySelector('[data-cdc-report-clear]').addEventListener('click', function() { execute(true); });
        dashboard.querySelector('[data-cdc-stock-refresh]').addEventListener('click', function() { execute(false); });
    }

    function updateReportMetrics(dashboard, definition) {
        if (!dashboard || !dashboard.querySelector('[data-cdc-report-cards]')) return;
        var summary = reportSummary(definition);
        var signature = JSON.stringify(summary);
        if (dashboard.dataset.reportSignature === signature) return;
        dashboard.dataset.reportSignature = signature;
        dashboard.querySelector('[data-cdc-report-cards]').innerHTML = reportCards(definition, summary);
    }

    function render() {
        var definition = routeDefinition();
        if (!definition) {
            removeDashboard();
            return;
        }
        if (definition.kind === 'document') renderDocument(definition);
        else renderQueryReport(definition);
    }

    function scheduleRender(delay) {
        if (renderTimer) clearTimeout(renderTimer);
        renderTimer = setTimeout(function() {
            renderTimer = null;
            render();
        }, delay || 120);
    }

    function init() {
        render();
        observer = new MutationObserver(function() {
            if (routeDefinition()) scheduleRender(140);
        });
        observer.observe(document.body, {childList: true, subtree: true});
        if (window.frappe && frappe.router && frappe.router.on) {
            frappe.router.on('change', function() {
                requestSerial += 1;
                activeRequestKey = '';
                scheduleRender(120);
            });
        }
        window.setInterval(function() {
            var definition = routeDefinition();
            if (definition && definition.kind === 'query-report') {
                var dashboard = document.getElementById('cdc-stock-route-dashboard');
                if (dashboard) updateReportMetrics(dashboard, definition);
            }
        }, 800);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 100);
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
})();
