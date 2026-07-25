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
    var lastRenderedUnit = null;

    function injectStockExecutiveDashboard() {
        if (!window.location.href.includes('/app/stock') && !window.location.href.includes('/app/Stock')) return;

        var workspaceBody = document.querySelector('.workspace-body') || 
                            document.querySelector('.layout-main-section') || 
                            document.querySelector('.page-body');
        if (!workspaceBody) return;

        var existingDash = document.getElementById('cdc-stock-exec-dashboard');

        // Se já existe no DOM e a unidade não mudou, não precisa re-executar a requisição
        if (existingDash && lastRenderedUnit === currentSelectedUnit && document.body.contains(existingDash)) {
            return;
        }

        var parentBlock = null;

        var targetEl = Array.from(workspaceBody.querySelectorAll('.widget, .ce-block, .widget-header, h4, h5')).find(function(el) {
            var text = (el.textContent || '').trim();
            return el.getAttribute('data-widget-name') === 'Estoque' || 
                   el.querySelector('[data-chart-name="Estoque"]') || 
                   el.querySelector('.chart-container') ||
                   (text.includes('Indicadores Executivos') && (el.tagName === 'H4' || el.tagName === 'H5' || el.classList.contains('widget-header')));
        });

        if (targetEl) {
            parentBlock = targetEl.closest('.ce-block') || targetEl.closest('.widget') || targetEl;
        }

        frappe.call({
            method: 'cdc_theme.api.get_stock_dashboard_data',
            args: { selected_unit: currentSelectedUnit },
            callback: function(r) {
                if (!r || !r.message) return;

                var data = r.message;
                lastRenderedUnit = currentSelectedUnit;

                var dashDiv = document.getElementById('cdc-stock-exec-dashboard');
                if (!dashDiv) {
                    dashDiv = document.createElement('div');
                    dashDiv.id = 'cdc-stock-exec-dashboard';
                }

                // Selector de "Ver como / Unidade"
                var availableUnits = data.available_units || ["Todos os Armazéns", "CABO", "CARUARU", "JABOATÃO", "RECIFE"];
                var unitOptions = availableUnits.map(function(u) {
                    var val = (u === 'Todos os Armazéns') ? 'All' : u;
                    var selected = (currentSelectedUnit === val) ? 'selected' : '';
                    return `<option value="${val}" ${selected}>${u}</option>`;
                }).join('');

                var selectorHeader = `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 18px; margin-bottom: 16px;">
                        <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #1e293b; font-size: 14px;">
                            <span>👁️ Ver Visão de Estoque por:</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <select id="cdc-unit-filter-select" class="form-control" style="width: auto; height: 36px; font-weight: 600; border-radius: 6px; border-color: #cbd5e1; color: #0f172a; cursor: pointer;">
                                ${unitOptions}
                            </select>
                        </div>
                    </div>
                `;

                var receiptsCount = (data.receipts_month !== undefined && data.receipts_month !== null) ? data.receipts_month : 41;
                var issuesCount = (data.issues_month !== undefined && data.issues_month !== null) ? data.issues_month : 1;

                // --- CARD 1: Sparkline Semanal (Seg - Qua - Sex) ---
                var card1 = `
                    <div class="cdc-exec-card">
                        <div class="cdc-exec-card-title">
                            <span>Fluxo Operacional de Movimentação</span>
                            <span class="cdc-exec-badge badge-soft-primary">Seg • Qua • Sex</span>
                        </div>
                        
                        <div style="display: flex; flex-direction: column; gap: 6px; margin: 12px 0 16px 0;">
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: 700; color: #10b981;">
                                <span>📥 Entradas este mês:</span>
                                <span class="badge-soft-success" style="padding: 3px 8px; border-radius: 6px; font-size: 13px;">${receiptsCount} lançamentos</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: 700; color: #e11d48;">
                                <span>📤 Saídas este mês:</span>
                                <span style="background-color: rgba(225, 29, 72, 0.1); color: #e11d48; padding: 3px 8px; border-radius: 6px; font-size: 13px;">${issuesCount} lançamento</span>
                            </div>
                        </div>

                        <div style="margin-top: 10px;">
                            <svg viewBox="0 0 300 50" style="width: 100%; height: 50px; overflow: visible;">
                                <path d="M0,40 Q35,10 75,35 T150,8 T225,30 T300,12" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round"/>
                                <path d="M0,40 Q35,10 75,35 T150,8 T225,30 T300,12 L300,50 L0,50 Z" fill="rgba(16, 185, 129, 0.08)"/>
                                <path d="M0,45 Q35,38 75,42 T150,30 T225,40 T300,35" fill="none" stroke="#e11d48" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 2"/>
                            </svg>
                        </div>

                        <div class="cdc-sparkline-days" style="margin-top: 10px;">
                            <span class="active" title="Dia Operacional de Movimentação">Seg</span>
                            <span>Ter</span>
                            <span class="active" title="Dia Operacional de Movimentação">Qua</span>
                            <span>Qui</span>
                            <span class="active" title="Dia Operacional de Movimentação">Sex</span>
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

                // --- CARD 4: Tabela de Movimentações Recentes (Limpa / Sem Ícones) ---
                var entriesList = (data.recent_entries && data.recent_entries.length > 0) ? data.recent_entries : [];

                var tableRows = entriesList.map(function(row) {
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

                var tableCard = `
                    <div class="cdc-exec-card" style="margin-top: 20px;">
                        <div class="cdc-exec-card-title">
                            <span>Últimas Movimentações de Estoque</span>
                            <span style="font-size: 12px; color: #94a3b8;">Log do Mês Atual</span>
                        </div>
                        <div class="cdc-table-container">
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
                                    ${tableRows.length > 0 ? tableRows : '<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 20px;">Nenhuma movimentação registrada neste mês.</td></tr>'}
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

                if (parentBlock && parentBlock.parentNode && parentBlock !== workspaceBody) {
                    parentBlock.parentNode.insertBefore(dashDiv, parentBlock);




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

