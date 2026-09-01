(function() {
    'use strict';

    var timers = [];
    var optionsCache = null;
    var optionsLoading = false;
    var optionsRequestSerial = 0;
    var optionsTimeout = null;
    var OPTIONS_TIMEOUT_MS = 15000;

    function normalize(value) {
        return decodeURIComponent(String(value || '')).toLowerCase().normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
    }

    function isReportsRoute() {
        var route = window.frappe && frappe.get_route ? frappe.get_route() : [];
        var main = normalize(route[0]);
        var sub = normalize(route[1]);
        return main === 'cdc-relatorios' || main === 'relatorios' ||
            ((main === 'workspace' || main === 'workspaces') && (sub === 'cdc-relatorios' || sub === 'relatorios')) ||
            normalize(window.location.pathname).indexOf('/app/cdc-relatorios') !== -1;
    }

    function escapeHTML(value) {
        var element = document.createElement('div');
        element.textContent = value === null || value === undefined ? '' : String(value);
        return element.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function claimDashboard() {
        if (typeof window._cdc_claim_active_dashboard !== 'function') return null;
        return window._cdc_claim_active_dashboard('cdc-reports-dashboard', 'section');
    }

    function removeDashboard() {
        optionsRequestSerial += 1;
        optionsLoading = false;
        if (optionsTimeout) clearTimeout(optionsTimeout);
        optionsTimeout = null;
        document.querySelectorAll('#cdc-reports-dashboard').forEach(function(node) { node.remove(); });
        document.querySelectorAll('.layout-main-section, .workspace-page-content').forEach(function(body) {
            body.classList.remove('cdc-custom-reports-active');
        });
    }

    function renderLoading(dashboard) {
        dashboard.dataset.loaded = '0';
        dashboard.dataset.loading = '1';
        dashboard.innerHTML = '<div class="cdc-monitoring-state">Carregando central de relatórios...</div>';
    }

    function renderFailure(message) {
        var current = claimDashboard();
        if (!current || !isReportsRoute()) return;
        current.dashboard.dataset.loaded = '0';
        current.dashboard.dataset.loading = '0';
        current.dashboard.innerHTML = `<div class="cdc-monitoring-state is-error"><strong>${escapeHTML(message)}</strong><br>
            <button type="button" class="btn btn-sm btn-default" data-cdc-reports-retry>Tentar novamente</button></div>`;
        var retry = current.dashboard.querySelector('[data-cdc-reports-retry]');
        if (retry) retry.addEventListener('click', function() {
            optionsCache = null;
            render();
        });
    }

    function finishOptionsRequest(serial) {
        if (serial !== optionsRequestSerial) return false;
        optionsLoading = false;
        if (optionsTimeout) clearTimeout(optionsTimeout);
        optionsTimeout = null;
        return true;
    }

    function requestOptions(claim) {
        if (optionsLoading) return;
        optionsLoading = true;
        var serial = ++optionsRequestSerial;
        renderLoading(claim.dashboard);
        optionsTimeout = setTimeout(function() {
            if (serial !== optionsRequestSerial) return;
            optionsRequestSerial += 1;
            optionsLoading = false;
            optionsTimeout = null;
            renderFailure('A consulta demorou mais que o esperado. Verifique a conexão e tente novamente.');
        }, OPTIONS_TIMEOUT_MS);

        frappe.call({method: 'cdc_theme.reports.get_stock_movement_report_options', callback: function(response) {
            if (!finishOptionsRequest(serial) || !isReportsRoute()) return;
            var current = claimDashboard();
            if (!current) return;
            optionsCache = response && response.message;
            if (!optionsCache) {
                renderFailure('Não foi possível carregar os relatórios.');
                return;
            }
            current.dashboard.innerHTML = buildShell(optionsCache);
            current.dashboard.dataset.loaded = '1';
            current.dashboard.dataset.loading = '0';
            bind(current.dashboard);
        }, error: function(xhr) {
            if (!finishOptionsRequest(serial) || !isReportsRoute()) return;
            var response = xhr && xhr.responseJSON ? xhr.responseJSON : {};
            var denied = (xhr && xhr.status === 403) || response.exc_type === 'PermissionError' ||
                String(response.exception || '').indexOf('PermissionError') !== -1;
            renderFailure(denied
                ? 'Seu perfil não possui acesso aos relatórios de estoque.'
                : 'Falha ao consultar os relatórios permitidos.');
        }});
    }

    function isoDate(date) {
        var local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 10);
    }

    function defaultDates() {
        var today = new Date();
        return {from: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: isoDate(today)};
    }

    function renderWarehouseOptions(warehouses) {
        return (warehouses || []).map(function(item) {
            var disabled = item.disabled ? '<small>Inativo</small>' : '';
            return `<label class="cdc-report-warehouse-option" data-search="${escapeHTML((item.name + ' ' + item.label).toLowerCase())}">
                <input type="checkbox" value="${escapeHTML(item.name)}">
                <span><strong>${escapeHTML(item.label)}</strong><small>${escapeHTML(item.name)}</small></span>${disabled}
            </label>`;
        }).join('');
    }

    function buildShell(data) {
        var dates = defaultDates();
        var groups = '<option value="">Selecione um grupo</option>' + (data.groups || []).map(function(item) {
            return `<option value="${escapeHTML(item.name)}">${escapeHTML(item.label)} (${item.warehouses.length})</option>`;
        }).join('');
        var projects = '<option value="">Selecione um projeto</option>' + (data.projects || []).map(function(item) {
            return `<option value="${escapeHTML(item)}">${escapeHTML(item)}</option>`;
        }).join('');
        return `${window._cdc_get_breadcrumb_html ? window._cdc_get_breadcrumb_html('Relatórios', 'Movimentações de estoque') : ''}
            <div class="cdc-reports-shell">
                <header class="cdc-reports-header">
                    <div><span class="cdc-reports-eyebrow">CENTRAL DE RELATÓRIOS</span><h1>CDC Relatórios</h1>
                    <p>Consulte e exporte informações operacionais usando os mesmos critérios e permissões do estoque.</p></div>
                </header>
                <div class="cdc-reports-catalog">
                    <article class="cdc-report-card is-active"><span>Disponível</span><h2>Movimentações de estoque</h2><p>Entradas, saídas e transferências por armazém, grupo ou projeto.</p></article>
                    <article class="cdc-report-card"><span>Em breve</span><h2>Posição atual do estoque</h2><p>Saldos por item e armazém.</p></article>
                    <article class="cdc-report-card"><span>Em breve</span><h2>Pedidos ONGSYS</h2><p>Importações, pendências e divergências persistidas.</p></article>
                </div>
                <section class="cdc-report-builder">
                    <div class="cdc-report-builder-heading"><div><span>RELATÓRIO DISPONÍVEL</span><h2>Movimentações de estoque</h2></div>
                    <p>Somente lançamentos confirmados são considerados.</p></div>
                    <div class="cdc-report-grid">
                        <div class="cdc-report-field is-wide"><label for="cdc-report-scope">1. Escopo</label>
                            <select id="cdc-report-scope"><option value="warehouses">Um ou mais armazéns</option><option value="group">Grupo de armazéns</option><option value="project">Projeto</option></select></div>
                        <div class="cdc-report-field is-wide" data-scope-panel="warehouses">
                            <div class="cdc-report-list-actions"><label for="cdc-report-search">Armazéns permitidos</label><button type="button" class="btn btn-xs btn-default" id="cdc-report-toggle-all">Selecionar visíveis</button></div>
                            <input id="cdc-report-search" type="search" placeholder="Pesquisar armazém">
                            <div class="cdc-report-warehouse-list">${renderWarehouseOptions(data.warehouses)}</div>
                        </div>
                        <div class="cdc-report-field is-wide" data-scope-panel="group" hidden><label for="cdc-report-group">Grupo</label><select id="cdc-report-group">${groups}</select></div>
                        <div class="cdc-report-field is-wide" data-scope-panel="project" hidden><label for="cdc-report-project">Projeto</label><select id="cdc-report-project">${projects}</select></div>
                        <div class="cdc-report-field"><label for="cdc-report-from">2. Data inicial</label><input id="cdc-report-from" type="date" value="${dates.from}"></div>
                        <div class="cdc-report-field"><label for="cdc-report-to">Data final</label><input id="cdc-report-to" type="date" value="${dates.to}"></div>
                        <div class="cdc-report-field is-wide"><span class="cdc-report-label">Período rápido</span><div class="cdc-report-periods">
                            <button type="button" data-months="1">Mês</button><button type="button" data-months="3">Trimestre</button><button type="button" data-months="6">Semestre</button><button type="button" data-months="12">Ano</button>
                        </div></div>
                        <div class="cdc-report-field"><label for="cdc-report-movement">3. Movimentação</label><select id="cdc-report-movement"><option value="all">Todas</option><option value="receipt">Entradas</option><option value="issue">Saídas</option><option value="transfer">Transferências</option></select></div>
                        <div class="cdc-report-field"><label for="cdc-report-format">4. Formato</label><select id="cdc-report-format"><option value="pdf">PDF gerencial</option><option value="xlsx" selected>XLSX detalhado</option><option value="csv">CSV detalhado</option></select></div>
                    </div>
                    <div class="cdc-report-actions"><button type="button" class="btn btn-primary" id="cdc-report-preview">Visualizar prévia</button>
                    <button type="button" class="btn btn-default" id="cdc-report-download" disabled>Baixar arquivo</button></div>
                    <div id="cdc-report-result" class="cdc-report-result"><p>Defina o escopo e visualize a prévia antes de baixar.</p></div>
                </section>
            </div>`;
    }

    function formArgs(root) {
        var scope = root.querySelector('#cdc-report-scope').value;
        var warehouses = Array.from(root.querySelectorAll('.cdc-report-warehouse-option input:checked')).map(function(input) { return input.value; });
        return {
            scope_mode: scope,
            warehouses: JSON.stringify(warehouses),
            group: root.querySelector('#cdc-report-group').value,
            project: root.querySelector('#cdc-report-project').value,
            from_date: root.querySelector('#cdc-report-from').value,
            to_date: root.querySelector('#cdc-report-to').value,
            movement_type: root.querySelector('#cdc-report-movement').value
        };
    }

    function validateArgs(args) {
        if (args.scope_mode === 'warehouses' && JSON.parse(args.warehouses).length === 0) return 'Selecione ao menos um armazém.';
        if (args.scope_mode === 'group' && !args.group) return 'Selecione um grupo.';
        if (args.scope_mode === 'project' && !args.project) return 'Selecione um projeto.';
        if (!args.from_date || !args.to_date) return 'Informe as datas inicial e final.';
        if (args.from_date > args.to_date) return 'A data inicial não pode ser posterior à data final.';
        return '';
    }

    function renderPreview(root, data) {
        var summary = data.summary || {};
        var rows = data.rows || [];
        var tableRows = rows.slice(0, 20).map(function(row) {
            return `<tr><td>${escapeHTML(row.posting_date)}</td><td>${escapeHTML(row.stock_entry)}</td><td>${escapeHTML(row.direction)}</td><td>${escapeHTML(row.warehouse)}</td><td>${escapeHTML(row.item_code)}</td><td>${escapeHTML(row.item_name)}</td><td>${escapeHTML(row.quantity)}</td></tr>`;
        }).join('') || '<tr><td colspan="7">Nenhuma movimentação encontrada.</td></tr>';
        root.querySelector('#cdc-report-result').innerHTML = `<div class="cdc-report-summary">
            <div><strong>${summary.warehouse_count || 0}</strong><span>Armazéns</span></div><div><strong>${summary.documents || 0}</strong><span>Lançamentos</span></div>
            <div><strong>${summary.movement_lines || 0}</strong><span>Movimentações</span></div><div><strong>${summary.distinct_items || 0}</strong><span>Itens distintos</span></div>
        </div><p class="cdc-report-scope-note">Período: ${escapeHTML(summary.from_date)} a ${escapeHTML(summary.to_date)}. Transferências são apresentadas por sentido em cada armazém.</p>
        <div class="cdc-report-table-wrap"><table><thead><tr><th>Data</th><th>Lançamento</th><th>Tipo</th><th>Armazém</th><th>Código</th><th>Item</th><th>Qtd.</th></tr></thead><tbody>${tableRows}</tbody></table></div>
        ${rows.length > 20 ? '<p class="cdc-report-scope-note">A prévia mostra 20 linhas. O arquivo contém o resultado completo.</p>' : ''}`;
        root.querySelector('#cdc-report-download').disabled = false;
    }

    function applyPrefill(root) {
        var saved = null;
        try { saved = JSON.parse(sessionStorage.getItem('cdc_reports_prefill') || 'null'); } catch (error) {}
        if (!saved) return;
        sessionStorage.removeItem('cdc_reports_prefill');
        if (saved.group && root.querySelector('#cdc-report-group option[value="' + CSS.escape(saved.group) + '"]')) {
            root.querySelector('#cdc-report-scope').value = 'group';
            root.querySelector('#cdc-report-group').value = saved.group;
        } else if (saved.project && root.querySelector('#cdc-report-project option[value="' + CSS.escape(saved.project) + '"]')) {
            root.querySelector('#cdc-report-scope').value = 'project';
            root.querySelector('#cdc-report-project').value = saved.project;
        } else if (Array.isArray(saved.warehouses)) {
            saved.warehouses.forEach(function(name) {
                var input = Array.from(root.querySelectorAll('.cdc-report-warehouse-option input')).find(function(item) { return item.value === name; });
                if (input) input.checked = true;
            });
        }
        root.querySelector('#cdc-report-scope').dispatchEvent(new Event('change'));
    }

    function bind(root) {
        var scope = root.querySelector('#cdc-report-scope');
        scope.addEventListener('change', function() {
            root.querySelectorAll('[data-scope-panel]').forEach(function(panel) { panel.hidden = panel.dataset.scopePanel !== scope.value; });
            root.querySelector('#cdc-report-download').disabled = true;
        });
        root.querySelector('#cdc-report-search').addEventListener('input', function(event) {
            var term = event.target.value.trim().toLowerCase();
            root.querySelectorAll('.cdc-report-warehouse-option').forEach(function(item) { item.hidden = term && item.dataset.search.indexOf(term) === -1; });
        });
        root.querySelector('#cdc-report-toggle-all').addEventListener('click', function() {
            var visible = Array.from(root.querySelectorAll('.cdc-report-warehouse-option:not([hidden]) input'));
            var select = visible.some(function(input) { return !input.checked; });
            visible.forEach(function(input) { input.checked = select; });
        });
        root.querySelectorAll('[data-months]').forEach(function(button) {
            button.addEventListener('click', function() {
                var months = Number(button.dataset.months);
                var end = new Date();
                var start = new Date(end.getFullYear(), end.getMonth() - months + 1, 1);
                root.querySelector('#cdc-report-from').value = isoDate(start);
                root.querySelector('#cdc-report-to').value = isoDate(end);
                root.querySelectorAll('[data-months]').forEach(function(item) { item.classList.toggle('is-active', item === button); });
            });
        });
        root.querySelectorAll('input, select').forEach(function(input) {
            input.addEventListener('change', function() { root.querySelector('#cdc-report-download').disabled = true; });
        });
        root.querySelector('#cdc-report-preview').addEventListener('click', function() {
            var args = formArgs(root);
            var error = validateArgs(args);
            if (error) { frappe.msgprint({title: 'Revise o relatório', message: error, indicator: 'orange'}); return; }
            var result = root.querySelector('#cdc-report-result');
            result.innerHTML = '<p>Calculando a prévia com os dados oficiais...</p>';
            frappe.call({method: 'cdc_theme.reports.preview_stock_movement_report', args: args, freeze: true, freeze_message: 'Preparando prévia...', callback: function(response) {
                if (response && response.message) renderPreview(root, response.message);
            }, error: function() { result.innerHTML = '<p class="text-danger">Não foi possível montar a prévia.</p>'; }});
        });
        root.querySelector('#cdc-report-download').addEventListener('click', function() {
            var args = formArgs(root);
            var error = validateArgs(args);
            if (error) { frappe.msgprint(error); return; }
            args.file_format = root.querySelector('#cdc-report-format').value;
            var query = Object.keys(args).map(function(key) { return encodeURIComponent(key) + '=' + encodeURIComponent(args[key] || ''); }).join('&');
            window.location.href = '/api/method/cdc_theme.reports.download_stock_movement_report?' + query;
        });
        applyPrefill(root);
    }

    function render() {
        if (!isReportsRoute()) { removeDashboard(); return; }
        var claim = claimDashboard();
        if (!claim) return;
        claim.body.classList.add('cdc-custom-reports-active');
        if (claim.dashboard.dataset.loaded === '1') return;
        if (optionsCache) {
            claim.dashboard.innerHTML = buildShell(optionsCache);
            claim.dashboard.dataset.loaded = '1';
            claim.dashboard.dataset.loading = '0';
            bind(claim.dashboard);
            return;
        }
        if (optionsLoading) {
            if (claim.dashboard.dataset.loading !== '1') renderLoading(claim.dashboard);
            return;
        }
        requestOptions(claim);
    }

    function schedule() {
        timers.forEach(clearTimeout);
        timers = [0, 250, 800, 1600].map(function(delay) { return setTimeout(render, delay); });
    }

    $(document).ready(schedule);
    $(document).on('page-change', schedule);
    if (window.frappe && frappe.router && frappe.router.on) frappe.router.on('change', schedule);
})();
