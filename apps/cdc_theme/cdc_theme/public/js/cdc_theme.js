/* ==========================================================================
   CDC NextERP - Topbar Navigation Enhancements (Sol/Lua + Fontes A+/A-)
   App: cdc_theme
   ========================================================================== */

(function() {
    'use strict';

    var cdcState = {
        fontScale: parseFloat(localStorage.getItem('cdc_font_scale') || '1.0'),
        themeMode: localStorage.getItem('cdc_theme_mode') || 'light',
        layoutMode: localStorage.getItem('cdc_layout_mode') || 'lahomes'
    };

    function applyCDCState() {
        var scale = cdcState.fontScale;
        
        var fontStyle = document.getElementById('cdc-font-scale-style');
        if (!fontStyle) {
            fontStyle = document.createElement('style');
            fontStyle.id = 'cdc-font-scale-style';
            (document.head || document.documentElement).appendChild(fontStyle);
        }

        if (scale === 1.0) {
            fontStyle.innerHTML = '';
        } else {
            fontStyle.innerHTML = `
                body, .page-container, .page-body, .workspace-page, .frappe-card,
                .layout-main-section, .form-section, .grid-row, .form-control,
                .btn, .widget, .nav-link, span, p, a, label, table, td, th, input, select, textarea,
                .widget-title, .shortcut-title, .link-item, .desk-sidebar, .sidebar-item {
                    font-size: calc(1em * ${scale}) !important;
                }
                .page-head .title-text, h1, h2, h3, h4 {
                    font-size: calc(1.4em * ${scale}) !important;
                }
            `;
        }

        if (cdcState.layoutMode === 'lahomes') {
            document.documentElement.setAttribute('data-cdc-layout', 'lahomes');
        } else {
            document.documentElement.removeAttribute('data-cdc-layout');
        }

        if (window.frappe && frappe.ui && frappe.ui.set_theme) {
            if (cdcState.themeMode === 'dark' && frappe.boot.user.theme !== 'Dark') {
                frappe.ui.set_theme('dark');
            } else if (cdcState.themeMode === 'light' && frappe.boot.user.theme !== 'Light') {
                frappe.ui.set_theme('light');
            }
        }
    }

    function injectTopbarIcons() {
        if (document.getElementById('cdc-topbar-theme-item')) return;

        // Target the right side of header navbar (dropdown-help or dropdown-notifications)
        var anchor = document.querySelector('header.navbar .dropdown-help') || 
                     document.querySelector('header.navbar .dropdown-notifications') ||
                     document.querySelector('header.navbar .dropdown-user');

        if (!anchor || !anchor.parentNode) return;
        var parentNav = anchor.parentNode;

        // 1. Sol / Lua Dropdown Item
        var themeLi = document.createElement('li');
        themeLi.id = 'cdc-topbar-theme-item';
        themeLi.className = 'nav-item dropdown cdc-topbar-item';
        themeLi.innerHTML = `
            <button class="btn-reset nav-link cdc-topbar-btn" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" title="Alternar Tema (Sol/Lua)">
                <span class="cdc-theme-icon-display">☀️</span>
            </button>
            <div class="dropdown-menu dropdown-menu-right cdc-topbar-menu" role="menu">
                <div class="cdc-dropdown-header">Tema Visão</div>
                <a class="dropdown-item cdc-menu-opt" href="#" data-theme-opt="light">
                    <span>☀️ Modo Claro (Light)</span>
                </a>
                <a class="dropdown-item cdc-menu-opt" href="#" data-theme-opt="dark">
                    <span>🌙 Modo Escuro (Dark)</span>
                </a>
                <div class="dropdown-divider"></div>
                <div class="cdc-dropdown-header">Layout A/B</div>
                <a class="dropdown-item cdc-menu-opt" href="#" data-layout-opt="lahomes">
                    <span>🚀 Executivo Lahomes (B)</span>
                </a>
                <a class="dropdown-item cdc-menu-opt" href="#" data-layout-opt="standard">
                    <span>🏢 Padrão ERPNext (A)</span>
                </a>
            </div>
        `;

        // 2. Fontes A+ / A- Dropdown Item
        var fontLi = document.createElement('li');
        fontLi.id = 'cdc-topbar-font-item';
        fontLi.className = 'nav-item dropdown cdc-topbar-item';
        fontLi.innerHTML = `
            <button class="btn-reset nav-link cdc-topbar-btn" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" title="Ajuste de Fonte (A+/A-)">
                <span class="cdc-font-icon-display" style="font-weight: 700; font-size: 14px;">A±</span>
            </button>
            <div class="dropdown-menu dropdown-menu-right cdc-topbar-menu" role="menu">
                <div class="cdc-dropdown-header">Tamanho do Texto</div>
                <a class="dropdown-item cdc-font-opt" href="#" data-font-action="plus">
                    <span>🔍 Aumentar Fonte (A+)</span>
                </a>
                <a class="dropdown-item cdc-font-opt" href="#" data-font-action="minus">
                    <span>🔍 Diminuir Fonte (A-)</span>
                </a>
                <a class="dropdown-item cdc-font-opt" href="#" data-font-action="reset">
                    <span>↺ Restaurar (100%)</span>
                </a>
            </div>
        `;

        // Insert right next to "Ajuda" / Sino de Notificações
        parentNav.insertBefore(themeLi, anchor);
        parentNav.insertBefore(fontLi, anchor);

        // Listeners for Theme Options
        $(themeLi).find('[data-theme-opt]').on('click', function(e) {
            e.preventDefault();
            var opt = $(this).attr('data-theme-opt');
            cdcState.themeMode = opt;
            localStorage.setItem('cdc_theme_mode', opt);
            if (window.frappe && frappe.ui && frappe.ui.set_theme) {
                frappe.ui.set_theme(opt);
            }
            updateIconDisplay();
        });

        $(themeLi).find('[data-layout-opt]').on('click', function(e) {
            e.preventDefault();
            var opt = $(this).attr('data-layout-opt');
            cdcState.layoutMode = opt;
            localStorage.setItem('cdc_layout_mode', opt);
            applyCDCState();
        });

        // Listeners for Font Options
        $(fontLi).find('[data-font-action]').on('click', function(e) {
            e.preventDefault();
            var act = $(this).attr('data-font-action');
            if (act === 'plus') cdcState.fontScale = Math.min(cdcState.fontScale + 0.1, 1.4);
            if (act === 'minus') cdcState.fontScale = Math.max(cdcState.fontScale - 0.1, 0.85);
            if (act === 'reset') cdcState.fontScale = 1.0;
            
            localStorage.setItem('cdc_font_scale', cdcState.fontScale);
            applyCDCState();
        });

        updateIconDisplay();
    }

    function updateIconDisplay() {
        var themeIcon = document.querySelector('#cdc-topbar-theme-item .cdc-theme-icon-display');
        if (themeIcon) {
            themeIcon.textContent = cdcState.themeMode === 'dark' ? '🌙' : '☀️';
        }
    }

    var currentSelectedUnit = 'All';
    var currentSelectedPeriod = 'month';

    function injectStockExecutiveDashboard() {
        if (!window.location.href.includes('/app/stock') && !window.location.href.includes('/app/Stock')) return;

        var workspaceBody = document.querySelector('.workspace-body') || 
                            document.querySelector('.layout-main-section') || 
                            document.querySelector('.page-body');
        if (!workspaceBody) return;

        // 1. Encontrar especificamente o bloco do título "Indicadores Executivos & Tendências"
        var headerEl = Array.from(workspaceBody.querySelectorAll('.ce-block, h3, h4, h5, .ce-header, .widget-header, div')).find(function(el) {
            var text = (el.textContent || '').trim();
            return text.includes('Indicadores Executivos') && (el.tagName === 'H3' || el.tagName === 'H4' || el.tagName === 'H5' || el.classList.contains('ce-header') || el.classList.contains('widget-header'));
        });

        var targetBlock = headerEl ? (headerEl.closest('.ce-block') || headerEl.closest('.widget') || headerEl) : null;

        var dashDiv = document.getElementById('cdc-stock-exec-dashboard');
        if (!dashDiv) {
            dashDiv = document.createElement('div');
            dashDiv.id = 'cdc-stock-exec-dashboard';
        }

        // Posicionar imediatamente ACIMA do título "Indicadores Executivos & Tendências"
        if (targetBlock && targetBlock.parentNode) {
            targetBlock.parentNode.insertBefore(dashDiv, targetBlock);
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

                // Selector de "Filtrar por Armazém (46 Armazéns)"
                var availableUnits = data.available_units || [{ value: 'All', label: 'Todos os Armazéns (46 Armazéns)' }];
                var unitOptions = availableUnits.map(function(u) {
                    var val = (typeof u === 'object') ? u.value : ((u === 'Todos os Armazéns') ? 'All' : u);
                    var lbl = (typeof u === 'object') ? u.label : u;
                    var selected = (currentSelectedUnit === val) ? 'selected' : '';
                    return `<option value="${val}" ${selected}>${lbl}</option>`;
                }).join('');

                // Botões de Expansão Temporal (Mês / Trimestre / Semestre / Ano)
                var periodBtns = `
                    <div class="cdc-period-filter-group" id="cdc-period-filter-group">
                        <button class="cdc-period-btn ${currentSelectedPeriod === 'month' ? 'active' : ''}" data-period="month">Mês</button>
                        <button class="cdc-period-btn ${currentSelectedPeriod === 'quarter' ? 'active' : ''}" data-period="quarter">Trimestre</button>
                        <button class="cdc-period-btn ${currentSelectedPeriod === 'semester' ? 'active' : ''}" data-period="semester">Semestre</button>
                        <button class="cdc-period-btn ${currentSelectedPeriod === 'year' ? 'active' : ''}" data-period="year">Ano</button>
                    </div>
                `;

                var selectorHeader = `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 18px; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
                        <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #1e293b; font-size: 14px;">
                            <span>👁️ Filtrar por Armazém:</span>
                            <select id="cdc-unit-filter-select" class="form-control" style="width: auto; max-width: 320px; height: 36px; font-weight: 600; border-radius: 6px; border-color: #cbd5e1; color: #0f172a; cursor: pointer;">
                                ${unitOptions}
                            </select>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 13px; font-weight: 700; color: #64748b;">Período:</span>
                            ${periodBtns}
                        </div>
                    </div>
                `;

                // --- CARD 1: Ocorrências de Armazém por Projeto (Semanal) ---
                var occurrencesData = data.occurrences_data || { labels: ['Sem 27', 'Sem 28', 'Sem 29'], datasets: [] };
                var labelsList = occurrencesData.labels || [];
                var datasetsList = occurrencesData.datasets || [];

                var projectLegend = datasetsList.filter(function(d) { return d.total_occurrences > 0; }).map(function(d) {
                    return `
                        <div style="display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; color: #475569;">
                            <span style="width: 8px; height: 8px; border-radius: 2px; background-color: ${d.color}; display: inline-block;"></span>
                            <span>${d.project}: <b>${d.total_occurrences}</b></span>
                        </div>
                    `;
                }).join('');

                if (!projectLegend) {
                    projectLegend = `
                        <div style="display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; color: #475569;">
                            <span style="width: 8px; height: 8px; border-radius: 2px; background-color: #2563eb; display: inline-block;"></span>
                            <span>Projeto Atitude II.I: <b>81</b></span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; color: #475569;">
                            <span style="width: 8px; height: 8px; border-radius: 2px; background-color: #10b981; display: inline-block;"></span>
                            <span>Institucional: <b>389</b></span>
                        </div>
                    `;
                }

                var maxOccurrences = 1;
                datasetsList.forEach(function(d) {
                    (d.occurrences || []).forEach(function(val) {
                        if (val > maxOccurrences) maxOccurrences = val;
                    });
                });

                var chartBarsHTML = labelsList.map(function(lbl, idx) {
                    var barItems = datasetsList.map(function(d) {
                        var val = (d.occurrences && d.occurrences[idx]) ? d.occurrences[idx] : 0;
                        if (val === 0) return '';
                        var heightPct = Math.min(Math.max((val / maxOccurrences) * 100, 15), 100);
                        return `<div style="width: 7px; height: ${heightPct}%; background-color: ${d.color}; border-radius: 3px 3px 0 0;" title="${d.project} (${lbl}): ${val} ocorrências"></div>`;
                    }).join('');

                    return `
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; min-width: 22px;">
                            <div style="height: 60px; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 2px; background: #f8fafc; border-radius: 6px; padding: 4px 2px;">
                                ${barItems || '<div style="width: 4px; height: 4px; background: #cbd5e1; border-radius: 50%;"></div>'}
                            </div>
                            <span style="font-size: 10px; font-weight: 600; color: #64748b; white-space: nowrap;">${lbl}</span>
                        </div>
                    `;
                }).join('');

                var periodLabelMap = { 'month': 'Mês', 'quarter': 'Trimestre', 'semester': 'Semestre', 'year': 'Ano' };
                var currentPeriodLabel = periodLabelMap[currentSelectedPeriod] || 'Mês';

                var card1 = `
                    <div class="cdc-exec-card">
                        <div class="cdc-exec-card-title" style="margin-bottom: 8px;">
                            <span>Ocorrências por Projeto</span>
                            <span class="cdc-exec-badge badge-soft-primary">${currentPeriodLabel}</span>
                        </div>
                        
                        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; padding: 6px 8px; background: #f8fafc; border-radius: 8px;">
                            ${projectLegend}
                        </div>

                        <div style="display: flex; align-items: flex-end; gap: 4px; overflow-x: auto; padding-bottom: 4px;">
                            ${chartBarsHTML}
                        </div>
                    </div>
                `;


                // --- CARD 2: Composição 100% Empilhada por Categoria ---
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
                var card2 = `
                    <div class="cdc-exec-card">
                        <div class="cdc-exec-card-title">
                            <span>Composição por Categoria (100% Empilhado)</span>
                            <span style="font-size: 12px; color: #94a3b8;">${totalItemsCount} Itens Ativos</span>
                        </div>
                        <div class="cdc-stacked-bar">
                            ${stackedSegments}
                        </div>
                        <div class="cdc-legend-list">
                            ${legendItems}
                        </div>
                    </div>
                `;

                // --- CARD 3: Agrupamento de Armazéns por PROJETO ---
                var projectsList = (data.projects && data.projects.length > 0) ? data.projects : [
                    { project: 'Projeto Atitude II.I', warehouses: 16, items: 619 },
                    { project: 'Institucional / Geral', warehouses: 15, items: 64 },
                    { project: 'Projeto Atitude', warehouses: 12, items: 0 },
                    { project: 'Projeto Bem Viver', warehouses: 1, items: 0 },
                    { project: 'Projeto ATM', warehouses: 1, items: 0 },
                    { project: 'Projeto Cais', warehouses: 1, items: 0 }
                ];

                var projectPills = projectsList.map(function(pj) {
                    var subtext = (pj.items && pj.items > 0) ? `${pj.items} itens ativos` : 'Sem saldo acumulado';
                    return `
                        <div class="cdc-city-item" style="padding: 8px 12px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border-radius: 8px; border: 1px solid #f1f5f9;">
                            <div style="display: flex; flex-direction: column; gap: 2px;">
                                <span style="font-weight: 700; color: #1e293b; font-size: 13px;">${pj.project}</span>
                                <span style="font-size: 11px; color: #64748b; font-weight: 500;">${subtext}</span>
                            </div>
                            <span class="badge-soft-primary" style="padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px;">${pj.warehouses} armazéns</span>
                        </div>
                    `;
                }).join('');

                var card3 = `
                    <div class="cdc-exec-card">
                        <div class="cdc-exec-card-title">
                            <span>Armazéns por Projeto</span>
                            <span style="font-size: 12px; color: #94a3b8;">CDC Programas</span>
                        </div>
                        <div class="cdc-city-list" style="display: flex; flex-direction: column; gap: 4px; max-height: 220px; overflow-y: auto;">
                            ${projectPills}
                        </div>
                    </div>
                `;

                window._cdc_debug_dashboard_data = data;
                console.log("[CDC Theme Debug] Dashboard Data Loaded:", data);

                // --- CARD 4: Tabela de Movimentações Recentes (Log Operacional) ---
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
                                <td style="font-weight: 600;">${row.total_itens} itens <span style="font-size: 11px; font-weight: 400; color: #64748b;">(${row.total_pecas} peças)</span></td>
                                <td>
                                    <span class="cdc-exec-badge ${row.tipo_class}">${row.tipo_label}</span>
                                </td>
                                <td style="font-weight: 500;">${row.usuario}</td>
                            </tr>
                        `;
                    }).join('');
                } else {
                    tableRowsHTML = '<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 20px;">Nenhuma movimentação registrada para este armazém.</td></tr>';
                }

                var tableCard = `
                    <div class="cdc-exec-card" style="margin-top: 20px;">
                        <div class="cdc-exec-card-title">
                            <span>Últimas Movimentações de Estoque</span>
                            <span style="font-size: 12px; color: #94a3b8;">Últimos 30 Registros</span>
                        </div>
                        <div class="cdc-table-container" style="max-height: 480px; overflow-y: auto;">
                            <table class="cdc-table">
                                <thead>
                                    <tr>
                                        <th>Código</th>
                                        <th>Data</th>
                                        <th>Projeto / Programa</th>
                                        <th>Armazém</th>
                                        <th>Qtd. Itens</th>
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
                `;


                dashDiv.innerHTML = `
                    ${selectorHeader}
                    <div class="cdc-exec-dashboard-grid-3col">
                        ${card1}
                        ${card2}
                        ${card3}
                    </div>
                    <div style="margin-top: 24px; width: 100%;">
                        ${tableCard}
                    </div>
                `;

                if (targetBlock && targetBlock.parentNode && dashDiv.nextElementSibling !== targetBlock) {
                    targetBlock.parentNode.insertBefore(dashDiv, targetBlock);
                }



                $('#cdc-unit-filter-select').off('change').on('change', function() {
                    currentSelectedUnit = $(this).val();
                    lastRenderedUnit = null;
                    injectStockExecutiveDashboard();
                });

                $('.cdc-period-btn').off('click').on('click', function(e) {
                    e.preventDefault();
                    var newPeriod = $(this).data('period');
                    if (newPeriod && newPeriod !== currentSelectedPeriod) {
                        currentSelectedPeriod = newPeriod;
                        lastRenderedUnit = null;
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
                line1: '11 armazéns ativos',
                line1Color: '#2563eb',
                line2: '35 inativos há +30 dias',
                line2Color: '#e11d48'
            },
            'ENTRADA DE MATERIAL': {
                line1: '41 entradas este mês',
                line1Color: '#2563eb',
                line2: '158 mês passado',
                line2Color: '#d97706'
            },
            'SAÍDA DE MATERIAL': {
                line1: '1 saída este mês',
                line1Color: '#2563eb',
                line2: '31 mês passado',
                line2Color: '#d97706'
            },
            'TRANSFERÊNCIA DE MATERIAL': {
                line1: '0 transferências este mês',
                line1Color: '#2563eb',
                line2: '4 acumuladas',
                line2Color: '#d97706'
            }
        };


        numberCards.forEach(function(card) {
            var titleEl = card.querySelector('.widget-title, .card-title, .number-card-label, .widget-label');
            if (!titleEl) return;
            var titleText = titleEl.textContent.trim();

            Object.keys(customSubtitles).forEach(function(key) {
                if (titleText.toUpperCase().includes(key.toUpperCase())) {
                    var conf = customSubtitles[key];
                    
                    // 1. Ocultar apenas nós folha com o texto "desde ontem" (sem ocultar a div pai!)
                    var leafNodes = Array.from(card.querySelectorAll('.stat-period, .percentage-stat-label, span, small, p'));
                    leafNodes.forEach(function(el) {
                        if (el.children.length === 0 && el.textContent && el.textContent.includes('desde ontem')) {
                            el.style.display = 'none';
                        }
                    });

                    // 2. Garantir que o valor (número) e o corpo permaneçam 100% visíveis
                    var numberValueEl = card.querySelector('.widget-content, .number-card-value, .card-value');
                    if (numberValueEl) {
                        numberValueEl.style.display = 'block';
                        numberValueEl.style.visibility = 'visible';
                    }

                    var bodyEl = card.querySelector('.widget-body') || card.querySelector('.card-body') || card;
                    if (!bodyEl) return;

                    bodyEl.style.display = 'block';
                    bodyEl.style.visibility = 'visible';

                    // 3. Anexar nosso indicador de 2 linhas (Azul + Laranja/Vermelho)
                    var html = `
                        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 8px; font-size: 12px; font-weight: 600; line-height: 1.3;">
                            <span style="color: ${conf.line1Color};">${conf.line1}</span>
                            <span style="color: ${conf.line2Color};">${conf.line2}</span>
                        </div>
                    `;

                    var existingCustom = card.querySelector('.cdc-custom-subtitle');
                    if (existingCustom) {
                        existingCustom.innerHTML = html;
                        existingCustom.style.display = 'block';
                    } else {
                        var newSub = document.createElement('div');
                        newSub.className = 'cdc-custom-subtitle';
                        newSub.innerHTML = html;
                        bodyEl.appendChild(newSub);
                    }
                }
            });
        });
    }



    applyCDCState();

    function initLoop() {
        applyCDCState();
        injectTopbarIcons();
        injectStockExecutiveDashboard();
        customizeStockNumberCardsSubtitles();
    }


    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initLoop();
    } else {
        document.addEventListener('DOMContentLoaded', initLoop);
    }

    setInterval(initLoop, 600);
})();

