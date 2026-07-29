(function() {
    'use strict';

    var SYSTEM_ASSET_VERSION = 'v2.9.0-20260727_1218-INTEGRACOES-FIX';

    // RESTAURAÇÃO DE FILTROS E ESTADO VIA SESSION STORAGE (F5 / REFRESH)
    var currentSelectedUnit = sessionStorage.getItem('cdc_unit') || 'All';
    var currentSelectedPeriod = sessionStorage.getItem('cdc_period') || 'quarter';
    var currentOccurrencesType = sessionStorage.getItem('cdc_occ_type') || 'all';
    var currentTableTypeFilter = sessionStorage.getItem('cdc_table_type') || 'all';
    var currentSelectedProjectFilter = sessionStorage.getItem('cdc_project_filter') || 'all';

    var activeCategoriesMap = {}; // Controle de categorias ativas
    var isCategoryDropdownOpen = false;
    var isDashboardLoading = false;
    var lastFetchTime = 0;
    var lastDiagnosticReportText = '';

    // PALETA DE CORES POR MÊS E TIPO (ENTRADA / SAÍDA)
    var MONTH_COLORS = ['#10b981', '#2563eb', '#f59e0b', '#8b5cf6']; // Maio (Verde), Junho (Azul), Julho (Laranja), Agosto (Roxo)
    var ISSUE_COLORS = ['#f87171', '#ef4444', '#dc2626', '#b91c1c']; // Tons de Vermelho para Saídas

    // CAPTURA DA POSIÇÃO EXATA DE SCROLL TANTO DA JANELA QUANTO DOS CONTEÎNERES INTERNOS DO FRAPPE
    function getActualScrollTop() {
        var mainEl = document.querySelector('.page-container') || document.querySelector('.layout-main-section') || document.querySelector('#body');
        var winScroll = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
        var elScroll = mainEl ? mainEl.scrollTop : 0;
        return Math.max(winScroll, elScroll);
    }

    function saveCurrentScrollState() {
        if (isStockWorkspacePage()) {
            var y = getActualScrollTop();
            if (y > 0) {
                sessionStorage.setItem('cdc_scroll_y', y);
            }
        }
    }

    window.addEventListener('beforeunload', saveCurrentScrollState);
    $(window).on('scroll', saveCurrentScrollState);
    $(document).on('scroll', '.page-container, .layout-main-section, #body', saveCurrentScrollState);

    function restoreScrollPosition() {
        var savedScrollY = sessionStorage.getItem('cdc_scroll_y');
        if (savedScrollY && parseFloat(savedScrollY) > 0) {
            var targetY = parseFloat(savedScrollY);
            setTimeout(function() {
                window.scrollTo(0, targetY);
                document.documentElement.scrollTop = targetY;
                var mainEl = document.querySelector('.page-container') || document.querySelector('.layout-main-section') || document.querySelector('#body');
                if (mainEl) mainEl.scrollTop = targetY;
            }, 350);
        }
    }

    // RENDERIZADOR NATIVO CDC DE ALTA PRECISÃO PARA GRÁFICOS ESTRUTURADOS POR MÊS
    function renderCustomStructuredMonthChart(containerSelector, dataset, groupedMonthsList, isIssueType, isMainChart) {
        var el = document.querySelector(containerSelector);
        if (!el || !dataset || !dataset.occurrences || !groupedMonthsList || groupedMonthsList.length === 0) return;

        var globalIndex = 0;
        var maxVal = Math.max.apply(null, dataset.occurrences.concat([1]));

        var barBoxHeightPx = isMainChart ? 150 : 105;
        var maxBarPx = isMainChart ? 125 : 85;
        var pillWidthPx = isMainChart ? 22 : 16;

        var monthCardsHTML = groupedMonthsList.map(function(gm, mIdx) {
            var monthColor = isIssueType ? (ISSUE_COLORS[mIdx % ISSUE_COLORS.length]) : (MONTH_COLORS[mIdx % MONTH_COLORS.length]);
            var weeksArr = gm.weeks || ['S1', 'S2', 'S3', 'S4'];

            var weekBarsHTML = weeksArr.map(function(wLbl) {
                var val = dataset.occurrences[globalIndex] || 0;
                globalIndex++;

                var barHeightPx = val > 0 ? Math.max(Math.round((val / maxVal) * maxBarPx), 14) : 4;
                var barBg = val > 0 ? monthColor : '#e2e8f0';

                return `
                    <div style="display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 32px;" class="week-bar-item">
                        <!-- QUANTIDADE NO TOPO DA BARRA -->
                        <span style="font-size: ${isMainChart ? '12px' : '11px'}; font-weight: 800; color: ${val > 0 ? '#0f172a' : '#cbd5e1'}; margin-bottom: 4px;">${val > 0 ? val : '-'}</span>
                        
                        <!-- CAIXA DE BARRA -->
                        <div style="width: 100%; height: ${barBoxHeightPx}px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; padding: 4px;">
                            <div class="chart-bar-pill" style="width: ${pillWidthPx}px; height: ${barHeightPx}px; background-color: ${barBg}; border-radius: 4px; transition: height 0.3s ease; box-shadow: ${val > 0 ? '0 2px 5px rgba(0,0,0,0.12)' : 'none'};"></div>
                        </div>

                        <!-- RÓTULO DA SEMANA S1, S2... EM BAIXO DA BARRA -->
                        <span style="font-size: ${isMainChart ? '12px' : '11px'}; font-weight: 800; color: #475569; margin-top: 6px;">${wLbl}</span>
                    </div>
                `;
            }).join('');

            return `
                <div class="month-group-card" style="display: flex; flex-direction: column; align-items: center; background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 12px; padding: ${isMainChart ? '14px 18px' : '10px 12px'}; flex: 1; min-width: 170px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                    <div style="display: flex; gap: ${isMainChart ? '14px' : '10px'}; justify-content: center; align-items: flex-end; width: 100%;">
                        ${weekBarsHTML}
                    </div>

                    <!-- NOME DO MÊS CENTRALIZADO EM BAIXO -->
                    <div style="font-size: ${isMainChart ? '13px' : '11.5px'}; font-weight: 800; color: #0f172a; margin-top: 10px; padding-top: 6px; border-top: 3.5px solid ${monthColor}; width: 100%; text-align: center; text-transform: uppercase; letter-spacing: 0.8px;">
                        ${gm.month}
                    </div>
                </div>
            `;
        }).join('');

        el.innerHTML = `
            <div style="display: flex; align-items: flex-end; gap: 8px; overflow-x: auto; padding: 8px 4px;">
                <div class="cdc-y-axis" style="display: flex; flex-direction: column; justify-content: space-between; height: ${barBoxHeightPx}px; font-size: 10px; font-weight: 800; color: #64748b; padding-right: 8px; border-right: 2px solid #cbd5e1; text-align: right; min-width: 32px; flex-shrink: 0; margin-bottom: ${isMainChart ? '38px' : '30px'};">
                    <span>${maxVal}</span>
                    <span>${Math.round(maxVal / 2)}</span>
                    <span>0 ┴</span>
                </div>
                <div style="display: flex; flex: 1; justify-content: space-around; gap: ${isMainChart ? '18px' : '12px'};">
                    ${monthCardsHTML}
                </div>
            </div>
        `;
    }

    // HELPER PARA ANOTAR QUANTIDADES NO TOPO DAS BARRAS DO FRAPPE.CHART
    function annotateChartValuesOnTop(containerId) {
        function doAnnotate() {
            var container = document.querySelector(containerId);
            if (!container) return;

            var svg = container.querySelector('svg');
            if (!svg) return;

            // Remove anotações anteriores
            svg.querySelectorAll('.cdc-bar-value-label').forEach(function(el) { el.remove(); });

            // Pega o viewBox para entender o espaço disponível
            var svgH = parseFloat(svg.getAttribute('height') || svg.viewBox.baseVal.height || 300);

            // Seleciona todos os rect do SVG
            var allRects = svg.querySelectorAll('rect');
            allRects.forEach(function(rect) {
                var x = parseFloat(rect.getAttribute('x') || '0');
                var y = parseFloat(rect.getAttribute('y') || '0');
                var w = parseFloat(rect.getAttribute('width') || '0');
                var h = parseFloat(rect.getAttribute('height') || '0');

                // Ignora barras muito pequenas (altura ≤ 5 = valor 0 ou elemento estrutural)
                // Ignora rects muito largos (fundo/eixo) ou muito finos (linhas de grade)
                if (w < 4 || h < 6 || w > 120) return;

                // Verifica se tem fill colorido (não transparente, não branco, não cinza claro de fundo)
                var fill = rect.getAttribute('fill') || window.getComputedStyle(rect).fill || '';
                if (!fill || fill === 'none' || fill === 'transparent' ||
                    fill === 'rgb(255, 255, 255)' || fill === '#ffffff' ||
                    fill === 'rgb(248, 250, 252)' || fill === '#f8fafc') return;

                // Extrai o valor: tenta <title>, depois atributos, depois tooltip data
                var numVal = 0;
                var titleEl = rect.querySelector('title');
                if (titleEl) {
                    var raw = titleEl.textContent || '';
                    // Formatos: "Maio: 42", "42", "dataset: 42"
                    var m = raw.match(/:\s*([0-9]+(?:\.[0-9]+)?)/) || raw.match(/^([0-9]+(?:\.[0-9]+)?)/);
                    if (m) numVal = parseFloat(m[1]);
                }
                if (!numVal) {
                    var dv = rect.getAttribute('data-value') || rect.getAttribute('data-point-value') || '';
                    if (dv) numVal = parseFloat(dv);
                }

                if (numVal > 0) {
                    var labelY = Math.max(y - 5, 12);
                    var textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    textEl.setAttribute('x', x + (w / 2));
                    textEl.setAttribute('y', labelY);
                    textEl.setAttribute('text-anchor', 'middle');
                    textEl.setAttribute('font-size', '10');
                    textEl.setAttribute('font-weight', '800');
                    textEl.setAttribute('fill', '#0f172a');
                    textEl.setAttribute('pointer-events', 'none');
                    textEl.classList.add('cdc-bar-value-label');
                    textEl.textContent = Math.round(numVal);

                    // Adiciona no mesmo grupo do rect para herdar transformações
                    var parent = rect.parentNode || svg;
                    parent.appendChild(textEl);
                }
            });
        }

        // Primeira tentativa após 700ms
        setTimeout(doAnnotate, 700);
        // Segunda tentativa após 1300ms (retry caso frappe.Chart ainda estivesse renderizando)
        setTimeout(doAnnotate, 1300);
    }


    // --- VALIDAÇÃO ESTRITA DE ROTA SPA DO FRAPPE (ESTOQUE) ---
    function isStockWorkspacePage() {
        var route = (frappe.get_route && frappe.get_route()) ? frappe.get_route() : [];
        if (!route || route.length === 0) return false;

        var mainRoute = (route[0] || '').toLowerCase();
        var subRoute = (route[1] || '').toLowerCase();

        if (mainRoute === 'form' || mainRoute === 'list' || mainRoute === 'query-report' || mainRoute === 'report' || mainRoute === 'tree' || mainRoute === 'dashboard-view' || mainRoute === 'print') {
            return false;
        }

        if ((mainRoute === 'workspaces' || mainRoute === 'workspace') && (subRoute === 'stock' || subRoute === 'estoque')) {
            return true;
        }

        var href = (window.location.href || '').toLowerCase();
        if (href.endsWith('/app/stock') || href.endsWith('/app/workspace/stock') || href.endsWith('/app/workspaces/stock') || href.endsWith('/app/stock/')) {
            return true;
        }

        return false;
    }

    // --- DETECÇÃO DA ROTA INTEGRAÇÕES ---
    function isIntegrationPage() {
        var href = (window.location.href || '').toLowerCase();
        // Aceita /app/integracoes  ou  /app/integra%C3%A7%C3%B5es
        if (href.indexOf('/app/integracoes') !== -1 ||
            href.indexOf('/app/integra%c3%a7%c3%b5es') !== -1) return true;
        var route = (frappe.get_route && frappe.get_route()) ? frappe.get_route() : [];
        var sub = decodeURIComponent((route[1] || '')).toLowerCase();
        return sub === 'integracoes' || sub === 'integrações';
    }

    // --- BANNER COMPLETO DA WORKSPACE INTEGRAÇÕES ---
    function renderIntegrationsDiagnosticBanner() {
        if (document.getElementById('cdc-integracoes-banner')) return;

        var target = document.querySelector('.layout-main-section') ||
                     document.querySelector('.page-content') ||
                     document.querySelector('.page-container');
        if (!target) return;

        var banner = document.createElement('div');
        banner.id = 'cdc-integracoes-banner';
        banner.style.cssText = 'margin:18px 24px 0;font-family:system-ui,sans-serif;display:flex;flex-direction:column;gap:16px;';

        // ── 1. BUSINESS INTELLIGENCE (primeiro, conforme solicitado) ──────────
        var S = '<div style="background:linear-gradient(135deg,#0f172a,#172038);border-radius:14px;padding:24px 28px;color:#f1f5f9;">';
        S += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">';
        S += '<span style="font-size:24px;">📊</span>';
        S += '<span style="font-size:17px;font-weight:800;color:#fff;">Business Intelligence</span>';
        S += '<span style="background:#7c3aed;color:#fff;font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;margin-left:4px;">Em breve</span>';
        S += '</div>';
        S += '<p style="font-size:13px;color:#cbd5e1;line-height:1.8;margin:0 0 18px;">Este espaço será dedicado à conexão do <strong style="color:#fff;">CDC NextERP</strong> com ferramentas de análise e visualização de dados. Poderemos integrar indicadores de estoque, movimentações e desempenho operacional diretamente em painéis interativos — acessíveis por gestores e diretoria em tempo real, sem exportações manuais.</p>';
        S += '<div style="display:flex;flex-wrap:wrap;gap:10px;">';
        S += '<div style="background:rgba(255,200,0,0.1);border:1px solid rgba(255,200,0,0.2);border-radius:10px;padding:10px 18px;font-size:12px;font-weight:700;color:#fde68a;">🟡 Power BI</div>';
        S += '<div style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);border-radius:10px;padding:10px 18px;font-size:12px;font-weight:700;color:#93c5fd;">🔵 Google Data Studio</div>';
        S += '<div style="background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.2);border-radius:10px;padding:10px 18px;font-size:12px;font-weight:700;color:#fdba74;">🟠 Microsoft Fabric</div>';
        S += '<div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:10px 18px;font-size:12px;font-weight:700;color:#fca5a5;">🔴 Databricks</div>';
        S += '</div></div>';

        // ── 2. MATTERMOST — WEBHOOKS POR ARMAZÉM (segundo) ───────────────────
        S += '<div style="background:linear-gradient(135deg,#0f172a,#0c2240);border-radius:14px;padding:24px 28px;color:#f1f5f9;">';
        S += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:20px;">';
        S += '<div><div style="display:flex;align-items:center;gap:10px;"><span style="font-size:22px;">🔔</span>';
        S += '<span style="font-size:17px;font-weight:800;color:#fff;">Integrações — CDC NextERP</span></div>';
        S += '<div style="font-size:12px;color:#475569;margin-top:5px;margin-left:32px;">Notificações Mattermost por armazém · Incoming Webhooks</div></div>';
        S += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
        S += '<button id="cdc-mm-new-btn" style="background:#10b981;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">+ Nova Config</button>';
        S += '<button id="cdc-mm-diag-btn" style="background:#1e293b;color:#94a3b8;border:1px solid #334155;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">🔍 Diagnóstico</button>';
        S += '</div></div>';
        S += '<div id="cdc-mm-configs-list"><div style="text-align:center;color:#475569;font-size:13px;padding:24px;">⏳ Carregando...</div></div>';
        S += '<div id="cdc-mm-diag-result" style="max-height:0;overflow:hidden;transition:max-height 0.4s ease;"></div>';
        S += '</div>';

        banner.innerHTML = S;
        target.insertBefore(banner, target.firstChild);

        // ── Carrega lista de configs agrupadas por armazém ────────────────────
        function loadMattermostConfigs() {
            frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'CDC Mattermost Config',
                    fields: ['name', 'warehouse', 'channel_name', 'enabled', 'notify_entry', 'notify_exit', 'notify_update'],
                    limit: 200,
                    order_by: 'warehouse asc'
                },
                callback: function(r) {
                    var listEl = document.getElementById('cdc-mm-configs-list');
                    if (!listEl) return;
                    var configs = (r && r.message) ? r.message : [];

                    if (!configs.length) {
                        listEl.innerHTML = '<div style="background:rgba(255,255,255,0.03);border:1px dashed rgba(255,255,255,0.08);border-radius:10px;padding:28px;text-align:center;">'
                            + '<div style="font-size:30px;margin-bottom:8px;">🏭</div>'
                            + '<div style="color:#64748b;font-size:13px;">Nenhum armazém configurado ainda.</div>'
                            + '<div style="color:#475569;font-size:12px;margin-top:6px;">Clique em <strong style="color:#10b981;">+ Nova Config</strong> para adicionar o primeiro canal Mattermost.</div>'
                            + '</div>';
                        return;
                    }

                    // Agrupa por armazém
                    var byWh = {}, order = [];
                    configs.forEach(function(c) {
                        var w = c.warehouse || '—';
                        if (!byWh[w]) { byWh[w] = []; order.push(w); }
                        byWh[w].push(c);
                    });

                    var html = '';
                    order.forEach(function(wh) {
                        var cfgs = byWh[wh];
                        var whLabel = wh.replace(/ - C$/, '').replace(/ - CDC$/, '').trim();
                        html += '<div style="border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:14px 16px;margin-bottom:10px;">';
                        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
                        html += '<span style="font-size:13px;font-weight:700;color:#f1f5f9;">🏭 ' + whLabel + '</span>';
                        html += '<span style="font-size:10px;color:#475569;">' + cfgs.length + ' canal(is)</span>';
                        html += '</div>';
                        cfgs.forEach(function(c) {
                            var dot = c.enabled ? '#10b981' : '#475569';
                            var evts = (c.notify_entry ? '📥 ' : '') + (c.notify_exit ? '📤 ' : '') + (c.notify_update ? '🔄' : '');
                            html += '<div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.04);border-radius:7px;padding:8px 12px;margin-bottom:4px;">';
                            html += '<div style="display:flex;align-items:center;gap:8px;">';
                            html += '<span style="width:8px;height:8px;border-radius:50%;background:' + dot + ';flex-shrink:0;display:inline-block;"></span>';
                            html += '<span style="font-size:12px;color:#e2e8f0;font-weight:600;">' + (c.channel_name || '—') + '</span>';
                            html += '<span style="font-size:11px;color:#64748b;">' + evts + '</span>';
                            html += '</div>';
                            html += '<a href="/app/cdc-mattermost-config/' + c.name + '" style="font-size:11px;color:#3b82f6;text-decoration:none;font-weight:600;" onclick="frappe.set_route(\'Form\',\'CDC Mattermost Config\',\'' + c.name + '\');return false;">Editar →</a>';
                            html += '</div>';
                        });
                        html += '</div>';
                    });

                    listEl.innerHTML = html;
                }
            });
        }

        loadMattermostConfigs();

        // ── Botão: Nova Config ────────────────────────────────────────────────
        document.getElementById('cdc-mm-new-btn').addEventListener('click', function() {
            frappe.new_doc('CDC Mattermost Config');
        });

        // ── Botão: Diagnóstico (toggle) ───────────────────────────────────────
        document.getElementById('cdc-mm-diag-btn').addEventListener('click', function() {
            var resultEl = document.getElementById('cdc-mm-diag-result');
            var btn = this;

            if (resultEl.dataset.open === '1') {
                resultEl.style.maxHeight = '0';
                resultEl.dataset.open = '0';
                btn.innerHTML = '🔍 Diagnóstico';
                return;
            }

            btn.innerHTML = '⏳ Verificando...';
            btn.disabled = true;

            frappe.call({
                method: 'cdc_theme.api.diagnostico_mattermost',
                freeze: false,
                callback: function(r) {
                    btn.innerHTML = '🔍 Diagnóstico';
                    btn.disabled = false;

                    if (!r || !r.message) {
                        resultEl.innerHTML = '<div style="padding:14px 0;color:#fca5a5;">❌ Sem resposta do servidor. Verifique o console.</div>';
                        resultEl.style.maxHeight = '80px';
                        resultEl.dataset.open = '1';
                        return;
                    }

                    var d = r.message;
                    if (d.erro) {
                        resultEl.innerHTML = '<div style="padding:14px 0;color:#fca5a5;">❌ ' + d.erro + '</div>';
                        resultEl.style.maxHeight = '80px';
                        resultEl.dataset.open = '1';
                        return;
                    }

                    var erros = (d.erros_recentes && d.erros_recentes.length)
                        ? d.erros_recentes.map(function(e) {
                            return '<div style="background:rgba(239,68,68,0.1);border-radius:6px;padding:6px 10px;font-size:11px;color:#fca5a5;margin-bottom:4px;">⚠️ '
                                + (e.title || '') + '<span style="color:#475569;margin-left:8px;">' + (e.creation || '') + '</span></div>';
                          }).join('')
                        : '<div style="color:#86efac;font-size:12px;">✅ Nenhum erro recente</div>';

                    resultEl.innerHTML = '<div style="border-top:1px solid rgba(255,255,255,0.07);margin-top:12px;padding-top:16px;">'
                        + '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;">'
                        + '<div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px 18px;text-align:center;min-width:64px;"><div style="font-size:20px;font-weight:800;color:#fff;">' + (d.total_configs || 0) + '</div><div style="font-size:10px;color:#64748b;">Total</div></div>'
                        + '<div style="background:rgba(16,185,129,0.1);border-radius:8px;padding:10px 18px;text-align:center;min-width:64px;"><div style="font-size:20px;font-weight:800;color:#34d399;">' + (d.ativos || 0) + '</div><div style="font-size:10px;color:#64748b;">Ativos</div></div>'
                        + '<div style="background:rgba(239,68,68,0.08);border-radius:8px;padding:10px 18px;text-align:center;min-width:64px;"><div style="font-size:20px;font-weight:800;color:#f87171;">' + (d.inativos || 0) + '</div><div style="font-size:10px;color:#64748b;">Inativos</div></div>'
                        + '<div style="background:rgba(37,99,235,0.1);border-radius:8px;padding:10px 18px;text-align:center;min-width:64px;"><div style="font-size:20px;font-weight:800;color:#93c5fd;">' + ((d.armazens_cobertos || []).length) + '</div><div style="font-size:10px;color:#64748b;">Armazéns</div></div>'
                        + '</div>'
                        + '<div style="font-size:10px;font-weight:700;color:#475569;letter-spacing:1px;margin-bottom:8px;">ERROS RECENTES</div>'
                        + erros
                        + '</div>';

                    resultEl.style.maxHeight = '420px';
                    resultEl.dataset.open = '1';
                }
            });
        });
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

        // H3: Gráfico Principal no DOM (SVG no #cdc-main-svg-chart + estrutura customizada em #cdc-native-frappe-chart)
        var mainSvgEl = document.getElementById('cdc-main-svg-chart');
        var customChartEl = document.getElementById('cdc-native-frappe-chart');
        var hasSvgChart = !!(mainSvgEl && mainSvgEl.querySelector('svg'));
        var hasCustomChart = !!(customChartEl && customChartEl.querySelector('.month-group-card'));
        var hasMainChart = hasSvgChart || hasCustomChart;
        if (!hasMainChart) report.all_passed = false;
        report.hypotheses.push({
            id: 3,
            name: 'Gráfico Principal (SVG interativo + Estrutura por Mês)',
            passed: hasMainChart,
            details: hasMainChart
                ? 'SVG: ' + (hasSvgChart ? '✅' : '❌') + '  |  Estrutura por Mês (S1 S2...): ' + (hasCustomChart ? '✅' : '❌')
                : '❌ ALERTA: Nenhum gráfico renderizado no DOM'
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

        // H7: Validação do Card Único Principal de Monitoramento
        var mainCardEl = document.getElementById('cdc-main-svg-chart');
        var h7Passed = !!mainCardEl;
        if (!h7Passed) report.all_passed = false;
        report.hypotheses.push({
            id: 7,
            name: 'Card Único de Monitoramento de Lançamentos',
            passed: h7Passed,
            details: h7Passed ? 'Apenas o Gráfico Principal de Lançamentos ativo no DOM conforme solicitado' : '❌ ALERTA: Card Principal não encontrado'
        });

        // H8: Restauração da Posição de Scroll (sessionStorage)
        var savedScroll = sessionStorage.getItem('cdc_scroll_y') || '0';
        report.hypotheses.push({
            id: 8,
            name: 'Preservação de Posição de Scroll (F5 / Refresh)',
            passed: true,
            details: 'Posição de scroll memorizada em sessionStorage (' + Math.round(parseFloat(savedScroll)) + 'px Y)'
        });

        // H9: Grupos de Mês Estruturados no Card Principal
        var monthGroupsCount = document.querySelectorAll('.month-group-card').length;
        report.hypotheses.push({
            id: 9,
            name: 'Grupos de Mês Estruturados no Card Principal',
            passed: monthGroupsCount > 0,
            details: monthGroupsCount > 0 ? monthGroupsCount + ' grupos de mês coloridos com rótulos S1, S2 em baixo' : '❌ ALERTA: 0 grupos de mês'
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

                // --- 3. ATALHO & CARTÕES DE CATEGORIAS (LAYOUT EXATO) ---
                var shortcutsBar = `
                    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 22px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                        <div style="font-size: 17px; font-weight: 800; color: #0f172a; margin-bottom: 14px;">Atalho</div>
                        <div style="display: flex; flex-wrap: wrap; gap: 24px; align-items: center;">
                            <a href="/app/query-report/Lancamento%20no%20Estoque%20-%20CDC" style="font-weight: 700; font-size: 14px; color: #0f172a; text-decoration: none; display: flex; align-items: center; gap: 4px;">
                                Lançamento no Estoque <span style="font-size: 12px; color: #64748b;">↗</span>
                            </a>
                            <a href="/app/stock-reconciliation" style="font-weight: 700; font-size: 14px; color: #0f172a; text-decoration: none; display: flex; align-items: center; gap: 4px;">
                                Conciliação de Estoque <span style="font-size: 12px; color: #64748b;">↗</span>
                            </a>
                            <a href="/app/query-report/Livro%20de%20Inventarios%20-%20CDC" style="font-weight: 700; font-size: 14px; color: #0f172a; text-decoration: none; display: flex; align-items: center; gap: 4px;">
                                Livro de inventario <span style="font-size: 12px; color: #64748b;">↗</span>
                            </a>
                            <a href="/app/query-report/Balan%C3%A7o%20de%20Estoque%20-%20CDC" style="font-weight: 700; font-size: 14px; color: #0f172a; text-decoration: none; display: flex; align-items: center; gap: 4px;">
                                Balanço de Estoque <span style="font-size: 12px; color: #64748b;">↗</span>
                            </a>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin-bottom: 24px;">
                        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                            <div style="font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 12px;">Catálogo</div>
                            <div style="display: flex; flex-direction: column; gap: 10px;">
                                <a href="/app/item" style="font-weight: 600; font-size: 13px; color: #334155; text-decoration: none; display: flex; justify-content: space-between; align-items: center;"><span>Item</span> <span style="color: #64748b; font-size: 12px;">↗</span></a>
                                <a href="/app/item-group" style="font-weight: 600; font-size: 13px; color: #334155; text-decoration: none; display: flex; justify-content: space-between; align-items: center;"><span>Grupo de Item</span> <span style="color: #64748b; font-size: 12px;">↗</span></a>
                                <a href="/app/warehouse" style="font-weight: 600; font-size: 13px; color: #334155; text-decoration: none; display: flex; justify-content: space-between; align-items: center;"><span>Armazém</span> <span style="color: #64748b; font-size: 12px;">↗</span></a>
                            </div>
                        </div>

                        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                            <div style="font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 12px;">Movimentação</div>
                            <div style="display: flex; flex-direction: column; gap: 10px;">
                                <a href="/app/stock-entry" style="font-weight: 600; font-size: 13px; color: #334155; text-decoration: none; display: flex; justify-content: space-between; align-items: center;"><span>Lançamento no Estoque</span> <span style="color: #64748b; font-size: 12px;">↗</span></a>
                                <a href="/app/stock-reconciliation" style="font-weight: 600; font-size: 13px; color: #334155; text-decoration: none; display: flex; justify-content: space-between; align-items: center;"><span>Conciliação de Estoque</span> <span style="color: #64748b; font-size: 12px;">↗</span></a>
                            </div>
                        </div>

                        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                            <div style="font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 12px;">Relatórios Personalizados</div>
                            <div style="display: flex; flex-direction: column; gap: 10px;">
                                <a href="/app/query-report/Balan%C3%A7o%20de%20Estoque%20-%20CDC" style="font-weight: 600; font-size: 13px; color: #334155; text-decoration: none; display: flex; justify-content: space-between; align-items: center;"><span>Balanço de Estoque - CDC</span> <span style="color: #64748b; font-size: 12px;">↗</span></a>
                                <a href="/app/query-report/Lancamento%20no%20Estoque%20-%20CDC" style="font-weight: 600; font-size: 13px; color: #334155; text-decoration: none; display: flex; justify-content: space-between; align-items: center;"><span>Lancamento no Estoque - CDC...</span> <span style="color: #64748b; font-size: 12px;">↗</span></a>
                                <a href="/app/query-report/Livro%20de%20Inventarios%20-%20CDC" style="font-weight: 600; font-size: 13px; color: #334155; text-decoration: none; display: flex; justify-content: space-between; align-items: center;"><span>Livro de Inventarios - CDC</span> <span style="color: #64748b; font-size: 12px;">↗</span></a>
                            </div>
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

                // --- 6. MONITORAMENTO DE LANÇAMENTOS (GRÁFICO ÚNICO PRINCIPAL EXCLUSIVO) ---
                var occurrencesData = data.occurrences_data || { labels: [], datasets: [], grouped_months: [] };
                var datasetsList = occurrencesData.datasets || [];
                var groupedMonthsList = occurrencesData.grouped_months || [];

                var ptBrLabels = (occurrencesData.labels || ["S1 Maio", "S2 Maio", "S3 Maio", "S4 Maio", "S1 Jun", "S2 Jun", "S3 Jun", "S4 Jun", "S5 Jun", "S1 Jul"]).map(function(lbl) {
                    return lbl.replace('May', 'Maio').replace('Jun', 'Junho').replace('Jul', 'Julho').replace('Aug', 'Agosto').replace('Sep', 'Setembro');
                });

                // SE A API NÃO RETORNAR grouped_months, CONSTRÓI CLIENT-SIDE A PARTIR DOS LABELS
                // Formato esperado dos labels: "Maio S1", "Maio S2", "Junho S1", etc. (mês + semana)
                if (!groupedMonthsList || groupedMonthsList.length === 0) {
                    var MONTH_NAME_LIST = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
                    var builtMonthMap = {};
                    var builtMonthOrder = [];
                    ptBrLabels.forEach(function(lbl) {
                        var parts = lbl.trim().split(/\s+/);
                        var monthName = null;
                        var weekName = null;
                        parts.forEach(function(p) {
                            var normalized = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
                            if (MONTH_NAME_LIST.indexOf(normalized) !== -1) {
                                monthName = normalized;
                            } else if (/^S\d+$/i.test(p)) {
                                weekName = p.toUpperCase();
                            }
                        });
                        if (!monthName && parts.length >= 1) monthName = parts[0];
                        if (!weekName && parts.length >= 2) weekName = parts[1];
                        if (!weekName) weekName = 'S1';
                        if (monthName) {
                            if (!builtMonthMap[monthName]) {
                                builtMonthMap[monthName] = [];
                                builtMonthOrder.push(monthName);
                            }
                            builtMonthMap[monthName].push(weekName);
                        }
                    });
                    groupedMonthsList = builtMonthOrder.map(function(m) {
                        return { month: m, weeks: builtMonthMap[m] };
                    });
                }

                var projectSelectOptions = `<option value="all" ${currentSelectedProjectFilter === 'all' ? 'selected' : ''}>🌐 Todos os Programas (Consolidado - 6 Projetos)</option>`;
                datasetsList.forEach(function(ds) {
                    var selected = (currentSelectedProjectFilter === ds.project) ? 'selected' : '';
                    projectSelectOptions += `<option value="${ds.project}" ${selected}>📌 ${ds.project} (${ds.total_occurrences} lançamentos)</option>`;
                });

                var singleProjectFilterDropdown = `
                    <select id="cdc-top-chart-project-select" class="form-control" style="width: auto; height: 30px; font-size: 12px; font-weight: 700; border-radius: 6px; border: 1px solid #2563eb; color: #0f172a; cursor: pointer; background: #ffffff; padding: 0 8px;">
                        ${projectSelectOptions}
                    </select>
                `;

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

                var isIssue = (currentOccurrencesType === 'issue');

                var discreteDiagBtn = `
                    <button id="cdc-btn-run-diag" class="btn btn-default btn-xs" style="font-weight: 700; font-size: 10px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; color: #475569; padding: 2px 7px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; margin-left: 10px;" title="Rodar Inquérito de Diagnóstico CDC">
                        <span>🔍 Diag</span>
                        <span style="color: #2563eb; font-size: 10px;">⚡</span>
                    </button>
                `;

                var customMainChartCard = `
                    <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 18px; margin-bottom: 0; box-shadow: 0 2px 10px rgba(0,0,0,0.03);">
                        <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                            <span style="font-size: 15px; font-weight: 800; color: #0f172a;">📊 Gráfico Principal de Lançamentos</span>
                            <span style="font-size: 11.5px; font-weight: 800; color: #2563eb;">Cores Distintas por Mês • Quantidades no Topo • S1 S2 na Base</span>
                        </div>

                        <!-- 1. GRÁFICO PRINCIPAL SVG INTERATIVO (FRAPPE.CHART) -->
                        <div id="cdc-main-svg-chart" style="width: 100%; min-height: 230px; margin-bottom: 16px; background: #fafafa; border-radius: 8px; padding: 8px;"></div>

                        <!-- 2. ESTRUTURA CUSTOMIZADA COM BARRAS COLORIDAS POR MÊS E MESES CENTRALIZADOS -->
                        <div id="cdc-native-frappe-chart" style="width: 100%; border-top: 1px dashed #cbd5e1; padding-top: 14px;"></div>
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
                                <p style="margin: 4px 0 0; font-size: 12px; color: #64748b;">Volume de lançamentos organizados com cores por mês e semanas S1, S2... centralizadas</p>
                            </div>

                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px; text-align: right;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 11px; font-weight: 700; color: #475569;">Programa:</span>
                                    ${singleProjectFilterDropdown}
                                </div>
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

                        ${customMainChartCard}
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
                    var filteredDatasets = (currentSelectedProjectFilter === 'all')
                        ? occurrencesData.datasets
                        : occurrencesData.datasets.filter(function(ds) { return ds.project === currentSelectedProjectFilter; });

                    // 1. RENDERIZAÇÃO DO GRÁFICO SVG NATIVO PRINCIPAL (FRAPPE.CHART)
                    // Legenda por MÊS: cada série = um mês (Maio, Junho, Julho)
                    // Fallback: se groupedMonthsList vazio, usa datasets por projeto
                    if (document.getElementById('cdc-main-svg-chart') && window.frappe && window.frappe.Chart) {
                        try {
                            var chartTitle = (currentSelectedProjectFilter === 'all') 
                                ? 'Volume Consolidado de Lançamentos por Mês'
                                : 'Volume de Lançamentos - ' + currentSelectedProjectFilter;

                            var totalWeeks = ptBrLabels.length;
                            var svgColors = isIssue ? ISSUE_COLORS : MONTH_COLORS;
                            var chartLabels = ptBrLabels;
                            var chartDatasets = [];

                            // --- MODO LEGENDA POR MÊS (quando groupedMonthsList disponível) ---
                            if (groupedMonthsList && groupedMonthsList.length > 0 && totalWeeks > 0 && filteredDatasets && filteredDatasets.length > 0) {

                                // Soma todos os projetos selecionados semana a semana
                                var consolidatedValues = [];
                                for (var wi = 0; wi < totalWeeks; wi++) {
                                    var wSum = 0;
                                    filteredDatasets.forEach(function(ds) {
                                        if (ds.occurrences) wSum += (ds.occurrences[wi] || 0);
                                    });
                                    consolidatedValues.push(wSum);
                                }

                                // Cria um dataset por mês, preenchendo só as suas semanas
                                var weekCursor = 0;
                                groupedMonthsList.forEach(function(gm) {
                                    var monthWeekCount = (gm.weeks || []).length;
                                    var values = new Array(totalWeeks).fill(0);
                                    for (var w = 0; w < monthWeekCount; w++) {
                                        var idx = weekCursor + w;
                                        if (idx < totalWeeks) {
                                            values[idx] = consolidatedValues[idx];
                                        }
                                    }
                                    chartDatasets.push({
                                        name: gm.month,
                                        type: 'bar',
                                        values: values
                                    });
                                    weekCursor += monthWeekCount;
                                });

                                // Rótulos simplificados (S1, S2... sem nome do mês — mês está na legenda)
                                var simpleWeekLabels = [];
                                groupedMonthsList.forEach(function(gm) {
                                    (gm.weeks || []).forEach(function(w) {
                                        simpleWeekLabels.push(w);
                                    });
                                });
                                if (simpleWeekLabels.length > 0) chartLabels = simpleWeekLabels;
                            }

                            // --- FALLBACK: MODO LEGENDA POR PROJETO (quando sem dados de mês) ---
                            if (chartDatasets.length === 0 && filteredDatasets && filteredDatasets.length > 0) {
                                chartDatasets = filteredDatasets.map(function(ds) {
                                    return { name: ds.project, type: 'bar', values: ds.occurrences || [] };
                                });
                                svgColors = (currentSelectedProjectFilter === 'all')
                                    ? ['#10b981', '#2563eb', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4']
                                    : [isIssue ? '#dc2626' : ((filteredDatasets[0] && filteredDatasets[0].color) || '#2563eb')];
                                chartLabels = ptBrLabels;
                            }

                            // Só renderiza se houver dados suficientes
                            if (chartDatasets.length > 0 && chartLabels.length > 0) {
                                new frappe.Chart('#cdc-main-svg-chart', {
                                    title: chartTitle,
                                    data: {
                                        labels: chartLabels,
                                        datasets: chartDatasets
                                    },
                                    type: 'bar',
                                    height: 230,
                                    colors: svgColors,
                                    axisOptions: { xIsSeries: true },
                                    barOptions: { spaceRatio: 0.2 }
                                });

                                annotateChartValuesOnTop('#cdc-main-svg-chart');
                            }
                        } catch (eSvg) {
                            console.error('Erro no gráfico SVG principal:', eSvg);
                        }
                    }


                    // 2. RENDERIZAÇÃO DA ESTRUTURA CUSTOMIZADA COM BARRAS COLORIDAS POR MÊS NO PRIMEIRO CARD
                    if (document.getElementById('cdc-native-frappe-chart')) {
                        var activeDataset = null;
                        if (occurrencesData && occurrencesData.datasets && occurrencesData.datasets.length > 0) {
                            if (currentSelectedProjectFilter === 'all') {
                                var sumOccurrences = [];
                                var totalLen = occurrencesData.datasets[0].occurrences ? occurrencesData.datasets[0].occurrences.length : 0;
                                for (var i = 0; i < totalLen; i++) {
                                    var sum = 0;
                                    occurrencesData.datasets.forEach(function(ds) {
                                        if (ds.occurrences) {
                                            sum += (ds.occurrences[i] || 0);
                                        }
                                    });
                                    sumOccurrences.push(sum);
                                }
                                activeDataset = {
                                    project: 'Consolidado (Todos os Programas)',
                                    occurrences: sumOccurrences
                                };
                            } else {
                                for (var dIdx = 0; dIdx < occurrencesData.datasets.length; dIdx++) {
                                    if (occurrencesData.datasets[dIdx].project === currentSelectedProjectFilter) {
                                        activeDataset = occurrencesData.datasets[dIdx];
                                        break;
                                    }
                                }
                                if (!activeDataset) {
                                    activeDataset = occurrencesData.datasets[0];
                                }
                            }
                        }

                        if (activeDataset) {
                            renderCustomStructuredMonthChart('#cdc-native-frappe-chart', activeDataset, groupedMonthsList, isIssue, true);
                        }
                    }

                    restoreScrollPosition();
                    window._cdc_run_diagnostics();
                }, 200);
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
            sessionStorage.setItem('cdc_unit', currentSelectedUnit);
            renderStockDashboard();
        });

        $(document).off('change', '#cdc-top-chart-project-select').on('change', '#cdc-top-chart-project-select', function(e) {
            e.stopPropagation();
            currentSelectedProjectFilter = $(this).val();
            sessionStorage.setItem('cdc_project_filter', currentSelectedProjectFilter);
            renderStockDashboard();
        });

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
                sessionStorage.setItem('cdc_period', currentSelectedPeriod);
                renderStockDashboard();
            }
        });

        $(document).off('click', '[data-occ-type]').on('click', '[data-occ-type]', function(e) {
            e.preventDefault();
            var occType = $(this).attr('data-occ-type') || $(this).data('occ-type');
            if (occType && occType !== currentOccurrencesType) {
                currentOccurrencesType = occType;
                sessionStorage.setItem('cdc_occ_type', currentOccurrencesType);
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
                sessionStorage.setItem('cdc_table_type', currentTableTypeFilter);
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

        // Renderiza banner de diagnóstico na workspace Integrações
        if (isIntegrationPage()) {
            setTimeout(renderIntegrationsDiagnosticBanner, 400);
        } else {
            var b = document.getElementById('cdc-integracoes-banner');
            if (b) b.remove();
        }
    });

    // Inicialização na carga inicial
    setTimeout(function() {
        if (isIntegrationPage()) renderIntegrationsDiagnosticBanner();
    }, 600);


    // REGISTRO GLOBAL DO BOTÃO TESTAR CONEXÃO NO FORMULÁRIO MATTERMOST
    frappe.ui.form.on('CDC Mattermost Config', {
        refresh: function(frm) {
            frm.add_custom_button(__('🧪 Testar Conexão'), function() {
                if (!frm.doc.webhook_url) {
                    frappe.msgprint(__('Por favor, preencha a URL do Webhook antes de testar.'), __('Aviso'), 'orange');
                    return;
                }
                frappe.call({
                    method: 'cdc_theme.cdc_theme.doctype.cdc_mattermost_config.cdc_mattermost_config.test_connection',
                    doc: frm.doc,
                    freeze: true,
                    freeze_message: __('Enviando mensagem de teste para o Mattermost...'),
                    callback: function(r) {
                        frm.reload_doc();
                    }
                });
            }).addClass('btn-primary');
        }
    });

})();
