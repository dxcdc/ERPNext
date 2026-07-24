/* ==========================================================================
   CDC NextERP - Widget Flutuante de Acessibilidade (Redimensionamento Geral)
   Branch: feature/acessibilidade-widget-css
   ========================================================================== */

(function() {
    'use strict';
    if (window.__cdc_accessibility_loaded) return;
    window.__cdc_accessibility_loaded = true;

    var state = {
        fontScale: parseFloat(localStorage.getItem('cdc_font_scale') || '1.0'),
        highContrast: localStorage.getItem('cdc_high_contrast') === 'true'
    };

    function applyState() {
        var scale = state.fontScale;
        document.documentElement.style.fontSize = (scale * 100) + '%';
        
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

        if (state.highContrast) {
            document.documentElement.classList.add('cdc-high-contrast');
        } else {
            document.documentElement.classList.remove('cdc-high-contrast');
        }
    }

    function injectStyles() {
        if (document.getElementById('cdc-accessibility-styles')) return;
        var style = document.createElement('style');
        style.id = 'cdc-accessibility-styles';
        style.innerHTML = `
            #cdc-accessibility-widget {
                position: fixed !important;
                bottom: 25px !important;
                right: 25px !important;
                z-index: 999999 !important;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            }
            #cdc-accessibility-toggle-btn {
                width: 50px !important;
                height: 50px !important;
                border-radius: 50% !important;
                background-color: #2490ef !important;
                color: #ffffff !important;
                border: 3px solid #ffffff !important;
                box-shadow: 0 6px 18px rgba(0,0,0,0.35) !important;
                cursor: pointer !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-size: 22px !important;
                transition: transform 0.2s ease !important;
            }
            #cdc-accessibility-toggle-btn:hover {
                transform: scale(1.1) !important;
                background-color: #1a74c4 !important;
            }
            #cdc-accessibility-menu {
                display: none;
                position: absolute !important;
                bottom: 65px !important;
                right: 0 !important;
                width: 230px !important;
                background: #ffffff !important;
                border: 1px solid #cbd5e1 !important;
                border-radius: 12px !important;
                box-shadow: 0 10px 25px rgba(0,0,0,0.25) !important;
                padding: 15px !important;
                box-sizing: border-box !important;
            }
            #cdc-accessibility-menu.active {
                display: block !important;
            }
            .cdc-menu-title {
                font-weight: 700 !important;
                font-size: 13px !important;
                color: #0f172a !important;
                margin-bottom: 10px !important;
                text-transform: uppercase !important;
            }
            .cdc-btn-group {
                display: flex !important;
                gap: 6px !important;
                margin-bottom: 8px !important;
            }
            .cdc-btn {
                flex: 1 !important;
                padding: 6px 8px !important;
                border: 1px solid #cbd5e1 !important;
                background: #f8fafc !important;
                color: #334155 !important;
                border-radius: 6px !important;
                font-size: 12px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
            }
            .cdc-btn:hover {
                background: #e2e8f0 !important;
            }
            html.cdc-high-contrast {
                filter: contrast(125%) !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function createWidget() {
        if (document.getElementById('cdc-accessibility-widget')) return;
        if (!document.body) return;

        var container = document.createElement('div');
        container.id = 'cdc-accessibility-widget';
        container.innerHTML = `
            <button id="cdc-accessibility-toggle-btn" title="Acessibilidade">♿</button>
            <div id="cdc-accessibility-menu">
                <div class="cdc-menu-title">♿ Acessibilidade</div>
                <div style="font-size:11px; color:#64748b; margin-bottom:4px; font-weight:600;">FONTE GERAL</div>
                <div class="cdc-btn-group">
                    <button class="cdc-btn" id="cdc-btn-font-plus">A+</button>
                    <button class="cdc-btn" id="cdc-btn-font-minus">A-</button>
                    <button class="cdc-btn" id="cdc-btn-font-reset">100%</button>
                </div>
                <div style="font-size:11px; color:#64748b; margin-bottom:4px; margin-top:8px; font-weight:600;">TEMA</div>
                <div class="cdc-btn-group">
                    <button class="cdc-btn" id="cdc-btn-theme-light">☀️ Claro</button>
                    <button class="cdc-btn" id="cdc-btn-theme-dark">🌙 Escuro</button>
                </div>
            </div>
        `;
        document.body.appendChild(container);

        var toggleBtn = document.getElementById('cdc-accessibility-toggle-btn');
        var menu = document.getElementById('cdc-accessibility-menu');

        toggleBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            menu.classList.toggle('active');
        });

        document.addEventListener('click', function(e) {
            if (!container.contains(e.target)) {
                menu.classList.remove('active');
            }
        });

        document.getElementById('cdc-btn-font-plus').addEventListener('click', function() {
            state.fontScale = Math.min(state.fontScale + 0.1, 1.4);
            localStorage.setItem('cdc_font_scale', state.fontScale);
            applyState();
        });

        document.getElementById('cdc-btn-font-minus').addEventListener('click', function() {
            state.fontScale = Math.max(state.fontScale - 0.1, 0.85);
            localStorage.setItem('cdc_font_scale', state.fontScale);
            applyState();
        });

        document.getElementById('cdc-btn-font-reset').addEventListener('click', function() {
            state.fontScale = 1.0;
            localStorage.setItem('cdc_font_scale', state.fontScale);
            applyState();
        });

        document.getElementById('cdc-btn-theme-light').addEventListener('click', function() {
            if (window.frappe && frappe.ui && frappe.ui.set_theme) {
                frappe.ui.set_theme('light');
            }
        });

        document.getElementById('cdc-btn-theme-dark').addEventListener('click', function() {
            if (window.frappe && frappe.ui && frappe.ui.set_theme) {
                frappe.ui.set_theme('dark');
            }
        });
    }

    applyState();

    function initLoop() {
        injectStyles();
        createWidget();
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initLoop();
    } else {
        document.addEventListener('DOMContentLoaded', initLoop);
    }

    setInterval(initLoop, 600);
})();
