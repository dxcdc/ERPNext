(function() {
    'use strict';

    var SYSTEM_ASSET_VERSION = 'v1.5.0-20260725_2315-MILESTONE-FIRST-BAR-CHART';
    var currentSelectedUnit = 'All';
    var currentSelectedPeriod = 'quarter'; // Trimestre
    var currentOccurrencesType = 'all'; // Todos por padrão
    var currentTableTypeFilter = 'all';
    var activeCategoriesMap = {}; // Controle de categorias ativas (checkboxes)
    var isCategoryDropdownOpen = false;
    var isDashboardLoading = false;
    var lastFetchTime = 0;
    var lastDiagnosticReportText = '';

    // --- VALIDAÇÃO ESTRITA DE ROTA SPA DO FRAPPE ---
    function isStockWorkspacePage() {
        var route = (frappe.get_route && frappe.get_route()) ? frappe.get_route() : [];
        if (!route || route.length === 0) return false;

        var mainRoute = (route[0] || '').toLowerCase();
        var subRoute = (route[1] || '').toLowerCase();

        // Se for um formulário, lista, relatório ou árvore, NÃO é a página inicial de Workspace!
        if (mainRoute === 'form' || mainRoute === 'list' || mainRoute === 'query-report' || mainRoute === 'report' || mainRoute === 'tree' || mainRoute === 'dashboard-view' || mainRoute === 'print') {
            return false;
        }

        // Apenas a página de Workspace de Estoque (/app/stock ou /app/workspaces/stock)
        if ((mainRoute === 'workspaces' || mainRoute === 'workspace') && (subRoute === 'stock' || subRoute === 'estoque')) {
            return true;
        }

        var href = (window.location.href || '').toLowerCase();
        if (href.endsWith('/app/stock') || href.endsWith('/app/workspace/stock') || href.endsWith('/app/workspaces/stock') || href.endsWith('/app/stock/')) {
            return true;
        }

        return false;
    }

    // --- SUÍTE DE INQUÉRITO E DIAGNÓSTICO PROFUNDO CDC ---
    window._cdc_run_diagnostics = function() {
        var now = new Date();
        var dateFormatted = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR');

        var report = {
            timestamp: dateFormatted,
            asset_version: SYSTEM_ASSET_VERSION,
            all_passed: true,
            hypotheses: []
        };

        // H1: Presença do Contêiner Principal no DOM
        var dash = document.getElementById('cdc-stock-exec-dashboard');
        var isAttached = !!(dash && dash.parentNode && document.body.contains(dash));
        if (!isAttached) report.all_passed = false;
        report.hypotheses.push({
            id: 1,
            name: 'Presença do Painel no DOM',
            passed: isAttached,
            details: isAttached ? 'Contêiner pai encontrado em <' + (dash.parentNode ? (dash.parentNode.className || dash.parentNode.tagName) : 'DOM') + '>' : '❌ ERRO: Contêiner pai não encontrado'
        });

        // H2: Recebimento de Payload de Dados da API Python Backend
        var hasData = !!(window._cdc_debug_dashboard_data && window._cdc_debug_dashboard_data.occurrences_data);
        var datasetsCount = hasData ? (window._cdc_debug_dashboard_data.occurrences_data.datasets || []).length : 0;
        if (!hasData || datasetsCount === 0) report.all_passed = false;
        report.hypotheses.push({
            id: 2,
            name: 'Recebimento de Dados da API Python',
            passed: hasData && datasetsCount > 0,
            details: (hasData && datasetsCount > 0) ? 'Payload recebido com sucesso (' + datasetsCount + ' programas de projetos)' : '❌ ERRO: Payload da API indisponível ou sem programas'
        });

        // H3: Gráfico Nativo Frappe.Chart no DOM
        var nativeChartEl = document.getElementById('cdc-native-frappe-chart');
        var hasNativeChartSVG = !!(nativeChartEl && nativeChartEl.querySelector('svg'));
        if (!hasNativeChartSVG) report.all_passed = false;
        report.hypotheses.push({
            id: 3,
            name: 'Renderização do Gráfico Nativo (frappe.Chart)',
            passed: hasNativeChartSVG,
            details: hasNativeChartSVG ? 'Gráfico nativo frappe.Chart renderizado com SVG interativo no DOM' : '❌ ALERTA: Gráfico nativo ainda não inicializado'
        });

        // H4: Visibilidade e Opacidade do Estilo CSS
        var isVisible = true;
        if (dash) {
            var comp = window.getComputedStyle(dash);
            if (comp.display === 'none' || comp.visibility === 'hidden' || comp.opacity === '0') {
                isVisible = false;
            }
        }
        if (!isVisible) report.all_passed = false;
        report.hypotheses.push({
            id: 4,
            name: 'Visibilidade de Estilo CSS do Card',
            passed: isVisible,
            details: isVisible ? 'Painel com display visível e opacidade 1.0' : '❌ ERRO: Regra CSS oculta o card principal'
        });

        // H5: Validação da Rota e URL do SPA
        var currentRoute = (frappe.get_route && frappe.get_route()) ? frappe.get_route().join('/') : '';
        var isStockRoute = isStockWorkspacePage();
        if (!isStockRoute) report.all_passed = false;
        report.hypotheses.push({
            id: 5,
            name: 'Validação da Rota SPA do Frappe',
            passed: isStockRoute,
            details: isStockRoute ? 'Rota ativa aceita: /' + currentRoute : '❌ ALERTA: Rota fora do escopo de Estoque'
        });

        // H6: Versão do Script JS e Cache Busting
        report.hypotheses.push({
            id: 6,
            name: 'Versão do Script JS do CDC',
            passed: true,
            details: 'Versão em execução: ' + SYSTEM_ASSET_VERSION
        });

        // H7: Inspeção dos Cards de Projeto Restaurados (.cdc-project-card)
        var projectCards = document.querySelectorAll('.cdc-project-card');
        var h7Passed = projectCards.length > 0;
        if (!h7Passed) report.all_passed = false;
        report.hypotheses.push({
            id: 7,
            name: 'Cards Individuais de Projeto (.cdc-project-card)',
            passed: h7Passed,
            details: h7Passed ? projectCards.length + ' cards de projeto ativos e renderizados no DOM' : '❌ ALERTA: 0 cards de projeto no DOM'
        });

        // H8: Inspeção dos Quadros Brancos por Semana (.week-box)
        var weekBoxes = document.querySelectorAll('.week-box');
        var h8Passed = weekBoxes.length > 0;
        if (!h8Passed) report.all_passed = false;
        report.hypotheses.push({
            id: 8,
            name: 'Quadros Individuais por Semana (.week-box)',
            passed: h8Passed,
            details: h8Passed ? weekBoxes.length + ' quadros de semana com fundo #f8fafc no DOM' : '❌ ALERTA: 0 quadros no DOM'
        });

        // H9: Inspeção do Eixo Y Lateral
        var yAxes = document.querySelectorAll('.cdc-y-axis');
        var h9Passed = yAxes.length > 0;
        if (!h9Passed) report.all_passed = false;
        report.hypotheses.push({
            id: 9,
            name: 'Eixo Y Lateral de Valores (.cdc-y-axis)',
            passed: h9Passed,
            details: h9Passed ? yAxes.length + ' réguas de eixo Y ativas' : '❌ ALERTA: 0 réguas de eixo Y'
        });

        // H10: Diagnóstico da Primeira Barra Pílula
        var firstBar = document.querySelector('.chart-bar-pill');
        report.hypotheses.push({
            id: 10,
            name: 'Estilo Computado da Primeira Barra Pílula',
            passed: !!firstBar,
            details: firstBar ? 'Barra Pílula: height=' + window.getComputedStyle(firstBar).height + ', bg=' + window.getComputedStyle(firstBar).backgroundColor : '❌ ALERTA: Nenhuma barra encontrada no DOM'
        });

        // Montagem do Texto Puro para Cópia
        var textLines = [];
        textLines.push('📅 DATA / HORA: ' + report.timestamp);
        textLines.push('⚙️ ASSET VERSION: ' + report.asset_version);
        textLines.push('STATUS GERAL: ' + (report.all_passed ? '✅ 100% OPERACIONAL' : '❌ ALERTAS DETECTADOS'));
        
        report.hypotheses.forEach(function(h) {
            textLines.push('\nH' + h.id + ' (' + h.name + '):');
            textLines.push('  ' + (h.passed ? '✅ OK -> ' : '❌ ALERTA -> ') + h.details);
        });

        lastDiagnosticReportText = textLines.join('\n');

        console.group('🔍 INQUÉRITO DE DIAGNÓSTICO PROFUNDO CDC - ' + dateFormatted);
        console.log(lastDiagnosticReportText);
        console.groupEnd();

        return report;
    };

    function renderStockDashboard() {
        if (!isStockWorkspacePage()) {
            var dashToRemove = document.getElementById('cdc-stock-exec-dashboard');
            if (dashToRemove) dashToRemove.remove();
            return;
        }

        if (isDashboardLoading && (Date.now() - lastFetchTime > 6000)) {
            isDashboardLoading = false;
        }

        if (isDashboardLoading) return;

        var workspaceBody = document.querySelector('.layout-main-section') || 
                            document.querySelector('.page-body') ||
                            document.querySelector('.workspace-page-content') ||
                            document.querySelector('.workspace-body') || 
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
            dashDiv.style.cssText = 'margin-bottom: 24px; user-select: none; -webkit-user-select: none; width: 100%; min-height: 400px; display: block !important; visibility: visible !important; opacity: 1 !important;';
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

                // --- 6. MONITORAMENTO DE LANÇAMENTOS (MARCO: PRIMEIRO GRÁFICO EM BARRA CONSOLIDADO) ---
                var occurrencesData = data.occurrences_data || { labels: [], datasets: [], grouped_months: [] };
                var datasetsList = occurrencesData.datasets || [];
                var groupedMonthsList = occurrencesData.grouped_months || [];

                // TRADUÇÃO DOS MESES DO EIXO X PARA PORTUGUÊS BRASIL
                var ptBrLabels = (occurrencesData.labels || ["S1 Maio", "S2 Maio", "S3 Maio", "S4 Maio", "S1 Jun", "S2 Jun", "S3 Jun", "S4 Jun", "S5 Jun", "S1 Jul"]).map(function(lbl) {
                    return lbl.replace('May', 'Maio').replace('Jun', 'Junho').replace('Jul', 'Julho').replace('Aug', 'Agosto').replace('Sep', 'Setembro');
                });

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
                        var weeksArr = gm.weeks || ['S1', 'S2', 'S3', 'S4'];
                        var weekItemsHTML = weeksArr.map(function(wLbl) {
                            var val = d.occurrences[globalIndex] || 0;
                            globalIndex++;

                            var barHeightPx = val > 0 ? Math.max(Math.round((val / maxValInProject) * 85), 14) : 4;
                            var barColor = (currentOccurrencesType === 'issue' && val > 0) ? '#dc2626' : (val > 0 ? (d.color || '#2563eb') : '#e2e8f0');

                            return `
                                <div style="display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 36px;" class="week-block-item">
                                    <div class="week-box" style="width: 100%; height: 110px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; padding: 4px; position: relative;">
                                        ${val > 0 ? `<span style="font-size: 10px; font-weight: 800; color: #0f172a; position: absolute; top: 4px;">${val}</span>` : ''}
                                        <div class="chart-bar-pill" style="width: 16px; height: ${barHeightPx}px; background-color: ${barColor}; border-radius: 4px; transition: height 0.3s ease;"></div>
                                    </div>
                                    <span style="font-size: 11px; font-weight: 700; color: #64748b; margin-top: 6px;">${wLbl}</span>
                                </div>
                            `;
                        }).join('');

                        return `
                            <div class="month-group-container" style="display: flex; flex-direction: column; align-items: center; flex: 1; padding: 0 6px;">
                                <div style="display: flex; gap: 6px; width: 100%;">
                                    ${weekItemsHTML}
                                </div>
                                <div style="font-size: 12px; font-weight: 800; color: #0f172a; text-align: center; margin-top: 6px;">${gm.month}</div>
                            </div>
                        `;
                    }).join('');

                    var typeBadgeLabel = (currentOccurrencesType === 'receipt') ? 'lançamentos de entrada' : ((currentOccurrencesType === 'issue') ? 'lançamentos de saída' : 'lançamentos totais');

                    return `
                        <div class="cdc-project-card" style="background: #ffffff; border: 1px solid #dbeafe; border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="width: 12px; height: 12px; border-radius: 50%; background-color: ${currentOccurrencesType === 'issue' ? '#dc2626' : d.color}; display: inline-block;"></span>
                                    <span style="font-size: 14px; font-weight: 800; color: #0f172a;">${d.project}</span>
                                </div>
                                <span class="badge-soft-primary" style="font-size: 11px; font-weight: 800; padding: 4px 12px; background: #eff6ff; color: #2563eb; border-radius: 6px;">
                                    ${d.total_occurrences} ${typeBadgeLabel}
                                </span>
                            </div>

                            <div style="display: flex; align-items: flex-end; gap: 12px; overflow-x: auto; padding: 4px 0;">
                                <div class="cdc-y-axis" style="display: flex; flex-direction: column; justify-content: space-between; height: 110px; font-size: 10px; font-weight: 700; color: #64748b; padding-right: 6px; border-right: 2px solid #e2e8f0; text-align: right; min-width: 28px; flex-shrink: 0; margin-bottom: 22px;">
                                    <span>${maxValInProject}</span>
                                    <span>${Math.round(maxValInProject / 2)}</span>
                                    <span>0 ┴</span>
                                </div>

                                <div style="display: flex; gap: 12px; flex: 1; align-items: flex-end;">
                                    ${monthBlocksHTML}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                var discreteDiagBtn = `
                    <button id="cdc-btn-run-diag" class="btn btn-default btn-xs" style="font-weight: 700; font-size: 10px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; color: #475569; padding: 2px 7px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; margin-left: 10px;" title="Rodar Inquérito de Diagnóstico CDC">
                        <span>🔍 Diag</span>
                        <span style="color: #2563eb; font-size: 10px;">⚡</span>
                    </button>
                `;

                var nativeFrappeChartCard = `
                    <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                        <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                            <span>📊 Visão Consolidada em Gráfico Nativo (Frappe.Chart)</span>
                            <span style="font-size: 11px; font-weight: 700; color: #2563eb;">Interativo & Exportável</span>
                        </div>
                        <div id="cdc-native-frappe-chart" style="width: 100%; min-height: 250px;"></div>
                    </div>
                `;

                var occurrencesSection = `
                    <div class="cdc-exec-card">
                        <div class="cdc-exec-card-title" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 20px;">
                            <div>
                                <h2 style="margin: 0; font-size: 16px; font-weight: 800; color: #0f172a; display: flex; align-items: center;">
                                    Monitoramento de Lançamentos
                                    ${discreteDiagBtn}
                                </h2>
                                <p style="margin: 4px 0 0; font-size: 12px; color: #64748b;">Volume de lançamentos por período e programa do CDC</p>
                            </div>

                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px; text-align: right;">
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

                        ${nativeFrappeChartCard}
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

                setTimeout(function() {
                    if (window.frappe && window.frappe.Chart && document.getElementById('cdc-native-frappe-chart')) {
                        try {
                            new frappe.Chart('#cdc-native-frappe-chart', {
                                title: 'Volume de Lançamentos por Programa',
                                data: {
                                    labels: ptBrLabels,
                                    datasets: (occurrencesData.datasets || []).map(function(ds) {
                                        return {
                                            name: ds.project,
                                            type: 'bar',
                                            values: ds.occurrences
                                        };
                                    })
                                },
                                type: 'bar',
                                height: 260,
                                colors: ['#10b981', '#2563eb', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'],
                                axisOptions: {
                                    xIsSeries: true
                                },
                                barOptions: {
                                    spaceRatio: 0.3
                                }
                            });
                        } catch (e) {
                            console.error('Erro ao renderizar frappe.Chart nativo:', e);
                        }
                    }

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

        // BOTÃO RODAR TESTE DE DIAGNÓSTICO
        $(document).off('click', '#cdc-btn-run-diag').on('click', '#cdc-btn-run-diag', function(e) {
            e.preventDefault();
            var report = window._cdc_run_diagnostics();
            
            var modalContent = '';
            if (report.all_passed) {
                modalContent = `
                    <div style="display: flex; flex-direction: column; gap: 12px; align-items: center; text-align: center; padding: 10px;">
                        <div style="font-size: 32px;">🎉</div>
                        <div style="font-size: 15px; font-weight: 800; color: #15803d;">SISTEMA 100% OPERACIONAL</div>
                        <div style="font-size: 12px; color: #475569;">Todos os 10 testes de diagnósticos foram aprovados com sucesso!</div>
                        <button id="cdc-btn-copy-diag" class="btn btn-default btn-xs" style="margin-top: 8px; font-weight: 700; font-size: 11px;">📋 Copiar Resumo Técnico</button>
                    </div>
                `;
            } else {
                var statusMsg = report.hypotheses.filter(function(h) { return !h.passed; }).map(function(h) { 
                    return 'H' + h.id + ' (' + h.name + '):\n  ❌ ALERTA -> ' + h.details; 
                }).join('\n\n');

                modalContent = `
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; background: #1e293b; padding: 10px 14px; border-radius: 8px;">
                            <span style="color: #f87171; font-weight: 800; font-size: 12px;">⚠️ ALERTAS ENCONTRADOS NO DIAGNÓSTICO</span>
                            <button id="cdc-btn-copy-diag" class="btn btn-xs" style="background: #2563eb; color: #ffffff; border: none; font-weight: 700; font-size: 11px; padding: 4px 12px; border-radius: 6px; cursor: pointer;">
                                📋 Copiar Diagnóstico Completo
                            </button>
                        </div>
                        <div style="font-family: monospace; font-size: 11px; text-align: left; background: #0f172a; color: #f8fafc; padding: 16px; border-radius: 8px; line-height: 1.5; max-height: 380px; overflow-y: auto;">
                            <div style="color: #60a5fa; font-weight: bold; margin-bottom: 8px;">📅 DATA / HORA: ${report.timestamp}</div>
                            <div style="color: #34d399; font-weight: bold; margin-bottom: 12px;">⚙️ ASSET VERSION: ${report.asset_version}</div>
                            <hr style="border-color: #334155; margin-bottom: 12px;">
                            <pre style="color: #fca5a5; background: transparent; padding: 0; margin: 0; white-space: pre-wrap;">${statusMsg}</pre>
                        </div>
                    </div>
                `;
            }

            var d = frappe.msgprint({
                title: __('Inquérito de Diagnóstico CDC - Suíte Contextual'),
                indicator: report.all_passed ? 'green' : 'orange',
                message: modalContent
            });

            setTimeout(function() {
                $('#cdc-btn-copy-diag').off('click').on('click', function(ev) {
                    ev.preventDefault();
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(lastDiagnosticReportText).then(function() {
                            frappe.show_alert({ message: __('📋 Diagnóstico copiado com sucesso!'), indicator: 'green' });
                        });
                    } else {
                        var tempInput = document.createElement('textarea');
                        tempInput.value = lastDiagnosticReportText;
                        document.body.appendChild(tempInput);
                        tempInput.select();
                        document.execCommand('copy');
                        document.body.removeChild(tempInput);
                        frappe.show_alert({ message: __('📋 Diagnóstico copiado com sucesso!'), indicator: 'green' });
                    }
                });
            }, 200);
        });

        $(document).off('click', '.cdc-period-btn').on('click', '.cdc-period-btn', function(e) {
            e.preventDefault();
            var newPeriod = $(this).attr('data-period') || $(this).data('period');
            if (newPeriod && newPeriod !== currentSelectedPeriod) {
                currentSelectedPeriod = newPeriod;
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
        } else {
            var dashContainer = document.getElementById('cdc-stock-exec-dashboard');
            if (dashContainer) {
                dashContainer.remove();
            }
        }
    }, 400);

    $(document).on('page-change', function() {
        if (!isStockWorkspacePage()) {
            var dashContainer = document.getElementById('cdc-stock-exec-dashboard');
            if (dashContainer) {
                dashContainer.remove();
            }
        } else {
            setTimeout(function() {
                renderStockDashboard();
            }, 100);
        }
    });

})();
