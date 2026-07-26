(function() {
    'use strict';

    var currentSelectedUnit = 'All';
    var currentSelectedPeriod = 'quarter'; // Trimestre
    var currentOccurrencesType = 'all'; // Todos
    var currentTableTypeFilter = 'all';
    var activeCategoriesMap = {}; // Controle de categorias ativas (checkboxes)
    var isDashboardLoading = false;
    var lastFetchTime = 0;

    function isStockWorkspacePage() {
        var href = (window.location.href || '').toLowerCase();
        var route = (frappe.get_route && frappe.get_route()) ? frappe.get_route() : [];
        var routeStr = route.join('/').toLowerCase();

        if (href.includes('/app/stock') || href.includes('workspace/stock') || href.includes('workspaces/stock') || routeStr.includes('stock')) {
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

        if (isDashboardLoading && (Date.now() - lastFetchTime > 6000)) {
            isDashboardLoading = false;
        }

        if (isDashboardLoading) return;

        var workspaceBody = document.querySelector('.workspace-page-content') ||
                            document.querySelector('.workspace-body') || 
                            document.querySelector('.layout-main-section') || 
                            document.querySelector('.page-body') ||
                            document.querySelector('.page-container') ||
                            document.querySelector('.workspace-page') ||
                            document.querySelector('#body');
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
            dashDiv.style.cssText = 'margin-bottom: 24px; user-select: none; -webkit-user-select: none; width: 100%; min-height: 400px;';
        }

        if (workspaceBody.firstChild !== dashDiv) {
            workspaceBody.insertBefore(dashDiv, workspaceBody.firstChild);
        }

        isDashboardLoading = true;
        lastFetchTime = Date.now();

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

                // --- 5. COMPOSIÇÃO POR CATEGORIA COM GRÁFICO ROSCA (DONUT CHART) + CHECKBOXES INTERATIVOS ---
                var rawCategoriesList = (data.categories && data.categories.length > 0) ? data.categories : [];
                
                // Inicializar mapa de checkboxes ativos se ainda não existir
                rawCategoriesList.forEach(function(c) {
                    if (activeCategoriesMap[c.label] === undefined) {
                        activeCategoriesMap[c.label] = true;
                    }
                });

                // Filtrar categorias ativas conforme os Checkboxes
                var activeCategories = rawCategoriesList.filter(function(c) {
                    return activeCategoriesMap[c.label] !== false;
                });

                var activeCategoriesTotal = activeCategories.reduce(function(sum, c) { return sum + c.count; }, 0);

                // Cálculo das fatias do Gráfico Rosca (SVG Donut Chart)
                var accumulatedPercent = 0;
                var donutSlicesSVG = activeCategories.map(function(c) {
                    var pct = activeCategoriesTotal > 0 ? ((c.count / activeCategoriesTotal) * 100) : 0;
                    var strokeDasharray = `${pct} ${100 - pct}`;
                    var strokeDashoffset = 100 - accumulatedPercent + 25; // 25 compensa início no topo (12 horas)
                    accumulatedPercent += pct;

                    return `<circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="${c.color}" stroke-width="6" stroke-dasharray="${strokeDasharray}" stroke-dashoffset="${strokeDashoffset}" style="transition: all 0.3s ease;"></circle>`;
                }).join('');

                var donutSVGChart = `
                    <div style="position: relative; width: 170px; height: 170px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <svg width="160" height="160" viewBox="0 0 42 42" style="transform: rotate(-90deg); border-radius: 50%;">
                            <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#e2e8f0" stroke-width="6"></circle>
                            ${donutSlicesSVG}
                        </svg>
                        <div style="position: absolute; text-align: center; pointer-events: none;">
                            <div style="font-size: 24px; font-weight: 800; color: #0f172a; line-height: 1;">${activeCategoriesTotal}</div>
                            <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Itens</div>
                        </div>
                    </div>
                `;

                // Legenda com Checkboxes Interativos
                var categoryCheckboxItems = rawCategoriesList.map(function(c) {
                    var isChecked = activeCategoriesMap[c.label] !== false;
                    var displayPercent = activeCategoriesTotal > 0 && isChecked ? ((c.count / activeCategoriesTotal) * 100).toFixed(1) : c.percent;

                    return `
                        <label style="padding: 10px 14px; background: #f8fafc; border-radius: 8px; border: 1px solid #cbd5e1; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; transition: all 0.15s ease;" class="cdc-cat-label-item">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <input type="checkbox" class="cdc-cat-checkbox" data-label="${c.label}" ${isChecked ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;">
                                <span style="background-color: ${c.color}; width: 12px; height: 12px; border-radius: 3px; display: inline-block;"></span>
                                <span style="font-weight: 700; color: #1e293b; font-size: 12px;">${c.label}</span>
                            </div>
                            <span style="font-weight: 800; color: #0f172a; font-size: 12px;">${c.count} (${displayPercent}%)</span>
                        </label>
                    `;
                }).join('');

                var totalItemsCount = data.total_items || 655;
                var unitDisplay = data.unit_display_label || 'Todos os Armazéns (46 Armazéns)';

                var categoryFullWidthCard = `
                    <div class="cdc-exec-card" style="margin-bottom: 20px; width: 100%;">
                        <div class="cdc-exec-card-title" style="margin-bottom: 6px;">
                            <span>Composição por Categoria (Gráfico Rosca com Checkboxes)</span>
                            <span style="font-size: 12px; font-weight: 700; color: #2563eb;">Total Geral: ${totalItemsCount} Itens</span>
                        </div>
                        <div style="font-size: 12px; color: #475569; font-weight: 600; margin-bottom: 16px;">
                            📍 Unidade Filtrada: <span style="color: #0f172a; font-weight: 700;">${unitDisplay}</span>
                        </div>

                        <!-- Lado a Lado: Gráfico Rosca (Esquerda) + Checkboxes (Direita) -->
                        <div style="display: flex; gap: 24px; align-items: center; flex-wrap: wrap;">
                            ${donutSVGChart}

                            <div style="flex: 1; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; min-width: 300px;">
                                ${categoryCheckboxItems}
                            </div>
                        </div>
                    </div>
                `;

                // --- 6. MONITORAMENTO DE LANÇAMENTOS ---
                var occurrencesData = data.occurrences_data || { labels: [], datasets: [], grouped_months: [] };
                var datasetsList = occurrencesData.datasets || [];
                var groupedMonthsList = occurrencesData.grouped_months || [];

                var projectsChartsHTML = datasetsList.map(function(d) {
                    var maxValInProject = Math.max.apply(null, d.occurrences.concat([1]));
                    var globalIndex = 0;

                    var monthBlocksHTML = groupedMonthsList.map(function(gm) {
                        var weekItemsHTML = gm.weeks.map(function(wLbl) {
                            var val = d.occurrences[globalIndex] || 0;
                            globalIndex++;

                            var heightPct = val > 0 ? Math.min(Math.max((val / maxValInProject) * 100, 18), 100) : 0;
                            var valDisplay = val > 0 ? `<span class="bar-value">${val}</span>` : '<span class="bar-value" style="color: #cbd5e1; font-size: 10px;">-</span>';

                            var customBarStyle = '';
                            if (currentOccurrencesType === 'issue' && val > 0) {
                                customBarStyle = 'background: linear-gradient(180deg, #fef2f2 0%, #fee2e2 45%, #fca5a5 100%); border: 1px solid #f87171;';
                            } else if (val > 0) {
                                customBarStyle = 'background: linear-gradient(180deg, #eff6ff 0%, #dbeafe 45%, #93c5fd 100%); border: 1px solid #2563eb;';
                            } else {
                                customBarStyle = 'background: #f1f5f9; border: 1px solid #e2e8f0;';
                            }

                            return `
                                <div class="week-item" role="listitem" aria-label="${gm.month}, ${wLbl}: ${val} lançamentos">
                                    <div class="bar-container">
                                        ${valDisplay}
                                        <div class="chart-bar" style="height: ${heightPct}%; ${customBarStyle}"></div>
                                    </div>
                                    <span class="week-label">${wLbl}</span>
                                </div>
                            `;
                        }).join('');

                        return `
                            <section class="month-block">
                                <div class="weeks-row" role="list">
                                    ${weekItemsHTML}
                                </div>
                                <h3 class="month-label">${gm.month}</h3>
                            </section>
                        `;
                    }).join('');

                    return `
                        <div style="margin-bottom: 22px; padding-bottom: 12px; border-bottom: 1px dashed #e2e8f0;">
                            <div style="font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                                <span style="width: 10px; height: 10px; border-radius: 50%; background-color: ${currentOccurrencesType === 'issue' ? '#dc2626' : d.color}; display: inline-block;"></span>
                                <span style="font-size: 14px; font-weight: 800; color: #0f172a;">${d.project}</span>
                                <span class="badge-soft-primary" style="font-size: 11px; font-weight: 700; margin-left: 6px;">${d.total_occurrences} lançamentos</span>
                            </div>
                            <div class="project-chart-box" role="group" aria-label="Volume semanal de lançamentos do ${d.project}">
                                ${monthBlocksHTML}
                            </div>
                        </div>
                    `;
                }).join('');

                var occurrencesSection = `
                    <div class="cdc-exec-card">
                        <div class="cdc-exec-card-title">
                            <div class="cdc-exec-title-content">
                                <h2>Monitoramento de Lançamentos</h2>
                                <p>Volume de lançamentos por período e programa do CDC</p>
                            </div>

                            <div class="cdc-exec-filters">
                                <label class="cdc-filter">
                                    <span>Período</span>
                                    <select id="cdc-period-select" aria-label="Selecionar período">
                                        <option value="month" ${currentSelectedPeriod === 'month' ? 'selected' : ''}>Mês</option>
                                        <option value="quarter" ${currentSelectedPeriod === 'quarter' ? 'selected' : ''}>Trimestre</option>
                                        <option value="semester" ${currentSelectedPeriod === 'semester' ? 'selected' : ''}>Semestre</option>
                                        <option value="year" ${currentSelectedPeriod === 'year' ? 'selected' : ''}>Ano</option>
                                    </select>
                                </label>

                                <label class="cdc-filter">
                                    <span>Tipo</span>
                                    <select id="cdc-type-select" aria-label="Selecionar tipo de lançamento">
                                        <option value="all" ${currentOccurrencesType === 'all' ? 'selected' : ''}>Todos</option>
                                        <option value="receipt" ${currentOccurrencesType === 'receipt' ? 'selected' : ''}>Entradas</option>
                                        <option value="issue" ${currentOccurrencesType === 'issue' ? 'selected' : ''}>Saídas</option>
                                    </select>
                                </label>
                            </div>
                        </div>

                        ${projectsChartsHTML}
                    </div>
                `;

                dashDiv.innerHTML = `
                    ${selectorHeader}
                    ${top4CardsGrid}
                    ${shortcutsBar}
                    ${sideBySideRow}
                    ${categoryFullWidthCard}
                    ${occurrencesSection}
                `;

                window._cdc_debug_dashboard_data = data;
            },
            error: function(err) {
                isDashboardLoading = false;
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

        $(document).off('change', '#cdc-type-select').on('change', '#cdc-type-select', function(e) {
            e.stopPropagation();
            currentOccurrencesType = $(this).val();
            renderStockDashboard();
        });

        // CHECKBOXES INTERATIVOS DO GRÁFICO ROSCA DE CATEGORIAS
        $(document).off('change', '.cdc-cat-checkbox').on('change', '.cdc-cat-checkbox', function(e) {
            e.stopPropagation();
            var lbl = $(this).data('label');
            if (lbl) {
                activeCategoriesMap[lbl] = $(this).is(':checked');
                renderStockDashboard();
            }
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
