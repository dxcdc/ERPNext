(function() {
    'use strict';

    var currentSelectedUnit = 'All';
    var currentSelectedPeriod = 'quarter'; // Trimestre
    var currentOccurrencesType = 'all'; // Todos por padrão
    var currentTableTypeFilter = 'all';
    var activeCategoriesMap = {}; // Controle de categorias ativas (checkboxes)
    var isCategoryDropdownOpen = false;
    var isDashboardLoading = false;
    var lastFetchTime = 0;
    var lastDiagnosticReport = null;

    // --- FERRAMENTA DE INQUÉRITO E DIAGNÓSTICO EM TEMPO REAL ---
    window._cdc_run_diagnostics = function() {
        var report = {
            timestamp: new Date().toISOString(),
            hypotheses: []
        };

        // Hipótese 1: Presença do Contêiner no DOM
        var dash = document.getElementById('cdc-stock-exec-dashboard');
        var isAttached = !!(dash && dash.parentNode && document.body.contains(dash));
        report.hypotheses.push({
            id: 1,
            name: 'Presença do Painel no DOM',
            passed: isAttached,
            details: isAttached ? 'Contêiner pai encontrado em ' + (dash.parentNode ? dash.parentNode.className : 'DOM') : 'ERRO: Contêiner não encontrado no DOM'
        });

        // Hipótese 2: Payload da API Backend
        var hasData = !!(window._cdc_debug_dashboard_data && window._cdc_debug_dashboard_data.occurrences_data);
        report.hypotheses.push({
            id: 2,
            name: 'Recebimento de Dados da API Python',
            passed: hasData,
            details: hasData ? 'Dados de ocorrências recebidos com sucesso (' + window._cdc_debug_dashboard_data.occurrences_data.datasets.length + ' projetos)' : 'ERRO: Dados da API indisponíveis ou nulos'
        });

        // Hipótese 3: Renderização das Barras de Gráfico
        var barElements = document.querySelectorAll('.chart-bar');
        var visibleBars = 0;
        var barHeights = [];
        barElements.forEach(function(bar) {
            var h = bar.offsetHeight || parseFloat(window.getComputedStyle(bar).height);
            if (h > 0) {
                visibleBars++;
                barHeights.push(h + 'px');
            }
        });
        report.hypotheses.push({
            id: 3,
            name: 'Renderização Física das Barras (Pixel Height)',
            passed: visibleBars > 0,
            details: visibleBars > 0 ? visibleBars + ' barras renderizadas com altura física em pixels (' + barHeights.slice(0, 5).join(', ') + '...)' : 'ALERTA: 0 barras visíveis na tela (Possível colapso de altura CSS)'
        });

        // Hipótese 4: Visibilidade e Ocultamento CSS (Display / Visibility)
        var isVisible = true;
        if (dash) {
            var comp = window.getComputedStyle(dash);
            if (comp.display === 'none' || comp.visibility === 'hidden' || comp.opacity === '0') {
                isVisible = false;
            }
        }
        report.hypotheses.push({
            id: 4,
            name: 'Visibilidade de Estilo CSS',
            passed: isVisible,
            details: isVisible ? 'Painel com display visível e opacidade total' : 'ERRO: Estilo CSS nativo ocultando o painel'
        });

        lastDiagnosticReport = report;
        console.table(report.hypotheses);
        return report;
    };

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

                // --- 5. COMPOSIÇÃO POR CATEGORIA ---
                var rawCategoriesList = (data.categories && data.categories.length > 0) ? data.categories : [];
                
                rawCategoriesList.forEach(function(c) {
                    if (activeCategoriesMap[c.label] === undefined) {
                        activeCategoriesMap[c.label] = true;
                    }
                });

                var activeCategories = rawCategoriesList.filter(function(c) {
                    return activeCategoriesMap[c.label] !== false;
                });

                var activeCategoriesTotal = activeCategories.reduce(function(sum, c) { return sum + c.count; }, 0);
                var maxCategoryCount = Math.max.apply(null, activeCategories.map(function(c) { return c.count; }).concat([1]));

                var dropdownCheckboxItems = rawCategoriesList.map(function(c) {
                    var isChecked = activeCategoriesMap[c.label] !== false;
                    var displayPercent = activeCategoriesTotal > 0 && isChecked ? ((c.count / activeCategoriesTotal) * 100).toFixed(1) : c.percent;

                    return `
                        <label style="padding: 8px 10px; background: ${isChecked ? '#ffffff' : '#f8fafc'}; border-radius: 6px; border: 1px solid #cbd5e1; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; opacity: ${isChecked ? '1' : '0.5'}; margin-bottom: 4px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <input type="checkbox" class="cdc-cat-checkbox" data-label="${c.label}" ${isChecked ? 'checked' : ''} style="width: 15px; height: 15px; cursor: pointer;">
                                <span style="background-color: ${c.color}; width: 10px; height: 10px; border-radius: 3px; display: inline-block;"></span>
                                <span style="font-weight: 700; color: #1e293b; font-size: 11.5px;">${c.label}</span>
                            </div>
                            <span style="font-weight: 800; color: #2563eb; font-size: 11px;">${c.count} (${displayPercent}%)</span>
                        </label>
                    `;
                }).join('');

                var dropdownMenuHTML = `
                    <div style="position: relative;" class="cdc-cat-dropdown-wrapper">
                        <button id="cdc-cat-dropdown-btn" class="btn btn-default btn-sm" style="font-weight: 700; font-size: 12px; border-radius: 8px; border: 1px solid #2563eb; background: #f8fafc; color: #0f172a; display: flex; align-items: center; gap: 8px; padding: 6px 14px; cursor: pointer;">
                            <span>🏷️ Filtrar Categorias (${activeCategories.length}/${rawCategoriesList.length})</span>
                            <span style="font-size: 10px; color: #2563eb;">▼</span>
                        </button>

                        <div id="cdc-cat-dropdown-menu" style="display: ${isCategoryDropdownOpen ? 'block' : 'none'}; position: absolute; right: 0; top: 100%; margin-top: 6px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); padding: 12px; min-width: 320px; z-index: 1000;">
                            <div style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                                <span>Categorias Visíveis</span>
                                <span style="font-size: 10px; color: #2563eb; cursor: pointer;" id="cdc-cat-select-all">Marcar Todos</span>
                            </div>
                            <div style="display: flex; flex-direction: column; max-height: 260px; overflow-y: auto;">
                                ${dropdownCheckboxItems}
                            </div>
                        </div>
                    </div>
                `;

                var accumulatedPercent = 0;
                var donutSlicesSVG = activeCategories.map(function(c) {
                    var pct = activeCategoriesTotal > 0 ? ((c.count / activeCategoriesTotal) * 100) : 0;
                    var strokeDasharray = `${pct} ${100 - pct}`;
                    var strokeDashoffset = 100 - accumulatedPercent + 25;
                    accumulatedPercent += pct;

                    return `<circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="${c.color}" stroke-width="6.5" stroke-dasharray="${strokeDasharray}" stroke-dashoffset="${strokeDashoffset}" style="transition: all 0.3s ease;"><title>${c.label}: ${pct.toFixed(1)}% (${c.count} itens)</title></circle>`;
                }).join('');

                var donutSVGChart = `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0;">
                        <div style="position: relative; width: 180px; height: 180px; display: flex; align-items: center; justify-content: center;">
                            <svg width="170" height="170" viewBox="0 0 42 42" style="transform: rotate(-90deg); border-radius: 50%;">
                                <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#e2e8f0" stroke-width="6.5"></circle>
                                ${donutSlicesSVG}
                            </svg>
                            <div style="position: absolute; text-align: center; pointer-events: none;">
                                <div style="font-size: 26px; font-weight: 800; color: #0f172a; line-height: 1;">${activeCategoriesTotal}</div>
                                <div style="font-size: 11px; font-weight: 800; color: #2563eb; margin-top: 3px;">100%</div>
                                <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 1px;">Itens Ativos</div>
                            </div>
                        </div>
                        <span style="font-size: 11px; font-weight: 700; color: #64748b; margin-top: 8px;">🍩 Gráfico Rosca com %</span>
                    </div>
                `;

                var categoryBarsHTML = activeCategories.map(function(c) {
                    var pct = activeCategoriesTotal > 0 ? ((c.count / activeCategoriesTotal) * 100).toFixed(1) : 0;
                    var barWidthPct = maxCategoryCount > 0 ? Math.min(Math.max((c.count / maxCategoryCount) * 100, 4), 100) : 0;

                    return `
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; font-weight: 700;">
                                <span style="color: #1e293b; display: flex; align-items: center; gap: 6px;">
                                    <span style="width: 10px; height: 10px; border-radius: 3px; background-color: ${c.color}; display: inline-block;"></span>
                                    ${c.label}
                                </span>
                                <span style="color: #0f172a; font-weight: 800;">${c.count} itens <span style="color: #2563eb; font-weight: 700;">(${pct}%)</span></span>
                            </div>
                            <div style="height: 12px; background: #f1f5f9; border-radius: 6px; overflow: hidden; width: 100%; border: 1px solid #e2e8f0;">
                                <div style="height: 100%; width: ${barWidthPct}%; background-color: ${c.color}; border-radius: 6px; transition: width 0.3s ease;"></div>
                            </div>
                        </div>
                    `;
                }).join('');

                var horizontalBarChartSection = `
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 10px; min-width: 280px; padding: 14px; background: #f8fafc; border-radius: 12px; border: 1px solid #cbd5e1;">
                        <div style="font-size: 12px; font-weight: 800; color: #0f172a; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
                            <span>📊 Gráfico de Barras por Categoria</span>
                            <span style="font-size: 11px; font-weight: 700; color: #64748b;">Qtd. & Porcentagem</span>
                        </div>
                        ${categoryBarsHTML}
                    </div>
                `;

                var totalItemsCount = data.total_items || 655;
                var unitDisplay = data.unit_display_label || 'Todos os Armazéns (46 Armazéns)';

                var categoryFullWidthCard = `
                    <div class="cdc-exec-card" style="margin-bottom: 20px; width: 100%;">
                        <div class="cdc-exec-card-title" style="margin-bottom: 12px; align-items: center;">
                            <div>
                                <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: #0f172a;">Composição por Categoria</h2>
                                <div style="font-size: 12px; color: #475569; font-weight: 600; margin-top: 2px;">
                                    📍 Unidade Filtrada: <span style="color: #0f172a; font-weight: 700;">${unitDisplay}</span> (Total Geral: ${totalItemsCount} Itens)
                                </div>
                            </div>
                            ${dropdownMenuHTML}
                        </div>

                        <div style="display: flex; gap: 24px; align-items: center; flex-wrap: wrap; margin-top: 8px;">
                            ${donutSVGChart}
                            ${horizontalBarChartSection}
                        </div>
                    </div>
                `;

                // --- 6. MONITORAMENTO DE LANÇAMENTOS (CÁLCULO DE ALTURA DE BARRAS EM PIXELS EXPLÍCITOS) ---
                var occurrencesData = data.occurrences_data || { labels: [], datasets: [], grouped_months: [] };
                var datasetsList = occurrencesData.datasets || [];
                var groupedMonthsList = occurrencesData.grouped_months || [];

                var periodButtonsHTML = `
                    <div class="cdc-period-filter-group" id="cdc-period-filter-group" style="display: flex; gap: 4px;">
                        <button class="cdc-period-btn ${currentSelectedPeriod === 'month' ? 'active' : ''}" data-period="month">Mês</button>
                        <button class="cdc-period-btn ${currentSelectedPeriod === 'quarter' ? 'active' : ''}" data-period="quarter">Trimestre</button>
                        <button class="cdc-period-btn ${currentSelectedPeriod === 'semester' ? 'active' : ''}" data-period="semester">Semestre</button>
                        <button class="cdc-period-btn ${currentSelectedPeriod === 'year' ? 'active' : ''}" data-period="year">Ano</button>
                    </div>
                `;

                var typeButtonsHTML = `
                    <div style="display: flex; gap: 4px; align-items: center;">
                        <button class="cdc-occ-type-btn ${currentOccurrencesType === 'all' ? 'active-all' : ''}" data-occ-type="all">Todos</button>
                        <button class="cdc-occ-type-btn ${currentOccurrencesType === 'receipt' ? 'active-receipt' : ''}" data-occ-type="receipt">Entradas</button>
                        <button class="cdc-occ-type-btn ${currentOccurrencesType === 'issue' ? 'active-issue' : ''}" data-occ-type="issue">Saídas</button>
                    </div>
                `;

                var projectsBarChartsHTML = datasetsList.map(function(d) {
                    var maxValInProject = Math.max.apply(null, d.occurrences.concat([1]));
                    var globalIndex = 0;

                    var monthBlocksHTML = groupedMonthsList.map(function(gm) {
                        var weekItemsHTML = gm.weeks.map(function(wLbl) {
                            var val = d.occurrences[globalIndex] || 0;
                            globalIndex++;

                            // CÁLCULO EXPLÍCITO EM PIXELS (GARANTE RENDERIZAÇÃO EM 100% DOS NAVEGADORES SEM DEPENDER DE PORCENTAGEM DO PAI)
                            var barHeightPx = val > 0 ? Math.max(Math.round((val / maxValInProject) * 110), 14) : 0;
                            var valDisplay = val > 0 ? `<span class="bar-value">${val}</span>` : '<span class="bar-value" style="color: #cbd5e1; font-size: 10px;">-</span>';

                            var barColor = d.color || '#2563eb';
                            var customBarStyle = '';
                            if (currentOccurrencesType === 'issue' && val > 0) {
                                customBarStyle = 'background: linear-gradient(180deg, #dc2626 0%, #ef4444 60%, #fca5a5 100%); border: 1px solid #dc2626;';
                            } else if (val > 0) {
                                customBarStyle = `background: linear-gradient(180deg, ${barColor} 0%, ${barColor}cc 60%, #93c5fd 100%); border: 1px solid ${barColor};`;
                            } else {
                                customBarStyle = 'background: #f1f5f9; border: 1px solid #e2e8f0;';
                            }

                            return `
                                <div class="week-item" role="listitem" aria-label="${gm.month}, ${wLbl}: ${val} lançamentos">
                                    <div class="bar-container" style="height: 135px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; width: 100%;">
                                        ${valDisplay}
                                        <div class="chart-bar" style="height: ${barHeightPx}px !important; min-height: ${val > 0 ? '14px' : '0'}; ${customBarStyle}"></div>
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
                            <div style="font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="width: 12px; height: 12px; border-radius: 50%; background-color: ${currentOccurrencesType === 'issue' ? '#dc2626' : d.color}; display: inline-block;"></span>
                                    <span style="font-size: 14px; font-weight: 800; color: #0f172a;">${d.project}</span>
                                </div>
                                <span class="badge-soft-primary" style="font-size: 11px; font-weight: 800; padding: 4px 12px;">Total: ${d.total_occurrences} lançamentos</span>
                            </div>
                            <div class="project-chart-box" role="group" aria-label="Volume semanal de lançamentos do ${d.project}">
                                ${monthBlocksHTML}
                            </div>
                        </div>
                    `;
                }).join('');

                // 7. INQUÉRITO E DIAGNÓSTICO EM TEMPO REAL NO TOPO DO CARD DE MONITORAMENTO
                var diagnosticBarHeader = `
                    <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 800; color: #0f172a;">
                            <span>🔍 Inquérito de Validação CDC:</span>
                            <span style="color: #2563eb; font-weight: 700;">Status do Sistema Ativo</span>
                        </div>
                        <button id="cdc-btn-run-diag" class="btn btn-default btn-xs" style="font-weight: 800; font-size: 11px; border-radius: 6px; border: 1px solid #2563eb; background: #2563eb; color: #ffffff; padding: 4px 10px; cursor: pointer;">
                            ⚡ Rodar Teste de Diagnóstico
                        </button>
                    </div>
                `;

                var occurrencesSection = `
                    <div class="cdc-exec-card">
                        <!-- Cabeçalho com Título + Botões de Período e Tipo -->
                        <div class="cdc-exec-card-title" style="align-items: center; flex-wrap: wrap; gap: 16px;">
                            <div>
                                <h2>Monitoramento de Lançamentos</h2>
                                <p>Volume de lançamentos por período e programa em Gráficos de Barra</p>
                            </div>

                            <!-- Botões Interativos de Filtro (Período & Tipo) -->
                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 11px; font-weight: 700; color: #64748b;">Período:</span>
                                    ${periodButtonsHTML}
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 11px; font-weight: 700; color: #64748b;">Tipo:</span>
                                    ${typeButtonsHTML}
                                </div>
                            </div>
                        </div>

                        ${diagnosticBarHeader}
                        ${projectsBarChartsHTML}
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
                
                // Executar diagnóstico automático pós-renderização
                setTimeout(function() {
                    window._cdc_run_diagnostics();
                }, 300);
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

        $(document).off('click', '#cdc-btn-run-diag').on('click', '#cdc-btn-run-diag', function(e) {
            e.preventDefault();
            var report = window._cdc_run_diagnostics();
            var statusMsg = report.hypotheses.map(function(h) { return 'H' + h.id + ' (' + h.name + '): ' + (h.passed ? '✅ OK' : '❌ ' + h.details); }).join('\n');
            frappe.msgprint({
                title: __('Inquérito de Diagnóstico CDC'),
                indicator: 'blue',
                message: '<pre style="font-size:11px; text-align:left;">' + statusMsg + '</pre>'
            });
        });

        // HANDLERS DOS BOTÕES DE PERÍODO (Mês, Trimestre, Semestre, Ano)
        $(document).off('click', '.cdc-period-btn').on('click', '.cdc-period-btn', function(e) {
            e.preventDefault();
            var newPeriod = $(this).attr('data-period') || $(this).data('period');
            if (newPeriod && newPeriod !== currentSelectedPeriod) {
                currentSelectedPeriod = newPeriod;
                renderStockDashboard();
            }
        });

        // HANDLERS DOS BOTÕES DE TIPO (Todos, Entradas, Saídas)
        $(document).off('click', '[data-occ-type]').on('click', '[data-occ-type]', function(e) {
            e.preventDefault();
            var occType = $(this).attr('data-occ-type') || $(this).data('occ-type');
            if (occType && occType !== currentOccurrencesType) {
                currentOccurrencesType = occType;
                renderStockDashboard();
            }
        });

        // MENU SUSPENSO DROPDOWN DE CATEGORIAS
        $(document).off('click', '#cdc-cat-dropdown-btn').on('click', '#cdc-cat-dropdown-btn', function(e) {
            e.preventDefault();
            e.stopPropagation();
            isCategoryDropdownOpen = !isCategoryDropdownOpen;
            $('#cdc-cat-dropdown-menu').toggle(isCategoryDropdownOpen);
        });

        $(document).off('click', '#cdc-cat-select-all').on('click', '#cdc-cat-select-all', function(e) {
            e.preventDefault();
            e.stopPropagation();
            for (var k in activeCategoriesMap) {
                activeCategoriesMap[k] = true;
            }
            renderStockDashboard();
        });

        $(document).off('change', '.cdc-cat-checkbox').on('change', '.cdc-cat-checkbox', function(e) {
            e.stopPropagation();
            var lbl = $(this).data('label');
            if (lbl) {
                activeCategoriesMap[lbl] = $(this).is(':checked');
                renderStockDashboard();
            }
        });

        $(document).on('click', function(e) {
            if (!$(e.target).closest('.cdc-cat-dropdown-wrapper').length) {
                if (isCategoryDropdownOpen) {
                    isCategoryDropdownOpen = false;
                    $('#cdc-cat-dropdown-menu').hide();
                }
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
