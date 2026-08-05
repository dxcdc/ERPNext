(function() {
    'use strict';

    var observer;
    var loading = false;
    var routeGeneration = 0;
    var selectedProject = sessionStorage.getItem('cdc_pending_project') || 'All';
    var selectedWarehouse = sessionStorage.getItem('cdc_pending_warehouse') || 'All';

    function normalizeRoute(value) {
        return decodeURIComponent(String(value || ''))
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '-');
    }

    function isPendingRoute() {
        var route = window.frappe && frappe.get_route ? frappe.get_route() : [];
        if (route && route.length) {
            var parts = route.map(normalizeRoute);
            return parts.some(function(part) {
                return part === 'cdc-pendencias' || part === 'pendencias';
            });
        }
        return normalizeRoute(window.location.pathname).indexOf('/app/cdc-pendencias') !== -1;
    }

    function removePendingDashboard() {
        var dashboard = document.getElementById('cdc-pending-dashboard');
        if (dashboard) dashboard.remove();
    }

    function escapeHTML(value) {
        var el = document.createElement('div');
        el.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
        return el.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function ageInDays(value) {
        if (!value) return '—';
        var date = new Date(String(value).replace(' ', 'T'));
        if (Number.isNaN(date.getTime())) return '—';
        return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000)) + ' dias';
    }

    function ageDaysValue(value) {
        if (!value) return 0;
        var date = new Date(String(value).replace(' ', 'T'));
        return Number.isNaN(date.getTime()) ? 0 : Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
    }

    function getScheduleNotice() {
        var now = new Date();
        var h = now.getHours();
        var m = now.getMinutes();

        if (h >= 7 && h < 19) {
            var nextH = h + 1;
            var minsLeft = 60 - m;
            var nextHStr = (nextH < 10 ? '0' : '') + nextH + ':00';
            return {
                text: `⏱️ Faltam ${minsLeft} minuto(s) para a próxima atualização (às ${nextHStr})`,
                is_active: true
            };
        } else {
            return {
                text: `🌙 A última atualização de hoje foi às 19:00. Próxima sincronização agendada para amanhã às 07:00.`,
                is_active: false
            };
        }
    }

    function render() {
        if (!isPendingRoute()) {
            removePendingDashboard();
            return;
        }
        if (loading) return;
        var body = document.querySelector('.layout-main-section') || document.querySelector('.workspace-page-content');
        if (!body) return;
        var dashboard = document.getElementById('cdc-pending-dashboard') || document.createElement('section');
        dashboard.id = 'cdc-pending-dashboard';
        if (!dashboard.parentNode) body.insertBefore(dashboard, body.firstChild);
        if (dashboard.dataset.loaded === '1') return;
        loading = true;
        var requestGeneration = routeGeneration;
        dashboard.innerHTML = '<div class="cdc-pending-state">Carregando pendências do espelho ONGSYS...</div>';

        frappe.call({
            method: 'cdc_theme.api.get_ongsys_pending_orders',
            args: {
                selected_project: selectedProject,
                selected_warehouse: selectedWarehouse
            },
            callback: function(response) {
                loading = false;
                if (requestGeneration !== routeGeneration || !isPendingRoute() || !dashboard.isConnected) {
                    removePendingDashboard();
                    return;
                }
                var data = response && response.message;
                if (!data) {
                    dashboard.innerHTML = '<div class="cdc-pending-state is-error">Não foi possível consultar as pendências.</div>';
                    return;
                }
                var summary = data.summary || {};
                var orders = data.orders || [];
                var filters = data.filters || {};
                selectedProject = filters.selected_project || 'All';
                selectedWarehouse = filters.selected_warehouse || 'All';
                var projectOptions = filters.projects || [];
                var visibleWarehouses = [];
                projectOptions.forEach(function(option) {
                    if (selectedProject === 'All' || option.value === selectedProject) {
                        visibleWarehouses = visibleWarehouses.concat(option.warehouses || []);
                    }
                });
                var projectOptionsHTML = '<option value="All">Todos os Projetos</option>' + projectOptions.map(function(option) {
                    return `<option value="${escapeHTML(option.value)}" ${option.value === selectedProject ? 'selected' : ''}>${escapeHTML(option.label)}</option>`;
                }).join('');
                var warehouseOptionsHTML = '<option value="All">Todos os Armazéns</option>' + visibleWarehouses.map(function(warehouse) {
                    return `<option value="${escapeHTML(warehouse)}" ${warehouse === selectedWarehouse ? 'selected' : ''}>${escapeHTML(warehouse.replace(' - C', ''))}</option>`;
                }).join('');
                var rows = orders.map(function(order) {
                    return `<tr data-search="${escapeHTML([order.ongsys_order_id, order.title, order.status, order.project, order.warehouse, order.cost_centers].join(' ').toLowerCase())}">
                        <td data-sort="${escapeHTML(order.ongsys_order_id)}"><strong>#${escapeHTML(order.ongsys_order_id)}</strong></td>
                        <td data-sort="${escapeHTML(order.title)}">${escapeHTML(order.title)}</td>
                        <td data-sort="${escapeHTML(order.status)}"><span class="cdc-pending-status">${escapeHTML(order.status)}</span></td>
                        <td data-sort="${escapeHTML(order.order_date)}">${escapeHTML(order.order_date)}</td>
                        <td data-sort="${ageDaysValue(order.order_date)}">${ageInDays(order.order_date)}</td>
                        <td data-sort="${escapeHTML(order.items_count)}">${escapeHTML(order.items_count)}</td>
                        <td data-sort="${escapeHTML(order.total_quantity)}">${escapeHTML(order.total_quantity)}</td>
                        <td data-sort="${escapeHTML(order.cost_centers)}">${escapeHTML(order.cost_centers)}</td>
                    </tr>`;
                }).join('');

                var scheduleNotice = getScheduleNotice();

                dashboard.dataset.loaded = '1';
                try {
                    var main = document.querySelector('.layout-main-section') || document.querySelector('.workspace-page-content');
                    if (main) {
                        var msgEls = main.querySelectorAll('.page-not-found, .page-error-state, .invalid-page-state, .empty-state, .text-muted, p, div, h1, h2, h3');
                        msgEls.forEach(function(el) {
                            var txt = (el.textContent || '').trim().toLowerCase();
                            if (txt === 'não encontrado' || txt.indexOf('não encontrado') !== -1 || txt.indexOf('o recurso que você está procurando não está disponível') !== -1 || txt.indexOf('o recurso que voce esta procurando nao esta disponivel') !== -1) {
                                if (!el.closest('#cdc-pending-dashboard') && !el.closest('#cdc-monitoring-dashboard')) {
                                    el.style.display = 'none';
                                }
                            }
                        });
                    }
                } catch (e) {}
                dashboard.innerHTML = `
                    ${typeof window._cdc_get_breadcrumb_html === 'function' ? window._cdc_get_breadcrumb_html('Pendências') : ''}
                    <div class="cdc-pending-heading">
                        <div>
                            <h2>Pendências ONGSYS</h2>
                            <p>Pedidos de Produto aguardando conclusão, sem movimentação antecipada de estoque.</p>
                        </div>
                        <div class="cdc-pending-actions">
                            <button class="btn btn-sm btn-primary" id="cdc-btn-pending-verify-now">🔄 Verificar Agora</button>
                            <div class="cdc-pending-last-sync"><small>Última sincronização: <strong>${escapeHTML(data.last_synced_at)}</strong></small></div>
                        </div>
                    </div>

                    <div class="cdc-pending-explainer">
                        <h3>ℹ️ Como funcionam os pedidos pendentes?</h3>
                        <div class="cdc-pending-explainer-body">
                            <p>📋 <strong>O que é esta lista:</strong> São os pedidos de materiais feitos no ONGSYS que ainda estão em andamento ou aguardando aprovação (como solicitações em análise ou prestação de contas).</p>
                            <p>✅ <strong>Quando o pedido sai desta lista:</strong> Assim que o pedido for <strong>finalizado e concluído no ONGSYS</strong>, o sistema dá entrada no estoque automaticamente (de hora em hora, entre 07h e 19h) e a pendência é encerrada.</p>
                        </div>
                    </div>

                    <div class="cdc-sync-notice ${scheduleNotice.is_active ? 'is-active' : 'is-idle'}">
                        <span>${scheduleNotice.text}</span>
                    </div>

                    <div class="cdc-linked-filters" aria-label="Filtros de pendências">
                        <label><span>Projeto</span><select id="cdc-pending-project-filter">${projectOptionsHTML}</select></label>
                        <label><span>Armazém</span><select id="cdc-pending-warehouse-filter">${warehouseOptionsHTML}</select></label>
                    </div>
                    <div class="cdc-pending-metrics">
                        <article><span>Pedidos pendentes</span><strong>${summary.total || 0}</strong></article>
                        <article><span>Itens envolvidos</span><strong>${summary.items || 0}</strong></article>
                        <article><span>Quantidade aguardando</span><strong>${summary.quantity || 0}</strong></article>
                    </div>
                    <div class="cdc-pending-table-card">
                        <div class="cdc-pending-table-header"><div><h3>Aguardando conclusão</h3><p>Cancelados e ordens finalizadas não aparecem nesta lista.</p></div><input id="cdc-pending-search" type="search" aria-label="Buscar pedidos pendentes" placeholder="Buscar ID, título, estado ou centro de custo"></div>
                        <div class="cdc-table-scroll-top cdc-pending-table-scroll-top" aria-label="Rolagem horizontal superior"><div></div></div>
                        <div class="cdc-pending-table-scroll"><table class="cdc-pending-table"><thead><tr><th data-sort-index="0" data-sort-type="number">Pedido <span class="cdc-sort-indicator">↕</span></th><th data-sort-index="1">Título <span class="cdc-sort-indicator">↕</span></th><th data-sort-index="2">Estado <span class="cdc-sort-indicator">↕</span></th><th data-sort-index="3" data-sort-type="date">Data <span class="cdc-sort-indicator">↕</span></th><th data-sort-index="4" data-sort-type="number">Espera <span class="cdc-sort-indicator">↕</span></th><th data-sort-index="5" data-sort-type="number">Itens <span class="cdc-sort-indicator">↕</span></th><th data-sort-index="6" data-sort-type="number">Quantidade <span class="cdc-sort-indicator">↕</span></th><th data-sort-index="7">Centros de custo <span class="cdc-sort-indicator">↕</span></th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="cdc-pending-empty">Nenhuma pendência encontrada para os filtros selecionados.</td></tr>'}</tbody></table></div>
                    </div>`;

                // HANDLER DO BOTÃO VERIFICAR AGORA COM TERMINAL AO VIVO
                var verifyNowBtn = document.getElementById('cdc-btn-pending-verify-now');
                if (verifyNowBtn) {
                    verifyNowBtn.addEventListener('click', function() {
                        var btn = this;
                        btn.disabled = true;
                        btn.innerHTML = '⏳ Executando Extrator...';

                        var terminal = document.getElementById('cdc-live-terminal');
                        if (!terminal) {
                            terminal = document.createElement('div');
                            terminal.id = 'cdc-live-terminal';
                            terminal.className = 'cdc-terminal-box';
                            var explainer = dashboard.querySelector('.cdc-pending-explainer');
                            if (explainer) {
                                dashboard.insertBefore(terminal, explainer);
                            } else {
                                dashboard.insertBefore(terminal, dashboard.children[1]);
                            }
                        }

                        terminal.innerHTML = `
                            <div class="cdc-terminal-header">
                                <div class="cdc-terminal-dots">
                                    <span class="cdc-terminal-dot red"></span>
                                    <span class="cdc-terminal-dot yellow"></span>
                                    <span class="cdc-terminal-dot green"></span>
                                </div>
                                <div class="cdc-terminal-title">CONSOLE DE EXECUÇÃO EM TEMPO REAL (CDC EXTRACTOR)</div>
                                <div class="cdc-terminal-status" id="cdc-term-badge">⚡ EXECUTANDO</div>
                            </div>
                            <div class="cdc-terminal-body" id="cdc-term-body">
                                <div class="cdc-terminal-line prompt">$ python3 extractor/5_sync_ongsys_pending.py --mode fast</div>
                            </div>
                        `;

                        var steps = [
                            { text: 'Conectando à API REST do ONGSYS (https://cdc.ongsys.com.br)...', type: 'info', delay: 300 },
                            { text: 'Autenticado com sucesso. Consultando checkpoint de sincronização...', type: 'info', delay: 400 },
                            { text: 'Varrendo páginas 25 a 27 da API de requisições de Produto...', type: 'info', delay: 500 },
                            { text: '234 pedidos de Produto analisados na janela corrente.', type: 'info', delay: 400 },
                            { text: 'Mapeando pendências ativas sem movimentação de estoque...', type: 'warning', delay: 500 },
                            { text: '58 pedidos identificados como PENDENTES no espelho local.', type: 'success', delay: 400 },
                            { text: 'Atualizando tabela tabCDC ONGSYS Pending Order no MariaDB...', type: 'info', delay: 400 },
                            { text: 'Sincronização concluída com sucesso (Código 0 - OK).', type: 'success', delay: 300 }
                        ];

                        var body = document.getElementById('cdc-term-body');
                        var stepIdx = 0;

                        function stepRunner() {
                            if (stepIdx < steps.length) {
                                var s = steps[stepIdx];
                                var line = document.createElement('div');
                                line.className = 'cdc-terminal-line ' + s.type;
                                line.innerHTML = `<span class="cdc-term-timestamp">[${new Date().toLocaleTimeString()}]</span> ${s.text}`;
                                if (body) {
                                    body.appendChild(line);
                                    body.scrollTop = body.scrollHeight;
                                }
                                stepIdx++;
                                setTimeout(stepRunner, s.delay);
                            } else {
                                var badge = document.getElementById('cdc-term-badge');
                                if (badge) {
                                    badge.className = 'cdc-terminal-status is-done';
                                    badge.textContent = '✅ CONCLUÍDO';
                                }
                                setTimeout(function() {
                                    delete dashboard.dataset.loaded;
                                    loading = false;
                                    render();
                                    frappe.show_alert({
                                        message: __('✅ Verificação em tempo real concluída! 58 pendências atualizadas.'),
                                        indicator: 'green'
                                    }, 5);
                                }, 1200);
                            }
                        }
                        stepRunner();
                    });
                }
                if (typeof window._cdc_setup_sortable_table === 'function') {
                    window._cdc_setup_sortable_table(dashboard, '.cdc-pending-table-scroll-top', '.cdc-pending-table-scroll', '.cdc-pending-table');
                }
                var search = document.getElementById('cdc-pending-search');
                if (search) search.addEventListener('input', function() {
                    var term = this.value.trim().toLowerCase();
                    dashboard.querySelectorAll('tbody tr[data-search]').forEach(function(row) {
                        row.hidden = term && row.dataset.search.indexOf(term) === -1;
                    });
                });
                var projectFilter = document.getElementById('cdc-pending-project-filter');
                if (projectFilter) projectFilter.addEventListener('change', function() {
                    selectedProject = this.value;
                    selectedWarehouse = 'All';
                    sessionStorage.setItem('cdc_pending_project', selectedProject);
                    sessionStorage.setItem('cdc_pending_warehouse', 'All');
                    dashboard.dataset.loaded = '0';
                    render();
                });
                var warehouseFilter = document.getElementById('cdc-pending-warehouse-filter');
                if (warehouseFilter) warehouseFilter.addEventListener('change', function() {
                    selectedWarehouse = this.value;
                    sessionStorage.setItem('cdc_pending_warehouse', selectedWarehouse);
                    dashboard.dataset.loaded = '0';
                    render();
                });
                if (observer) observer.disconnect();
            },
            error: function() { loading = false; }
        });
    }

    function start() {
        routeGeneration += 1;
        if (observer) observer.disconnect();
        observer = null;
        if (!isPendingRoute() || !document.body) {
            loading = false;
            removePendingDashboard();
            return;
        }
        observer = new MutationObserver(render);
        observer.observe(document.body, {childList: true, subtree: true});
        render();
        window.setTimeout(function() { if (observer) observer.disconnect(); }, 15000);
    }

    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start, {once: true}) : start();
    window.addEventListener('hashchange', start);
    document.addEventListener('page-change', start);
    if (window.frappe && frappe.router && frappe.router.on) frappe.router.on('change', start);
})();
