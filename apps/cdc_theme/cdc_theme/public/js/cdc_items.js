(function() {
    'use strict';

    function normalize(value) {
        return decodeURIComponent(String(value || '')).toLowerCase().normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
    }

    function isItemsRoute() {
        var route = window.frappe && frappe.get_route ? frappe.get_route() : [];
        return normalize(window.location.pathname) === '/app/cdc-itens' ||
            (route || []).some(function(part) { return normalize(part) === 'cdc-itens'; });
    }

    function removeDashboard() {
        var dashboard = document.getElementById('cdc-items-dashboard');
        if (dashboard) dashboard.remove();
        document.querySelectorAll('.layout-main-section, .workspace-page-content').forEach(function(element) {
            element.classList.remove('cdc-custom-items-active');
        });
    }

    function render() {
        if (!isItemsRoute()) { removeDashboard(); return; }
        var body = document.querySelector('.layout-main-section') || document.querySelector('.workspace-page-content');
        if (!body) return;
        var dashboard = document.getElementById('cdc-items-dashboard') || document.createElement('section');
        dashboard.id = 'cdc-items-dashboard';
        if (!dashboard.parentNode) body.insertBefore(dashboard, body.firstChild);
        body.classList.add('cdc-custom-items-active');
        if (dashboard.dataset.loaded === '1') return;
        dashboard.dataset.loaded = '1';
        dashboard.innerHTML = `
            ${window._cdc_get_breadcrumb_html ? window._cdc_get_breadcrumb_html('Itens', 'Atalho do Catálogo') : ''}
            <div class="cdc-groups-shell">
                <section class="cdc-groups-hero cdc-items-hero">
                    <div class="cdc-groups-icon cdc-items-icon" aria-hidden="true">📦</div>
                    <div>
                        <span class="cdc-quality-eyebrow">Catálogo de estoque</span>
                        <h1>CDC Itens</h1>
                        <p>Acesso rápido à lista oficial de Itens do ERPNext, preservando pesquisa, filtros e permissões nativas.</p>
                    </div>
                    <button type="button" class="btn btn-primary" data-cdc-open-items>Abrir Itens</button>
                </section>
                <div class="cdc-groups-benefits">
                    <article><span>01</span><strong>Cadastro oficial</strong><p>Consulte e edite os itens diretamente na fonte oficial do ERPNext.</p></article>
                    <article><span>02</span><strong>Pesquisa rápida</strong><p>Localize itens por código, nome, grupo e demais filtros disponíveis.</p></article>
                    <article><span>03</span><strong>Permissões preservadas</strong><p>Cada usuário acessa somente as operações autorizadas pelo ERPNext.</p></article>
                </div>
                <div class="cdc-groups-callout"><strong>Fonte única de dados</strong><span>Nenhum item é copiado para esta página; o botão abre diretamente <code>/app/item</code>.</span></div>
            </div>`;
    }

    $(document).on('click', '[data-cdc-open-items]', function() {
        frappe.set_route('List', 'Item', 'List');
    });
    function schedule() {
        [0, 200, 700].forEach(function(delay) { setTimeout(render, delay); });
    }
    $(document).ready(schedule);
    $(document).on('page-change', schedule);
    if (window.frappe && frappe.router && frappe.router.on) frappe.router.on('change', schedule);
})();
