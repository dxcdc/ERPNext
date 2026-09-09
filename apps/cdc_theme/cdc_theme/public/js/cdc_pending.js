(function() {
    'use strict';

    var observer;
    var loading = false;
    var scheduleClockTimer;
    var routeGeneration = 0;
    var selectedProject = sessionStorage.getItem('cdc_pending_project') || 'All';
    var selectedWarehouse = sessionStorage.getItem('cdc_pending_warehouse') || 'All';
    var selectedStage = sessionStorage.getItem('cdc_pending_stage') || 'All';
    var scrollToResults = false;

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
        if (scheduleClockTimer) window.clearInterval(scheduleClockTimer);
        scheduleClockTimer = null;
        document.querySelectorAll('#cdc-pending-dashboard').forEach(function(dashboard) { dashboard.remove(); });
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

    function countdownText(seconds) {
        var value = Math.max(0, Math.floor(Number(seconds) || 0));
        var hours = Math.floor(value / 3600);
        var minutes = Math.floor((value % 3600) / 60);
        var secs = value % 60;
        return [hours, minutes, secs].map(function(part) { return String(part).padStart(2, '0'); }).join(':');
    }

    function startScheduleClock(dashboard, automation) {
        if (scheduleClockTimer) window.clearInterval(scheduleClockTimer);
        scheduleClockTimer = null;
        var clock = dashboard.querySelector('#cdc-pending-next-sync');
        if (!clock) return;
        if (!automation || !automation.enabled) {
            clock.classList.add('is-waiting');
            clock.innerHTML = '<span>◷</span><div><small>Próxima atualização</small><strong>Agendamento aguardando ativação</strong></div>';
            return;
        }
        var initial = Number(automation.seconds_until_next_run || 0);
        var startedAt = Date.now();
        function update() {
            var remaining = initial - Math.floor((Date.now() - startedAt) / 1000);
            if (remaining >= 0) {
                clock.innerHTML = `<span>◷</span><div><small>Próxima atualização em</small><strong>${countdownText(remaining)}</strong></div>`;
            } else if (remaining > -300) {
                clock.innerHTML = '<span>↻</span><div><small>Atualização programada</small><strong>Processamento em andamento</strong></div>';
            } else {
                clock.classList.add('is-late');
                clock.innerHTML = `<span>!</span><div><small>Atualização aguardada</small><strong>Atraso de ${countdownText(Math.abs(remaining))}</strong></div>`;
            }
        }
        update();
        scheduleClockTimer = window.setInterval(update, 1000);
    }

    function render() {
        if (!isPendingRoute()) {
            removePendingDashboard();
            return;
        }
        var claim = window._cdc_claim_active_dashboard && window._cdc_claim_active_dashboard('cdc-pending-dashboard', 'section');
        if (!claim) return;
        var body = claim.body;
        var dashboard = claim.dashboard;
        if (dashboard.dataset.loaded === '1' && dashboard.querySelector('.cdc-pending-heading')) return;
    function getDiagnosticPanelHTML(statusMsg, isError) {
        var route = window.frappe && frappe.get_route ? frappe.get_route().join('/') : window.location.pathname;
        var user = window.frappe && frappe.session ? frappe.session.user : 'Guest';
        var time = new Date().toLocaleString();

        return `
            <div class="cdc-diagnostic-container">
                <div class="cdc-diagnostic-header-flex">
                    <div class="cdc-diagnostic-title-box">
                        <span class="cdc-diagnostic-icon">🛠️</span>
                        <div>
                            <h3 class="cdc-diagnostic-h3">Painel de Diagnóstico de Pendências</h3>
                            <p class="cdc-diagnostic-sub">Diagnóstico de resposta da API de pendências e estado da página</p>
                        </div>
                    </div>
                    <span class="cdc-diagnostic-badge ${isError ? 'is-error' : 'is-running'}">
                        ${isError ? '⚠️ ERRO REGISTRADO' : '⏳ PROCESSANDO REQUISIÇÃO'}
                    </span>
                </div>

                <div class="cdc-diagnostic-actions-bar">
                    <button class="btn btn-xs btn-primary cdc-diag-btn" id="cdc-pending-diag-ping">📡 Testar API Pendências (Ping)</button>
                    <button class="btn btn-xs btn-default cdc-diag-btn" id="cdc-pending-diag-remount">⚡ Forçar Remontagem da Tela</button>
                    <button class="btn btn-xs btn-default cdc-diag-btn" id="cdc-pending-diag-copy">📋 Copiar Logs de Diagnóstico</button>
                </div>

                <div class="cdc-diagnostic-logs-box">
                    <div class="cdc-diagnostic-logs-header">LOGS DE EXECUÇÃO DA TELA DE PENDÊNCIAS</div>
                    <pre class="cdc-diagnostic-pre" id="cdc-pending-diag-pre">
[TIMESTAMP] ${time}
[URL] ${window.location.href}
[ROUTA FRAPPE] ${route}
[USUÁRIO SESSÃO] ${user}
[CONTAINER .layout-main-section] ${!!document.querySelector('.layout-main-section') ? '🟢 Presente' : '🔴 Ausente'}
[STATUS REQUISIÇÃO] ${statusMsg || 'Iniciando chamada REST cdc_theme.api.get_ongsys_pending_orders...'}
                    </pre>
                </div>
            </div>
        `;
    }

    function bindDiagnosticActions(dashboard) {
        var pingBtn = dashboard.querySelector('#cdc-pending-diag-ping');
        if (pingBtn) {
            pingBtn.addEventListener('click', function() {
                var btn = this;
                btn.disabled = true;
                btn.textContent = '⏳ Testando...';
                var pre = dashboard.querySelector('#cdc-pending-diag-pre');
                var startTime = Date.now();
                frappe.call({
                    method: 'cdc_theme.api.get_ongsys_pending_orders',
                    args: { selected_project: 'All', selected_warehouse: 'All' },
                    callback: function(res) {
                        btn.disabled = false;
                        btn.textContent = '📡 Testar API Pendências (Ping)';
                        var elapsed = Date.now() - startTime;
                        if (pre) {
                            pre.textContent += `\n\n[TESTE MANUAL API - ${new Date().toLocaleTimeString()}]`;
                            pre.textContent += `\nHTTP Status: OK 200 (Tempo: ${elapsed}ms)`;
                            pre.textContent += `\nResposta da API: ${JSON.stringify(res ? res.message : null, null, 2).substring(0, 300)}...`;
                        }
                    },
                    error: function(err) {
                        btn.disabled = false;
                        btn.textContent = '📡 Testar API Pendências (Ping)';
                        if (pre) {
                            pre.textContent += `\n\n[ERRO NA CHAMADA API]`;
                            pre.textContent += `\nDetalhes do Erro: ${JSON.stringify(err, null, 2)}`;
                        }
                    }
                });
            });
        }

        var remountBtn = dashboard.querySelector('#cdc-pending-diag-remount');
        if (remountBtn) {
            remountBtn.addEventListener('click', function() {
                delete dashboard.dataset.loaded;
                loading = false;
                render();
                frappe.show_alert({ message: __('⚡ Solicitando remontagem da tela...'), indicator: 'blue' }, 3);
            });
        }

        var copyBtn = dashboard.querySelector('#cdc-pending-diag-copy');
        if (copyBtn) {
            copyBtn.addEventListener('click', function() {
                var pre = dashboard.querySelector('#cdc-pending-diag-pre');
                if (pre) {
                    navigator.clipboard.writeText(pre.textContent).then(function() {
                        frappe.show_alert({ message: __('📋 Logs copiados para a área de transferência!'), indicator: 'green' }, 3);
                    });
                }
            });
        }
    }

        if (loading) return;
        loading = true;
        var requestGeneration = routeGeneration;
        dashboard.innerHTML = '<div class="cdc-pending-state">Carregando pendências do espelho ONGSYS...</div>' + getDiagnosticPanelHTML('Carregando dados da API...', false);
        bindDiagnosticActions(dashboard);

        frappe.call({
            method: 'cdc_theme.api.get_ongsys_pending_orders',
            args: {
                selected_project: selectedProject,
                selected_warehouse: selectedWarehouse,
                selected_stage: selectedStage
            },
            callback: function(response) {
                loading = false;
                if (!isPendingRoute()) {
                    removePendingDashboard();
                    return;
                }
                var currentClaim = window._cdc_claim_active_dashboard && window._cdc_claim_active_dashboard('cdc-pending-dashboard', 'section');
                if (currentClaim) {
                    dashboard = currentClaim.dashboard;
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
                selectedStage = filters.selected_stage === undefined ? 'All' : String(filters.selected_stage);
                var stageCards = summary.stages || [];
                var stageCardsHTML = stageCards.map(function(stage) {
                    var value = String(stage.stage);
                    var selected = selectedStage === value;
                    return `<button type="button" class="cdc-pending-stage-card${selected ? ' is-selected' : ''}" data-stage="${escapeHTML(value)}" aria-pressed="${selected ? 'true' : 'false'}">
                        <span class="cdc-pending-stage-number">Etapa ${escapeHTML(value)}</span>
                        <strong>${escapeHTML(stage.count || 0)}</strong>
                        <span class="cdc-pending-stage-name">${escapeHTML(stage.name)}</span>
                        <small>${escapeHTML(stage.description)}</small>
                    </button>`;
                }).join('');
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
                function orderRow(order) {
                    return `<tr data-stage="${escapeHTML(order.current_stage)}" data-search="${escapeHTML([order.ongsys_order_id, order.title, order.status, order.current_stage, order.project, order.warehouse, order.cost_centers].join(' ').toLowerCase())}">
                        <td data-sort="${escapeHTML(order.ongsys_order_id)}"><strong>#${escapeHTML(order.ongsys_order_id)}</strong></td>
                        <td data-sort="${escapeHTML(order.title)}">${escapeHTML(order.title)}</td>
                        <td data-sort="${escapeHTML(order.status)}"><span class="cdc-pending-status">${escapeHTML(order.status)}</span></td>
                        <td data-sort="${escapeHTML(order.current_stage)}"><span class="cdc-pending-stage-pill">Etapa ${escapeHTML(order.current_stage)}</span></td>
                        <td data-sort="${escapeHTML(order.order_date)}">${escapeHTML(order.order_date)}</td>
                        <td data-sort="${ageDaysValue(order.order_date)}">${ageInDays(order.order_date)}</td>
                        <td data-sort="${escapeHTML(order.items_count)}">${escapeHTML(order.items_count)}</td>
                        <td data-sort="${escapeHTML(order.total_quantity)}">${escapeHTML(order.total_quantity)}</td>
                        <td data-sort="${escapeHTML(order.cost_centers)}">${escapeHTML(order.cost_centers)}</td>
                    </tr>`;
                }
                var warehouseGroups = {};
                orders.forEach(function(order) {
                    var key = order.warehouse || 'Não identificado';
                    if (!warehouseGroups[key]) warehouseGroups[key] = [];
                    warehouseGroups[key].push(order);
                });
                var trailingGroups = {'Múltiplos armazéns': 1, 'Não identificado': 2};
                var groupNames = Object.keys(warehouseGroups).sort(function(left, right) {
                    var leftRank = trailingGroups[left] || 0;
                    var rightRank = trailingGroups[right] || 0;
                    if (leftRank !== rightRank) return leftRank - rightRank;
                    return left.localeCompare(right, 'pt-BR');
                });
                var warehouseGroupsHTML = groupNames.map(function(warehouse) {
                    var groupOrders = warehouseGroups[warehouse];
                    var projects = [];
                    groupOrders.forEach(function(order) {
                        (order.projects && order.projects.length ? order.projects : [order.project]).forEach(function(project) {
                            if (project && projects.indexOf(project) === -1) projects.push(project);
                        });
                    });
                    var items = groupOrders.reduce(function(total, order) { return total + Number(order.items_count || 0); }, 0);
                    var quantity = groupOrders.reduce(function(total, order) { return total + Number(order.total_quantity || 0); }, 0);
                    var groupRows = groupOrders.map(orderRow).join('');
                    return `<details class="cdc-pending-warehouse-group" data-warehouse-group="${escapeHTML(warehouse)}" open>
                        <summary>
                            <span><strong>${escapeHTML(warehouse)}</strong><small>${escapeHTML(projects.join(' · ') || 'Projeto não identificado')}</small></span>
                            <span class="cdc-pending-warehouse-totals"><b>${escapeHTML(groupOrders.length)} pedido(s)</b><small>${escapeHTML(items)} item(ns) · ${escapeHTML(quantity)} unidade(s)</small></span>
                        </summary>
                        <div class="cdc-table-scroll-top cdc-pending-table-scroll-top" aria-label="Rolagem horizontal superior"><div></div></div>
                        <div class="cdc-pending-table-scroll"><table class="cdc-pending-table"><thead><tr><th data-sort-index="0" data-sort-type="number">Pedido <span class="cdc-sort-indicator">↕</span></th><th data-sort-index="1">Título <span class="cdc-sort-indicator">↕</span></th><th data-sort-index="2">Estado <span class="cdc-sort-indicator">↕</span></th><th data-sort-index="3" data-sort-type="number">Etapa <span class="cdc-sort-indicator">↕</span></th><th data-sort-index="4" data-sort-type="date">Data <span class="cdc-sort-indicator">↕</span></th><th data-sort-index="5" data-sort-type="number">Espera <span class="cdc-sort-indicator">↕</span></th><th data-sort-index="6" data-sort-type="number">Itens <span class="cdc-sort-indicator">↕</span></th><th data-sort-index="7" data-sort-type="number">Quantidade <span class="cdc-sort-indicator">↕</span></th><th data-sort-index="8">Centros de custo <span class="cdc-sort-indicator">↕</span></th></tr></thead><tbody>${groupRows}</tbody></table></div>
                    </details>`;
                }).join('');

                var automation = data.automation || {};
                var tableTitle = selectedStage === '6' ? 'Recebidos e encerrados' : 'Aguardando conclusão';
                var tableDescription = selectedStage === '6'
                    ? 'Pedidos concluídos nos últimos 30 dias dentro do seu escopo de acesso.'
                    : (selectedStage === 'All'
                        ? 'Cancelados e ordens finalizadas não aparecem nesta lista.'
                        : 'Exibindo somente os pedidos pendentes da etapa selecionada.');

                dashboard.dataset.loaded = '1';
                try {
                    var main = window._cdc_get_active_page_body && window._cdc_get_active_page_body();
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
                            <button class="btn btn-sm btn-primary" id="cdc-btn-pending-verify-now">🔄 Atualizar dados</button>
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

                    <div class="cdc-linked-filters" aria-label="Filtros de pendências">
                        <label><span>Projeto</span><select id="cdc-pending-project-filter">${projectOptionsHTML}</select></label>
                        <label><span>Armazém</span><select id="cdc-pending-warehouse-filter">${warehouseOptionsHTML}</select></label>
                    </div>
                    <div class="cdc-pending-metrics">
                        <article><span>${selectedStage === 'All' ? 'Pedidos pendentes' : 'Pedidos exibidos'}</span><strong>${summary.total || 0}</strong></article>
                        <article><span>Itens envolvidos</span><strong>${summary.items || 0}</strong></article>
                        <article><span>${selectedStage === '6' ? 'Quantidade concluída' : 'Quantidade aguardando'}</span><strong>${summary.quantity || 0}</strong></article>
                    </div>
                    <section class="cdc-pending-stages" aria-labelledby="cdc-pending-stages-title">
                        <div class="cdc-pending-stages-heading">
                            <div><h3 id="cdc-pending-stages-title">Etapas dos pedidos</h3><p>Totais calculados somente sobre projetos e armazéns que você pode consultar.</p></div>
                            <div class="cdc-pending-stage-controls">
                                <div class="cdc-pending-next-sync" id="cdc-pending-next-sync" aria-live="polite"></div>
                                <button type="button" class="btn btn-xs btn-default" id="cdc-pending-stage-all" aria-pressed="${selectedStage === 'All' ? 'true' : 'false'}">Todas as pendências (${escapeHTML(summary.pending_total || 0)})</button>
                            </div>
                        </div>
                        <div class="cdc-pending-stage-grid">${stageCardsHTML}</div>
                    </section>
                    <div class="cdc-pending-table-card" id="cdc-pending-results">
                        <div class="cdc-pending-table-header"><div><h3>${tableTitle}</h3><p>${tableDescription}</p></div><input id="cdc-pending-search" type="search" aria-label="Buscar pedidos" placeholder="Buscar ID, título, etapa, estado ou centro de custo"></div>
                        <div class="cdc-pending-warehouse-groups">${warehouseGroupsHTML || '<div class="cdc-pending-empty">Nenhum pedido encontrado para os filtros selecionados.</div>'}</div>
                    </div>
                    ${getDiagnosticPanelHTML('API REST Conectada com Êxito (HTTP 200 OK)', false)}
                `;

                bindDiagnosticActions(dashboard);
                startScheduleClock(dashboard, automation);

                function selectStage(value) {
                    selectedStage = String(value);
                    scrollToResults = true;
                    sessionStorage.setItem('cdc_pending_stage', selectedStage);
                    dashboard.dataset.loaded = '0';
                    render();
                }
                dashboard.querySelectorAll('.cdc-pending-stage-card').forEach(function(card) {
                    card.addEventListener('click', function() { selectStage(this.dataset.stage); });
                });
                var allStagesBtn = dashboard.querySelector('#cdc-pending-stage-all');
                if (allStagesBtn) allStagesBtn.addEventListener('click', function() { selectStage('All'); });

                // Atualiza apenas o espelho persistido; a interface não simula execução externa.
                var verifyNowBtn = document.getElementById('cdc-btn-pending-verify-now');
                if (verifyNowBtn) {
                    verifyNowBtn.addEventListener('click', function() {
                        delete dashboard.dataset.loaded;
                        loading = false;
                        render();
                        frappe.show_alert({
                            message: __('Dados locais atualizados. A execução do extrator é acompanhada pelo checkpoint real.'),
                            indicator: 'blue'
                        }, 4);
                    });
                }
                if (typeof window._cdc_setup_sortable_table === 'function') {
                    dashboard.querySelectorAll('.cdc-pending-warehouse-group').forEach(function(group) {
                        window._cdc_setup_sortable_table(group, '.cdc-pending-table-scroll-top', '.cdc-pending-table-scroll', '.cdc-pending-table');
                    });
                }
                var search = document.getElementById('cdc-pending-search');
                if (search) search.addEventListener('input', function() {
                    var term = this.value.trim().toLowerCase();
                    dashboard.querySelectorAll('.cdc-pending-warehouse-group').forEach(function(group) {
                        var visible = 0;
                        group.querySelectorAll('tbody tr[data-search]').forEach(function(row) {
                            row.hidden = Boolean(term && row.dataset.search.indexOf(term) === -1);
                            if (!row.hidden) visible += 1;
                        });
                        group.hidden = visible === 0;
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
                if (scrollToResults) {
                    scrollToResults = false;
                    var results = dashboard.querySelector('#cdc-pending-results');
                    if (results) results.scrollIntoView({behavior: 'smooth', block: 'start'});
                }
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
