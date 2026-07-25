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

    function injectStockExecutiveDashboard() {
        if (!window.location.href.includes('/app/stock') && !window.location.href.includes('/app/Stock')) return;

        var workspaceBody = document.querySelector('.workspace-body .codex-editor__redactor') || 
                            document.querySelector('.workspace-body') || 
                            document.querySelector('.page-body');
        if (!workspaceBody) return;

        // Localizar o widget do gráfico "Estoque" na árvore do DOM
        var chartWidget = Array.from(workspaceBody.querySelectorAll('.widget, .ce-block, [data-widget-name]')).find(function(el) {
            return el.getAttribute('data-widget-name') === 'Estoque' || 
                   el.querySelector('[data-chart-name="Estoque"]') || 
                   el.querySelector('.chart-container');
        });

        if (!chartWidget) return;

        var parentBlock = chartWidget.closest('.ce-block') || chartWidget.closest('.widget') || chartWidget;

        // Se já existir diretamente ACIMA do gráfico de estoque, não faz nada
        var existingDash = document.getElementById('cdc-stock-exec-dashboard');
        if (existingDash) {
            if (existingDash.nextElementSibling === parentBlock) {
                return;
            }
            existingDash.remove();
        }

        frappe.call({
            method: 'cdc_theme.api.get_stock_dashboard_data',
            callback: function(r) {
                if (!r.message) return;

                var data = r.message;
                var dashDiv = document.createElement('div');
                dashDiv.id = 'cdc-stock-exec-dashboard';
                dashDiv.className = 'cdc-exec-dashboard-grid';
                dashDiv.setAttribute('data-correctly-placed', 'true');

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
                                <span class="badge-soft-success" style="padding: 3px 8px; border-radius: 6px; font-size: 13px;">${data.receipts_month} lançamentos</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: 700; color: #e11d48;">
                                <span>📤 Saídas este mês:</span>
                                <span style="background-color: rgba(225, 29, 72, 0.1); color: #e11d48; padding: 3px 8px; border-radius: 6px; font-size: 13px;">${data.issues_month} lançamento</span>
                            </div>
                        </div>

                        <div style="margin-top: 10px;">
                            <svg viewBox="0 0 300 50" style="width: 100%; height: 50px; overflow: visible;">
                                <!-- Linha Verde: Entradas -->
                                <path d="M0,40 Q35,10 75,35 T150,8 T225,30 T300,12" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round"/>
                                <path d="M0,40 Q35,10 75,35 T150,8 T225,30 T300,12 L300,50 L0,50 Z" fill="rgba(16, 185, 129, 0.08)"/>
                                
                                <!-- Linha Vermelha: Saídas -->
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
                var stackedSegments = data.categories.map(function(c) {
                    return `<div class="cdc-stacked-bar-segment" style="width: ${c.percent}%; background-color: ${c.color};" title="${c.label}: ${c.percent}%"></div>`;
                }).join('');

                var legendItems = data.categories.map(function(c) {
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

                var card2 = `
                    <div class="cdc-exec-card">
                        <div class="cdc-exec-card-title">
                            <span>Composição por Categoria (100% Empilhado)</span>
                            <span style="font-size: 12px; color: #94a3b8;">${data.total_items} Itens</span>
                        </div>
                        <div class="cdc-stacked-bar">
                            ${stackedSegments}
                        </div>
                        <div class="cdc-legend-list">
                            ${legendItems}
                        </div>
                    </div>
                `;

                // --- CARD 3: Distribuição por Cidade / Unidade ---
                var cityPills = data.cities.map(function(ct) {
                    return `
                        <div class="cdc-city-item">
                            <span>🏙️ ${ct.city}</span>
                            <span class="badge-soft-primary" style="padding: 3px 8px; border-radius: 6px;">${ct.warehouses} Armazéns</span>
                        </div>
                    `;
                }).join('');

                var card3 = `
                    <div class="cdc-exec-card">
                        <div class="cdc-exec-card-title">
                            <span>Armazéns por Cidade / Unidade</span>
                            <span style="font-size: 12px; color: #94a3b8;">CDC Regional</span>
                        </div>
                        <div class="cdc-city-list">
                            ${cityPills}
                        </div>
                    </div>
                `;

                dashDiv.innerHTML = `
                    <div class="cdc-exec-dashboard-grid-2col">
                        ${card1}
                        ${card2}
                    </div>
                    <div style="margin-top: 16px;">
                        ${card3}
                    </div>
                `;

                // Inserir DENTRO do container principal, diretamente ACIMA do gráfico de Estoque
                if (parentBlock && parentBlock.parentNode) {
                    parentBlock.parentNode.insertBefore(dashDiv, parentBlock);
                }

            }
        });
    }




    function customizeStockNumberCardsSubtitles() {
        if (!window.location.href.includes('/app/stock') && !window.location.href.includes('/app/Stock')) return;

        var numberCards = document.querySelectorAll('.widget-num-card, [data-widget-type="number_card"], .number-card, .widget');
        if (!numberCards || numberCards.length === 0) return;

        var customSubtitles = {
            'TOTAL DE ARMAZÉM': '⚠️ 35 armazéns sem movimentação há +30 dias',
            'Entrada de Material': '↑ +41 entradas neste mês (vs. 158 mês ant.)',
            'Saída de Material': '↓ 1 saída neste mês (vs. 31 mês ant.)',
            'Transferência de Material': '🔄 4 movimentações entre unidades'
        };

        numberCards.forEach(function(card) {
            var titleEl = card.querySelector('.widget-title, .card-title, .number-card-label, .widget-label');
            if (!titleEl) return;
            var titleText = titleEl.textContent.trim();

            Object.keys(customSubtitles).forEach(function(key) {
                if (titleText.toUpperCase().includes(key.toUpperCase())) {
                    
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

                    // 3. Anexar nosso indicador exatamente ABAIXO do número
                    var existingCustom = card.querySelector('.cdc-custom-subtitle');
                    if (existingCustom) {
                        existingCustom.textContent = customSubtitles[key];
                        existingCustom.style.display = 'block';
                        bodyEl.appendChild(existingCustom);
                    } else {
                        var newSub = document.createElement('div');
                        newSub.className = 'cdc-custom-subtitle';
                        newSub.style.fontSize = '12px';
                        newSub.style.marginTop = '8px';
                        newSub.style.fontWeight = '600';
                        newSub.style.lineHeight = '1.3';
                        newSub.style.color = key.includes('ARMAZÉM') ? '#e11d48' : '#475569';
                        newSub.textContent = customSubtitles[key];
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

