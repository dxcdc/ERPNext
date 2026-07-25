(function() {
    'use strict';

    var currentSelectedUnit = 'All';
    var currentSelectedPeriod = 'month';

    function injectStockExecutiveDashboard() {
        if (!window.location.href.includes('/app/stock') && !window.location.href.includes('/app/Stock')) return;

        var workspaceBody = document.querySelector('.workspace-body') || 
                            document.querySelector('.layout-main-section') || 
                            document.querySelector('.page-body');
        if (!workspaceBody) return;

        var dashDiv = document.getElementById('cdc-stock-exec-dashboard');
        if (!dashDiv) {
            dashDiv = document.createElement('div');
            dashDiv.id = 'cdc-stock-exec-dashboard';
        }

        // 1. Posicionar dashDiv no topo do Workspace (acima de todos os widgets)
        var firstWidget = workspaceBody.querySelector('.ce-block, .widget, .workspace-page-content, .widget-group, .widget-num-card');
        if (firstWidget && firstWidget.parentNode) {
            if (dashDiv.parentNode !== firstWidget.parentNode) {
                firstWidget.parentNode.insertBefore(dashDiv, firstWidget);
            }
        } else if (!dashDiv.parentNode && workspaceBody) {
            workspaceBody.appendChild(dashDiv);
        }

        frappe.call({
            method: 'cdc_theme.api.get_stock_dashboard_data',
            args: { 
                selected_unit: currentSelectedUnit,
                period: currentSelectedPeriod 
            },
            callback: function(r) {
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
                    <div style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 18px; margin-bottom: 16px;">
                        <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #1e293b; font-size: 14px;">
                            <span>👁️ Filtrar por Armazém:</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <select id="cdc-unit-filter-select" class="form-control" style="width: auto; max-width: 380px; height: 36px; font-weight: 600; border-radius: 6px; border-color: #cbd5e1; color: #0f172a; cursor: pointer;">
                                ${unitOptions}
                            </select>
                        </div>
                    </div>
                `;

                // --- 2. LADO A LADO: ARMAZÉNS POR PROJETO (CLICÁVEIS 🔗) + TABELA DE MOVIMENTAÇÕES ---
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
                        <a href="${pj.url || '/app/stock-entry'}" class="cdc-city-item" style="padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; text-decoration: none; transition: all 0.15s ease;" onmouseover="this.style.borderColor='#2563eb'; this.style.boxShadow='0 2px 8px rgba(37,99,235,0.1)';" onmouseout="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none';">
                            <div style="display: flex; flex-direction: column; gap: 2px;">
                                <span style="font-weight: 700; color: #1e293b; font-size: 13px; display: flex; align-items: center; gap: 4px;">
                                    🔗 ${pj.project}
                                </span>
                                <span style="font-size: 11px; color: #64748b; font-weight: 500;">${subtext}</span>
                            </div>
                            <span class="badge-soft-primary" style="padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px;">${pj.warehouses} armazéns</span>
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
                                    <a href="/app/stock-entry/${row.codigo}" class="cdc-doc-link">${row.codigo}</a>
                                </td>
                                <td style="font-weight: 600; color: #475569;">${row.data}</td>
                                <td style="font-weight: 600; color: #0f172a;">${row.projeto}</td>
                                <td>${row.armazem}</td>
                                <td style="font-weight: 600;">${row.total_itens} <span style="font-size: 11px; font-weight: 400; color: #64748b;">(${row.total_pecas} pç)</span></td>
                                <td>
                                    <span class="cdc-exec-badge ${row.tipo_class}">${row.tipo_label}</span>
                                </td>
                                <td style="font-weight: 500;">${row.usuario}</td>
                            </tr>
                        `;
                    }).join('');
                } else {
                    tableRowsHTML = '<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 20px;">Nenhuma movimentação registrada.</td></tr>';
                }

                var sideBySideRow = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
                        <!-- Armazéns por Projeto Clicáveis -->
                        <div class="cdc-exec-card">
                            <div class="cdc-exec-card-title">
                                <span>Armazéns por Projeto</span>
                                <span style="font-size: 11px; color: #2563eb; font-weight: 600;">🔗 Clique para abrir</span>
                            </div>
                            <div class="cdc-city-list" style="max-height: 380px; overflow-y: auto;">
                                ${projectPills}
                            </div>
                        </div>

                        <!-- Tabela de Movimentações (30 Registros) -->
                        <div class="cdc-exec-card">
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

                // --- 3. COMPOSIÇÃO POR CATEGORIA (LARGURA 100% EXCLUSIVA) ---
                var categoriesList = (data.categories && data.categories.length > 0) ? data.categories : [
                    { label: 'MAT. HIGIENE E LIMPEZA', percent: 14.0, color: '#2563eb' },
                    { label: 'CEREAIS', percent: 12.9, color: '#d97706' },
                    { label: 'MAT. ESPORTIVO E PEDAGÓGICO', percent: 10.9, color: '#059669' },
                    { label: 'MAT. EXPEDIENTE', percent: 10.0, color: '#7c3aed' },
                    { label: 'Outras Categorias', percent: 52.3, color: '#64748b' }
                ];

                var stackedSegments = categoriesList.map(function(c) {
                    return `<div class="cdc-stacked-bar-segment" style="width: ${c.percent}%; background-color: ${c.color};" title="${c.label}: ${c.percent}%"></div>`;
                }).join('');

                var legendItems = categoriesList.map(function(c) {
                    return `
                        <div class="cdc-legend-item">
                            <div>
                                <span class="cdc-legend-bullet" style="background-color: ${c.color};"></span>
                                <span>${c.label}</span>
                            </div>
                            <span style="font-weight: 700;">${c.percent}%</span>
                        </div>
                    `;
                }).join('');

                var totalItemsCount = data.total_items || 655;
                var categoryFullWidthCard = `
                    <div class="cdc-exec-card" style="margin-bottom: 20px; width: 100%;">
                        <div class="cdc-exec-card-title">
                            <span>Composição por Categoria (100% Empilhado)</span>
                            <span style="font-size: 12px; color: #94a3b8;">${totalItemsCount} Itens Ativos</span>
                        </div>
                        <div class="cdc-stacked-bar" style="height: 16px; border-radius: 8px; margin: 12px 0;">
                            ${stackedSegments}
                        </div>
                        <div class="cdc-legend-list" style="display: flex; flex-wrap: wrap; gap: 16px;">
                            ${legendItems}
                        </div>
                    </div>
                `;

                // --- 4. INDICADORES EXECUTIVOS & TENDÊNCIAS (SUB-GRÁFICOS POR PROJETO COM SEMANAS) ---
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
                                <div style="height: 50px; width: 100%; display: flex; align-items: flex-end; justify-content: center; background: #ffffff; border-radius: 4px; padding: 2px; border: 1px solid #f1f5f9;">
                                    <div style="width: 14px; height: ${heightPct}%; background-color: ${barColor}; border-radius: 3px 3px 0 0;" title="${d.project} (${lbl}): ${val} entradas"></div>
                                </div>
                                <span style="font-size: 10px; font-weight: 600; color: #475569;">${lbl}</span>
                            </div>
                        `;
                    }).join('');

                    return `
                        <div style="padding: 12px 14px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 12px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <span style="font-size: 13px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 6px;">
                                    <span style="width: 10px; height: 10px; border-radius: 50%; background-color: ${d.color}; display: inline-block;"></span>
                                    ${d.project}
                                </span>
                                <span class="badge-soft-primary" style="font-size: 11px; font-weight: 700;">${d.total_occurrences} entradas</span>
                            </div>
                            <div style="display: flex; align-items: flex-end; gap: 6px;">
                                ${barsHTML}
                            </div>
                        </div>
                    `;
                }).join('');

                var occurrencesSection = `
                    <div class="cdc-exec-card" style="margin-bottom: 20px; width: 100%;">
                        <div class="cdc-exec-card-title" style="margin-bottom: 14px;">
                            <span>Entradas de Estoque por Projeto</span>
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
                    ${sideBySideRow}
                    ${categoryFullWidthCard}
                    ${occurrencesSection}
                `;

                window._cdc_debug_dashboard_data = data;
                console.log("[CDC Theme Debug] Dashboard Data Loaded:", data);

                $('#cdc-unit-filter-select').off('change').on('change', function() {
                    currentSelectedUnit = $(this).val();
                    injectStockExecutiveDashboard();
                });

                $('.cdc-period-btn').off('click').on('click', function(e) {
                    e.preventDefault();
                    var newPeriod = $(this).data('period');
                    if (newPeriod && newPeriod !== currentSelectedPeriod) {
                        currentSelectedPeriod = newPeriod;
                        injectStockExecutiveDashboard();
                    }
                });
            }
        });
    }

    function customizeStockNumberCardsSubtitles() {
        if (!window.location.href.includes('/app/stock') && !window.location.href.includes('/app/Stock')) return;

        var numberCards = document.querySelectorAll('.widget-num-card, [data-widget-type="number_card"], .number-card, .widget');
        if (!numberCards || numberCards.length === 0) return;

        var customSubtitles = {
            'TOTAL DE ARMAZÉM': {
                sub1: '<span style="color: #2563eb; font-weight: 600;">🔵 11 ativos</span>',
                sub2: '<span style="color: #ef4444; font-weight: 600;">🔴 35 inativos (+30 dias)</span>'
            },
            'ENTRADA MATERIAL': {
                sub1: '<span style="color: #2563eb; font-weight: 600;">🔵 41 este mês</span>',
                sub2: '<span style="color: #d97706; font-weight: 600;">🟠 158 mês passado</span>'
            },
            'SAÍDA DE MATERIAL': {
                sub1: '<span style="color: #2563eb; font-weight: 600;">🔵 1 este mês</span>',
                sub2: '<span style="color: #d97706; font-weight: 600;">🟠 31 mês passado</span>'
            },
            'TRANSFERÊNCIA': {
                sub1: '<span style="color: #2563eb; font-weight: 600;">🔵 0 este mês</span>',
                sub2: '<span style="color: #d97706; font-weight: 600;">🟠 4 acumuladas</span>'
            }
        };

        numberCards.forEach(function(card) {
            var titleEl = card.querySelector('.widget-title, .number-card-title, .ellipsis, .widget-title-text, h5, h4');
            if (!titleEl) return;
            
            var titleText = titleEl.textContent.trim().toUpperCase();
            
            Object.keys(customSubtitles).forEach(function(key) {
                if (titleText.includes(key)) {
                    var subContainer = card.querySelector('.cdc-custom-subtitle-box');
                    if (!subContainer) {
                        subContainer = document.createElement('div');
                        subContainer.className = 'cdc-custom-subtitle-box';
                        subContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px; margin-top: 6px; font-size: 11px;';
                        
                        var cardBody = card.querySelector('.widget-body, .number-card-body') || card;
                        cardBody.appendChild(subContainer);
                    }
                    
                    subContainer.innerHTML = `
                        <div>${customSubtitles[key].sub1}</div>
                        <div>${customSubtitles[key].sub2}</div>
                    `;
                }
            });
        });
    }

    function initLoop() {
        injectStockExecutiveDashboard();
        customizeStockNumberCardsSubtitles();
    }

    $(document).ready(function() {
        initLoop();
        setInterval(initLoop, 1000);
    });

    $(document).on('page-change', function() {
        setTimeout(initLoop, 300);
    });

})();
