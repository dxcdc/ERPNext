(function() {
    'use strict';

    function normalize(value) {
        return decodeURIComponent(String(value || '')).toLowerCase().normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
    }

    function isGroupsRoute() {
        var route = window.frappe && frappe.get_route ? frappe.get_route() : [];
        return normalize(window.location.pathname) === '/app/cdc-grupos' ||
            (route || []).some(function(part) { return normalize(part) === 'cdc-grupos'; });
    }

    function removeDashboard() {
        document.querySelectorAll('#cdc-groups-dashboard').forEach(function(dashboard) { dashboard.remove(); });
        document.querySelectorAll('.layout-main-section, .workspace-page-content').forEach(function(element) {
            element.classList.remove('cdc-custom-groups-active');
        });
    }

    function render() {
        if (!isGroupsRoute()) { removeDashboard(); return; }
        var claim = window._cdc_claim_active_dashboard && window._cdc_claim_active_dashboard('cdc-groups-dashboard', 'section');
        if (!claim) return;
        var body = claim.body;
        var dashboard = claim.dashboard;
        body.classList.add('cdc-custom-groups-active');
        if (dashboard.dataset.loaded === '1') return;
        dashboard.dataset.loaded = '1';
        dashboard.innerHTML = `
            ${window._cdc_get_breadcrumb_html ? window._cdc_get_breadcrumb_html('Grupos', 'Atalho do Catálogo') : ''}
            <div class="cdc-groups-shell">
                <section class="cdc-groups-hero">
                    <div class="cdc-groups-icon" aria-hidden="true">🏷️</div>
                    <div>
                        <span class="cdc-quality-eyebrow">Catálogo de estoque</span>
                        <h1>CDC Grupos</h1>
                        <p>Acesso rápido à lista oficial de Grupos de Itens do ERPNext, com cards, pesquisa e filtros.</p>
                    </div>
                    <button type="button" class="btn btn-primary" data-cdc-open-item-groups>Abrir Grupos de Itens</button>
                </section>
                <div class="cdc-groups-benefits">
                    <article><span>01</span><strong>Lista oficial</strong><p>Use edição, visualizações e permissões nativas do ERPNext.</p></article>
                    <article><span>02</span><strong>Indicadores</strong><p>Consulte categorias, produtos, saldo e grupos críticos.</p></article>
                    <article><span>03</span><strong>Filtros rápidos</strong><p>Pesquise por nome, grupo pai e tipo sem duplicar cadastros.</p></article>
                </div>
                <div class="cdc-groups-callout"><strong>Fonte única de dados</strong><span>Nenhum grupo é copiado para esta página; o botão abre diretamente <code>/app/item-group</code>.</span></div>
            </div>`;
    }

    $(document).on('click', '[data-cdc-open-item-groups]', function() {
        frappe.set_route('List', 'Item Group', 'List');
    });
    function schedule() {
        [0, 200, 700].forEach(function(delay) { setTimeout(render, delay); });
    }
    $(document).ready(schedule);
    $(document).on('page-change', schedule);
    if (window.frappe && frappe.router && frappe.router.on) frappe.router.on('change', schedule);
})();
