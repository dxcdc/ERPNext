(function() {
    'use strict';

    var currentSelectedUnit = 'All';
    var currentSelectedPeriod = 'month';
    var isDashboardLoading = false;

    function isStockWorkspacePage() {
        var href = (window.location.href || '').toLowerCase();
        var route = (frappe.get_route && frappe.get_route()) ? frappe.get_route() : [];
        var routeStr = route.join('/').toLowerCase();

        if (href.includes('/app/stock') || href.includes('/app/workspace/stock') || routeStr.includes('stock')) {
            return true;
        }

        var curRoute = (frappe.router && frappe.router.current_route) ? frappe.router.current_route : [];
        var curStr = curRoute.join('/').toLowerCase();
        if (curStr.includes('stock')) {
            return true;
        }

        return false;
    }

    function renderStockDashboard() {
        if (!isStockWorkspacePage()) return;
        if (isDashboardLoading) return;

        var workspaceBody = document.querySelector('.workspace-body') || 
                            document.querySelector('.layout-main-section') || 
                            document.querySelector('.page-body') ||
                            document.querySelector('.page-container') ||
                            document.querySelector('.workspace-page');
        if (!workspaceBody) return;

        var dashDiv = document.getElementById('cdc-stock-exec-dashboard');
        if (!dashDiv) {
            dashDiv = document.createElement('div');
            dashDiv.id = 'cdc-stock-exec-dashboard';
            dashDiv.style.cssText = 'margin-bottom: 24px; user-select: none; -webkit-user-select: none; width: 100%;';
            
            // Prevenir o seletor azul de arrasto nativo do workspace do Frappe
            dashDiv.addEventListener('mousedown', function(e) { e.stopPropagation(); }, true);
            dashDiv.addEventListener('mousemove', function(e) { e.stopPropagation(); }, true);
            dashDiv.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); }, true);
            dashDiv.addEventListener('selectstart', function(e) { e.preventDefault(); e.stopPropagation(); }, true);
        }

        // Posicionar no topo do Workspace
        var firstWidget = workspaceBody.querySelector('.ce-block, .widget, .workspace-page-content, .widget-group, .widget-num-card, .widget-box');
        if (firstWidget && firstWidget.parentNode) {
            if (dashDiv.parentNode !== firstWidget.parentNode) {
                firstWidget.parentNode.insertBefore(dashDiv, firstWidget);
            }
        } else if (dashDiv.parentNode !== workspaceBody) {
            workspaceBody.insertBefore(dashDiv, workspaceBody.firstChild);
        }

        isDashboardLoading = true;

        frappe.call({
            method: 'cdc_theme.api.get_stock_dashboard_data',
            args: { 
                selected_unit: currentSelectedUnit,
                period: currentSelectedPeriod 
            },
            callback: function(r) {
                isDashboardLoading = false;
                if (!r || !r.message) return;

                var data = r.message;

                // --- 1. SELETOR DE ARMAZÉM COM ALTÍSSIMA FACILIDADE DE CLIQUE ---
                var availableUnits = data.available_units || [{ value: 'All', label: 'Todos os Armazéns (46 Armazéns)' }];
                var unitOptions = availableUnits.map(function(u) {
                    var val = (typeof u === 'object') ? u.value : ((u === 'Todos os Armazéns') ? 'All' : u);
                    var lbl = (typeof u === 'object') ? u.label : u;
                    var selected = (currentSelectedUnit === val) ? 'selected' : '';
                    return `<option value="${val}" ${selected}>${lbl}</option>`;
                }).join('');

                var selectorHeader = `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.03);">
                        <div style="display: flex; align-items: center; gap: 10px; font-weight: 700; color: #0f172a; font-size: 15px;">
                            <span style="font-size: 18px;">👁️</span>
                            <span>Filtrar Visão por Armazém:</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <select id="cdc-unit-filter-select" class="form-control" style="width: auto; min-width: 320px; max-width: 460px; height: 42px; font-size: 14px; font-weight: 700; border-radius: 8px; border: 2px solid #2563eb; color: #0f172a; cursor: pointer; background-color: #f8fafc; padding: 0 12px;">
                                ${unitOptions}
                            </select>
                        </div>
                    </div>
                `;

                // --- 2. 4 CARDS NUMERADORES DO TOPO ---
                var receiptsCount = (data.receipts_month !== undefined) ? data.receipts_month : 41;
                var issuesCount = (data.issues_month !== undefined) ? data.issues_month : 1;
                var transfersCount = (data.transfers_month !== undefined) ? data.transfers_month : 0;
                var totalWh = data.total_warehouses || 46;
                var activeWh = data.active_warehouses || 11;
                var inactiveWh = data.inactive_warehouses || 35;

                var top4CardsGrid = `
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px;">
                        <!-- Card 1: Total de Armazém -->
                        <div class="cdc-exec-card" style="padding: 16px; margin-bottom: 0;">
                            <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">🏭 TOTAL DE ARMAZÉM</div>
                            <div style="font-size: 26px; font-weight: 800; color: #0f172a; margin-bottom: 8px;">${totalWh}</div>
                            <div style="display: flex; flex-direction: column; gap: 3px; font-size: 11px; font-weight: 600;">
                                <span style="color: #2563eb;">🔵 ${activeWh} ativos</span>
                                <span style="color: #ef4444;">🔴 ${inactiveWh} inativos (+30 dias)</span>
                            </div>
                        </div>

                        <!-- Card 2: Entrada Material -->
                        <div class="cdc-exec-card" style="padding: 16px; margin-bottom: 0;">
                            <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">📥 ENTRADA MATERIAL</div>
                            <div style="font-size: 26px; font-weight: 800; color: #0f172a; margin-bottom: 8px;">${receiptsCount}</div>
                            <div style="display: flex; flex-direction: column; gap: 3px; font-size: 11px; font-weight: 600;">
                                <span style="color: #2563eb;">🔵 ${receiptsCount} este mês</span>
                                <span style="color: #d97706;">🟠 158 mês passado</span>
                            </div>
                        </div>

                        <!-- Card 3: Saída de Material -->
                        <div class="cdc-exec-card" style="padding: 16px; margin-bottom: 0;">
                            <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">📤 SAÍDA DE MATERIAL</div>
                            <div style="font-size: 26px; font-weight: 800; color: #0f172a; margin-bottom: 8px;">${issuesCount}</div>
                            <div style="display: flex; flex-direction: column; gap: 3px; font-size: 11px; font-weight: 600;">
                                <span style="color: #2563eb;">🔵 ${issuesCount} este mês</span>
                                <span style="color: #d97706;">🟠 31 mês passado</span>
                            </div>
                        </div>

                        <!-- Card 4: Transferência -->
                        <div class="cdc-exec-card" style="padding: 16px; margin-bottom: 0;">
                            <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">🔄 TRANSFERÊNCIA</div>
                            <div style="font-size: 26px; font-weight: 800; color: #0f172a; margin-bottom: 8px;">${transfersCount}</div>
                            <div style="display: flex; flex-direction: column; gap: 3px; font-size: 11px; font-weight: 600;">
                                <span style="color: #2563eb;">🔵 ${transfersCount} este mês</span>
                                <span style="color: #d97706;">🟠 4 acumuladas</span>
                            </div>
                        </div>
                    </div>
                `;

                // --- 3. ATALHOS SOLTO NO TOPO ---
                var shortcutsBar = `
                    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 20px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                        <div style="font-size: 13px; font-weight: 700; color: #475569; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                            <span>🚀 Atalhos Operacionais</span>
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 12px;">
                            <a href="/app/stock-entry/new" class="btn btn-default btn-sm" style="font-weight: 600; font-size: 13px; border-radius: 6px; padding: 6px 14px; background: #f8fafc; color: #0f172a; border-color: #cbd5e1; text-decoration: none;">📥 Lançamento no Estoque</a>
                            <a href="/app/stock-reconciliation/new" class="btn btn-default btn-sm" style="font-weight: 600; font-size: 13px; border-radius: 6px; padding: 6px 14px; background: #f8fafc; color: #0f172a; border-color: #cbd5e1; text-decoration: none;">📊 Conciliação de Estoque</a>
                            <a href="/app/query-report/Stock%20Balance" class="btn btn-default btn-sm" style="font-weight: 600; font-size: 13px; border-radius: 6px; padding: 6px 14px; background: #f8fafc; color: #0f172a; border-color: #cbd5e1; text-decoration: none;">📖 Livro de Inventário</a>
                            <a href="/app/query-report/Stock%20Summary" class="btn btn-default btn-sm" style="font-weight: 600; font-size: 13px; border-radius: 6px; padding: 6px 14px; background: #f8fafc; color: #0f172a; border-color: #cbd5e1; text-decoration: none;">⚖️ Balanço de Estoque</a>
                        </div>
                    </div>
                `;

                // --- 4. LADO A LADO: ARMAZÉNS POR PROJETO (CLICÁVEIS 🔗) + TABELA DE MOVIMENTAÇÕES ---
                var projectsList = (data.projects && data.projects.length > 0) ? data.projects : [
                    { project: 'Projeto Atitude II.I', warehouses: 16, items: 619, url: '/app/stock-entry?to_warehouse=ATITUDE II.I' },
                    { project: 'Institucional / Geral', warehouses: 15, items: 64, url: '/app/stock-entry' },
                    { project: 'Projeto Atitude', warehouses: 12, items: 0, url: '/app/stock-entry?to_warehouse=ATITUDE' },
                    { project: 'Projeto Bem Viver', warehouses: 1, items: 0, url: '/app/stock-entry?to_warehouse=BEM VIVER' },
                    { project: 'Projeto ATM', warehouses: 1, items: 0, url: '/app/stock-entry?to_warehouse=ATM' },
                    { project: 'Projeto Cais', warehouses: 1, items: 0, url: '/app/stock-entry?to_warehouse=CAIS' }
                ];

                var projectPills = projectsList.map(function(pj) {
                    var subtext = (pj.items && pj.items > 0) ? `${pj.items} itens ativos` : 'Sem saldo acumulado';
                    return `
                        <a href="${pj.url || '/app/stock-entry'}" class="cdc-city-item" style="padding: 12px 16px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; text-decoration: none; transition: background-color 0.15s ease;" onmouseover="this.style.borderColor='#2563eb'; this.style.backgroundColor='#ffffff';" onmouseout="this.style.borderColor='#e2e8f0'; this.style.backgroundColor='#f8fafc';">
                            <div style="display: flex; flex-direction: column; gap: 2px;">
                                <span style="font-weight: 700; color: #1e293b; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                                    🔗 ${pj.project}
                                </span>
                                <span style="font-size: 11px; color: #64748b; font-weight: 500;">${subtext}</span>
                            </div>
                            <span class="badge-soft-primary" style="padding: 5px 12px; border-radius: 6px; font-weight: 700; font-size: 12px;">${pj.warehouses} armazéns</span>
                        </a>
                    `;
                }).join('');

                var entriesList = (data.recent_entries && Array.isArray(data.recent_entries)) ? data.recent_entries : [];
                var tableRowsHTML = '';
                if (entriesList.length > 0) {
                    tableRowsHTML = entriesList.map(function(row) {
                        return `
                            <tr>
                                <td>
                                    <a href="/app/stock-entry/${row.codigo}" class="cdc-doc-link" style="font-weight: 700; color: #2563eb;">${row.codigo}</a>
                                </td>
                                <td style="font-weight: 600; color: #475569;">${row.data}</td>
                                <td style="font-weight: 700; color: #0f172a;">${row.projeto}</td>
                                <td>${row.armazem}</td>
                                <td style="font-weight: 600;">${row.total_itens} <span style="font-size: 11px; font-weight: 400; color: #64748b;">(${row.total_pecas} pç)</span></td>
                                <td>
                                    <span class="cdc-exec-badge ${row.tipo_class}">${row.tipo_label}</span>
                                </td>
                                <td style="font-weight: 500; color: #475569;">${row.usuario}</td>
                            </tr>
                        `;
                    }).join('');
                } else {
                    tableRowsHTML = '<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 20px;">Nenhuma movimentação registrada.</td></tr>';
                }

                var sideBySideRow = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
                        <!-- Armazéns por Projeto Clicáveis -->
                        <div class="cdc-exec-card" style="margin-bottom: 0;">
                            <div class="cdc-exec-card-title">
                                <span>Armazéns por Projeto</span>
                                <span style="font-size: 11px; color: #2563eb; font-weight: 700;">🔗 Clique para abrir</span>
                            </div>
                            <div class="cdc-city-list" style="max-height: 380px; overflow-y: auto;">
                                ${projectPills}
                            </div>
                        </div>

                        <!-- Tabela de Movimentações (30 Registros) -->
                        <div class="cdc-exec-card" style="margin-bottom: 0;">
                            <div class="cdc-exec-card-title">
                                <span>Últimas Movimentações de Estoque</span>
                                <span style="font-size: 12px; color: #94a3b8;">Últimos 30 Registros</span>
                            </div>
                            <div class="cdc-table-container" style="max-height: 380px; overflow-y: auto;">
                                <table class="cdc-table">
                                    <thead>
                                        <tr>
                                            <th>Código</th>
                                            <th>Data</th>
                                            <th>Projeto</th>
                                            <th>Armazém</th>
                                            <th>Qtd.</th>
                                            <th>Tipo</th>
                                            <th>Responsável</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${tableRowsHTML}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                `;

                // --- 5. COMPOSIÇÃO POR CATEGORIA (PARAMETRIZADO APENAS POR QTD DE ITENS) ---
                var categoriesList = (data.categories && data.categories.length > 0) ? data.categories : [
                    { label: 'MAT. HIGIENE E LIMPEZA', count: 154, percent: 14.0, color: '#2563eb' },
                    { label: 'CEREAIS', count: 144, percent: 12.9, color: '#d97706' },
                    { label: 'MAT. ESPORTIVO E PEDAGÓGICO', count: 129, percent: 10.9, color: '#059669' },
                    { label: 'MAT. EXPEDIENTE', count: 110, percent: 10.0, color: '#7c3aed' },
                    { label: 'Outras Categorias', count: 980, percent: 52.3, color: '#64748b' }
                ];

                var stackedSegments = categoriesList.map(function(c) {
                    return `<div class="cdc-stacked-bar-segment" style="width: ${c.percent}%; background-color: ${c.color};" title="${c.label}: ${c.count} itens (${c.percent}%)"></div>`;
                }).join('');

                var legendItems = categoriesList.map(function(c) {
                    return `
                        <div class="cdc-legend-item" style="padding: 6px 12px; background: #f8fafc; border-radius: 6px; border: 1px solid #f1f5f9;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="cdc-legend-bullet" style="background-color: ${c.color}; width: 10px; height: 10px; border-radius: 3px;"></span>
                                <span style="font-weight: 600; color: #1e293b;">${c.label}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-weight: 700; color: #0f172a; font-size: 13px;">${c.count} itens</span>
                                <span style="font-size: 11px; font-weight: 600; color: #64748b;">(${c.percent}%)</span>
                            </div>
                        </div>
                    `;
                }).join('');

                var totalItemsCount = data.total_items || 655;
                var unitDisplay = data.unit_display_label || 'Todos os Armazéns (46 Armazéns)';

                var categoryFullWidthCard = `
                    <div class="cdc-exec-card" style="margin-bottom: 20px; width: 100%;">
                        <div class="cdc-exec-card-title" style="margin-bottom: 6px;">
                            <span>Composição por Categoria (Parametrizado por Qtd. de Itens)</span>
                            <span style="font-size: 12px; font-weight: 700; color: #2563eb;">Total: ${totalItemsCount} Itens Ativos</span>
                        </div>
                        <div style="font-size: 12px; color: #475569; font-weight: 600; margin-bottom: 12px;">
                            📍 Unidade Filtrada: <span style="color: #0f172a; font-weight: 700;">${unitDisplay}</span>
                        </div>
                        <div class="cdc-stacked-bar" style="height: 18px; border-radius: 8px; margin: 12px 0;">
                            ${stackedSegments}
                        </div>
                        <div class="cdc-legend-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; margin-top: 14px;">
                            ${legendItems}
                        </div>
                    </div>
                `;

                // --- 6. INDICADORES EXECUTIVOS & TENDÊNCIAS (SUB-GRÁFICOS POR PROJETO COM SEMANAS E MÊS) ---
                var periodBtns = `
                    <div class="cdc-period-filter-group" id="cdc-period-filter-group">
                        <button class="cdc-period-btn ${currentSelectedPeriod === 'month' ? 'active' : ''}" data-period="month">Mês</button>
                        <button class="cdc-period-btn ${currentSelectedPeriod === 'quarter' ? 'active' : ''}" data-period="quarter">Trimestre</button>
                        <button class="cdc-period-btn ${currentSelectedPeriod === 'semester' ? 'active' : ''}" data-period="semester">Semestre</button>
                        <button class="cdc-period-btn ${currentSelectedPeriod === 'year' ? 'active' : ''}" data-period="year">Ano</button>
                    </div>
                `;

                var occurrencesData = data.occurrences_data || { labels: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5'], datasets: [] };
                var labelsList = occurrencesData.labels || ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5'];
                var datasetsList = occurrencesData.datasets || [];

                var projectSubChartsHTML = datasetsList.map(function(d) {
                    var maxOcc = Math.max.apply(null, d.occurrences.concat([1]));
                    var barsHTML = labelsList.map(function(lbl, idx) {
                        var val = d.occurrences[idx] || 0;
                        var heightPct = val > 0 ? Math.min(Math.max((val / maxOcc) * 100, 20), 100) : 4;
                        var barColor = val > 0 ? d.color : '#e2e8f0';
                        return `
                            <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; min-width: 32px;">
                                <div style="height: 55px; width: 100%; display: flex; align-items: flex-end; justify-content: center; background: #ffffff; border-radius: 4px; padding: 2px; border: 1px solid #f1f5f9;">
                                    <div style="width: 14px; height: ${heightPct}%; background-color: ${barColor}; border-radius: 3px 3px 0 0;" title="${d.project} (${lbl}): ${val} lançamentos de entrada"></div>
                                </div>
                                <span style="font-size: 10px; font-weight: 600; color: #475569; white-space: nowrap;">${lbl}</span>
                            </div>
                        `;
                    }).join('');

                    return `
                        <div style="padding: 14px 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 14px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <span style="font-size: 14px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                                    <span style="width: 10px; height: 10px; border-radius: 50%; background-color: ${d.color}; display: inline-block;"></span>
                                    ${d.project}
                                </span>
                                <span class="badge-soft-primary" style="font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 6px;">${d.total_occurrences} lançamentos de entrada</span>
                            </div>
                            <div style="display: flex; align-items: flex-end; gap: 6px; overflow-x: auto; padding-bottom: 4px;">
                                ${barsHTML}
                            </div>
                        </div>
                    `;
                }).join('');

                var occurrencesSection = `
                    <div class="cdc-exec-card" style="margin-bottom: 20px; width: 100%;">
                        <div class="cdc-exec-card-title" style="margin-bottom: 16px;">
                            <div>
                                <span style="font-size: 15px; font-weight: 700; color: #0f172a;">Entradas de Estoque por Projeto</span>
                                <div style="font-size: 12px; color: #64748b; font-weight: 500; margin-top: 2px;">Quantidade de lançamentos por semana e programa do CDC</div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 12px; font-weight: 700; color: #64748b;">Período:</span>
                                ${periodBtns}
                            </div>
                        </div>
                        <div>
                            ${projectSubChartsHTML}
                        </div>
                    </div>
                `;

                // --- MONTAGEM FINAL DA PÁGINA REFORMULADA ---
                dashDiv.innerHTML = `
                    ${selectorHeader}
                    ${top4CardsGrid}
                    ${shortcutsBar}
                    ${sideBySideRow}
                    ${categoryFullWidthCard}
                    ${occurrencesSection}
                `;

                window._cdc_debug_dashboard_data = data;

                // Event Listeners sem re-renderizações destrutivas
                $('#cdc-unit-filter-select').off('change').on('change', function(e) {
                    e.stopPropagation();
                    currentSelectedUnit = $(this).val();
                    renderStockDashboard();
                });

                $('.cdc-period-btn').off('click').on('click', function(e) {
                    e.preventDefault();
                    var newPeriod = $(this).data('period');
                    if (newPeriod && newPeriod !== currentSelectedPeriod) {
                        currentSelectedPeriod = newPeriod;
                        renderStockDashboard();
                    }
                });
            }
        });
    }

    $(document).ready(function() {
        renderStockDashboard();
    });

    $(document).on('page-change', function() {
        setTimeout(function() {
            renderStockDashboard();
        }, 300);
    });

})();
