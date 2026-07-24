/* ==========================================================================
   CDC NextERP - Widget Flutuante de Acessibilidade (HTML / CSS / JS Isolado)
   Branch: feature/acessibilidade-widget-css
   Descrição: Injeta um botão flutuante elegante no canto da tela sem alterar
              nenhum arquivo interno do núcleo do Frappe (0% risco de tela branca).
   ========================================================================== */

(function() {
    'use strict';

    // Evita inicialização duplicada
    if (window.__cdc_accessibility_loaded) return;
    window.__cdc_accessibility_loaded = true;

    // Estado da Acessibilidade
    var state = {
        fontScale: parseFloat(localStorage.getItem('cdc_font_scale') || '1.0'),
        highContrast: localStorage.getItem('cdc_high_contrast') === 'true'
    };

    // Aplicar configurações salvas imediatamente
    function applyState() {
        document.documentElement.style.fontSize = (state.fontScale * 100) + '%';
        if (state.highContrast) {
            document.documentElement.classList.add('cdc-high-contrast');
        } else {
            document.documentElement.classList.remove('cdc-high-contrast');
        }
    }

    // Injetar Estilos CSS do Widget
    function injectStyles() {
        var style = document.createElement('style');
        style.id = 'cdc-accessibility-styles';
        style.innerHTML = `
            /* Widget Flutuante de Acessibilidade */
            #cdc-accessibility-widget {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 999999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }

            #cdc-accessibility-toggle-btn {
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background-color: #2490ef;
                color: #ffffff;
                border: none;
                box-shadow: 0 4px 12px rgba(0,0,0,0.25);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                transition: transform 0.2s ease, background-color 0.2s ease;
            }

            #cdc-accessibility-toggle-btn:hover {
                transform: scale(1.08);
                background-color: #1a74c4;
            }

            #cdc-accessibility-menu {
                display: none;
                position: absolute;
                bottom: 60px;
                right: 0;
                width: 240px;
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.15);
                padding: 16px;
                box-sizing: border-box;
            }

            #cdc-accessibility-menu.active {
                display: block;
                animation: cdcFadeIn 0.2s ease-out;
            }

            @keyframes cdcFadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }

            .cdc-menu-title {
                font-weight: 700;
                font-size: 13px;
                color: #1e293b;
                margin-bottom: 12px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            .cdc-btn-group {
                display: flex;
                gap: 6px;
                margin-bottom: 12px;
            }

            .cdc-btn {
                flex: 1;
                padding: 6px 8px;
                border: 1px solid #cbd5e1;
                background: #f8fafc;
                color: #334155;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                text-align: center;
                transition: all 0.15s ease;
            }

            .cdc-btn:hover {
                background: #e2e8f0;
                color: #0f172a;
            }

            .cdc-btn-full {
                width: 100%;
                margin-top: 4px;
            }

            /* Alto Contraste */
            html.cdc-high-contrast {
                filter: contrast(125%) !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Criar Estrutura HTML do Widget
    function createWidget() {
        if (document.getElementById('cdc-accessibility-widget')) return;

        var container = document.createElement('div');
        container.id = 'cdc-accessibility-widget';

        container.innerHTML = `
            <button id="cdc-accessibility-toggle-btn" title="Menu de Acessibilidade (A+ / Tema)">♿</button>
            <div id="cdc-accessibility-menu">
                <div class="cdc-menu-title">
                    <span>♿ Acessibilidade</span>
                </div>
                
                <div style="font-size: 11px; color: #64748b; margin-bottom: 4px; font-weight: 600;">TAMANHO DO TEXTO</div>
                <div class="cdc-btn-group">
                    <button class="cdc-btn" id="cdc-btn-font-plus" title="Aumentar Fonte">A+</button>
                    <button class="cdc-btn" id="cdc-btn-font-minus" title="Diminuir Fonte">A-</button>
                    <button class="cdc-btn" id="cdc-btn-font-reset" title="Tamanho Padrão (100%)">100%</button>
                </div>

                <div style="font-size: 11px; color: #64748b; margin-bottom: 4px; font-weight: 600; margin-top: 8px;">TEMA DE CORES</div>
                <div class="cdc-btn-group">
                    <button class="cdc-btn" id="cdc-btn-theme-light">☀️ Claro</button>
                    <button class="cdc-btn" id="cdc-btn-theme-dark">🌙 Escuro</button>
                </div>

                <button class="cdc-btn cdc-btn-full" id="cdc-btn-contrast">👁️ Alto Contraste</button>
            </div>
        `;

        document.body.appendChild(container);

        // Eventos dos Botões
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

        // Controles de Fonte
        document.getElementById('cdc-btn-font-plus').addEventListener('click', function() {
            state.fontScale = Math.min(state.fontScale + 0.1, 1.35);
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

        // Controles de Tema
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

        // Alto Contraste
        document.getElementById('cdc-btn-contrast').addEventListener('click', function() {
            state.highContrast = !state.highContrast;
            localStorage.setItem('cdc_high_contrast', state.highContrast);
            applyState();
        });
    }

    // Inicialização segura após o carregamento do DOM
    applyState();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            injectStyles();
            createWidget();
        });
    } else {
        injectStyles();
        createWidget();
    }

    // Garantia para carregamento tardio do Desk
    var checkExist = setInterval(function() {
        if (document.body) {
            injectStyles();
            createWidget();
            clearInterval(checkExist);
        }
    }, 500);

})();
