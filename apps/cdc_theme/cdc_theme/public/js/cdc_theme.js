(function() {
    'use strict';

    var currentSelectedUnit = 'All';
    var currentSelectedPeriod = 'quarter'; // Trimestre
    var currentOccurrencesType = 'receipt'; // Entradas
    var currentTableTypeFilter = 'all'; 
    var currentAttemptMode = 1; // 1: Cards, 2: Tabela Semanal, 3: Timeline, 4: Abas, 5: Dual Bars
    var currentActiveMonthTab = {}; // Para o modo 4
    var isDashboardLoading = false;

    function isStockWorkspacePage() {
        var href = (window.location.href || '').toLowerCase();
        var route = (frappe.get_route && frappe.get_route()) ? frappe.get_route() : [];
        var routeStr = route.join('/').toLowerCase();

        if (href.includes('/app/stock') || href.includes('workspace/stock') || href.includes('workspaces/stock')) {
            return true;
        }
        if (routeStr.includes('stock')) {
            return true;
        }

        var pageTitle = ($('.page-title').text() || $('h1').text() || $('.title-text').text() || '').toLowerCase();
        var activeSidebar = ($('.sidebar-item.selected').text() || $('.desk-sidebar .selected').text() || '').toLowerCase();

        if (pageTitle.includes('estoque') || pageTitle.includes('stock') || activeSidebar.includes('estoque') || activeSidebar.includes('stock')) {
            return true;
        }

        return false;
    }

    function renderStockDashboard() {
        if (!isStockWorkspacePage()) return;
        if (isDashboardLoading) return;

        var workspaceBody = document.querySelector('.workspace-page-content') ||
                            document.querySelector('.workspace-body') || 
                            document.querySelector('.layout-main-section') || 
                            document.querySelector('.page-body') ||
                            document.querySelector('.page-container') ||
                            document.querySelector('.workspace-page');
        if (!workspaceBody) return;

        var existingDashboards = document.querySelectorAll('#cdc-stock-exec-dashboard');
        if (existingDashboards.length > 1) {
            for (var i = 1; i < existingDashboards.length; i++) {
                existingDashboards[i].remove();
            }
        }

        var dashDiv = document.getElementById('cdc-stock-exec-dashboard');
        if (!dashDiv) {
            dashDiv = document.createElement('div');
            dashDiv.id = 'cdc-stock-exec-dashboard';
            dashDiv.style.cssText = 'margin-bottom: 24px; user-select: none; -webkit-user-select: none; width: 100%;';
            
            dashDiv.addEventListener('mousedown', function(e) { e.stopPropagation(); }, true);
            dashDiv.addEventListener('mousemove', function(e) { e.stopPropagation(); }, true);
            dashDiv.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); }, true);
            dashDiv.addEventListener('selectstart', function(e) { e.preventDefault(); e.stopPropagation(); }, true);
        }

        if (workspaceBody.firstChild !== dashDiv) {
            workspaceBody.insertBefore(dashDiv, workspaceBody.firstChild);
        }

        isDashboardLoading = true;

        frappe.call({
            method: 'cdc_theme.api.get_stock_dashboard_data',
            args: { 
                selected_unit: currentSelectedUnit,
                period: currentSelectedPeriod,
                entry_type: currentOccurrencesType
            },
            callback: function(r) {
                isDashboardLoading = false;
                if (!r || !r.message) return;

                var data = r.message;

                // --- 1. SELETOR DE ARMAZÉM ---
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
                        <div class="cdc-exec-card" style="padding: 16px; margin-bottom: 0;">
                            <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">🏭 TOTAL DE ARMAZÉM</div>
                            <div style="font-size: 26px; font-weight: 800; color: #0f172a; margin-bottom: 8px;">${totalWh}</div>
                            <div style="display: flex; flex-direction: column; gap: 3px; font-size: 11px; font-weight: 600;">
                                <span style="color: #2563eb;">🔵 ${activeWh} ativos</span>
                                <span style="color: #ef4444;">🔴 ${inactiveWh} inativos (+30 dias)</span>
                            </div>
                        </div>

                        <div class="cdc-exec-card" style="padding: 16px; margin-bottom: 0;">
                            <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">📥 ENTRADA MATERIAL</div>
                            <div style="font-size: 26px; font-weight: 800; color: #0f172a; margin-bottom: 8px;">${receiptsCount}</div>
                            <div style="display: flex; flex-direction: column; gap: 3px; font-size: 11px; font-weight: 600;">
                                <span style="color: #2563eb;">🔵 ${receiptsCount} este mês</span>
                                <span style="color: #d97706;">🟠 158 mês passado</span>
                            </div>
                        </div>

                        <div class="cdc-exec-card" style="padding: 16px; margin-bottom: 0;">
                            <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">📤 SAÍDA DE MATERIAL</div>
                            <div style="font-size: 26px; font-weight: 800; color: #0f172a; margin-bottom: 8px;">${issuesCount}</div>
                            <div style="display: flex; flex-direction: column; gap: 3px; font-size: 11px; font-weight: 600;">
                                <span style="color: #2563eb;">🔵 ${issuesCount} este mês</span>
                                <span style="color: #d97706;">🟠 31 mês passado</span>
                            </div>
                        </div>

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

                // --- 3. ATALHOS OPERACIONAIS ---
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

                // --- 4. LADO A LADO ---
                var projectsList = (data.projects && data.projects.length > 0) ? data.projects : [
                    { project: 'Projeto Atitude II.I', warehouses: 16, items: 619, url: '/app/stock-entry?to_warehouse=ATITUDE II.I' },
                    { project: 'Institucional / Geral', warehouses: 15, items: 64, url: '/app/stock-entry' },
                    { project: 'Projeto Atitude', warehouses: 12, items: 0, url: '/app/stock-entry?to_warehouse=ATITUDE' }
                ];

                var projectPills = projectsList.map(function(pj) {
                    var subtext = (pj.items && pj.items > 0) ? `${pj.items} itens` : 'Sem saldo';
                    return `
                        <a href="${pj.url || '/app/stock-entry'}" class="cdc-city-item" style="padding: 8px 12px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; text-decoration: none;">
                            <div style="display: flex; flex-direction: column; gap: 2px;">
                                <span style="font-weight: 700; color: #1e293b; font-size: 12px;">🔗 ${pj.project}</span>
                                <span style="font-size: 10px; color: #64748b;">${subtext}</span>
                            </div>
                            <span class="badge-soft-primary" style="padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 11px;">${pj.warehouses} armazéns</span>
                        </a>
                    `;
                }).join('');

                var entriesList = (data.recent_entries && Array.isArray(data.recent_entries)) ? data.recent_entries : [];
                var filteredEntries = entriesList.filter(function(row) {
                    if (currentTableTypeFilter === 'receipt') return row.tipo_label === 'Entrada';
                    if (currentTableTypeFilter === 'issue') return row.tipo_label === 'Saída';
                    return true;
                });

                var tableRowsHTML = filteredEntries.map(function(row) {
                    var isIssue = (row.tipo_label === 'Saída');
                    var qtyColor = isIssue ? '#dc2626' : '#2563eb';
                    return `
                        <tr>
                            <td><a href="/app/stock-entry/${row.codigo}" class="cdc-doc-link" style="font-weight: 700; color: #2563eb; font-size: 11px;">${row.codigo}</a></td>
                            <td style="font-weight: 600; color: #475569; font-size: 11px;">${row.data}</td>
                            <td style="font-size: 11px; font-weight: 600; color: #0f172a;">${row.armazem}</td>
                            <td style="font-weight: 700; font-size: 11px; color: ${qtyColor}; white-space: nowrap;">${row.total_itens} <span style="font-size: 10px; font-weight: 500; opacity: 0.85;">(${row.total_pecas} pç)</span></td>
                            <td style="font-weight: 500; color: #475569; font-size: 11px;">${row.usuario}</td>
                        </tr>
                    `;
                }).join('');

                var tableFilterPills = `
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <button class="cdc-table-filter-btn ${currentTableTypeFilter === 'all' ? 'active' : ''}" data-type="all">Todos</button>
                        <button class="cdc-table-filter-btn ${currentTableTypeFilter === 'receipt' ? 'active' : ''}" data-type="receipt">Entradas</button>
                        <button class="cdc-table-filter-btn ${currentTableTypeFilter === 'issue' ? 'active' : ''}" data-type="issue">Saídas</button>
                    </div>
                `;

                var sideBySideRow = `
                    <div style="display: grid; grid-template-columns: 330px 1fr; gap: 16px; margin-bottom: 20px;">
                        <div class="cdc-exec-card" style="margin-bottom: 0; padding: 16px;">
                            <div class="cdc-exec-card-title" style="margin-bottom: 10px;">
                                <span>Armazéns por Projeto</span>
                                <span style="font-size: 11px; color: #2563eb; font-weight: 700;">🔗 Abrir</span>
                            </div>
                            <div style="max-height: 380px; overflow-y: auto;">
                                ${projectPills}
                            </div>
                        </div>

                        <div class="cdc-exec-card" style="margin-bottom: 0; padding: 16px;">
                            <div class="cdc-exec-card-title" style="margin-bottom: 10px;">
                                <span>Últimas Movimentações</span>
                                ${tableFilterPills}
                            </div>
                            <div class="cdc-table-container" style="max-height: 380px; overflow-y: auto;">
                                <table class="cdc-table">
                                    <thead>
                                        <tr>
                                            <th>Código</th>
                                            <th>Data</th>
                                            <th>Armazém</th>
                                            <th>Qtd.</th>
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

                // --- 5. COMPOSIÇÃO POR CATEGORIA ---
                var categoriesList = (data.categories && data.categories.length > 0) ? data.categories : [];
                var stackedSegments = categoriesList.map(function(c) {
                    return `<div class="cdc-stacked-bar-segment" style="width: ${c.percent}%; background-color: ${c.color};" title="${c.label}: ${c.count} itens (${c.percent}%)"></div>`;
                }).join('');

                var legendItems = categoriesList.map(function(c) {
                    return `
                        <div style="padding: 6px 12px; background: #f8fafc; border-radius: 6px; border: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="background-color: ${c.color}; width: 10px; height: 10px; border-radius: 3px; display: inline-block;"></span>
                                <span style="font-weight: 600; color: #1e293b; font-size: 12px;">${c.label}</span>
                            </div>
                            <span style="font-weight: 700; color: #0f172a; font-size: 12px;">${c.count} (${c.percent}%)</span>
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
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; margin-top: 14px;">
                            ${legendItems}
                        </div>
                    </div>
                `;

                // --- 6. SELETOR DAS 5 TENTATIVAS DE MONITORAMENTO ---
                var occurrencesData = data.occurrences_data || { labels: [], datasets: [], grouped_months: [] };
                var datasetsList = occurrencesData.datasets || [];
                var groupedMonthsList = occurrencesData.grouped_months || [];

                var attemptSwitcherHTML = `
                    <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 16px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                        <div style="font-size: 13px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 6px;">
                            <span>🧪 Alternar Tentativa de Exibição:</span>
                        </div>
                        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                            <button class="cdc-attempt-btn ${currentAttemptMode === 1 ? 'active' : ''}" data-attempt="1">Tentativa 1: Cards Modulares</button>
                            <button class="cdc-attempt-btn ${currentAttemptMode === 2 ? 'active' : ''}" data-attempt="2">Tentativa 2: Tabela Executiva</button>
                            <button class="cdc-attempt-btn ${currentAttemptMode === 3 ? 'active' : ''}" data-attempt="3">Tentativa 3: Linha do Tempo</button>
                            <button class="cdc-attempt-btn ${currentAttemptMode === 4 ? 'active' : ''}" data-attempt="4">Tentativa 4: Abas por Mês</button>
                            <button class="cdc-attempt-btn ${currentAttemptMode === 5 ? 'active' : ''}" data-attempt="5">Tentativa 5: Entradas vs Saídas</button>
                        </div>
                    </div>
                `;

                var typeFilterBtns = `
                    <div style="display: flex; gap: 4px; align-items: center;">
                        <button class="cdc-occ-type-btn ${currentOccurrencesType === 'receipt' ? 'active-receipt' : ''}" data-occ-type="receipt">Entradas</button>
                        <button class="cdc-occ-type-btn ${currentOccurrencesType === 'issue' ? 'active-issue' : ''}" data-occ-type="issue">Saídas</button>
                    </div>
                `;

                var periodBtns = `
                    <div class="cdc-period-filter-group" id="cdc-period-filter-group">
                        <button class="cdc-period-btn ${currentSelectedPeriod === 'month' ? 'active' : ''}" data-period="month">Mês</button>
                        <button class="cdc-period-btn ${currentSelectedPeriod === 'quarter' ? 'active' : ''}" data-period="quarter">Trimestre</button>
                        <button class="cdc-period-btn ${currentSelectedPeriod === 'semester' ? 'active' : ''}" data-period="semester">Semestre</button>
                        <button class="cdc-period-btn ${currentSelectedPeriod === 'year' ? 'active' : ''}" data-period="year">Ano</button>
                    </div>
                `;

                // RENDERIZADOR DAS 5 TENTATIVAS
                var renderedProjectsHTML = datasetsList.map(function(d) {
                    var maxOcc = Math.max.apply(null, d.occurrences.concat([1]));
                    var stepOcc = Math.max(Math.ceil(maxOcc / 2), 1);
                    var topOcc = stepOcc * 2;
                    var chartTypeBadgeText = (currentOccurrencesType === 'issue') ? 'saídas' : 'entradas';

                    // --- TENTATIVA 1: Mini-Cards Modulares por Mês ---
                    if (currentAttemptMode === 1) {
                        var globalIndex = 0;
                        var monthCards = groupedMonthsList.map(function(gm) {
                            var monthTotal = 0;
                            var monthBarsHTML = gm.weeks.map(function(wLbl) {
                                var val = d.occurrences[globalIndex] || 0;
                                monthTotal += val;
                                globalIndex++;
                                var heightPct = val > 0 ? Math.min(Math.max((val / topOcc) * 100, 18), 100) : 4;
                                var barColor = val > 0 ? (currentOccurrencesType === 'issue' ? '#dc2626' : d.color) : '#e2e8f0';
                                var qtyText = val > 0 ? `<span style="font-size: 11px; font-weight: 800; color: #0f172a;">${val}</span>` : '<span style="font-size: 9px; color: #cbd5e1;">-</span>';

                                return `
                                    <div style="display: flex; flex-direction: column; align-items: center; gap: 2px; flex: 1;">
                                        ${qtyText}
                                        <div style="height: 50px; width: 100%; display: flex; align-items: flex-end; justify-content: center;">
                                            <div style="width: 14px; height: ${heightPct}%; background-color: ${barColor}; border-radius: 3px 3px 0 0;"></div>
                                        </div>
                                        <span style="font-size: 10px; font-weight: 700; color: #475569;">${wLbl}</span>
                                    </div>
                                `;
                            }).join('');

                            return `
                                <div style="flex: ${gm.weeks.length}; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px; min-width: 140px; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
                                    <div style="display: flex; justify-content: space-between; align-items: center; background: #f1f5f9; padding: 6px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                                        <span style="font-size: 11px; font-weight: 800; color: #0f172a;">🗓️ ${gm.month}</span>
                                        <span class="badge-soft-primary" style="font-size: 10px; font-weight: 800;">${monthTotal} ${chartTypeBadgeText}</span>
                                    </div>
                                    <div style="display: flex; align-items: flex-end; gap: 4px; justify-content: space-around; margin-top: 4px;">
                                        ${monthBarsHTML}
                                    </div>
                                </div>
                            `;
                        }).join('');

                        return `
                            <div style="padding: 16px; background: #f8fafc; border-radius: 12px; border: 1px solid #cbd5e1; margin-bottom: 16px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                    <span style="font-size: 14px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                                        <span style="width: 10px; height: 10px; border-radius: 50%; background-color: ${currentOccurrencesType === 'issue' ? '#dc2626' : d.color}; display: inline-block;"></span>
                                        ${d.project}
                                    </span>
                                    <span class="badge-soft-primary" style="font-size: 12px; font-weight: 700; padding: 4px 12px;">Total: ${d.total_occurrences} ${chartTypeBadgeText}</span>
                                </div>
                                <div style="display: flex; gap: 12px; overflow-x: auto;">
                                    ${monthCards}
                                </div>
                            </div>
                        `;
                    }

                    // --- TENTATIVA 2: Matriz Tabela Executiva Semanal ---
                    if (currentAttemptMode === 2) {
                        var globalIndex = 0;
                        var tableRows = groupedMonthsList.map(function(gm) {
                            var monthTotal = 0;
                            var weekCells = gm.weeks.map(function(wLbl) {
                                var val = d.occurrences[globalIndex] || 0;
                                monthTotal += val;
                                globalIndex++;
                                var pillHTML = val > 0 ? `<span style="background: #2563eb; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 800; font-size: 11px;">${val}</span>` : '<span style="color: #cbd5e1;">-</span>';
                                return `<td style="text-align: center; padding: 8px;">${pillHTML}</td>`;
                            }).join('');

                            return `
                                <tr>
                                    <td style="font-weight: 800; color: #0f172a; font-size: 11px; padding: 8px 12px; background: #f8fafc;">🗓️ ${gm.month}</td>
                                    ${weekCells}
                                    <td style="font-weight: 800; color: #2563eb; text-align: center; padding: 8px; background: #f8fafc;">${monthTotal}</td>
                                </tr>
                            `;
                        }).join('');

                        return `
                            <div style="padding: 16px; background: #ffffff; border-radius: 12px; border: 1px solid #cbd5e1; margin-bottom: 16px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                    <span style="font-size: 14px; font-weight: 700; color: #1e293b;">${d.project}</span>
                                    <span class="badge-soft-primary" style="font-size: 12px; font-weight: 700;">Total: ${d.total_occurrences} ${chartTypeBadgeText}</span>
                                </div>
                                <table class="cdc-table" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                                    <thead>
                                        <tr>
                                            <th>Mês</th>
                                            <th style="text-align: center;">Sem. 1</th>
                                            <th style="text-align: center;">Sem. 2</th>
                                            <th style="text-align: center;">Sem. 3</th>
                                            <th style="text-align: center;">Sem. 4</th>
                                            <th style="text-align: center;">Sem. 5</th>
                                            <th style="text-align: center;">Total Mês</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${tableRows}
                                    </tbody>
                                </table>
                            </div>
                        `;
                    }

                    // --- TENTATIVA 3: Linha do Tempo Contínua ---
                    if (currentAttemptMode === 3) {
                        var barsHTML = occurrencesData.labels.map(function(lbl, idx) {
                            var val = d.occurrences[idx] || 0;
                            var heightPct = val > 0 ? Math.min(Math.max((val / topOcc) * 100, 18), 100) : 4;
                            var barColor = val > 0 ? '#2563eb' : '#e2e8f0';
                            var qtyText = val > 0 ? `<span style="font-size: 11px; font-weight: 800; color: #0f172a;">${val}</span>` : '<span style="font-size: 9px; color: #cbd5e1;">-</span>';

                            return `
                                <div style="display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 24px;">
                                    ${qtyText}
                                    <div style="height: 60px; width: 100%; display: flex; align-items: flex-end; justify-content: center;">
                                        <div style="width: 12px; height: ${heightPct}%; background-color: ${barColor}; border-radius: 3px 3px 0 0;"></div>
                                    </div>
                                    <span style="font-size: 9px; font-weight: 700; color: #64748b; margin-top: 4px;">${lbl.replace(/.*S/, 'S')}</span>
                                </div>
                            `;
                        }).join('');

                        var monthFlowHeader = groupedMonthsList.map(function(gm) {
                            return `<div style="flex: ${gm.weeks.length}; text-align: center; background: #e2e8f0; padding: 4px; font-size: 10px; font-weight: 800; color: #1e293b; border-radius: 4px;">└─ ${gm.month} ─┘</div>`;
                        }).join('');

                        return `
                            <div style="padding: 16px; background: #f8fafc; border-radius: 12px; border: 1px solid #cbd5e1; margin-bottom: 16px;">
                                <div style="font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 12px;">${d.project} (Linha do Tempo)</div>
                                <div style="display: flex; align-items: flex-end; gap: 4px; overflow-x: auto; padding-bottom: 8px;">
                                    ${barsHTML}
                                </div>
                                <div style="display: flex; gap: 6px; margin-top: 8px;">
                                    ${monthFlowHeader}
                                </div>
                            </div>
                        `;
                    }

                    // --- TENTATIVA 4: Navegação por Abas de Mês ---
                    if (currentAttemptMode === 4) {
                        var activeMonth = currentActiveMonthTab[d.project] || (groupedMonthsList[0] ? groupedMonthsList[0].month : '');
                        var selectedMonthObj = groupedMonthsList.find(function(gm) { return gm.month === activeMonth; }) || groupedMonthsList[0];

                        var tabsHTML = groupedMonthsList.map(function(gm) {
                            var isActive = (gm.month === selectedMonthObj.month);
                            return `<button class="cdc-month-tab-btn ${isActive ? 'active' : ''}" data-project="${d.project}" data-month="${gm.month}" style="padding: 6px 14px; font-size: 12px; font-weight: 700; border-radius: 6px; border: 1px solid #cbd5e1; cursor: pointer; background: ${isActive ? '#2563eb' : '#ffffff'}; color: ${isActive ? '#ffffff' : '#475569'};">🗓️ ${gm.month}</button>`;
                        }).join('');

                        var globalIndex = 0;
                        var selectedMonthBars = '';
                        groupedMonthsList.forEach(function(gm) {
                            gm.weeks.forEach(function(wLbl) {
                                var val = d.occurrences[globalIndex] || 0;
                                if (gm.month === selectedMonthObj.month) {
                                    var heightPct = val > 0 ? Math.min(Math.max((val / topOcc) * 100, 18), 100) : 4;
                                    selectedMonthBars += `
                                        <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
                                            <span style="font-size: 12px; font-weight: 800; color: #0f172a;">${val}</span>
                                            <div style="height: 70px; width: 100%; display: flex; align-items: flex-end; justify-content: center;">
                                                <div style="width: 18px; height: ${heightPct}%; background-color: #2563eb; border-radius: 4px 4px 0 0;"></div>
                                            </div>
                                            <span style="font-size: 11px; font-weight: 700; color: #475569; margin-top: 6px;">${wLbl}</span>
                                        </div>
                                    `;
                                }
                                globalIndex++;
                            });
                        });

                        return `
                            <div style="padding: 16px; background: #ffffff; border-radius: 12px; border: 1px solid #cbd5e1; margin-bottom: 16px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                    <span style="font-size: 14px; font-weight: 700; color: #1e293b;">${d.project}</span>
                                    <div style="display: flex; gap: 6px;">${tabsHTML}</div>
                                </div>
                                <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; display: flex; gap: 12px; justify-content: space-around;">
                                    ${selectedMonthBars}
                                </div>
                            </div>
                        `;
                    }

                    // --- TENTATIVA 5: Barras Lado a Lado (Entradas VS Saídas) ---
                    if (currentAttemptMode === 5) {
                        var globalIndex = 0;
                        var dualMonthBlocks = groupedMonthsList.map(function(gm) {
                            var monthBarsHTML = gm.weeks.map(function(wLbl) {
                                var valReceipt = d.occurrences[globalIndex] || 0;
                                var valIssue = 0; // Exemplo comparativo
                                globalIndex++;

                                return `
                                    <div style="display: flex; flex-direction: column; align-items: center; gap: 2px; flex: 1;">
                                        <div style="display: flex; gap: 2px; align-items: flex-end; height: 60px;">
                                            <div style="width: 10px; height: ${valReceipt > 0 ? 50 : 4}%; background-color: #2563eb; border-radius: 2px 2px 0 0;" title="Entradas: ${valReceipt}"></div>
                                            <div style="width: 10px; height: ${valIssue > 0 ? 50 : 4}%; background-color: #dc2626; border-radius: 2px 2px 0 0;" title="Saídas: ${valIssue}"></div>
                                        </div>
                                        <span style="font-size: 10px; font-weight: 700; color: #475569; margin-top: 4px;">${wLbl}</span>
                                    </div>
                                `;
                            }).join('');

                            return `
                                <div style="flex: ${gm.weeks.length}; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px;">
                                    <div style="background: #f1f5f9; color: #0f172a; font-size: 11px; font-weight: 800; border-radius: 6px; padding: 4px; text-align: center;">🗓️ ${gm.month}</div>
                                    <div style="display: flex; align-items: flex-end; gap: 4px; justify-content: space-around;">
                                        ${monthBarsHTML}
                                    </div>
                                </div>
                            `;
                        }).join('');

                        return `
                            <div style="padding: 16px; background: #f8fafc; border-radius: 12px; border: 1px solid #cbd5e1; margin-bottom: 16px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                    <span style="font-size: 14px; font-weight: 700; color: #1e293b;">${d.project} (Comparativo Duplo)</span>
                                    <div style="display: flex; gap: 10px; font-size: 11px; font-weight: 700;">
                                        <span style="color: #2563eb;">🟦 Entradas</span>
                                        <span style="color: #dc2626;">🟥 Saídas</span>
                                    </div>
                                </div>
                                <div style="display: flex; gap: 10px;">
                                    ${dualMonthBlocks}
                                </div>
                            </div>
                        `;
                    }

                }).join('');

                var occurrencesSection = `
                    <div class="cdc-exec-card" style="margin-bottom: 20px; width: 100%;">
                        <div class="cdc-exec-card-title" style="margin-bottom: 16px;">
                            <div>
                                <span style="font-size: 16px; font-weight: 800; color: #0f172a;">Monitoramento de Lançamentos</span>
                                <div style="font-size: 12px; color: #64748b; font-weight: 500; margin-top: 2px;">Volume de lançamentos por período e programa do CDC</div>
                            </div>
                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 12px; font-weight: 700; color: #64748b;">Período:</span>
                                    ${periodBtns}
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 12px; font-weight: 700; color: #64748b;">Tipo:</span>
                                    ${typeFilterBtns}
                                </div>
                            </div>
                        </div>
                        ${attemptSwitcherHTML}
                        <div>
                            ${renderedProjectsHTML}
                        </div>
                    </div>
                `;

                // MONTAGEM FINAL
                dashDiv.innerHTML = `
                    ${selectorHeader}
                    ${top4CardsGrid}
                    ${shortcutsBar}
                    ${sideBySideRow}
                    ${categoryFullWidthCard}
                    ${occurrencesSection}
                `;

                window._cdc_debug_dashboard_data = data;
            }
        });
    }

    // --- EVENT DELEGATION GLOBAL ---
    $(document).ready(function() {
        renderStockDashboard();

        $(document).off('change', '#cdc-unit-filter-select').on('change', '#cdc-unit-filter-select', function(e) {
            e.stopPropagation();
            currentSelectedUnit = $(this).val();
            renderStockDashboard();
        });

        $(document).off('click', '.cdc-table-filter-btn').on('click', '.cdc-table-filter-btn', function(e) {
            e.preventDefault();
            var type = $(this).data('type');
            if (type && type !== currentTableTypeFilter) {
                currentTableTypeFilter = type;
                renderStockDashboard();
            }
        });

        $(document).off('click', '[data-occ-type]').on('click', '[data-occ-type]', function(e) {
            e.preventDefault();
            var occType = $(this).attr('data-occ-type') || $(this).data('occ-type');
            if (occType && occType !== currentOccurrencesType) {
                currentOccurrencesType = occType;
                renderStockDashboard();
            }
        });

        $(document).off('click', '.cdc-period-btn').on('click', '.cdc-period-btn', function(e) {
            e.preventDefault();
            var newPeriod = $(this).attr('data-period') || $(this).data('period');
            if (newPeriod && newPeriod !== currentSelectedPeriod) {
                currentSelectedPeriod = newPeriod;
                renderStockDashboard();
            }
        });

        // NAVEGADOR DAS 5 TENTATIVAS
        $(document).off('click', '.cdc-attempt-btn').on('click', '.cdc-attempt-btn', function(e) {
            e.preventDefault();
            var mode = parseInt($(this).attr('data-attempt') || $(this).data('attempt'), 10);
            if (mode && mode !== currentAttemptMode) {
                currentAttemptMode = mode;
                renderStockDashboard();
            }
        });

        // TABS DO MENSAL (MODO 4)
        $(document).off('click', '.cdc-month-tab-btn').on('click', '.cdc-month-tab-btn', function(e) {
            e.preventDefault();
            var pj = $(this).data('project');
            var m = $(this).data('month');
            if (pj && m) {
                currentActiveMonthTab[pj] = m;
                renderStockDashboard();
            }
        });
    });

    setInterval(function() {
        if (isStockWorkspacePage()) {
            var dashContainer = document.getElementById('cdc-stock-exec-dashboard');
            if (!dashContainer && !isDashboardLoading) {
                renderStockDashboard();
            }
        }
    }, 400);

    $(document).on('page-change', function() {
        setTimeout(function() {
            renderStockDashboard();
        }, 100);
    });

})();
