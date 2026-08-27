(function() {
    'use strict';

    var SYSTEM_ASSET_VERSION = 'v2.9.0-20260727_1218-INTEGRACOES-FIX';

    // RESTAURAÇÃO DE FILTROS E ESTADO VIA SESSION STORAGE (F5 / REFRESH)
    var currentSelectedUnit = sessionStorage.getItem('cdc_unit') || 'All';
    var currentSelectedPeriod = sessionStorage.getItem('cdc_period') || 'quarter';
    var currentOccurrencesType = sessionStorage.getItem('cdc_occ_type') || 'all';
    var currentTableTypeFilter = sessionStorage.getItem('cdc_table_type') || 'all';
    var currentSelectedProjectFilter = sessionStorage.getItem('cdc_project_filter') || 'all';
    var currentUsersProject = sessionStorage.getItem('cdc_users_project') || 'All';
    var currentUsersWarehouse = sessionStorage.getItem('cdc_users_warehouse') || 'All';

    var activeCategoriesMap = {}; // Controle de categorias ativas
    var isCategoryDropdownOpen = false;
    var isDashboardLoading = false;
    var lastDiagnosticReportText = '';
    var stockRequestSerial = 0;
    var stockRequestTimer = null;
    var stockActiveRequestKey = '';
    var stockRenderStage = 'inicialização';

    function claimCDCActiveDashboard(id, tagName) {
        var claim = window._cdc_claim_active_dashboard;
        return typeof claim === 'function' ? claim(id, tagName) : null;
    }

    function escapeHTML(value) {
        var element = document.createElement('div');
        element.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
        return element.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function getPilotProjectContext() {
        var slug = decodeURIComponent(window.location.pathname || '').split('/').filter(Boolean)[2] || '';
        var legacyProject = new URL(window.location.href).searchParams.get('cdc_project');
        var projects = {
            'projeto-atitude-ii-i': {name: 'Projeto Atitude II.I', label: 'armazéns do Projeto Atitude II.I'},
            'institucional-geral': {name: 'Institucional / Geral', label: 'armazéns institucionais e gerais'},
            'projeto-atitude': {name: 'Projeto Atitude', label: 'armazéns do Projeto Atitude'},
            'projeto-bem-viver': {name: 'Projeto Bem Viver', label: 'armazéns do Projeto Bem Viver'},
            'projeto-cais': {name: 'Projeto Cais', label: 'armazéns do Projeto Cais'},
            'projeto-atm': {name: 'Projeto ATM', label: 'armazéns do Projeto ATM'}
        };
        var legacySlugs = {
            'Projeto Atitude II.I': 'projeto-atitude-ii-i',
            'Institucional / Geral': 'institucional-geral',
            'Projeto Atitude': 'projeto-atitude',
            'Projeto Bem Viver': 'projeto-bem-viver',
            'Projeto Cais': 'projeto-cais',
            'Projeto ATM': 'projeto-atm'
        };
        return projects[slug || legacySlugs[legacyProject]] || null;
    }

    function suppressFalsePositive404() {
        try {
            var main = document.querySelector('.layout-main-section') || document.querySelector('.workspace-page-content');
            if (main) {
                var els = main.querySelectorAll('.page-not-found, .page-error-state, .invalid-page-state, .empty-state');
                els.forEach(function(el) {
                    if (el && !el.closest('#cdc-monitoring-dashboard') && !el.closest('#cdc-pending-dashboard')) {
                        el.style.display = 'none';
                    }
                });
                var msgEls = main.querySelectorAll('.text-muted, p, div, h1, h2, h3');
                msgEls.forEach(function(el) {
                    var txt = (el.textContent || '').trim().toLowerCase();
                    if (txt === 'não encontrado' || txt.indexOf('não encontrado') !== -1 || txt.indexOf('o recurso que você está procurando não está disponível') !== -1 || txt.indexOf('o recurso que voce esta procurando nao esta disponivel') !== -1) {
                        if (!el.closest('#cdc-monitoring-dashboard') && !el.closest('#cdc-pending-dashboard')) {
                            el.style.display = 'none';
                        }
                    }
                });
            }
        } catch (err) {}
    }

    function getCDCBreadcrumbHTML(section, detail) {
        var sections = [
            {label: 'Estoque', href: '/app/cdc-estoque'},
            {label: 'Usuários', href: '/app/cdc-usuários'},
            {label: 'Grupos', href: '/app/cdc-grupos'},
            {label: 'Itens', href: '/app/cdc-itens'},
            {label: 'Integrações', href: '/app/cdc-integrações'},
            {label: 'Pendências', href: '/app/cdc-pendências'},
            {label: 'Monitoramento', href: '/app/cdc-monitoramento'},
            {label: 'Testes', href: '/app/cdc-testes'},
            {label: 'Admin', href: '/app/cdc-admin'}
        ];
        var current = sections.find(function(item) { return item.label === section; });
        var quickLinks = sections.map(function(item) {
            return `<a href="${item.href}" class="cdc-breadcrumb-menu-link ${item.label === section ? 'is-active' : ''}">${item.label}</a>`;
        }).join('');
        return `<nav class="cdc-breadcrumb" aria-label="Navegação CDC">
            <div class="cdc-breadcrumb-trail"><span>CDC</span><span class="cdc-breadcrumb-separator">/</span><a href="${current.href}">${section}</a>${detail ? `<span class="cdc-breadcrumb-separator">/</span><strong>${detail}</strong>` : ''}</div>
            <div class="cdc-breadcrumb-menu">${quickLinks}</div>
        </nav>`;
    }
    window._cdc_get_breadcrumb_html = getCDCBreadcrumbHTML;

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


    // --- VALIDAÇÃO DE ROTA SPA DO FRAPPE (ESTOQUE) ---
    function isStockWorkspacePage() {
        var route = (frappe.get_route && frappe.get_route()) ? frappe.get_route() : [];
        var mainRoute = (route[0] || '').toLowerCase();
        var subRoute = decodeURIComponent((route[1] || '')).toLowerCase();

        if (mainRoute === 'form' || mainRoute === 'list' || mainRoute === 'query-report' || mainRoute === 'report' || mainRoute === 'tree' || mainRoute === 'dashboard-view' || mainRoute === 'print') {
            return false;
        }

        if (mainRoute === 'cdc-estoque' || mainRoute === 'stock' || mainRoute === 'estoque') return true;

        if (mainRoute === 'workspaces' || mainRoute === 'workspace') {
            if (subRoute === 'cdc-estoque' || subRoute === 'stock' || subRoute === 'estoque') return true;
        }

        var href = (window.location.href || '').toLowerCase();
        return href.indexOf('/app/cdc-estoque') !== -1 || href.indexOf('/app/stock') !== -1 || href.indexOf('/app/estoque') !== -1 || href.indexOf('/app/workspace/stock') !== -1;
    }


    // --- DETECÇÃO DA ROTA INTEGRAÇÕES ---
    function isIntegrationPage() {
        var route = (frappe.get_route && frappe.get_route()) ? frappe.get_route() : [];
        if (route && route.length > 0) {
            var normalize = function(value) {
                return decodeURIComponent(String(value || '')).toLowerCase().normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
            };
            var mainRoute = normalize(route[0]);
            var subRoute = normalize(route[1]);
            if (mainRoute === 'cdc-integracoes' || mainRoute === 'integrations' || mainRoute === 'integracoes') return true;
            if ((mainRoute === 'workspaces' || mainRoute === 'workspace') && 
                (subRoute === 'cdc-integracoes' || subRoute === 'integrations' || subRoute === 'integracoes')) {
                return true;
            }
            return false;
        }
        var path = decodeURIComponent(window.location.pathname || '').toLowerCase();
        return path.indexOf('/app/cdc-integracoes') !== -1 || path.indexOf('/app/integrations') !== -1;
    }

    function isUsersWorkspacePage() {
        var route = (frappe.get_route && frappe.get_route()) ? frappe.get_route() : [];
        var normalize = function(value) {
            return decodeURIComponent(String(value || '')).toLowerCase().normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
        };
        var mainRoute = normalize(route[0]);
        var subRoute = normalize(route[1]);
        if (mainRoute === 'cdc-usuarios' || mainRoute === 'users' || mainRoute === 'usuarios') return true;
        if (mainRoute === 'workspace' || mainRoute === 'workspaces') {
            return subRoute === 'cdc-usuarios' || subRoute === 'users' || subRoute === 'usuarios';
        }
        var href = (window.location.href || '').toLowerCase();
        return href.indexOf('/app/cdc-usuarios') !== -1 || href.indexOf('/app/cdc-usu%c3%a1rios') !== -1;
    }

    function escapeCDC(value) {
        var element = document.createElement('div');
        element.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
        return element.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function setupCDCSortableTable(root, topSelector, scrollSelector, tableSelector) {
        var topScroll = root.querySelector(topSelector);
        var bottomScroll = root.querySelector(scrollSelector);
        var table = root.querySelector(tableSelector);
        if (!topScroll || !bottomScroll || !table) return;
        var topContent = topScroll.firstElementChild;
        var syncing = false;
        var syncWidth = function() { topContent.style.width = table.scrollWidth + 'px'; };
        window.requestAnimationFrame(syncWidth);
        topScroll.addEventListener('scroll', function() {
            if (syncing) return;
            syncing = true;
            bottomScroll.scrollLeft = topScroll.scrollLeft;
            syncing = false;
        });
        bottomScroll.addEventListener('scroll', function() {
            if (syncing) return;
            syncing = true;
            topScroll.scrollLeft = bottomScroll.scrollLeft;
            syncing = false;
        });
        table.querySelectorAll('th[data-sort-index]').forEach(function(header) {
            header.tabIndex = 0;
            header.setAttribute('role', 'button');
            header.setAttribute('aria-sort', 'none');
            var sort = function() {
                var index = Number(header.dataset.sortIndex);
                var type = header.dataset.sortType || 'text';
                var direction = header.dataset.sortDirection === 'asc' ? 'desc' : 'asc';
                table.querySelectorAll('th[data-sort-index]').forEach(function(item) {
                    item.dataset.sortDirection = '';
                    item.setAttribute('aria-sort', 'none');
                    var indicator = item.querySelector('.cdc-sort-indicator');
                    if (indicator) indicator.textContent = '↕';
                });
                header.dataset.sortDirection = direction;
                header.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
                var activeIndicator = header.querySelector('.cdc-sort-indicator');
                if (activeIndicator) activeIndicator.textContent = direction === 'asc' ? '▲' : '▼';
                var body = table.tBodies[0];
                var rows = Array.from(body.querySelectorAll('tr[data-search]'));
                rows.sort(function(a, b) {
                    var aValue = (a.cells[index].dataset.sort || a.cells[index].textContent || '').trim();
                    var bValue = (b.cells[index].dataset.sort || b.cells[index].textContent || '').trim();
                    var result;
                    if (type === 'number') result = (Number(aValue) || 0) - (Number(bValue) || 0);
                    else if (type === 'date') result = (Date.parse(aValue) || 0) - (Date.parse(bValue) || 0);
                    else result = aValue.localeCompare(bValue, 'pt-BR', {numeric: true, sensitivity: 'base'});
                    return direction === 'asc' ? result : -result;
                });
                rows.forEach(function(row) { body.appendChild(row); });
            };
            header.addEventListener('click', sort);
            header.addEventListener('keydown', function(event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    sort();
                }
            });
        });
    }
    window._cdc_setup_sortable_table = setupCDCSortableTable;

    function renderUsersDashboard() {
        if (!isUsersWorkspacePage()) {
            document.querySelectorAll('#cdc-users-dashboard').forEach(function(dashboard) { dashboard.remove(); });
            return;
        }

        var claim = claimCDCActiveDashboard('cdc-users-dashboard', 'section');
        if (!claim) return;
        var workspaceBody = claim.body;
        var dashboard = claim.dashboard;

        if (dashboard.dataset.loaded === '1') return;

        dashboard.setAttribute('aria-label', 'Painel de usuários CDC');
        if (dashboard.dataset.loading === '1') return;
        dashboard.dataset.loading = '1';
        dashboard.innerHTML = '<div class="cdc-users-loading">Carregando dados de usuários...</div>';

        frappe.call({
            method: 'cdc_theme.api.get_users_dashboard_data',
            args: {
                selected_project: currentUsersProject,
                selected_warehouse: currentUsersWarehouse
            },
            callback: function(r) {
                if (!isUsersWorkspacePage()) return;
                var currentClaim = claimCDCActiveDashboard('cdc-users-dashboard', 'section');
                if (!currentClaim) return;
                workspaceBody = currentClaim.body;
                dashboard = currentClaim.dashboard;
                dashboard.dataset.loading = '0';
                if (!r || !r.message) {
                    dashboard.innerHTML = '<div class="cdc-users-empty">Não foi possível carregar os usuários.</div>';
                    return;
                }

                var summary = r.message.summary || {};
                var users = r.message.users || [];
                var filters = r.message.filters || {};
                currentUsersProject = filters.selected_project || 'All';
                currentUsersWarehouse = filters.selected_warehouse || 'All';
                var projectOptions = filters.projects || [];
                var visibleWarehouses = [];
                projectOptions.forEach(function(option) {
                    if (currentUsersProject === 'All' || option.value === currentUsersProject) {
                        visibleWarehouses = visibleWarehouses.concat(option.warehouses || []);
                    }
                });
                var projectOptionsHTML = '<option value="All">Todos os Projetos</option>' + projectOptions.map(function(option) {
                    return `<option value="${escapeCDC(option.value)}" ${option.value === currentUsersProject ? 'selected' : ''}>${escapeCDC(option.label)}</option>`;
                }).join('');
                var warehouseOptionsHTML = '<option value="All">Todos os Armazéns</option>' + visibleWarehouses.map(function(warehouse) {
                    return `<option value="${escapeCDC(warehouse)}" ${warehouse === currentUsersWarehouse ? 'selected' : ''}>${escapeCDC(warehouse.replace(' - C', ''))}</option>`;
                }).join('');
                dashboard.dataset.loaded = '1';
                var rows = users.map(function(user) {
                    var statusClass = user.enabled ? 'is-enabled' : 'is-disabled';
                    var statusLabel = user.enabled ? 'Ativo' : 'Desativado';
                    var lastAccess = user.last_active || user.last_login || '—';
                    return `
                        <tr data-search="${escapeCDC([user.full_name, user.email, user.user_type, user.role_profile_name].join(' ').toLowerCase())}">
                            <td data-sort="${escapeCDC(user.full_name || user.name)}"><a class="cdc-user-name" href="/app/user/${encodeURIComponent(user.name)}">${escapeCDC(user.full_name || user.name)}</a></td>
                            <td data-sort="${escapeCDC(user.email)}">${escapeCDC(user.email)}</td>
                            <td data-sort="${escapeCDC(user.user_type)}">${escapeCDC(user.user_type)}</td>
                            <td data-sort="${escapeCDC(user.role_profile_name)}">${escapeCDC(user.role_profile_name)}</td>
                            <td data-sort="${statusLabel}"><span class="cdc-user-status ${statusClass}">${statusLabel}</span></td>
                            <td data-sort="${escapeCDC(lastAccess)}">${escapeCDC(lastAccess)}</td>
                        </tr>`;
                }).join('');

                dashboard.innerHTML = `
                    ${getCDCBreadcrumbHTML('Usuários')}
                    <div class="cdc-users-heading">
                        <div><h2>Visão geral de usuários</h2><p>Indicadores e acessos cadastrados no NextERP.</p></div>
                    </div>
                    <div class="cdc-linked-filters" aria-label="Filtros de usuários">
                        <label><span>Projeto</span><select id="cdc-users-project-filter">${projectOptionsHTML}</select></label>
                        <label><span>Armazém</span><select id="cdc-users-warehouse-filter">${warehouseOptionsHTML}</select></label>
                    </div>
                    <div class="cdc-users-metrics">
                        <article class="cdc-user-metric"><span>Usuários NextERP</span><strong>${summary.total || 0}</strong><small>Contas internas do sistema</small></article>
                        <article class="cdc-user-metric accent-green"><span>Acessos ativos</span><strong>${summary.enabled || 0}</strong><small>Com login habilitado</small></article>
                        <article class="cdc-user-metric accent-orange"><span>Acessos desativados</span><strong>${summary.disabled || 0}</strong><small>Sem acesso ao Desk</small></article>
                        <article class="cdc-user-metric accent-blue"><span>Com perfil de função</span><strong>${summary.with_role_profile || 0}</strong><small>Permissões por perfil</small></article>
                    </div>
                    <div class="cdc-users-table-card">
                        <div class="cdc-users-table-header">
                            <div><h3>Usuários</h3><p>${users.length} registros exibidos</p></div>
                            <input id="cdc-users-search" type="search" placeholder="Buscar usuário, email ou perfil" aria-label="Buscar usuários">
                        </div>
                        <div class="cdc-table-scroll-top cdc-users-table-scroll-top" aria-label="Rolagem horizontal superior"><div></div></div>
                        <div class="cdc-users-table-scroll">
                            <table class="cdc-users-table">
                                <thead><tr><th data-sort-index="0">Usuário <span class="cdc-sort-indicator">↕</span></th><th data-sort-index="1">Email <span class="cdc-sort-indicator">↕</span></th><th data-sort-index="2">Tipo <span class="cdc-sort-indicator">↕</span></th><th data-sort-index="3">Perfil <span class="cdc-sort-indicator">↕</span></th><th data-sort-index="4">Status <span class="cdc-sort-indicator">↕</span></th><th data-sort-index="5" data-sort-type="date">Última atividade <span class="cdc-sort-indicator">↕</span></th></tr></thead>
                                <tbody>${rows || '<tr><td colspan="6">Nenhum usuário encontrado.</td></tr>'}</tbody>
                            </table>
                        </div>
                    </div>
                    <div class="cdc-users-shortcuts-label"><h3>Seus atalhos</h3><p>Acessos administrativos e configurações de permissão.</p></div>`;

                setupCDCSortableTable(dashboard, '.cdc-users-table-scroll-top', '.cdc-users-table-scroll', '.cdc-users-table');

                var search = document.getElementById('cdc-users-search');
                if (search) search.addEventListener('input', function() {
                    var term = this.value.trim().toLowerCase();
                    dashboard.querySelectorAll('.cdc-users-table tbody tr[data-search]').forEach(function(row) {
                        row.hidden = term && row.dataset.search.indexOf(term) === -1;
                    });
                });
                var projectFilter = document.getElementById('cdc-users-project-filter');
                if (projectFilter) projectFilter.addEventListener('change', function() {
                    currentUsersProject = this.value;
                    currentUsersWarehouse = 'All';
                    sessionStorage.setItem('cdc_users_project', currentUsersProject);
                    sessionStorage.setItem('cdc_users_warehouse', 'All');
                    dashboard.dataset.loaded = '0';
                    renderUsersDashboard();
                });
                var warehouseFilter = document.getElementById('cdc-users-warehouse-filter');
                if (warehouseFilter) warehouseFilter.addEventListener('change', function() {
                    currentUsersWarehouse = this.value;
                    sessionStorage.setItem('cdc_users_warehouse', currentUsersWarehouse);
                    dashboard.dataset.loaded = '0';
                    renderUsersDashboard();
                });
            },
            error: function() {
                var currentClaim = claimCDCActiveDashboard('cdc-users-dashboard', 'section');
                if (!currentClaim || !isUsersWorkspacePage()) return;
                currentClaim.dashboard.dataset.loading = '0';
                currentClaim.dashboard.innerHTML = '<div class="cdc-users-empty"><strong>Falha ao carregar os usuários.</strong><br><button type="button" class="btn btn-sm btn-default" data-cdc-dashboard-retry="users">Tentar novamente</button></div>';
            }
        });
    }

    window._cdc_render_users_dashboard = renderUsersDashboard;




    // --- BANNER COMPLETO DA WORKSPACE INTEGRAÇÕES ---
    function renderIntegrationsDiagnosticBanner() {
        if (!isIntegrationPage()) {
            var staleBanner = document.getElementById('cdc-integracoes-banner');
            if (staleBanner) staleBanner.remove();
            return;
        }
        var claim = claimCDCActiveDashboard('cdc-integracoes-banner', 'div');
        if (!claim) return;
        var target = claim.body;
        var banner = claim.dashboard;
        if (banner.dataset.loaded === '1') return;
        banner.dataset.loaded = '1';
        banner.style.cssText = 'margin:18px 24px 0;font-family:system-ui,sans-serif;display:flex;flex-direction:column;gap:16px;';

        // ── 1. BUSINESS INTELLIGENCE (primeiro, conforme solicitado) ──────────
        var S = getCDCBreadcrumbHTML('Integrações');
        S += '<div style="background:linear-gradient(135deg,#0f172a,#172038);border-radius:14px;padding:24px 28px;color:#f1f5f9;">';
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
                    fields: ['name', 'warehouse', 'channel_name', 'enabled', 'notify_entry', 'notify_exit', 'notify_transfer'],
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
                            var evts = (c.notify_entry ? '📥 ' : '') + (c.notify_exit ? '📤 ' : '') + (c.notify_transfer ? '🔄' : '');
                            html += '<div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.04);border-radius:7px;padding:8px 12px;margin-bottom:4px;">';
                            html += '<div style="display:flex;align-items:center;gap:8px;">';
                            html += '<span style="width:8px;height:8px;border-radius:50%;background:' + dot + ';flex-shrink:0;display:inline-block;"></span>';
                            html += '<span style="font-size:12px;color:#e2e8f0;font-weight:600;">' + (c.channel_name || '—') + '</span>';
                            html += '<span style="font-size:11px;color:#64748b;">' + evts + '</span>';
                            html += '</div>';
                            html += '<div class="cdc-mm-row-actions">';
                            html += '<button type="button" class="cdc-mm-action-btn cdc-mm-edit-btn" data-name="' + escapeCDC(c.name) + '" title="Editar configuração" aria-label="Editar configuração">✎ Editar</button>';
                            html += '<button type="button" class="cdc-mm-action-btn is-delete cdc-mm-delete-btn" data-name="' + escapeCDC(c.name) + '" data-channel="' + escapeCDC(c.channel_name || c.name) + '" title="Apagar configuração" aria-label="Apagar configuração">× Apagar</button>';
                            html += '</div>';
                            html += '</div>';
                        });
                        html += '</div>';
                    });

                    listEl.innerHTML = html;
                }
            });
        }

        loadMattermostConfigs();

        banner.addEventListener('click', function(event) {
            var editButton = event.target.closest('.cdc-mm-edit-btn');
            if (editButton) {
                frappe.set_route('Form', 'CDC Mattermost Config', editButton.dataset.name);
                return;
            }

            var deleteButton = event.target.closest('.cdc-mm-delete-btn');
            if (!deleteButton) return;
            var configName = deleteButton.dataset.name;
            var channelName = deleteButton.dataset.channel || configName;
            frappe.confirm(
                'Apagar a configuração do canal <strong>' + escapeCDC(channelName) + '</strong>?',
                function() {
                    frappe.call({
                        method: 'frappe.client.delete',
                        args: {doctype: 'CDC Mattermost Config', name: configName},
                        freeze: true,
                        freeze_message: 'Apagando configuração...',
                        callback: function() {
                            frappe.show_alert({message: 'Configuração apagada', indicator: 'green'});
                            loadMattermostConfigs();
                        }
                    });
                }
            );
        });

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
                        resultEl.innerHTML = '<div style="padding:14px 0;color:#fca5a5;">❌ ' + escapeCDC(d.erro) + '</div>';
                        resultEl.style.maxHeight = '80px';
                        resultEl.dataset.open = '1';
                        return;
                    }

                    var erros = (d.erros_recentes && d.erros_recentes.length)
                        ? d.erros_recentes.map(function(e) {
                            return '<div style="background:rgba(239,68,68,0.1);border-radius:6px;padding:6px 10px;font-size:11px;color:#fca5a5;margin-bottom:4px;">⚠️ '
                                + escapeCDC(e.title || '') + '<span style="color:#475569;margin-left:8px;">' + escapeCDC(e.creation || '') + '</span></div>';
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

    function removeStockPageNavigator() {
        var state = window._cdcStockPageNavigator;
        if (state && state.scroller && state.handler) state.scroller.removeEventListener('scroll', state.handler);
        window._cdcStockPageNavigator = null;
        var button = document.getElementById('cdc-stock-page-navigator');
        if (button) button.remove();
    }

    function restoreNativeStockWorkspaceContent() {
        document.querySelectorAll('.cdc-stock-native-content-hidden').forEach(function(element) {
            element.classList.remove('cdc-stock-native-content-hidden');
        });
    }

    function hideNativeStockWorkspaceContent(workspaceBody, dashboard) {
        restoreNativeStockWorkspaceContent();
        Array.from(workspaceBody.children || []).forEach(function(element) {
            if (element === dashboard || element.matches('script, style, .modal, .toast-container, .freeze-message-container')) return;
            element.classList.add('cdc-stock-native-content-hidden');
        });
    }

    function setupStockPageNavigator(dashboard) {
        removeStockPageNavigator();
        if (!dashboard || !isStockWorkspacePage()) return;
        var scroller = null;
        var node = dashboard.parentElement;
        while (node && node !== document.body) {
            var overflowY = window.getComputedStyle(node).overflowY;
            if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 20) {
                scroller = node;
                break;
            }
            node = node.parentElement;
        }
        var usesWindow = !scroller;
        scroller = scroller || window;
        var button = document.createElement('button');
        button.id = 'cdc-stock-page-navigator';
        button.type = 'button';
        document.body.appendChild(button);

        var metrics = function() {
            if (usesWindow) {
                var doc = document.scrollingElement || document.documentElement;
                return {top: window.scrollY || doc.scrollTop, max: Math.max(0, doc.scrollHeight - window.innerHeight)};
            }
            return {top: scroller.scrollTop, max: Math.max(0, scroller.scrollHeight - scroller.clientHeight)};
        };
        var update = function() {
            var position = metrics();
            var atBottom = position.max > 0 && position.top >= position.max - 24;
            button.classList.toggle('is-at-bottom', atBottom);
            button.innerHTML = atBottom ? '<span>↑</span><small>Subir</small>' : '<span>↓</span><small>Ir ao fim</small>';
            button.setAttribute('aria-label', atBottom ? 'Voltar ao início da página' : 'Ir ao fim da página');
            button.title = atBottom ? 'Voltar ao início' : 'Ir ao fim da página';
        };
        button.addEventListener('click', function() {
            var position = metrics();
            var destination = position.max > 0 && position.top >= position.max - 24 ? 0 : position.max;
            if (usesWindow) window.scrollTo({top: destination, behavior: 'smooth'});
            else scroller.scrollTo({top: destination, behavior: 'smooth'});
        });
        scroller.addEventListener('scroll', update, {passive: true});
        window._cdcStockPageNavigator = {scroller: scroller, handler: update};
        update();
    }

    function renderStockDashboardFailure(message) {
        isDashboardLoading = false;
        stockActiveRequestKey = '';
        window.clearTimeout(stockRequestTimer);
        stockRequestTimer = null;
        var claim = claimCDCActiveDashboard('cdc-stock-exec-dashboard', 'div');
        if (!claim || !isStockWorkspacePage()) return;
        claim.dashboard.dataset.loaded = '0';
        claim.dashboard.dataset.renderKey = '';
        claim.dashboard.dataset.state = 'error';
        claim.dashboard.innerHTML = `<div class="cdc-dashboard-load-state is-error"><strong>${escapeHTML(message)}</strong><span>A lista nativa foi preservada e você pode tentar montar o painel novamente.</span><button type="button" class="btn btn-sm btn-primary" data-cdc-dashboard-retry="stock">Tentar novamente</button></div>`;
        restoreNativeStockWorkspaceContent();
    }

    function startStockLoadingWatchdog(requestSerial) {
        window.clearTimeout(stockRequestTimer);
        stockRequestTimer = window.setTimeout(function() {
            if (requestSerial !== stockRequestSerial || !isDashboardLoading) return;
            stockRequestTimer = null;
            renderStockDashboardFailure('Tempo limite ao aguardar a resposta do painel de estoque.');
        }, 12000);
    }

    function cancelStockDashboardRequest() {
        if (isDashboardLoading || stockRequestTimer) stockRequestSerial += 1;
        isDashboardLoading = false;
        stockActiveRequestKey = '';
        window.clearTimeout(stockRequestTimer);
        stockRequestTimer = null;
    }

    function getStockDashboardRenderKey(pilotProject) {
        var categoryState = Object.keys(activeCategoriesMap).sort().map(function(label) {
            return label + ':' + (activeCategoriesMap[label] === false ? '0' : '1');
        }).join(',');
        return [
            pilotProject ? pilotProject.name : '',
            currentSelectedUnit,
            currentSelectedPeriod,
            currentOccurrencesType,
            currentSelectedProjectFilter,
            currentTableTypeFilter,
            categoryState
        ].join('|');
    }

    function renderStockDashboard() {
        if (!isStockWorkspacePage()) {
            cancelStockDashboardRequest();
            document.querySelectorAll('#cdc-stock-exec-dashboard').forEach(function(dashboard) { dashboard.remove(); });
            restoreNativeStockWorkspaceContent();
            return;
        }

        var pilotProject = getPilotProjectContext();
        if (pilotProject) {
            currentSelectedUnit = 'All';
            currentSelectedProjectFilter = pilotProject.name;
        } else {
            currentSelectedUnit = sessionStorage.getItem('cdc_unit') || 'All';
            currentSelectedProjectFilter = sessionStorage.getItem('cdc_project_filter') || 'all';
        }

        var renderKey = getStockDashboardRenderKey(pilotProject);
        if (isDashboardLoading) {
            if (stockActiveRequestKey === renderKey) return;
            cancelStockDashboardRequest();
        }

        var claim = claimCDCActiveDashboard('cdc-stock-exec-dashboard', 'div');
        if (!claim) return;
        var workspaceBody = claim.body;
        var dashDiv = claim.dashboard;
        if (dashDiv.dataset.loaded === '1' && dashDiv.dataset.renderKey === renderKey && dashDiv.querySelector('.cdc-exec-card')) {
            hideNativeStockWorkspaceContent(workspaceBody, dashDiv);
            return;
        }
        dashDiv.style.cssText = 'margin-bottom: 0; user-select: none; -webkit-user-select: none; width: 100%; min-height: 400px; display: block !important; visibility: visible !important; opacity: 1 !important;';
        dashDiv.dataset.loaded = '0';
        dashDiv.dataset.renderKey = '';
        dashDiv.dataset.state = 'loading';
        dashDiv.innerHTML = '<div class="cdc-dashboard-load-state"><span class="cdc-dashboard-spinner" aria-hidden="true"></span><strong>Carregando o painel de estoque...</strong><span>Consultando dados reais e permissões dos armazéns.</span></div>';
        hideNativeStockWorkspaceContent(workspaceBody, dashDiv);

        isDashboardLoading = true;
        stockActiveRequestKey = renderKey;
        var requestSerial = ++stockRequestSerial;
        startStockLoadingWatchdog(requestSerial);

        frappe.call({
            method: 'cdc_theme.api.get_stock_dashboard_data',
            args: { 
                selected_unit: currentSelectedUnit,
                period: currentSelectedPeriod,
                entry_type: currentOccurrencesType,
                selected_project: pilotProject ? pilotProject.name : null,
                table_type: currentTableTypeFilter
            },
            callback: function(r) {
                if (requestSerial !== stockRequestSerial) return;
                window.clearTimeout(stockRequestTimer);
                stockRequestTimer = null;
                isDashboardLoading = false;
                stockActiveRequestKey = '';
                stockRenderStage = 'validação da resposta';
                try {
                if (!r || !r.message) {
                    renderStockDashboardFailure('O servidor não retornou os dados do estoque.');
                    return;
                }
                if (!isStockWorkspacePage()) return;
                var activeClaim = claimCDCActiveDashboard('cdc-stock-exec-dashboard', 'div');
                if (!activeClaim) return;
                workspaceBody = activeClaim.body;
                dashDiv = activeClaim.dashboard;
                dashDiv.style.cssText = 'margin-bottom: 0; user-select: none; -webkit-user-select: none; width: 100%; min-height: 400px; display: block !important; visibility: visible !important; opacity: 1 !important;';
                hideNativeStockWorkspaceContent(workspaceBody, dashDiv);

                var data = r.message;
                stockRenderStage = 'preparação de filtros e indicadores';
                var pilotProject = getPilotProjectContext();
                var breadcrumb = getCDCBreadcrumbHTML('Estoque', pilotProject ? pilotProject.name : null);

                // --- 1. SELETOR DE ARMAZÉM ---
                var availableUnits = data.available_units || [{ value: 'All', label: 'Todos os Armazéns' }];
                var unitOptions = availableUnits.map(function(u) {
                    var val = (typeof u === 'object') ? u.value : ((u === 'Todos os Armazéns') ? 'All' : u);
                    var lbl = (typeof u === 'object') ? u.label : u;
                    var selected = (currentSelectedUnit === val) ? 'selected' : '';
                    return `<option value="${escapeHTML(val)}" ${selected}>${escapeHTML(lbl)}</option>`;
                }).join('');

                var selectorHeader = pilotProject ? `
                    <div style="display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,#0f172a,#17345c);color:#fff;border-radius:12px;padding:18px 22px;margin-bottom:20px;box-shadow:0 4px 14px rgba(15,23,42,.18);">
                        <div>
                            <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#93c5fd;margin-bottom:5px;">Dashboard piloto por projeto</div>
                            <div style="font-size:21px;font-weight:800;">${pilotProject.name}</div>
                            <div style="font-size:12px;color:#cbd5e1;margin-top:4px;">Dados exclusivos de ${pilotProject.label}</div>
                        </div>
                        <a id="cdc-project-back" href="/app/cdc-estoque" style="background:#fff;color:#1d4ed8;border-radius:8px;padding:9px 14px;text-decoration:none;font-size:12px;font-weight:800;">← Voltar à visão geral</a>
                    </div>
                ` : `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.03);">
                        <div style="display: flex; align-items: center; gap: 10px; font-weight: 700; color: #0f172a; font-size: 15px;">
                            <span style="font-size: 18px;">👁️</span>
                            <span>Filtrar Visão por Armazém:</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <select id="cdc-unit-filter-select" class="form-control" style="width: auto; min-width: 320px; max-width: 460px; height: 42px; font-size: 14px; font-weight: 700; border-radius: 8px; border: 2px solid #2563eb; color: #0f172a; cursor: pointer; background-color: #f8fafc; padding: 0 12px;">
                                ${unitOptions}
                            </select>
                            <button id="cdc-clear-unit-filter" type="button" class="btn btn-default" ${currentSelectedUnit === 'All' ? 'disabled aria-disabled="true"' : ''} style="height:42px;font-size:12px;font-weight:800;border-radius:8px;white-space:nowrap;opacity:${currentSelectedUnit === 'All' ? '.55' : '1'};">↺ Mostrar todos</button>
                        </div>
                    </div>
                `;

                // --- 2. 4 CARDS NUMERADORES DO TOPO ---
                var receiptsCount = (data.receipts_month !== undefined) ? data.receipts_month : 0;
                var issuesCount = (data.issues_month !== undefined) ? data.issues_month : 0;
                var transfersCount = (data.transfers_month !== undefined) ? data.transfers_month : 0;
                var totalWh = data.total_warehouses || 0;
                var activeWh = data.active_warehouses || 0;
                var inactiveWh = data.inactive_warehouses || 0;

                var top4CardsGrid = `
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px;">
                        <a href="/app/warehouse" class="cdc-exec-card cdc-kpi-link" style="padding: 16px; margin-bottom: 0;">
                            <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">🏭 TOTAL DE ARMAZÉM</div>
                            <div style="font-size: 26px; font-weight: 800; color: #0f172a; margin-bottom: 8px;">${totalWh}</div>
                            <div style="display: flex; flex-direction: column; gap: 3px; font-size: 11px; font-weight: 600;">
                                <span style="color: #2563eb;">🔵 ${activeWh} ativos</span>
                                <span style="color: #ef4444;">🔴 ${inactiveWh} inativos (+30 dias)</span>
                            </div>
                        </a>

                        <a href="/app/stock-entry?purpose=Material%20Receipt" class="cdc-exec-card cdc-kpi-link" style="padding: 16px; margin-bottom: 0;">
                            <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">📥 ENTRADA MATERIAL</div>
                            <div style="font-size: 26px; font-weight: 800; color: #0f172a; margin-bottom: 8px;">${receiptsCount}</div>
                            <div style="display: flex; flex-direction: column; gap: 3px; font-size: 11px; font-weight: 600;">
                                <span style="color: #2563eb;">🔵 ${receiptsCount} este mês</span>
                                <span style="color: #d97706;">🟠 ${data.receipts_last_month || 0} mês passado</span>
                            </div>
                        </a>

                        <a href="/app/stock-entry?purpose=Material%20Issue" class="cdc-exec-card cdc-kpi-link" style="padding: 16px; margin-bottom: 0;">
                            <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">📤 SAÍDA DE MATERIAL</div>
                            <div style="font-size: 26px; font-weight: 800; color: #0f172a; margin-bottom: 8px;">${issuesCount}</div>
                            <div style="display: flex; flex-direction: column; gap: 3px; font-size: 11px; font-weight: 600;">
                                <span style="color: #2563eb;">🔵 ${issuesCount} este mês</span>
                                <span style="color: #d97706;">🟠 ${data.issues_last_month || 0} mês passado</span>
                            </div>
                        </a>

                        <a href="/app/stock-entry?purpose=Material%20Transfer" class="cdc-exec-card cdc-kpi-link" style="padding: 16px; margin-bottom: 0;">
                            <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">🔄 TRANSFERÊNCIA</div>
                            <div style="font-size: 26px; font-weight: 800; color: #0f172a; margin-bottom: 8px;">${transfersCount}</div>
                            <div style="display: flex; flex-direction: column; gap: 3px; font-size: 11px; font-weight: 600;">
                                <span style="color: #2563eb;">🔵 ${transfersCount} este mês</span>
                                <span style="color: #d97706;">🟠 ${data.transfers_accumulated || 0} no mês passado</span>
                            </div>
                        </a>
                    </div>
                `;

                // --- 3. ATALHO & CARTÕES DE CATEGORIAS (LAYOUT EXATO) ---
                var shortcutsBar = `
                    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 22px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                        <div style="font-size: 17px; font-weight: 800; color: #0f172a; margin-bottom: 14px;">Atalho</div>
                        <div style="display: flex; flex-wrap: wrap; gap: 24px; align-items: center;">
                            <a href="/app/stock-entry/view/report/Lancamento%20no%20Estoque%20-%20CDC" style="font-weight: 700; font-size: 14px; color: #0f172a; text-decoration: none; display: flex; align-items: center; gap: 4px;">
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
                                <a href="/app/stock-entry/view/report/Lancamento%20no%20Estoque%20-%20CDC" style="font-weight: 600; font-size: 13px; color: #334155; text-decoration: none; display: flex; justify-content: space-between; align-items: center;"><span>Lancamento no Estoque - CDC...</span> <span style="color: #64748b; font-size: 12px;">↗</span></a>
                                <a href="/app/query-report/Livro%20de%20Inventarios%20-%20CDC" style="font-weight: 600; font-size: 13px; color: #334155; text-decoration: none; display: flex; justify-content: space-between; align-items: center;"><span>Livro de Inventarios - CDC</span> <span style="color: #64748b; font-size: 12px;">↗</span></a>
                            </div>
                        </div>
                    </div>
                `;

                // --- 4. LADO A LADO ---
                var projectsList = (data.projects && data.projects.length > 0) ? data.projects : [];
                var projectPills = projectsList.map(function(pj) {
                    var subtext = (pj.items && pj.items > 0) ? `${pj.items} itens` : 'Sem saldo';
                    var projectSlugs = {
                        'Projeto Atitude II.I': 'projeto-atitude-ii-i',
                        'Institucional / Geral': 'institucional-geral',
                        'Projeto Atitude': 'projeto-atitude',
                        'Projeto Bem Viver': 'projeto-bem-viver',
                        'Projeto Cais': 'projeto-cais',
                        'Projeto ATM': 'projeto-atm'
                    };
                    var isPilotProject = !!projectSlugs[pj.project];
                    var projectUrl = '/app/cdc-estoque/' + projectSlugs[pj.project];
                    return `
                        <a href="${projectUrl}" class="cdc-city-item ${isPilotProject ? 'cdc-pilot-project-link' : ''}" style="padding: 8px 12px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; text-decoration: none;">
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

                var recentMovementsCard = `
                    <div class="cdc-exec-card" style="margin-bottom: 0; padding: 16px; min-width: 0;">
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
                `;

                var sideBySideRow = pilotProject ? `
                    <div style="display: block; margin-bottom: 20px;">
                        ${recentMovementsCard}
                    </div>
                ` : `
                    <div style="display: grid; grid-template-columns: 330px minmax(0, 1fr); gap: 16px; margin-bottom: 20px;">
                        <div class="cdc-exec-card" style="margin-bottom: 0; padding: 16px;">
                            <div class="cdc-exec-card-title" style="margin-bottom: 10px;">
                                <span>Armazéns por Projeto</span>
                                <span style="font-size: 11px; color: #2563eb; font-weight: 700;">🔗 Abrir</span>
                            </div>
                            <div style="max-height: 380px; overflow-y: auto;">
                                ${projectPills}
                            </div>
                        </div>
                        ${recentMovementsCard}
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

                var totalItemsCount = data.total_items || 0;
                var unitDisplay = data.unit_display_label || 'Todos os Armazéns';

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

                var ptBrLabels = (occurrencesData.labels || []).map(function(lbl) {
                    return String(lbl).replace('May', 'Maio').replace('Jun', 'Junho').replace('Jul', 'Julho').replace('Aug', 'Agosto').replace('Sep', 'Setembro');
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

                var projectSelectOptions = `<option value="all" ${currentSelectedProjectFilter === 'all' ? 'selected' : ''}>🌐 Todos os Programas (Consolidado - ${datasetsList.length} Projetos)</option>`;
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

                stockRenderStage = 'montagem do conteúdo no navegador';
                dashDiv.innerHTML = `
                    ${breadcrumb}
                    ${selectorHeader}
                    ${top4CardsGrid}
                    ${shortcutsBar}
                    ${sideBySideRow}
                    ${categoryFullWidthCard}
                    ${occurrencesSection}
                `;
                dashDiv.dataset.loaded = '1';
                dashDiv.dataset.renderKey = getStockDashboardRenderKey(pilotProject);
                dashDiv.dataset.state = 'ready';
                stockRenderStage = 'inicialização dos gráficos';
                setupStockPageNavigator(dashDiv);

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
                stockRenderStage = 'concluído';
                } catch (error) {
                    console.error('[CDC Theme] Erro no render do Estoque na etapa ' + stockRenderStage + ':', error);
                    renderStockDashboardFailure('Falha ao montar o painel na etapa: ' + stockRenderStage + '.');
                }
            },
            error: function(err) {
                if (requestSerial !== stockRequestSerial) return;
                window.clearTimeout(stockRequestTimer);
                stockRequestTimer = null;
                stockActiveRequestKey = '';
                renderStockDashboardFailure('Falha ao consultar o painel de estoque.');
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

        $(document).off('click', '#cdc-clear-unit-filter').on('click', '#cdc-clear-unit-filter', function(e) {
            e.preventDefault();
            currentSelectedUnit = 'All';
            sessionStorage.setItem('cdc_unit', 'All');
            renderStockDashboard();
        });

        $(document).off('click', '.cdc-pilot-project-link').on('click', '.cdc-pilot-project-link', function(e) {
            e.preventDefault();
            window.history.pushState({}, '', this.getAttribute('href'));
            renderStockDashboard();
        });

        $(document).off('click', '#cdc-project-back').on('click', '#cdc-project-back', function(e) {
            e.preventDefault();
            window.history.pushState({}, '', '/app/cdc-estoque');
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

    $(document).on('page-change', function() {
        if (!isStockWorkspacePage()) {
            cancelStockDashboardRequest();
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

    // SANITIZAÇÃO DINÂMICA DA SIDEBAR: mantém somente as áreas CDC aprovadas
    function sanitizeSidebarWorkspaces() {
        var allowedList = ['cdc estoque', 'cdc usuarios', 'cdc grupos', 'cdc itens', 'cdc integracoes', 'cdc pendencias', 'cdc monitoramento', 'cdc testes', 'cdc admin'];

        var sidebarLinks = document.querySelectorAll('.desk-sidebar .standard-sidebar-item');
        sidebarLinks.forEach(function(el) {
            var labelText = (el.innerText || el.textContent || '').trim().toLowerCase().normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
            var primaryLabel = labelText.split(' dup')[0].trim();
            var href = decodeURIComponent((el.querySelector('a') || el).getAttribute('href') || '')
                .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            var isAllowed = allowedList.indexOf(primaryLabel) !== -1 ||
                /^\/app\/cdc-(estoque|usuarios|grupos|itens|integracoes|pendencias|monitoramento|testes|admin)(\/|$)/.test(href);
            var isRestrictedWorkspace = primaryLabel === 'cdc admin' || primaryLabel === 'cdc testes' ||
                /^\/app\/cdc-(admin|testes)(\/|$)/.test(href);
            if (isRestrictedWorkspace && (!window.frappe || (frappe.user_roles || []).indexOf('System Manager') === -1)) {
                isAllowed = false;
            }
            el.classList.toggle('cdc-workspace-hidden', labelText && !isAllowed);
        });
    }

    function syncCDCBrandLogos() {
        var logoUrl = '/assets/cdc_theme/images/cdc_logo.png';
        var faviconUrl = '/assets/cdc_theme/images/favicon.png';
        document.querySelectorAll('.app-logo, .navbar-brand img').forEach(function(img) {
            if (img.tagName === 'IMG' && img.getAttribute('src') !== logoUrl) {
                img.setAttribute('src', logoUrl);
            }
            img.classList.add('cdc-brand-logo');
        });
        var favicon = document.querySelector('link[rel*="icon"]');
        if (favicon && favicon.getAttribute('href') !== faviconUrl) {
            favicon.setAttribute('href', faviconUrl);
        }
    }

    // DISPARADOR GERAL DE COMPONENTES DO TEMA CDC
    function checkAndRenderThemeComponents() {
        if (isStockWorkspacePage()) {
            try {
                renderStockDashboard();
            } catch (error) {
                console.error('[CDC Theme] Falha ao montar CDC Estoque:', error);
                renderStockDashboardFailure('A montagem do painel de estoque foi interrompida.');
            }
        } else {
            removeStockPageNavigator();
            restoreNativeStockWorkspaceContent();
        }
        if (isIntegrationPage()) {
            try {
                renderIntegrationsDiagnosticBanner();
            } catch (error) {
                console.error('[CDC Theme] Falha ao montar CDC Integrações:', error);
            }
        } else {
            var integrationsBanner = document.getElementById('cdc-integracoes-banner');
            if (integrationsBanner) integrationsBanner.remove();
        }
        try {
            renderUsersDashboard();
        } catch (error) {
            console.error('[CDC Theme] Falha ao montar CDC Usuários:', error);
            var usersClaim = claimCDCActiveDashboard('cdc-users-dashboard', 'section');
            if (usersClaim && isUsersWorkspacePage()) {
                usersClaim.dashboard.dataset.loading = '0';
                usersClaim.dashboard.innerHTML = '<div class="cdc-users-empty"><strong>A montagem da página de usuários foi interrompida.</strong><br><button type="button" class="btn btn-sm btn-default" data-cdc-dashboard-retry="users">Tentar novamente</button></div>';
            }
        }
    }

    function scheduleThemeRender() {
        [0, 250, 700, 1500, 3500].forEach(function(delay) {
            setTimeout(function() {
                syncCDCBrandLogos();
                sanitizeSidebarWorkspaces();
                checkAndRenderThemeComponents();
            }, delay);
        });
    }

    function normalizeThemeCacheSnapshot(value) {
        return String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ');
    }

    function getThemeCacheTag() {
        var script = document.querySelector('script[src*="/assets/cdc_theme/js/cdc_theme.js"]');
        if (script && script.src) {
            return script.src;
        }
        return 'cdc_theme_runtime_v151';
    }

    function browserWorkspaceCacheNeedsReset() {
        var cachePayload = [
            localStorage.getItem('desktop:workspaces'),
            localStorage.getItem('workspace_sidebar_items'),
            localStorage.getItem('frappe:boot')
        ].filter(Boolean).join(' ');

        if (!cachePayload) {
            return false;
        }

        var normalized = normalizeThemeCacheSnapshot(cachePayload);
        var hasCDCWorkspaceCache = normalized.indexOf('cdc ') !== -1 || normalized.indexOf('cdc-') !== -1;
        if (!hasCDCWorkspaceCache) {
            return false;
        }

        var requiredTokens = [
            'cdc estoque',
            'cdc usuarios',
            'cdc grupos',
            'cdc itens',
            'cdc integracoes',
            'cdc pendencias',
            'cdc monitoramento'
        ];

        if (window.frappe && Array.isArray(frappe.user_roles) && frappe.user_roles.indexOf('System Manager') !== -1) {
            requiredTokens.push('cdc testes');
            requiredTokens.push('cdc admin');
        }

        return requiredTokens.some(function(token) {
            return normalized.indexOf(token) === -1;
        });
    }

    // PURGA AUTOMÁTICA DE CACHE LEGADO OU INCONSISTENTE DE WORKSPACES NO NAVEGADOR DO USUÁRIO
    function purgeLegacyBrowserWorkspaceCache() {
        var currentBuildTag = getThemeCacheTag();
        var storedTag = localStorage.getItem('cdc_theme_version');
        var shouldResetWorkspaceCache = browserWorkspaceCacheNeedsReset();

        if (storedTag !== currentBuildTag || shouldResetWorkspaceCache) {
            try {
                localStorage.removeItem('desktop:workspaces');
                localStorage.removeItem('workspace_sidebar_items');
                localStorage.removeItem('frappe:boot');
                [
                    'cdc_unit', 'cdc_period', 'cdc_occ_type', 'cdc_table_type',
                    'cdc_project_filter', 'cdc_users_project', 'cdc_users_warehouse'
                ].forEach(function(key) { sessionStorage.removeItem(key); });
                localStorage.setItem('cdc_theme_version', currentBuildTag);
                console.log('[CDC Theme] Cache de workspaces purgado automaticamente.');
            } catch(e) {}
        }
    }

    function resetThemeBrowserState() {
        try {
            ['desktop:workspaces', 'workspace_sidebar_items', 'frappe:boot', 'cdc_theme_version'].forEach(function(key) {
                localStorage.removeItem(key);
            });
            [
                'cdc_unit', 'cdc_period', 'cdc_occ_type', 'cdc_table_type',
                'cdc_project_filter', 'cdc_users_project', 'cdc_users_warehouse',
                'cdc_catalog_project', 'cdc_catalog_warehouse'
            ].forEach(function(key) { sessionStorage.removeItem(key); });
        } catch (error) {
            console.warn('[CDC Theme] O navegador impediu a limpeza completa do armazenamento:', error);
        }
        currentSelectedUnit = 'All';
        currentSelectedPeriod = 'quarter';
        currentOccurrencesType = 'all';
        currentTableTypeFilter = 'all';
        currentSelectedProjectFilter = 'all';
        currentUsersProject = 'All';
        currentUsersWarehouse = 'All';
        cancelStockDashboardRequest();
        removeStockPageNavigator();
        restoreNativeStockWorkspaceContent();
        document.querySelectorAll('#cdc-stock-exec-dashboard, #cdc-users-dashboard').forEach(function(dashboard) {
            dashboard.remove();
        });
    }

    window._cdc_repair_theme_runtime = function() {
        resetThemeBrowserState();
        var tasks = [];
        if (window.caches && typeof window.caches.keys === 'function') {
            tasks.push(window.caches.keys().then(function(names) {
                return Promise.all(names.filter(function(name) {
                    return String(name).toLowerCase().indexOf('cdc') !== -1;
                }).map(function(name) { return window.caches.delete(name); }));
            }));
        }
        if (typeof window.fetch === 'function') {
            document.querySelectorAll('script[src*="/assets/cdc_theme/"], link[href*="/assets/cdc_theme/"]').forEach(function(asset) {
                var url = asset.src || asset.href;
                if (url) tasks.push(window.fetch(url, {cache: 'reload', credentials: 'same-origin'}));
            });
        }
        scheduleThemeRender();
        return Promise.all(tasks.map(function(task) {
            return Promise.resolve(task).catch(function(error) {
                console.warn('[CDC Theme] Falha não bloqueante ao revalidar cache:', error);
                return null;
            });
        }));
    };

    $(document).on('click', '[data-cdc-dashboard-retry]', function() {
        var target = this.getAttribute('data-cdc-dashboard-retry');
        if (target === 'stock') {
            cancelStockDashboardRequest();
            renderStockDashboard();
        } else if (target === 'users') {
            var dashboard = document.getElementById('cdc-users-dashboard');
            if (dashboard) {
                dashboard.dataset.loaded = '0';
                dashboard.dataset.loading = '0';
            }
            renderUsersDashboard();
        }
    });




    $(document).ready(function() {
        purgeLegacyBrowserWorkspaceCache();
        scheduleThemeRender();
    });
    $(window).on('hashchange route', scheduleThemeRender);
    window.addEventListener('popstate', function() {
        scheduleThemeRender();
    });
    $(document).on('page-change', scheduleThemeRender);
    if (frappe.router && frappe.router.on) {
        frappe.router.on('change', scheduleThemeRender);
    }





    // REGISTRO GLOBAL DO BOTÃO TESTAR CONEXÃO NO FORMULÁRIO MATTERMOST
    if (frappe.ui && frappe.ui.form && frappe.ui.form.on) {
      frappe.ui.form.on('CDC Mattermost Config', {
        refresh: function(frm) {
            frm.add_custom_button(__('🧪 Testar Conexão'), function() {
                if (!frm.doc.webhook_url) {
                    frappe.msgprint(__('Por favor, preencha a URL do Webhook antes de testar.'), __('Aviso'), 'orange');
                    return;
                }
                frappe.call({
                    method: 'test_connection',
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
    }

})();

/* ==========================================================================
   CDC MONITORING WORKSPACE DASHBOARD INITIALIZER
   ========================================================================== */
(function() {
    'use strict';

    var observer;
    var loading = false;
    var routeGeneration = 0;

    function normalizeRoute(value) {
        return decodeURIComponent(String(value || ''))
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '-');
    }

    function isMonitoringRoute() {
        var route = window.frappe && frappe.get_route ? frappe.get_route() : [];
        if (route && route.length) {
            var parts = route.map(normalizeRoute);
            return parts.some(function(part) {
                return part === 'cdc-monitoramento' || part === 'cdc-incidentes' || part === 'monitoramento' || part === 'incidentes';
            });
        }
        return normalizeRoute(window.location.pathname).indexOf('/app/cdc-monitoramento') !== -1;
    }

    function getActiveWorkspaceBody() {
        var currentPage = window.frappe && frappe.container && frappe.container.page;
        if (currentPage) {
            var currentBody = currentPage.querySelector('.layout-main-section') ||
                              currentPage.querySelector('.workspace-page-content') ||
                              currentPage.querySelector('.page-body') ||
                              currentPage.querySelector('.page-content');
            if (currentBody) return currentBody;
        }

        var visiblePages = Array.prototype.slice.call(document.querySelectorAll('.page-container'))
            .filter(function(page) { return page.offsetParent !== null; });
        var visiblePage = visiblePages[visiblePages.length - 1];
        if (visiblePage) {
            return visiblePage.querySelector('.layout-main-section') ||
                   visiblePage.querySelector('.workspace-page-content') ||
                   visiblePage.querySelector('.page-body') ||
                   visiblePage.querySelector('.page-content') ||
                   visiblePage;
        }

        return document.querySelector('.layout-main-section') ||
               document.querySelector('.workspace-page-content') ||
               document.querySelector('.page-body') ||
               document.querySelector('.page-content') ||
               document.querySelector('.page-container');
    }

    function claimActiveDashboard(id, tagName) {
        var body = getActiveWorkspaceBody();
        if (!body || !body.isConnected) return null;
        var dashboard = body.querySelector('#' + id);
        document.querySelectorAll('#' + id).forEach(function(candidate) {
            if (candidate !== dashboard) candidate.remove();
        });
        if (!dashboard) {
            dashboard = document.createElement(tagName || 'section');
            dashboard.id = id;
        }
        if (dashboard.parentNode !== body || body.firstChild !== dashboard) {
            body.insertBefore(dashboard, body.firstChild);
        }
        return {body: body, dashboard: dashboard};
    }
    window._cdc_get_active_page_body = getActiveWorkspaceBody;
    window._cdc_claim_active_dashboard = claimActiveDashboard;

    function escapeHTML(value) {
        var el = document.createElement('div');
        el.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
        return el.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function render() {
        if (!isMonitoringRoute()) {
            removeMonitoringDashboard();
            return;
        }
        var claim = claimActiveDashboard('cdc-monitoring-dashboard', 'section');
        if (!claim) return;
        var body = claim.body;
        var dashboard = claim.dashboard;
        body.classList.add('cdc-custom-monitoring-active');
        if (dashboard.dataset.loaded === '1' && dashboard.querySelector('.cdc-monitoring-wrapper')) return;
    function getDiagnosticPanelHTML(statusMsg, isError) {
        var route = window.frappe && frappe.get_route ? frappe.get_route().join('/') : window.location.pathname;
        var user = window.frappe && frappe.session ? frappe.session.user : 'Guest';
        var time = new Date().toLocaleString();
        var isSuccess = !isError && String(statusMsg || '').indexOf('HTTP 200') !== -1;

        return `
            <details class="cdc-diagnostic-container ${isSuccess ? 'is-success' : ''}" ${isSuccess ? '' : 'open'}>
                <summary class="cdc-diagnostic-header-flex">
                    <div class="cdc-diagnostic-title-box">
                        <span class="cdc-diagnostic-icon">🛠️</span>
                        <div>
                            <h3 class="cdc-diagnostic-h3">Diagnóstico Técnico da Central</h3>
                            <p class="cdc-diagnostic-sub">${isSuccess ? 'API conectada; abra para testar a rota e consultar os logs técnicos' : 'Diagnóstico em tempo real da conexão com o servidor e contêineres DOM'}</p>
                        </div>
                    </div>
                    <span class="cdc-diagnostic-badge ${isError ? 'is-error' : (isSuccess ? 'is-success' : 'is-running')}">
                        ${isError ? '⚠️ ERRO REGISTRADO' : (isSuccess ? '● API OPERACIONAL' : '⏳ PROCESSANDO REQUISIÇÃO')}
                    </span>
                </summary>

                <div class="cdc-diagnostic-content">
                    <div class="cdc-diagnostic-actions-bar">
                        <button class="btn btn-xs btn-primary cdc-diag-btn" id="cdc-diag-btn-ping">📡 Testar API Backend (Ping)</button>
                        <button class="btn btn-xs btn-default cdc-diag-btn" id="cdc-diag-btn-remount">⚡ Forçar Remontagem da Tela</button>
                        <button class="btn btn-xs btn-default cdc-diag-btn" id="cdc-diag-btn-copy">📋 Copiar Logs de Diagnóstico</button>
                    </div>

                    <div class="cdc-diagnostic-logs-box">
                        <div class="cdc-diagnostic-logs-header">LOGS DE EXECUÇÃO & DIAGNÓSTICO DO NAVEGADOR</div>
                        <pre class="cdc-diagnostic-pre" id="cdc-diag-pre-output">
[TIMESTAMP] ${time}
[URL] ${window.location.href}
[ROUTA FRAPPE] ${route}
[USUÁRIO SESSÃO] ${user}
[CONTÊINER ATIVO .layout-main-section] ${!!document.querySelector('.layout-main-section') ? '🟢 Presente' : '🔴 Não encontrado'}
[CONTÊINER ALTERNATIVO .workspace-page-content] ${!!document.querySelector('.workspace-page-content') ? '🟢 Disponível' : '⚪ Não utilizado nesta versão'}
[STATUS REQUISIÇÃO] ${statusMsg || 'Iniciando chamada REST cdc_theme.api.get_ongsys_monitoring_dashboard...'}
                        </pre>
                    </div>
                </div>
            </details>
        `;
    }

    function bindDiagnosticActions(dashboard) {
        var pingBtn = dashboard.querySelector('#cdc-diag-btn-ping');
        if (pingBtn) {
            pingBtn.addEventListener('click', function() {
                var btn = this;
                btn.disabled = true;
                btn.textContent = '⏳ Testando...';
                var pre = dashboard.querySelector('#cdc-diag-pre-output');
                var startTime = Date.now();
                frappe.call({
                    method: 'cdc_theme.api.get_ongsys_monitoring_dashboard',
                    callback: function(res) {
                        btn.disabled = false;
                        btn.textContent = '📡 Testar API Backend (Ping)';
                        var elapsed = Date.now() - startTime;
                        if (pre) {
                            pre.textContent += `\n\n[TESTE MANUAL API - ${new Date().toLocaleTimeString()}]`;
                            pre.textContent += `\nHTTP Status: OK 200 (Tempo: ${elapsed}ms)`;
                            pre.textContent += `\nResposta da API: ${JSON.stringify(res ? res.message : null, null, 2).substring(0, 300)}...`;
                        }
                    },
                    error: function(err) {
                        btn.disabled = false;
                        btn.textContent = '📡 Testar API Backend (Ping)';
                        if (pre) {
                            pre.textContent += `\n\n[ERRO NA CHAMADA API]`;
                            pre.textContent += `\nDetalhes do Erro: ${JSON.stringify(err, null, 2)}`;
                        }
                    }
                });
            });
        }

        var remountBtn = dashboard.querySelector('#cdc-diag-btn-remount');
        if (remountBtn) {
            remountBtn.addEventListener('click', function() {
                delete dashboard.dataset.loaded;
                loading = false;
                render();
                frappe.show_alert({ message: __('⚡ Solicitando remontagem da tela...'), indicator: 'blue' }, 3);
            });
        }

        var copyBtn = dashboard.querySelector('#cdc-diag-btn-copy');
        if (copyBtn) {
            copyBtn.addEventListener('click', function() {
                var pre = dashboard.querySelector('#cdc-diag-pre-output');
                if (pre) {
                    navigator.clipboard.writeText(pre.textContent).then(function() {
                        frappe.show_alert({ message: __('📋 Logs copiados para a área de transferência!'), indicator: 'green' }, 3);
                    });
                }
            });
        }
    }

        if (loading) return;
        loading = true;
        var requestGeneration = routeGeneration;
        dashboard.innerHTML = '<div class="cdc-monitoring-state">Carregando central de monitoramento e exceções...</div>' + getDiagnosticPanelHTML('Carregando dados da API...', false);
        bindDiagnosticActions(dashboard);

        frappe.call({
            method: 'cdc_theme.api.get_ongsys_monitoring_dashboard',
            callback: function(response) {
                loading = false;
                if (requestGeneration !== routeGeneration) return;
                if (!isMonitoringRoute()) {
                    removeMonitoringDashboard();
                    return;
                }
                try {
                var currentClaim = claimActiveDashboard('cdc-monitoring-dashboard', 'section');
                if (currentClaim) {
                    var currentBody = currentClaim.body;
                    dashboard = currentClaim.dashboard;
                    currentBody.classList.add('cdc-custom-monitoring-active');
                }
                dashboard.dataset.loaded = '1';
                var data = response && response.message;
                if (!data) {
                    dashboard.innerHTML = getDiagnosticPanelHTML('Falha ao obter resposta da API REST.', true);
                    bindDiagnosticActions(dashboard);
                    return;
                }

                var activeTab = sessionStorage.getItem('cdc_monitoring_active_tab') || 'tab-pendencias';
                if (['tab-pendencias', 'tab-armazem', 'tab-entradas', 'tab-job', 'tab-perfis', 'tab-avisos'].indexOf(activeTab) === -1) {
                    activeTab = 'tab-pendencias';
                }
                var tabPendencias = data.tab_pendencias || {};
                var tabWarehouses = data.tab_warehouses || {};
                var tabEntradas = data.tab_entradas || {};
                var tabJob = data.tab_job || {};
                var tabPerfis = data.tab_perfis || {};
                var tabAvisos = data.tab_avisos || {};

                var breadcrumbHTML = window._cdc_get_breadcrumb_html ? window._cdc_get_breadcrumb_html('Monitoramento', 'Central de Exceções & Ferramentas') : '';

                dashboard.innerHTML = `
                    ${breadcrumbHTML}
                    <div class="cdc-monitoring-wrapper">
                        <section class="cdc-control-tower-hero">
                            <div class="cdc-control-tower-icon" aria-hidden="true">📡</div>
                            <div class="cdc-control-tower-copy">
                                <span class="cdc-control-tower-eyebrow">Integração ONGSYS → NextERP</span>
                                <h1>Torre de Controle da Operação</h1>
                                <p>Acompanhe o fluxo das requisições de materiais sem consultar código Python, logs do Linux ou banco de dados.</p>
                            </div>
                            <div class="cdc-control-tower-health">
                                <span class="cdc-control-tower-health-dot"></span>
                                <div><strong>${escapeHTML((data.summary || {}).system_health || 'EM ANÁLISE')}</strong><small>Saúde da integração</small></div>
                            </div>
                        </section>

                        <div class="cdc-control-map" aria-label="Áreas monitoradas">
                            <button type="button" class="cdc-control-card is-warning" data-tab="tab-pendencias">
                                <span class="cdc-control-card-icon">⚠️</span><span><strong>Pendências</strong><small>Diagnóstico e ação recomendada</small></span>
                            </button>
                            <button type="button" class="cdc-control-card" data-tab="tab-armazem">
                                <span class="cdc-control-card-icon">🏢</span><span><strong>Armazéns</strong><small>De-para e centros de custo</small></span>
                            </button>
                            <button type="button" class="cdc-control-card" data-tab="tab-entradas">
                                <span class="cdc-control-card-icon">📥</span><span><strong>Entradas</strong><small>Solicitações convertidas em estoque</small></span>
                            </button>
                            <button type="button" class="cdc-control-card" data-tab="tab-job">
                                <span class="cdc-control-card-icon">⏱️</span><span><strong>Cron Job</strong><small>Execução e performance horária</small></span>
                            </button>
                            <button type="button" class="cdc-control-card" data-tab="tab-perfis">
                                <span class="cdc-control-card-icon">👥</span><span><strong>Perfis e catálogo</strong><small>Usuários, itens e projetos piloto</small></span>
                            </button>
                            <button type="button" class="cdc-control-card" data-tab="tab-avisos">
                                <span class="cdc-control-card-icon">🔔</span><span><strong>Avisos</strong><small>Mattermost e antiduplicidade</small></span>
                            </button>
                        </div>

                        <div class="cdc-monitoring-header">
                            <div class="cdc-monitoring-title-box">
                                <h1 class="cdc-monitoring-h1">🔍 Central de Monitoramento & Integração ONGSYS</h1>
                                <p class="cdc-monitoring-sub">Acompanhamento inteligente por guias: diagnóstico de pendências, extratores Python, job e alertas</p>
                            </div>
                            <button class="btn btn-sm btn-default cdc-refresh-btn" id="cdc-btn-refresh-monitoring">🔄 Atualizar Dados</button>
                        </div>

                        <!-- 6 GUIAS OFICIAIS NAVEGÁVEIS -->
                        <ul class="cdc-monitoring-tabs-nav">
                            <li class="${activeTab === 'tab-pendencias' ? 'is-active' : ''}" data-tab="tab-pendencias">
                                <span class="cdc-tab-icon">⚠️</span> 1. Pendências & Diagnósticos
                            </li>
                            <li class="${activeTab === 'tab-armazem' ? 'is-active' : ''}" data-tab="tab-armazem">
                                <span class="cdc-tab-icon">🏢</span> 2. Armazéns
                            </li>
                            <li class="${activeTab === 'tab-entradas' ? 'is-active' : ''}" data-tab="tab-entradas">
                                <span class="cdc-tab-icon">📥</span> 3. Entradas
                            </li>
                            <li class="${activeTab === 'tab-job' ? 'is-active' : ''}" data-tab="tab-job">
                                <span class="cdc-tab-icon">⏱️</span> 4. Checkpoint do Job
                            </li>
                            <li class="${activeTab === 'tab-perfis' ? 'is-active' : ''}" data-tab="tab-perfis">
                                <span class="cdc-tab-icon">👥</span> 5. Perfis & Itens
                            </li>
                            <li class="${activeTab === 'tab-avisos' ? 'is-active' : ''}" data-tab="tab-avisos">
                                <span class="cdc-tab-icon">🔔</span> 6. Avisos & Trava
                            </li>
                        </ul>

                        <!-- GUIA 1: PENDÊNCIAS & DIAGNÓSTICOS (DEFAULT) -->
                        <div class="cdc-tab-pane ${activeTab === 'tab-pendencias' ? 'is-active' : ''}" id="tab-pendencias">
                            <div class="cdc-monitoring-cards-grid">
                                <div class="cdc-monitoring-card is-danger">
                                    <div class="cdc-card-label">Pendências Totais Identificadas</div>
                                    <div class="cdc-card-value">${tabPendencias.metrics.total_pendencies ?? 0}</div>
                                    <div class="cdc-card-desc">Exceções que requerem ação</div>
                                </div>
                                <div class="cdc-monitoring-card is-warning">
                                    <div class="cdc-card-label">Armazéns Ausentes do de-para</div>
                                    <div class="cdc-card-value">${tabPendencias.metrics.unmapped_warehouses ?? 0}</div>
                                    <div class="cdc-card-desc">Calculado a partir do espelho local</div>
                                </div>
                            </div>

                            <div class="cdc-info-box">
                                <div class="cdc-info-box-title">ℹ️ O que esta guia faz?</div>
                                <div class="cdc-info-box-text">${escapeHTML(tabPendencias.what_it_does)}</div>
                            </div>

                            <div class="cdc-narrative-box">
                                <div class="cdc-narrative-header">
                                    <span class="cdc-narrative-icon">📖</span>
                                    <div>
                                        <h3 class="cdc-narrative-title">Motivo do Acompanhamento</h3>
                                    </div>
                                </div>
                                <div class="cdc-narrative-body">
                                    <p>${escapeHTML(tabPendencias.why_created)}</p>
                                </div>
                            </div>

                            <div class="cdc-monitoring-table-section">
                                <div class="cdc-table-header-flex">
                                    <div class="cdc-table-header-title">📋 Diagnóstico Automático de Pendências Ativas</div>
                                    <div>
                                        <button class="btn btn-xs btn-primary cdc-btn-refresh-live">🔄 Atualizar dados</button>
                                    </div>
                                </div>
                                <div class="table-responsive">
                                    <table class="table table-bordered cdc-monitoring-table">
                                        <thead>
                                            <tr>
                                                <th>ID Pedido</th>
                                                <th>Solicitação</th>
                                                <th>Motivo</th>
                                                <th>Diagnóstico Automático</th>
                                                <th>Ação Recomendada</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${(tabPendencias.incidents || []).map(function(inc) {
                                                return `
                                                    <tr>
                                                        <td><strong>${escapeHTML(inc.id_pedido)}</strong></td>
                                                        <td>${escapeHTML(inc.titulo)}</td>
                                                        <td><span class="cdc-badge cdc-badge-${inc.severidade === 'HIGH' ? 'danger' : 'warning'}">${escapeHTML(inc.motivo)}</span></td>
                                                        <td>${escapeHTML(inc.diagnostico)}</td>
                                                        <td><div class="cdc-action-box">${escapeHTML(inc.acao_recomendada)}</div></td>
                                                    </tr>
                                                `;
                                            }).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <!-- GUIA 2: ARMAZÉNS -->
                        <div class="cdc-tab-pane ${activeTab === 'tab-armazem' ? 'is-active' : ''}" id="tab-armazem">
                            <div class="cdc-monitoring-cards-grid">
                                <div class="cdc-monitoring-card is-danger">
                                    <div class="cdc-card-label">Centros de Custo Mapeados</div>
                                    <div class="cdc-card-value">${tabWarehouses.metrics.mapped_count ?? 0}</div>
                                    <div class="cdc-card-desc">Armazéns finais existentes no ERPNext</div>
                                </div>
                                <div class="cdc-monitoring-card is-warning">
                                    <div class="cdc-card-label">Armazéns Pendentes de Mapeamento</div>
                                    <div class="cdc-card-value">${tabWarehouses.metrics.pending_count ?? 0}</div>
                                    <div class="cdc-card-desc">Pendente: ${escapeHTML(tabWarehouses.metrics.pending_warehouse)}</div>
                                </div>
                            </div>

                            <div class="cdc-info-box">
                                <div class="cdc-info-box-title">ℹ️ O que o script 1_armazem_v2.py faz?</div>
                                <div class="cdc-info-box-text">${escapeHTML(tabWarehouses.what_it_does)}</div>
                            </div>

                            <div class="cdc-narrative-box">
                                <div class="cdc-narrative-header">
                                    <span class="cdc-narrative-icon">📖</span>
                                    <div>
                                        <h3 class="cdc-narrative-title">Motivo do Acompanhamento</h3>
                                    </div>
                                </div>
                                <div class="cdc-narrative-body">
                                    <p>${escapeHTML(tabWarehouses.why_created)}</p>
                                </div>
                            </div>

                            <div class="cdc-monitoring-table-section">
                                <div class="cdc-table-header-flex">
                                    <div class="cdc-table-header-title">📋 Ferramenta de Verificação de Armazéns</div>
                                    <div>
                                        <button class="btn btn-xs btn-primary cdc-btn-refresh-live">🔄 Atualizar dados</button>
                                        <a href="/app/warehouse" class="btn btn-xs btn-default">📋 Ver Armazéns</a>
                                    </div>
                                </div>
                                <div style="padding:1rem; color:#cbd5e1;">
                                    Utilize o botão de verificação para auditar os Centros de Custo dos armazéns cadastrados em centro_de_custo_armazen.csv sem alterar arquivos de configuração diretamente na interface.
                                </div>
                            </div>
                        </div>

                        <!-- GUIA 3: ENTRADAS -->
                        <div class="cdc-tab-pane ${activeTab === 'tab-entradas' ? 'is-active' : ''}" id="tab-entradas">
                            <div class="cdc-monitoring-cards-grid">
                                <div class="cdc-monitoring-card is-warning">
                                    <div class="cdc-card-label">Pedidos Retidos (> 48h)</div>
                                    <div class="cdc-card-value">${tabEntradas.metrics.stuck_orders_count ?? 0}</div>
                                    <div class="cdc-card-desc">Script 5_extrator_requisicoes_v2.py</div>
                                </div>
                                <div class="cdc-monitoring-card is-info">
                                    <div class="cdc-card-label">Janela de Importação</div>
                                    <div class="cdc-card-value" style="font-size:1.1rem; margin-top:0.4rem;">${tabEntradas.metrics.sync_window}</div>
                                    <div class="cdc-card-desc">Conversão automática para Stock Entry</div>
                                </div>
                            </div>

                            <div class="cdc-info-box">
                                <div class="cdc-info-box-title">ℹ️ O que o script 5_extrator_requisicoes_v2.py faz?</div>
                                <div class="cdc-info-box-text">${escapeHTML(tabEntradas.what_it_does)}</div>
                            </div>

                            <div class="cdc-narrative-box">
                                <div class="cdc-narrative-header">
                                    <span class="cdc-narrative-icon">📖</span>
                                    <div>
                                        <h3 class="cdc-narrative-title">Motivo do Acompanhamento</h3>
                                    </div>
                                </div>
                                <div class="cdc-narrative-body">
                                    <p>${escapeHTML(tabEntradas.why_created)}</p>
                                </div>
                            </div>

                            <div class="cdc-monitoring-table-section">
                                <div class="cdc-table-header-flex">
                                    <div class="cdc-table-header-title">📋 Lançamentos de Entrada de Estoque</div>
                                    <div>
                                        <a href="/app/stock-entry" class="btn btn-xs btn-primary">📥 Ver Entradas de Estoque</a>
                                        <button class="btn btn-xs btn-default cdc-btn-refresh-live">🔄 Atualizar checkpoint</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- GUIA 4: CRON JOB (90S) -->
                        <div class="cdc-tab-pane ${activeTab === 'tab-job' ? 'is-active' : ''}" id="tab-job">
                            <div class="cdc-monitoring-cards-grid">
                                <div class="cdc-monitoring-card is-info">
                                    <div class="cdc-card-label">Janela Limite (Timeout)</div>
                                    <div class="cdc-card-value">${tabJob.metrics.timeout_limit || 'Indisponível'}</div>
                                    <div class="cdc-card-desc">Expandida de 30s para 90s em run_job.sh</div>
                                </div>
                                <div class="cdc-monitoring-card is-status">
                                    <div class="cdc-card-label">Última Duração de Execução</div>
                                    <div class="cdc-card-value-status">${tabJob.metrics.last_duration || 'Indisponível'}</div>
                                    <div class="cdc-card-desc">Duração não persistida pelo extrator</div>
                                </div>
                            </div>

                            <div class="cdc-info-box">
                                <div class="cdc-info-box-title">ℹ️ O que o script bash run_job.sh faz?</div>
                                <div class="cdc-info-box-text">${escapeHTML(tabJob.what_it_does)}</div>
                            </div>

                            <div class="cdc-narrative-box">
                                <div class="cdc-narrative-header">
                                    <span class="cdc-narrative-icon">📖</span>
                                    <div>
                                        <h3 class="cdc-narrative-title">Motivo do Acompanhamento</h3>
                                    </div>
                                </div>
                                <div class="cdc-narrative-body">
                                    <p>${escapeHTML(tabJob.why_created)}</p>
                                </div>
                            </div>

                            <div class="cdc-monitoring-table-section">
                                <div class="cdc-table-header-flex">
                                    <div class="cdc-table-header-title">📋 Histórico de Ciclos de Execução do Cron Job (run_job.sh)</div>
                                    <button class="btn btn-xs btn-default cdc-btn-refresh-live">🔄 Atualizar checkpoint</button>
                                </div>
                                <div class="table-responsive">
                                    <table class="table table-bordered cdc-monitoring-table">
                                        <thead>
                                            <tr>
                                                <th>Data / Hora UTC</th>
                                                <th>Duração Total</th>
                                                <th>Código de Saída</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${(tabJob.log_table || []).map(function(log) {
                                                return `
                                                    <tr>
                                                        <td>${escapeHTML(log.datetime)}</td>
                                                        <td>${escapeHTML(log.duration)}</td>
                                                        <td><code>${log.exit_code}</code></td>
                                                        <td><span class="cdc-badge cdc-badge-success">${escapeHTML(log.status)}</span></td>
                                                    </tr>
                                                `;
                                            }).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <!-- GUIA 5: PERFIS & ITENS -->
                        <div class="cdc-tab-pane ${activeTab === 'tab-perfis' ? 'is-active' : ''}" id="tab-perfis">
                            <div class="cdc-monitoring-cards-grid">
                                <div class="cdc-monitoring-card is-info">
                                    <div class="cdc-card-label">Usuários Sincronizados</div>
                                    <div class="cdc-card-value">${tabPerfis.metrics.users_count ?? 0}</div>
                                    <div class="cdc-card-desc">Script 4_extrator_usuarios_v2.py</div>
                                </div>
                                <div class="cdc-monitoring-card is-status">
                                    <div class="cdc-card-label">Projetos Piloto Mapeados</div>
                                    <div class="cdc-card-value">${tabPerfis.metrics.projects_count ?? 0}</div>
                                    <div class="cdc-card-desc">Script 3_extrator_projetos_v2.py</div>
                                </div>
                            </div>

                            <div class="cdc-info-box">
                                <div class="cdc-info-box-title">ℹ️ O que estes scripts fazem?</div>
                                <div class="cdc-info-box-text">${escapeHTML(tabPerfis.what_it_does)}</div>
                            </div>

                            <div class="cdc-narrative-box">
                                <div class="cdc-narrative-header">
                                    <span class="cdc-narrative-icon">📖</span>
                                    <div>
                                        <h3 class="cdc-narrative-title">Motivo do Acompanhamento</h3>
                                    </div>
                                </div>
                                <div class="cdc-narrative-body">
                                    <p>${escapeHTML(tabPerfis.why_created)}</p>
                                </div>
                            </div>

                            <div class="cdc-monitoring-table-section">
                                <div class="cdc-table-header-flex">
                                    <div class="cdc-table-header-title">📋 Projetos Piloto & Gestão de Acessos</div>
                                    <div>
                                        <a href="/app/cdc-usuários" class="btn btn-xs btn-primary">👥 Gerenciar Usuários</a>
                                        <a href="/app/item" class="btn btn-xs btn-default">📦 Ver Itens</a>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- GUIA 6: AVISOS & TRAVA -->
                        <div class="cdc-tab-pane ${activeTab === 'tab-avisos' ? 'is-active' : ''}" id="tab-avisos">
                            <div class="cdc-monitoring-cards-grid">
                                <div class="cdc-monitoring-card is-info">
                                    <div class="cdc-card-label">Webhooks Ativos no Mattermost</div>
                                    <div class="cdc-card-value">${tabAvisos.metrics.active_webhooks ?? 0}</div>
                                    <div class="cdc-card-desc">Canais de comunicação por armazém</div>
                                </div>
                                <div class="cdc-monitoring-card is-status">
                                    <div class="cdc-card-label">Duplicidades Encontradas</div>
                                    <div class="cdc-card-value-status">${tabAvisos.metrics.duplicates_count ?? 0} Registros</div>
                                    <div class="cdc-card-desc">${tabAvisos.metrics.audited_orders ?? 0} pedidos auditados; índice único ${tabAvisos.metrics.unique_index_enabled ? 'ativo' : 'ausente'}</div>
                                </div>
                            </div>

                            <div class="cdc-info-box">
                                <div class="cdc-info-box-title">ℹ️ O que esta guia faz?</div>
                                <div class="cdc-info-box-text">${escapeHTML(tabAvisos.what_it_does)}</div>
                            </div>

                            <div class="cdc-narrative-box">
                                <div class="cdc-narrative-header">
                                    <span class="cdc-narrative-icon">📖</span>
                                    <div>
                                        <h3 class="cdc-narrative-title">Motivo do Acompanhamento</h3>
                                    </div>
                                </div>
                                <div class="cdc-narrative-body">
                                    <p>${escapeHTML(tabAvisos.why_created)}</p>
                                </div>
                            </div>

                            <div class="cdc-monitoring-table-section">
                                <div class="cdc-table-header-flex">
                                    <div class="cdc-table-header-title">📋 Ferramentas de Teste & Auditoria</div>
                                    <div>
                                        <a href="/app/cdc-integrações" class="btn btn-xs btn-primary">⚙️ Configurar Mattermost</a>
                                        <button class="btn btn-xs btn-default cdc-btn-refresh-live">🛡️ Atualizar auditoria</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                    ${getDiagnosticPanelHTML('API REST conectada com sucesso (HTTP 200)', false)}
                `;

                dashboard.dataset.loaded = '1';
                bindDiagnosticActions(dashboard);

                // GERENCIADOR DE TROCA DE SUB-ABAS
                var tabLinks = dashboard.querySelectorAll('.cdc-monitoring-tabs-nav li');
                var controlCards = dashboard.querySelectorAll('.cdc-control-card[data-tab]');
                function activateMonitoringTab(target) {
                    sessionStorage.setItem('cdc_monitoring_active_tab', target);
                    tabLinks.forEach(function(link) {
                        link.classList.toggle('is-active', link.dataset.tab === target);
                    });
                    controlCards.forEach(function(card) {
                        card.classList.toggle('is-active', card.dataset.tab === target);
                    });
                    var panes = dashboard.querySelectorAll('.cdc-tab-pane');
                    panes.forEach(function(pane) { pane.classList.remove('is-active'); });
                    var activePane = dashboard.querySelector('#' + target);
                    if (activePane) activePane.classList.add('is-active');
                }
                tabLinks.forEach(function(link) {
                    link.addEventListener('click', function() {
                        activateMonitoringTab(this.dataset.tab);
                    });
                });
                controlCards.forEach(function(card) {
                    card.addEventListener('click', function() {
                        activateMonitoringTab(this.dataset.tab);
                        var tabs = dashboard.querySelector('.cdc-monitoring-tabs-nav');
                        if (tabs) tabs.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                });
                activateMonitoringTab(activeTab);

                var refreshBtn = document.getElementById('cdc-btn-refresh-monitoring');
                if (refreshBtn) {
                    refreshBtn.addEventListener('click', function() {
                        dashboard.dataset.loaded = '0';
                        render();
                    });
                }

                var refreshLiveBtns = dashboard.querySelectorAll('.cdc-btn-refresh-live');
                refreshLiveBtns.forEach(function(btn) {
                    btn.addEventListener('click', function() {
                        dashboard.dataset.loaded = '0';
                        loading = false;
                        render();
                        frappe.show_alert({
                            message: __('Medições locais atualizadas. Nenhuma execução externa foi simulada.'),
                            indicator: 'blue'
                        }, 4);
                    });
                });
                } catch (renderError) {
                    dashboard.dataset.loaded = '1';
                    console.error('[CDC Monitoramento] Falha ao renderizar painel:', renderError);
                    dashboard.innerHTML = '<div class="cdc-monitoring-wrapper"><div class="cdc-monitoring-state is-error"><strong>Falha ao montar a Torre de Controle.</strong><br>' + escapeHTML(renderError && renderError.message ? renderError.message : String(renderError)) + '</div></div>';
                }
            },
            error: function(error) {
                loading = false;
                if (requestGeneration !== routeGeneration || !isMonitoringRoute() || !dashboard.isConnected) {
                    removeMonitoringDashboard();
                    return;
                }
                dashboard.dataset.loaded = '0';
                var message = 'Nao foi possivel carregar a central de monitoramento.';
                if (error && error.message) {
                    message += ' ' + error.message;
                }
                dashboard.innerHTML = '<div class="cdc-monitoring-state is-error">' + escapeHTML(message) + '</div>';
            }
        });
    }

    function removeMonitoringDashboard() {
        document.querySelectorAll('#cdc-monitoring-dashboard').forEach(function(dashboard) {
            if (dashboard.parentNode) dashboard.parentNode.classList.remove('cdc-custom-monitoring-active');
            dashboard.remove();
        });
        document.querySelectorAll('.cdc-custom-monitoring-active').forEach(function(element) {
            element.classList.remove('cdc-custom-monitoring-active');
        });
    }

    var catalogScopeProject = sessionStorage.getItem('cdc_catalog_project') || 'All';
    var catalogScopeWarehouse = sessionStorage.getItem('cdc_catalog_warehouse') || 'All';

    function getCatalogScopeHTML(filters) {
        filters = filters || {};
        catalogScopeProject = filters.selected_project || 'All';
        catalogScopeWarehouse = filters.selected_warehouse || 'All';
        sessionStorage.setItem('cdc_catalog_project', catalogScopeProject);
        sessionStorage.setItem('cdc_catalog_warehouse', catalogScopeWarehouse);
        var projects = filters.projects || [];
        var projectOptions = '<option value="All">Todos os projetos</option>' + projects.map(function(project) {
            var selected = project.value === catalogScopeProject ? ' selected' : '';
            return `<option value="${escapeHTML(project.value)}"${selected}>${escapeHTML(project.label)}</option>`;
        }).join('');
        var warehouses = [];
        projects.forEach(function(project) {
            if (catalogScopeProject === 'All' || project.value === catalogScopeProject) {
                warehouses = warehouses.concat(project.warehouses || []);
            }
        });
        warehouses = Array.from(new Set(warehouses)).sort(function(a, b) {
            return a.localeCompare(b, 'pt-BR');
        });
        var warehouseOptions = '<option value="All">Todos os armazéns</option>' + warehouses.map(function(warehouse) {
            var selected = warehouse === catalogScopeWarehouse ? ' selected' : '';
            var label = warehouse.replace(/\s+-\s+C$/, '');
            return `<option value="${escapeHTML(warehouse)}"${selected}>${escapeHTML(label)}</option>`;
        }).join('');
        var scopeLabel = filters.scope_active
            ? `${escapeHTML(filters.scope_label)} · ${Number(filters.scoped_warehouses_count || 0)} armazém(ns)`
            : 'Catálogo completo permitido';
        return `<div class="cdc-linked-filters cdc-catalog-scope-filters" aria-label="Escopo por projeto e armazém">
            <label><span>Projetos</span><select data-cdc-catalog-project>${projectOptions}</select></label>
            <label><span>Armazéns</span><select data-cdc-catalog-warehouse>${warehouseOptions}</select></label>
            <div class="cdc-catalog-scope-status"><strong>Visualização atual</strong><span>${scopeLabel}</span><small>Com filtro: somente itens com saldo positivo.</small></div>
            <button type="button" class="btn btn-sm btn-default" data-cdc-catalog-clear-scope>Limpar escopo</button>
        </div>`;
    }

    function bindCatalogScopeControls(dashboard, renderAgain, resetLoading) {
        var projectSelect = dashboard.querySelector('[data-cdc-catalog-project]');
        var warehouseSelect = dashboard.querySelector('[data-cdc-catalog-warehouse]');
        function applyScope(project, warehouse) {
            catalogScopeProject = project || 'All';
            catalogScopeWarehouse = warehouse || 'All';
            sessionStorage.setItem('cdc_catalog_project', catalogScopeProject);
            sessionStorage.setItem('cdc_catalog_warehouse', catalogScopeWarehouse);
            dashboard.dataset.loaded = '0';
            resetLoading();
            renderAgain();
        }
        if (projectSelect) projectSelect.addEventListener('change', function() {
            applyScope(projectSelect.value, 'All');
        });
        if (warehouseSelect) warehouseSelect.addEventListener('change', function() {
            applyScope(projectSelect ? projectSelect.value : catalogScopeProject, warehouseSelect.value);
        });
        var clearButton = dashboard.querySelector('[data-cdc-catalog-clear-scope]');
        if (clearButton) clearButton.addEventListener('click', function() {
            applyScope('All', 'All');
        });
    }

    function bindCatalogNativeScope(doctype, scope) {
        function bind() {
            var list = window.cur_list;
            if (!list || normalizeRoute(list.doctype) !== normalizeRoute(doctype)) return false;
            if (!list._cdcOriginalGetFiltersForArgs) {
                list._cdcOriginalGetFiltersForArgs = list.get_filters_for_args;
                list.get_filters_for_args = function() {
                    var filters = this._cdcOriginalGetFiltersForArgs.apply(this, arguments).slice();
                    var currentScope = this._cdcCatalogScope;
                    if (currentScope && currentScope.active) {
                        var names = currentScope.names.length ? currentScope.names : ['__cdc_sem_resultado__'];
                        filters.push([this.doctype, 'name', 'in', names]);
                    }
                    return filters;
                };
            }
            var names = scope && Array.isArray(scope.names) ? scope.names : [];
            var active = !!(scope && scope.active);
            var scopeKey = [active ? '1' : '0', catalogScopeProject, catalogScopeWarehouse, names.length, names[0] || '', names[names.length - 1] || ''].join('|');
            var previousKey = list._cdcCatalogScopeKey;
            list._cdcCatalogScope = {active: active, names: names};
            list._cdcCatalogScopeKey = scopeKey;
            if ((previousKey !== undefined && previousKey !== scopeKey) || (previousKey === undefined && active)) {
                list.start = 0;
                list.refresh();
            }
            return true;
        }
        if (!bind()) [150, 500].forEach(function(delay) { setTimeout(bind, delay); });
    }

    function isItemGroupRoute() {
        var route = window.frappe && frappe.get_route ? frappe.get_route() : [];
        var routeType = normalizeRoute(route && route[0]);
        var routeDoctype = normalizeRoute(route && route[1]);
        if (routeType === 'list' && routeDoctype === 'item-group') return true;

        var pathname = normalizeRoute(decodeURIComponent(window.location.pathname || ''));
        return pathname === '/app/item-group' || pathname === '/app/item-group/view/list';
    }

    function removeItemGroupDashboard() {
        document.querySelectorAll('#cdc-item-group-dashboard').forEach(function(dashboard) { dashboard.remove(); });
        document.querySelectorAll('.cdc-catalog-list-enhanced.is-item-group-list').forEach(function(list) {
            list.classList.remove('cdc-catalog-list-enhanced', 'is-item-group-list');
        });
    }

    var itemGroupLoading = false;

    function renderItemGroup() {
        if (!isItemGroupRoute()) {
            removeItemGroupDashboard();
            return;
        }
        var listBody = getActiveWorkspaceBody();
        var body = listBody && listBody.parentNode;
        if (!body) return;
        listBody.classList.add('cdc-catalog-list-enhanced', 'is-item-group-list');
        var dashboard = body.querySelector('#cdc-item-group-dashboard');
        document.querySelectorAll('#cdc-item-group-dashboard').forEach(function(candidate) {
            if (candidate !== dashboard) candidate.remove();
        });
        if (!dashboard) {
            dashboard = document.createElement('section');
            dashboard.id = 'cdc-item-group-dashboard';
        }
        if (dashboard.parentNode !== body) {
            body.insertBefore(dashboard, listBody);
        }
        if (dashboard.dataset.loaded === '1' && dashboard.querySelector('.cdc-item-group-wrapper')) return;
        if (itemGroupLoading) return;
        itemGroupLoading = true;

        dashboard.innerHTML = '<div class="cdc-monitoring-state">Carregando catálogo e grupos de itens...</div>';

        frappe.call({
            method: 'cdc_theme.api.get_item_group_dashboard_data',
            args: {
                selected_project: catalogScopeProject,
                selected_warehouse: catalogScopeWarehouse
            },
            callback: function(response) {
                itemGroupLoading = false;
                if (!isItemGroupRoute()) {
                    removeItemGroupDashboard();
                    return;
                }
                var currentListBody = getActiveWorkspaceBody();
                var currentBody = currentListBody && currentListBody.parentNode;
                if (currentBody) {
                    currentListBody.classList.add('cdc-catalog-list-enhanced', 'is-item-group-list');
                    var currentDash = currentBody.querySelector('#cdc-item-group-dashboard');
                    document.querySelectorAll('#cdc-item-group-dashboard').forEach(function(candidate) {
                        if (candidate !== currentDash) candidate.remove();
                    });
                    if (!currentDash) {
                        dashboard = document.createElement('section');
                        dashboard.id = 'cdc-item-group-dashboard';
                    } else {
                        dashboard = currentDash;
                    }
                    if (dashboard.parentNode !== currentBody) {
                        currentBody.insertBefore(dashboard, currentListBody);
                    }
                }
                dashboard.dataset.loaded = '1';
                var data = response && response.message;
                if (!data) {
                    dashboard.innerHTML = '<div class="cdc-monitoring-state is-error">Falha ao obter dados dos grupos de itens.</div>';
                    return;
                }

                var summary = data.summary || {};
                var scopeFiltersHTML = getCatalogScopeHTML(data.filters || {});
                var parentGroups = (data.filters && data.filters.parent_groups) || [];
                var parentOptionsHTML = '<option value="">Todos os grupos pais</option>' + parentGroups.map(function(parent) {
                    return `<option value="${escapeHTML(parent)}">${escapeHTML(parent)}</option>`;
                }).join('');

                var breadcrumbHTML = window._cdc_get_breadcrumb_html ? window._cdc_get_breadcrumb_html('Estoque', 'Grupos de Itens & Catálogo') : '';

                dashboard.innerHTML = `
                    ${breadcrumbHTML}
                    <div class="cdc-item-group-wrapper">
                        <div class="cdc-monitoring-header">
                            <div class="cdc-monitoring-title-box">
                                <h1 class="cdc-monitoring-h1">🏷️ Grupos de Itens</h1>
                                <p class="cdc-monitoring-sub">Organização do catálogo com indicadores cadastrais e filtros ligados à lista oficial</p>
                            </div>
                            <button class="btn btn-sm btn-default" id="cdc-btn-refresh-ig">🔄 Atualizar indicadores</button>
                        </div>

                        <!-- CARDS KPI -->
                        <div class="cdc-monitoring-cards-grid">
                            <div class="cdc-monitoring-card is-info">
                                <div class="cdc-card-label">${data.filters && data.filters.scope_active ? 'Grupos no escopo' : 'Todos os grupos'}</div>
                                <div class="cdc-card-value">${summary.total_groups || 0}</div>
                                <div class="cdc-card-desc">${data.filters && data.filters.scope_active ? 'Com itens de saldo positivo' : 'Estrutura completa visível'}</div>
                            </div>
                            <div class="cdc-monitoring-card is-status">
                                <div class="cdc-card-label">Grupos pais</div>
                                <div class="cdc-card-value">${summary.parent_groups || 0}</div>
                                <div class="cdc-card-desc">Categorias com subgrupos</div>
                            </div>
                            <div class="cdc-monitoring-card is-info">
                                <div class="cdc-card-label">Grupos finais</div>
                                <div class="cdc-card-value">${summary.final_groups || 0}</div>
                                <div class="cdc-card-desc">Categorias disponíveis para itens</div>
                            </div>
                            <div class="cdc-monitoring-card is-status">
                                <div class="cdc-card-label">Itens ativos</div>
                                <div class="cdc-card-value">${summary.active_items || 0}</div>
                                <div class="cdc-card-desc">Produtos e serviços habilitados</div>
                            </div>
                            <div class="cdc-monitoring-card ${summary.empty_final_groups > 0 ? 'is-warning' : 'is-status'}">
                                <div class="cdc-card-label">Grupos vazios</div>
                                <div class="cdc-card-value">${summary.empty_final_groups || 0}</div>
                                <div class="cdc-card-desc">Grupos finais sem item ativo</div>
                            </div>
                        </div>

                        ${scopeFiltersHTML}

                        <!-- BARRA DE FILTROS -->
                        <div class="cdc-linked-filters" aria-label="Filtros de Grupos">
                            <label><span>Pesquisar</span><input id="cdc-ig-search" type="search" aria-label="Pesquisar grupo de itens" placeholder="Nome do grupo"></label>
                            <label><span>Grupo pai</span><select id="cdc-ig-parent-filter">${parentOptionsHTML}</select></label>
                            <label><span>Tipo</span><select id="cdc-ig-kind-filter"><option value="">Todos os tipos</option><option value="1">Com subgrupos</option><option value="0">Grupo final</option></select></label>
                            <button type="button" class="btn btn-sm btn-primary" id="cdc-ig-apply-filters">Aplicar filtros</button>
                            <button type="button" class="btn btn-sm btn-default" id="cdc-ig-clear-filters">Limpar filtros</button>
                        </div>
                        <p class="cdc-catalog-filter-note">Os filtros são aplicados à lista oficial do ERPNext, preservando edição, paginação, visualizações e filtros salvos.</p>
                    </div>
                `;

                dashboard.dataset.loaded = '1';
                bindCatalogNativeScope('Item Group', data.scope || {});
                bindCatalogScopeControls(dashboard, renderItemGroup, function() {
                    itemGroupLoading = false;
                });

                var searchInput = dashboard.querySelector('#cdc-ig-search');
                var parentFilter = dashboard.querySelector('#cdc-ig-parent-filter');
                var kindFilter = dashboard.querySelector('#cdc-ig-kind-filter');
                if (searchInput) searchInput.value = getCatalogRouteValue('name').replace(/^%|%$/g, '');
                if (parentFilter) parentFilter.value = getCatalogRouteValue('parent_item_group');
                if (kindFilter) kindFilter.value = getCatalogRouteValue('is_group');
                function navigateWithItemGroupFilters() {
                    var filters = {};
                    var term = searchInput ? searchInput.value.trim() : '';
                    if (term) filters.name = ['like', '%' + term + '%'];
                    if (parentFilter && parentFilter.value) filters.parent_item_group = parentFilter.value;
                    if (kindFilter && kindFilter.value !== '') filters.is_group = Number(kindFilter.value);
                    frappe.set_route('List', 'Item Group', 'List', filters);
                }

                var applyFiltersBtn = dashboard.querySelector('#cdc-ig-apply-filters');
                if (applyFiltersBtn) applyFiltersBtn.addEventListener('click', navigateWithItemGroupFilters);
                if (searchInput) searchInput.addEventListener('keydown', function(event) {
                    if (event.key === 'Enter') navigateWithItemGroupFilters();
                });

                var clearFiltersBtn = dashboard.querySelector('#cdc-ig-clear-filters');
                if (clearFiltersBtn) {
                    clearFiltersBtn.addEventListener('click', function() {
                        [searchInput, parentFilter, kindFilter].forEach(function(control) {
                            if (control) control.value = '';
                        });
                        frappe.set_route('List', 'Item Group', 'List');
                    });
                }

                var refreshBtn = dashboard.querySelector('#cdc-btn-refresh-ig');
                if (refreshBtn) {
                    refreshBtn.addEventListener('click', function() {
                        delete dashboard.dataset.loaded;
                        itemGroupLoading = false;
                        renderItemGroup();
                        frappe.show_alert({ message: __('🔄 Atualizando grupos de itens...'), indicator: 'green' }, 3);
                    });
                }

            },
            error: function(err) {
                itemGroupLoading = false;
                if (!isItemGroupRoute()) {
                    removeItemGroupDashboard();
                    return;
                }
                dashboard.dataset.loaded = '0';
                var message = err && err.message ? err.message : 'Não foi possível consultar os grupos de itens.';
                dashboard.innerHTML = '<div class="cdc-monitoring-state is-error">' + escapeHTML(message) + '</div>';
            }
        });
    }

    function isItemRoute() {
        var route = window.frappe && frappe.get_route ? frappe.get_route() : [];
        var routeType = normalizeRoute(route && route[0]);
        var routeDoctype = normalizeRoute(route && route[1]);
        if (routeType === 'list' && routeDoctype === 'item') return true;

        var pathname = normalizeRoute(decodeURIComponent(window.location.pathname || ''));
        return pathname === '/app/item' || pathname === '/app/item/view/list';
    }

    function getCatalogRouteValue(fieldname) {
        var params = new URLSearchParams(window.location.search || '');
        if (params.has(fieldname)) return params.get(fieldname) || '';
        var options = window.frappe && frappe.get_route_options ? frappe.get_route_options() : (window.frappe && frappe.route_options);
        var value = options && options[fieldname];
        if (Array.isArray(value)) value = value[value.length - 1];
        return value === undefined || value === null ? '' : String(value);
    }

    function removeItemDashboard() {
        document.querySelectorAll('#cdc-item-list-dashboard').forEach(function(dashboard) { dashboard.remove(); });
        document.querySelectorAll('.cdc-catalog-list-enhanced.is-item-list').forEach(function(list) {
            list.classList.remove('cdc-catalog-list-enhanced', 'is-item-list');
        });
    }

    var itemListLoading = false;

    function renderItemList() {
        if (!isItemRoute()) {
            removeItemDashboard();
            return;
        }
        var listBody = getActiveWorkspaceBody();
        var body = listBody && listBody.parentNode;
        if (!body) return;
        listBody.classList.add('cdc-catalog-list-enhanced', 'is-item-list');

        var dashboard = body.querySelector('#cdc-item-list-dashboard');
        document.querySelectorAll('#cdc-item-list-dashboard').forEach(function(candidate) {
            if (candidate !== dashboard) candidate.remove();
        });
        if (!dashboard) {
            dashboard = document.createElement('section');
            dashboard.id = 'cdc-item-list-dashboard';
        }
        if (dashboard.parentNode !== body) body.insertBefore(dashboard, listBody);
        if (dashboard.dataset.loaded === '1' && dashboard.querySelector('.cdc-item-list-wrapper')) return;
        if (itemListLoading) return;
        itemListLoading = true;
        dashboard.innerHTML = '<div class="cdc-monitoring-state">Carregando indicadores do catálogo...</div>';

        frappe.call({
            method: 'cdc_theme.api.get_item_list_dashboard_data',
            args: {
                selected_project: catalogScopeProject,
                selected_warehouse: catalogScopeWarehouse
            },
            callback: function(response) {
                itemListLoading = false;
                if (!isItemRoute()) {
                    removeItemDashboard();
                    return;
                }
                var currentListBody = getActiveWorkspaceBody();
                var currentBody = currentListBody && currentListBody.parentNode;
                if (!currentBody) return;
                currentListBody.classList.add('cdc-catalog-list-enhanced', 'is-item-list');
                var currentDash = currentBody.querySelector('#cdc-item-list-dashboard');
                document.querySelectorAll('#cdc-item-list-dashboard').forEach(function(candidate) {
                    if (candidate !== currentDash) candidate.remove();
                });
                if (!currentDash) {
                    dashboard = document.createElement('section');
                    dashboard.id = 'cdc-item-list-dashboard';
                } else {
                    dashboard = currentDash;
                }
                if (dashboard.parentNode !== currentBody) currentBody.insertBefore(dashboard, currentListBody);

                var data = response && response.message;
                if (!data) {
                    dashboard.innerHTML = '<div class="cdc-monitoring-state is-error">Falha ao obter os indicadores dos itens.</div>';
                    return;
                }
                var summary = data.summary || {};
                var scopeFiltersHTML = getCatalogScopeHTML(data.filters || {});
                var groups = (data.filters && data.filters.groups) || [];
                var groupOptions = '<option value="">Todos os grupos</option>' + groups.map(function(group) {
                    return `<option value="${escapeHTML(group)}">${escapeHTML(group)}</option>`;
                }).join('');
                var breadcrumbHTML = window._cdc_get_breadcrumb_html ? window._cdc_get_breadcrumb_html('Estoque', 'Itens do Catálogo') : '';

                dashboard.innerHTML = `
                    ${breadcrumbHTML}
                    <div class="cdc-item-list-wrapper">
                        <div class="cdc-monitoring-header">
                            <div class="cdc-monitoring-title-box">
                                <h1 class="cdc-monitoring-h1">📦 Itens do Catálogo</h1>
                                <p class="cdc-monitoring-sub">Visão cadastral com busca e filtros ligados à lista oficial do ERPNext</p>
                            </div>
                            <button class="btn btn-sm btn-default" id="cdc-btn-refresh-items">🔄 Atualizar indicadores</button>
                        </div>
                        <div class="cdc-monitoring-cards-grid">
                            <div class="cdc-monitoring-card is-status"><div class="cdc-card-label">${data.filters && data.filters.scope_active ? 'Itens no escopo' : 'Itens ativos'}</div><div class="cdc-card-value">${summary.active_items || 0}</div><div class="cdc-card-desc">${data.filters && data.filters.scope_active ? 'Ativos com saldo positivo' : 'Disponíveis no catálogo'}</div></div>
                            <div class="cdc-monitoring-card ${summary.disabled_items > 0 ? 'is-warning' : 'is-status'}"><div class="cdc-card-label">Desativados</div><div class="cdc-card-value">${summary.disabled_items || 0}</div><div class="cdc-card-desc">Mantidos no histórico</div></div>
                            <div class="cdc-monitoring-card is-info"><div class="cdc-card-label">Itens de estoque</div><div class="cdc-card-value">${summary.active_stock_items || 0}</div><div class="cdc-card-desc">Ativos e movimentáveis</div></div>
                            <div class="cdc-monitoring-card is-info"><div class="cdc-card-label">Não estocáveis</div><div class="cdc-card-value">${summary.active_non_stock_items || 0}</div><div class="cdc-card-desc">Serviços e itens sem saldo</div></div>
                            <div class="cdc-monitoring-card is-status"><div class="cdc-card-label">Grupos em uso</div><div class="cdc-card-value">${summary.groups_in_use || 0}</div><div class="cdc-card-desc">Com pelo menos um item ativo</div></div>
                        </div>
                        ${scopeFiltersHTML}
                        <div class="cdc-linked-filters cdc-catalog-filters" aria-label="Filtros de Itens">
                            <label><span>Pesquisar</span><input id="cdc-item-search" type="search" aria-label="Pesquisar código do item" placeholder="Código do item"></label>
                            <label><span>Grupo</span><select id="cdc-item-group-filter">${groupOptions}</select></label>
                            <label><span>Status</span><select id="cdc-item-status-filter"><option value="">Todos</option><option value="0">Ativos</option><option value="1">Desativados</option></select></label>
                            <label><span>Tipo</span><select id="cdc-item-stock-filter"><option value="">Todos</option><option value="1">Item de estoque</option><option value="0">Não estocável</option></select></label>
                            <button type="button" class="btn btn-sm btn-primary" id="cdc-item-apply-filters">Aplicar filtros</button>
                            <button type="button" class="btn btn-sm btn-default" id="cdc-item-clear-filters">Limpar filtros</button>
                        </div>
                        <p class="cdc-catalog-filter-note">A pesquisa usa o código oficial do item. Edição, paginação, seleção de colunas e filtros salvos continuam nativos.</p>
                    </div>`;
                dashboard.dataset.loaded = '1';
                bindCatalogNativeScope('Item', data.scope || {});
                bindCatalogScopeControls(dashboard, renderItemList, function() {
                    itemListLoading = false;
                });

                var searchInput = dashboard.querySelector('#cdc-item-search');
                var groupFilter = dashboard.querySelector('#cdc-item-group-filter');
                var statusFilter = dashboard.querySelector('#cdc-item-status-filter');
                var stockFilter = dashboard.querySelector('#cdc-item-stock-filter');
                if (searchInput) searchInput.value = getCatalogRouteValue('name').replace(/^%|%$/g, '');
                if (groupFilter) groupFilter.value = getCatalogRouteValue('item_group');
                if (statusFilter) statusFilter.value = getCatalogRouteValue('disabled');
                if (stockFilter) stockFilter.value = getCatalogRouteValue('is_stock_item');

                function navigateWithItemFilters() {
                    var filters = {};
                    var term = searchInput ? searchInput.value.trim() : '';
                    if (term) filters.name = ['like', '%' + term + '%'];
                    if (groupFilter && groupFilter.value) filters.item_group = groupFilter.value;
                    if (statusFilter && statusFilter.value !== '') filters.disabled = Number(statusFilter.value);
                    if (stockFilter && stockFilter.value !== '') filters.is_stock_item = Number(stockFilter.value);
                    frappe.set_route('List', 'Item', 'List', filters);
                }
                dashboard.querySelector('#cdc-item-apply-filters').addEventListener('click', navigateWithItemFilters);
                searchInput.addEventListener('keydown', function(event) {
                    if (event.key === 'Enter') navigateWithItemFilters();
                });
                dashboard.querySelector('#cdc-item-clear-filters').addEventListener('click', function() {
                    [searchInput, groupFilter, statusFilter, stockFilter].forEach(function(control) { control.value = ''; });
                    frappe.set_route('List', 'Item', 'List');
                });
                dashboard.querySelector('#cdc-btn-refresh-items').addEventListener('click', function() {
                    dashboard.dataset.loaded = '0';
                    itemListLoading = false;
                    renderItemList();
                    frappe.show_alert({message: __('Indicadores do catálogo atualizados.'), indicator: 'green'}, 3);
                });
            },
            error: function(error) {
                itemListLoading = false;
                if (!isItemRoute()) {
                    removeItemDashboard();
                    return;
                }
                dashboard.dataset.loaded = '0';
                var message = error && error.message ? error.message : 'Não foi possível consultar os itens.';
                dashboard.innerHTML = '<div class="cdc-monitoring-state is-error">' + escapeHTML(message) + '</div>';
            }
        });
    }

    var warehouseListLoading = false;
    var warehouseRequestSerial = 0;
    var warehouseActiveRequestKey = '';
    var warehouseRenderTimer = null;
    var warehousePendingContext = null;
    var warehousePendingContextUntil = 0;
    var warehouseLastScope = {active: false, names: []};
    var warehouseSelectedProject = sessionStorage.getItem('cdc_warehouse_project') || 'All';

    function scheduleWarehouseRender(delay) {
        if (warehouseRenderTimer) clearTimeout(warehouseRenderTimer);
        warehouseRenderTimer = setTimeout(function() {
            warehouseRenderTimer = null;
            renderWarehouseList();
        }, delay || 140);
    }

    function isWarehouseListRoute() {
        var route = window.frappe && frappe.get_route ? frappe.get_route() : [];
        var routeType = normalizeRoute(route && route[0]);
        var routeDoctype = normalizeRoute(route && route[1]);
        if (routeType === 'list' && routeDoctype === 'warehouse') return true;
        var pathname = normalizeRoute(decodeURIComponent(window.location.pathname || ''));
        return pathname === '/app/warehouse' || pathname === '/app/warehouse/view/list';
    }

    function removeWarehouseDashboard() {
        if (warehouseListLoading) warehouseRequestSerial += 1;
        warehouseListLoading = false;
        warehouseActiveRequestKey = '';
        warehousePendingContext = null;
        warehousePendingContextUntil = 0;
        warehouseLastScope = {active: false, names: []};
        document.querySelectorAll('#cdc-warehouse-dashboard').forEach(function(dashboard) { dashboard.remove(); });
        document.querySelectorAll('.cdc-catalog-list-enhanced.is-warehouse-list').forEach(function(list) {
            list.classList.remove('cdc-catalog-list-enhanced', 'is-warehouse-list');
        });
    }

    function getWarehouseRouteValue(fieldname) {
        var params = new URLSearchParams(window.location.search || '');
        var options = window.frappe && frappe.get_route_options ? frappe.get_route_options() : (window.frappe && frappe.route_options);
        var value = params.has(fieldname) ? (params.get(fieldname) || '') : (options && options[fieldname]);
        if (typeof value === 'string' && value.trim().charAt(0) === '[') {
            try {
                var parsedValue = JSON.parse(value);
                if (Array.isArray(parsedValue)) value = parsedValue;
            } catch (error) {}
        }
        if (Array.isArray(value)) {
            var operator = normalizeRoute(value[0]);
            if (fieldname === 'name' && operator === 'in') return '';
            value = value.length > 1 ? value[1] : '';
        }
        return value === undefined || value === null ? '' : String(value);
    }

    function getWarehouseListContext() {
        var context = {
            search: getWarehouseRouteValue('name').replace(/^%|%$/g, ''),
            company: getWarehouseRouteValue('company'),
            disabled: getWarehouseRouteValue('disabled'),
            is_group: getWarehouseRouteValue('is_group'),
            parent_warehouse: getWarehouseRouteValue('parent_warehouse'),
            selected_project: warehouseSelectedProject
        };
        if (warehousePendingContext && Date.now() < warehousePendingContextUntil) {
            return Object.assign({}, warehousePendingContext);
        }
        warehousePendingContext = null;
        warehousePendingContextUntil = 0;
        return context;
    }

    function bindWarehouseNativeScope(scope) {
        function bind() {
            var list = window.cur_list;
            if (!list || normalizeRoute(list.doctype) !== 'warehouse') return false;
            if (!list._cdcWarehouseOriginalGetFiltersForArgs) {
                list._cdcWarehouseOriginalGetFiltersForArgs = list.get_filters_for_args;
                list.get_filters_for_args = function() {
                    var filters = (this._cdcWarehouseOriginalGetFiltersForArgs.apply(this, arguments) || []).slice();
                    var currentScope = this._cdcWarehouseScope;
                    if (currentScope && currentScope.active) {
                        var names = currentScope.names.length ? currentScope.names : ['__cdc_sem_resultado__'];
                        filters.push([this.doctype, 'name', 'in', names]);
                    }
                    return filters;
                };
            }
            var names = scope && Array.isArray(scope.names) ? scope.names : [];
            var active = !!(scope && scope.active);
            var scopeKey = [active ? '1' : '0', warehouseSelectedProject, names.length, names[0] || '', names[names.length - 1] || ''].join('|');
            var previousKey = list._cdcWarehouseScopeKey;
            list._cdcWarehouseScope = {active: active, names: names};
            list._cdcWarehouseScopeKey = scopeKey;
            if ((previousKey !== undefined && previousKey !== scopeKey) || (previousKey === undefined && active)) {
                (function refreshWhenReady(attempt) {
                    if (!isWarehouseListRoute() || window.cur_list !== list) return;
                    if (list.$result && typeof list.refresh === 'function') {
                        list.start = 0;
                        list.refresh();
                        return;
                    }
                    if (attempt < 8) setTimeout(function() { refreshWhenReady(attempt + 1); }, 150);
                })(0);
            }
            return true;
        }
        if (!bind()) [150, 500].forEach(function(delay) { setTimeout(bind, delay); });
    }

    function renderWarehouseList() {
        if (!isWarehouseListRoute()) {
            removeWarehouseDashboard();
            return;
        }
        var listBody = getActiveWorkspaceBody();
        var body = listBody && listBody.parentNode;
        if (!body) return;
        listBody.classList.add('cdc-catalog-list-enhanced', 'is-warehouse-list');
        var dashboard = body.querySelector('#cdc-warehouse-dashboard');
        document.querySelectorAll('#cdc-warehouse-dashboard').forEach(function(candidate) {
            if (candidate !== dashboard) candidate.remove();
        });
        if (!dashboard) {
            dashboard = document.createElement('section');
            dashboard.id = 'cdc-warehouse-dashboard';
        }
        if (dashboard.parentNode !== body) body.insertBefore(dashboard, listBody);

        var context = getWarehouseListContext();
        var contextKey = JSON.stringify(context);
        if (dashboard.dataset.loaded === '1' && dashboard.dataset.contextKey === contextKey && dashboard.querySelector('.cdc-warehouse-wrapper')) {
            bindWarehouseNativeScope(warehouseLastScope);
            return;
        }
        if (warehouseListLoading) {
            if (warehouseActiveRequestKey === contextKey) return;
            warehouseRequestSerial += 1;
            warehouseListLoading = false;
        }

        warehouseListLoading = true;
        warehouseActiveRequestKey = contextKey;
        var requestSerial = ++warehouseRequestSerial;
        dashboard.dataset.loaded = '0';
        dashboard.dataset.contextKey = contextKey;
        dashboard.innerHTML = '<div class="cdc-monitoring-state">Carregando indicadores dos armazéns...</div>';

        frappe.call({
            method: 'cdc_theme.api.get_warehouse_list_dashboard_data',
            args: context,
            callback: function(response) {
                if (requestSerial !== warehouseRequestSerial) return;
                warehouseListLoading = false;
                warehouseActiveRequestKey = '';
                if (!isWarehouseListRoute()) {
                    removeWarehouseDashboard();
                    return;
                }
                var currentListBody = getActiveWorkspaceBody();
                var currentBody = currentListBody && currentListBody.parentNode;
                if (!currentBody) return;
                currentListBody.classList.add('cdc-catalog-list-enhanced', 'is-warehouse-list');
                var currentDashboard = currentBody.querySelector('#cdc-warehouse-dashboard');
                if (currentDashboard) dashboard = currentDashboard;
                else {
                    dashboard = document.createElement('section');
                    dashboard.id = 'cdc-warehouse-dashboard';
                    currentBody.insertBefore(dashboard, currentListBody);
                }

                var data = response && response.message;
                if (!data) {
                    dashboard.dataset.loaded = '0';
                    dashboard.innerHTML = '<div class="cdc-monitoring-state is-error">Falha ao obter o contexto dos armazéns.</div>';
                    return;
                }
                var summary = data.summary || {};
                var filters = data.filters || {};
                warehouseSelectedProject = filters.selected_project || 'All';
                sessionStorage.setItem('cdc_warehouse_project', warehouseSelectedProject);

                var companyOptions = '<option value="">Todas as empresas</option>' + (filters.companies || []).map(function(value) {
                    return `<option value="${escapeHTML(value)}"${value === filters.selected_company ? ' selected' : ''}>${escapeHTML(value)}</option>`;
                }).join('');
                var projectOptions = '<option value="All">Todos os projetos</option>' + (filters.projects || []).map(function(value) {
                    return `<option value="${escapeHTML(value)}"${value === warehouseSelectedProject ? ' selected' : ''}>${escapeHTML(value)}</option>`;
                }).join('');
                var parentOptions = '<option value="">Todos os grupos pais</option>' + (filters.parent_groups || []).map(function(value) {
                    return `<option value="${escapeHTML(value)}"${value === filters.selected_parent ? ' selected' : ''}>${escapeHTML(value.replace(/\s+-\s+C$/, ''))}</option>`;
                }).join('');
                var breadcrumb = window._cdc_get_breadcrumb_html ? window._cdc_get_breadcrumb_html('Estoque', 'Armazéns') : '';

                dashboard.innerHTML = `
                    ${breadcrumb}
                    <div class="cdc-warehouse-wrapper">
                        <div class="cdc-monitoring-header">
                            <div class="cdc-monitoring-title-box">
                                <h1 class="cdc-monitoring-h1">🏭 Armazéns</h1>
                                <p class="cdc-monitoring-sub">Indicadores e filtros aplicados à lista oficial do ERPNext</p>
                            </div>
                            <button class="btn btn-sm btn-default" id="cdc-btn-refresh-warehouses">🔄 Atualizar contexto</button>
                        </div>
                        <div class="cdc-monitoring-cards-grid">
                            <div class="cdc-monitoring-card is-info"><div class="cdc-card-label">Resultados</div><div class="cdc-card-value">${summary.total_results || 0}</div><div class="cdc-card-desc">Registros no contexto atual</div></div>
                            <div class="cdc-monitoring-card is-status"><div class="cdc-card-label">Operacionais</div><div class="cdc-card-value">${summary.operational_warehouses || 0}</div><div class="cdc-card-desc">Armazéns que recebem movimentações</div></div>
                            <div class="cdc-monitoring-card is-info"><div class="cdc-card-label">Grupos</div><div class="cdc-card-value">${summary.warehouse_groups || 0}</div><div class="cdc-card-desc">Nós organizadores da árvore</div></div>
                            <div class="cdc-monitoring-card ${summary.inactive_warehouses > 0 ? 'is-warning' : 'is-status'}"><div class="cdc-card-label">Inativos</div><div class="cdc-card-value">${summary.inactive_warehouses || 0}</div><div class="cdc-card-desc">Desabilitados no contexto</div></div>
                            <div class="cdc-monitoring-card is-status"><div class="cdc-card-label">Projetos</div><div class="cdc-card-value">${summary.projects_in_context || 0}</div><div class="cdc-card-desc">Projetos representados</div></div>
                        </div>
                        <div class="cdc-linked-filters cdc-warehouse-filters" aria-label="Filtros de Armazéns">
                            <label class="is-search"><span>Pesquisar</span><input id="cdc-warehouse-search" type="search" value="${filters.search ? escapeHTML(filters.search) : ''}" placeholder="Nome ou código do armazém"></label>
                            <label><span>Projetos</span><select id="cdc-warehouse-project">${projectOptions}</select></label>
                            <label><span>Empresa</span><select id="cdc-warehouse-company">${companyOptions}</select></label>
                            <label><span>Status</span><select id="cdc-warehouse-status"><option value="">Todos</option><option value="0"${filters.selected_disabled === '0' ? ' selected' : ''}>Ativos</option><option value="1"${filters.selected_disabled === '1' ? ' selected' : ''}>Inativos</option></select></label>
                            <label><span>Tipo</span><select id="cdc-warehouse-kind"><option value="">Todos</option><option value="0"${filters.selected_is_group === '0' ? ' selected' : ''}>Operacional</option><option value="1"${filters.selected_is_group === '1' ? ' selected' : ''}>Grupo</option></select></label>
                            <label><span>Grupo pai</span><select id="cdc-warehouse-parent">${parentOptions}</select></label>
                            <button type="button" class="btn btn-sm btn-primary" id="cdc-warehouse-apply">Aplicar filtros</button>
                            <button type="button" class="btn btn-sm btn-default" id="cdc-warehouse-clear">Limpar filtros</button>
                        </div>
                        <p class="cdc-catalog-filter-note">Cards e filtros usam somente armazéns permitidos ao usuário. A lista, paginação, seleção e ações permanecem nativas.</p>
                    </div>`;
                dashboard.dataset.loaded = '1';
                dashboard.dataset.contextKey = contextKey;
                warehouseLastScope = data.scope || {active: false, names: []};
                bindWarehouseNativeScope(warehouseLastScope);

                var searchInput = dashboard.querySelector('#cdc-warehouse-search');
                var projectSelect = dashboard.querySelector('#cdc-warehouse-project');
                var companySelect = dashboard.querySelector('#cdc-warehouse-company');
                var statusSelect = dashboard.querySelector('#cdc-warehouse-status');
                var kindSelect = dashboard.querySelector('#cdc-warehouse-kind');
                var parentSelect = dashboard.querySelector('#cdc-warehouse-parent');
                function applyFilters() {
                    warehouseSelectedProject = projectSelect ? projectSelect.value : 'All';
                    sessionStorage.setItem('cdc_warehouse_project', warehouseSelectedProject);
                    var routeFilters = {};
                    var term = searchInput ? searchInput.value.trim() : '';
                    if (term) routeFilters.name = ['like', '%' + term + '%'];
                    if (companySelect && companySelect.value) routeFilters.company = companySelect.value;
                    if (statusSelect && statusSelect.value !== '') routeFilters.disabled = Number(statusSelect.value);
                    if (kindSelect && kindSelect.value !== '') routeFilters.is_group = Number(kindSelect.value);
                    if (parentSelect && parentSelect.value) routeFilters.parent_warehouse = parentSelect.value;
                    warehousePendingContext = {
                        search: term,
                        company: companySelect ? companySelect.value : '',
                        disabled: statusSelect ? statusSelect.value : '',
                        is_group: kindSelect ? kindSelect.value : '',
                        parent_warehouse: parentSelect ? parentSelect.value : '',
                        selected_project: warehouseSelectedProject
                    };
                    warehousePendingContextUntil = Date.now() + 1200;
                    dashboard.dataset.loaded = '0';
                    frappe.set_route('List', 'Warehouse', 'List', routeFilters);
                    scheduleWarehouseRender(180);
                }
                dashboard.querySelector('#cdc-warehouse-apply').addEventListener('click', applyFilters);
                if (searchInput) searchInput.addEventListener('keydown', function(event) {
                    if (event.key === 'Enter') applyFilters();
                });
                dashboard.querySelector('#cdc-warehouse-clear').addEventListener('click', function() {
                    warehouseSelectedProject = 'All';
                    sessionStorage.setItem('cdc_warehouse_project', 'All');
                    warehousePendingContext = {
                        search: '', company: '', disabled: '', is_group: '',
                        parent_warehouse: '', selected_project: 'All'
                    };
                    warehousePendingContextUntil = Date.now() + 1200;
                    dashboard.dataset.loaded = '0';
                    frappe.set_route('List', 'Warehouse', 'List');
                    scheduleWarehouseRender(180);
                });
                dashboard.querySelector('#cdc-btn-refresh-warehouses').addEventListener('click', function() {
                    dashboard.dataset.loaded = '0';
                    if (window.cur_list && normalizeRoute(window.cur_list.doctype) === 'warehouse') window.cur_list.refresh();
                    renderWarehouseList();
                    frappe.show_alert({message: __('Indicadores dos armazéns atualizados.'), indicator: 'green'}, 3);
                });
            },
            error: function(error) {
                if (requestSerial !== warehouseRequestSerial) return;
                warehouseListLoading = false;
                warehouseActiveRequestKey = '';
                if (!isWarehouseListRoute()) {
                    removeWarehouseDashboard();
                    return;
                }
                dashboard.dataset.loaded = '0';
                var message = error && error.message ? error.message : 'Não foi possível consultar os armazéns.';
                dashboard.innerHTML = '<div class="cdc-monitoring-state is-error">' + escapeHTML(message) + '</div>';
            }
        });
    }

    function init() {
        render();
        renderItemGroup();
        renderItemList();
        renderWarehouseList();
        if (observer) observer.disconnect();
        observer = new MutationObserver(function() {
            if (isMonitoringRoute()) render();
            renderItemGroup();
            renderItemList();
            scheduleWarehouseRender();
        });
        observer.observe(document.body, { childList: true, subtree: true });

        if (window.frappe && frappe.router && frappe.router.on) {
            frappe.router.on('change', function() {
                routeGeneration++;
                loading = false;
                if (isMonitoringRoute()) render();
                var groupDashboard = document.getElementById('cdc-item-group-dashboard');
                if (groupDashboard) groupDashboard.dataset.loaded = '0';
                var itemDashboard = document.getElementById('cdc-item-list-dashboard');
                if (itemDashboard) itemDashboard.dataset.loaded = '0';
                renderItemGroup();
                renderItemList();
                scheduleWarehouseRender();
            });
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 100);
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
})();
