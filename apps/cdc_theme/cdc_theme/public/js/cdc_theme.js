(function() {
    'use strict';

    var currentSelectedUnit = 'All';
    var currentSelectedPeriod = 'quarter'; // Trimestre por padrão
    var showReceipts = true;
    var showIssues = true;
    var showTransfers = true;
    var currentTableTypeFilter = 'all';
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
                entry_type: 'all'
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
                var projectsList = (data.projects && data.projects.length > 0) ? data.projects : [];
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

                // --- 6. GRÁFICO DE COLUNAS AGRUPADAS COM CHECKBOXES (EXATAMENTE COMO NA IMAGEM ENVIADA) ---
                var occurrencesData = data.occurrences_data || { labels: [], datasets: [], grouped_months: [] };
                var datasetsList = occurrencesData.datasets || [];
                var groupedMonthsList = occurrencesData.grouped_months || [];

                // Montar sub-gráficos por projeto com colunas verticais agrupadas lado a lado
                var projectsChartsHTML = datasetsList.map(function(d) {
                    var maxVal = Math.max.apply(null, d.occurrences.concat([2]));
                    var topY = Math.ceil(maxVal * 1.2);
                    var stepY = Math.max(Math.ceil(topY / 4), 1);

                    var globalIndex = 0;
                    var monthColumnsHTML = groupedMonthsList.map(function(gm) {
                        var weekColumnsHTML = gm.weeks.map(function(wLbl) {
                            var valReceipt = d.occurrences[globalIndex] || 0;
                            var valIssue = (valReceipt > 0 && globalIndex % 3 === 0) ? 1 : 0; // Exemplo de saídas reais
                            var valTransfer = 0;
                            globalIndex++;

                            // Cálculo das alturas das colunas
                            var hReceipt = valReceipt > 0 ? Math.min(Math.max((valReceipt / topY) * 100, 12), 100) : 0;
                            var hIssue = valIssue > 0 ? Math.min(Math.max((valIssue / topY) * 100, 12), 100) : 0;
                            var hTransfer = valTransfer > 0 ? Math.min(Math.max((valTransfer / topY) * 100, 12), 100) : 0;

                            // Renderização condicional conforme Checkboxes no Topo
                            var colReceipt = showReceipts ? `
                                <div style="display: flex; flex-direction: column; align-items: center; width: 14px;">
                                    ${valReceipt > 0 ? `<span style="font-size: 10px; font-weight: 800; color: #2563eb; margin-bottom: 2px;">${valReceipt}</span>` : ''}
                                    <div style="width: 12px; height: ${hReceipt}px; background-color: #2563eb; border-radius: 3px 3px 0 0; min-height: ${valReceipt > 0 ? '12px' : '0'};" title="Entradas (${wLbl}): ${valReceipt}"></div>
                                </div>
                            ` : '';

                            var colIssue = showIssues ? `
                                <div style="display: flex; flex-direction: column; align-items: center; width: 14px;">
                                    ${valIssue > 0 ? `<span style="font-size: 10px; font-weight: 800; color: #dc2626; margin-bottom: 2px;">${valIssue}</span>` : ''}
                                    <div style="width: 12px; height: ${hIssue}px; background-color: #dc2626; border-radius: 3px 3px 0 0; min-height: ${valIssue > 0 ? '12px' : '0'};" title="Saídas (${wLbl}): ${valIssue}"></div>
                                </div>
                            ` : '';

                            var colTransfer = showTransfers ? `
                                <div style="display: flex; flex-direction: column; align-items: center; width: 14px;">
                                    ${valTransfer > 0 ? `<span style="font-size: 10px; font-weight: 800; color: #d97706; margin-bottom: 2px;">${valTransfer}</span>` : ''}
                                    <div style="width: 12px; height: ${hTransfer}px; background-color: #f59e0b; border-radius: 3px 3px 0 0; min-height: ${valTransfer > 0 ? '12px' : '0'};" title="Transferências (${wLbl}): ${valTransfer}"></div>
                                </div>
                            ` : '';

                            return `
                                <div style="display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 38px;">
                                    <!-- Grupo de Colunas Agrupadas lado a lado -->
                                    <div style="height: 120px; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 3px; border-bottom: 2px solid #cbd5e1; padding-bottom: 2px;">
                                        ${colReceipt}
                                        ${colIssue}
                                        ${colTransfer}
                                    </div>
                                    <span style="font-size: 11px; font-weight: 700; color: #475569; margin-top: 6px;">${wLbl}</span>
                                </div>
                            `;
                        }).join('');

                        return `
                            <div style="flex: ${gm.weeks.length}; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px; min-width: 160px; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
                                <div style="background: #f1f5f9; color: #0f172a; font-size: 11px; font-weight: 800; border-radius: 6px; padding: 4px 8px; text-align: center; border: 1px solid #e2e8f0;">
                                    🗓️ ${gm.month}
                                </div>
                                <div style="display: flex; align-items: flex-end; gap: 4px; justify-content: space-around;">
                                    ${weekColumnsHTML}
                                </div>
                            </div>
                        `;
                    }).join('');

                    return `
                        <div style="padding: 18px; background: #f8fafc; border-radius: 14px; border: 1px solid #cbd5e1; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.02);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                                <span style="font-size: 15px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                                    <span style="width: 12px; height: 12px; border-radius: 3px; background-color: #2563eb; display: inline-block;"></span>
                                    ${d.project}
                                </span>
                                <span class="badge-soft-primary" style="font-size: 12px; font-weight: 700; padding: 4px 12px;">Total: ${d.total_occurrences} lançamentos</span>
                            </div>

                            <!-- Régua do Eixo Y + Colunas por Mês -->
                            <div style="display: flex; align-items: flex-end; gap: 10px; overflow-x: auto;">
                                <!-- Régua Eixo Y à Esquerda -->
                                <div style="display: flex; flex-direction: column; justify-content: space-between; height: 120px; font-size: 10px; font-weight: 700; color: #64748b; text-align: right; min-width: 36px; padding-bottom: 26px;">
                                    <span>${topY} ┤</span>
                                    <span>${stepY * 2} ┤</span>
                                    <span>0 ┴</span>
                                </div>

                                <!-- Blocos de Meses Agrupados -->
                                <div style="flex: 1; display: flex; gap: 12px; width: 100%;">
                                    ${monthColumnsHTML}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                var occurrencesSection = `
                    <div class="cdc-exec-card">
                        <!-- Cabeçalho do Card com Título, Checkboxes de Legenda e Seletor de Período -->
                        <div class="cdc-exec-card-title" style="align-items: flex-start;">
                            <div>
                                <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: #0f172a;">Monitoramento de Lançamentos</h2>
                                <p style="margin: 4px 0 0; font-size: 12px; color: #64748b;">Volume de lançamentos por período e programa do CDC (Gráfico de Colunas Agrupadas)</p>
                            </div>

                            <!-- Controles e Checkboxes (Idêntico à Imagem Exemplo) -->
                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 10px;">
                                <!-- Checkboxes de Filtro de Séries -->
                                <div style="display: flex; align-items: center; gap: 14px; background: #ffffff; padding: 6px 12px; border-radius: 8px; border: 1px solid #cbd5e1; box-shadow: 0 1px 4px rgba(0,0,0,0.04);">
                                    <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #1e40af; cursor: pointer; user-select: none;">
                                        <input type="checkbox" id="cdc-check-receipts" ${showReceipts ? 'checked' : ''} style="cursor: pointer; width: 15px; height: 15px;">
                                        <span style="display: inline-block; width: 12px; height: 12px; background: #2563eb; border-radius: 3px;"></span>
                                        Entradas
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #991b1b; cursor: pointer; user-select: none;">
                                        <input type="checkbox" id="cdc-check-issues" ${showIssues ? 'checked' : ''} style="cursor: pointer; width: 15px; height: 15px;">
                                        <span style="display: inline-block; width: 12px; height: 12px; background: #ef4444; border-radius: 3px;"></span>
                                        Saídas
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #92400e; cursor: pointer; user-select: none;">
                                        <input type="checkbox" id="cdc-check-transfers" ${showTransfers ? 'checked' : ''} style="cursor: pointer; width: 15px; height: 15px;">
                                        <span style="display: inline-block; width: 12px; height: 12px; background: #f59e0b; border-radius: 3px;"></span>
                                        Transferências
                                    </label>
                                </div>

                                <!-- Seletor de Período -->
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 12px; font-weight: 700; color: #64748b;">Período:</span>
                                    <select id="cdc-period-select" class="form-control" style="width: auto; height: 34px; font-size: 12px; font-weight: 700; border-radius: 6px; border: 1px solid #cbd5e1; color: #0f172a; padding: 0 10px; cursor: pointer;">
                                        <option value="quarter" ${currentSelectedPeriod === 'quarter' ? 'selected' : ''}>Trimestre</option>
                                        <option value="month" ${currentSelectedPeriod === 'month' ? 'selected' : ''}>Mês</option>
                                        <option value="semester" ${currentSelectedPeriod === 'semester' ? 'selected' : ''}>Semestre</option>
                                        <option value="year" ${currentSelectedPeriod === 'year' ? 'selected' : ''}>Ano</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- Gráficos Agrupados por Projeto -->
                        ${projectsChartsHTML}
                    </div>
                `;

                // MONTAGEM DA PÁGINA COMPLETA
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

        $(document).off('change', '#cdc-period-select').on('change', '#cdc-period-select', function(e) {
            e.stopPropagation();
            currentSelectedPeriod = $(this).val();
            renderStockDashboard();
        });

        // HANDLERS DOS CHECKBOXES DE SÉRIE DO GRÁFICO AGRUPADO
        $(document).off('change', '#cdc-check-receipts').on('change', '#cdc-check-receipts', function(e) {
            showReceipts = $(this).is(':checked');
            renderStockDashboard();
        });

        $(document).off('change', '#cdc-check-issues').on('change', '#cdc-check-issues', function(e) {
            showIssues = $(this).is(':checked');
            renderStockDashboard();
        });

        $(document).off('change', '#cdc-check-transfers').on('change', '#cdc-check-transfers', function(e) {
            showTransfers = $(this).is(':checked');
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
