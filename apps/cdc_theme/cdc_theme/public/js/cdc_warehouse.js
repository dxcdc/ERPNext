(function() {
    'use strict';

    function normalize(value) {
        return decodeURIComponent(String(value || '')).toLowerCase().normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
    }

    function isWarehouseShortcutRoute() {
        var route = window.frappe && frappe.get_route ? frappe.get_route() : [];
        return normalize(window.location.pathname) === '/app/cdc-armazem' ||
            (route || []).some(function(part) { return normalize(part) === 'cdc-armazem'; });
    }

    function removeDashboard() {
        document.querySelectorAll('#cdc-warehouse-shortcut-dashboard').forEach(function(dashboard) { dashboard.remove(); });
        document.querySelectorAll('.layout-main-section, .workspace-page-content').forEach(function(element) {
            element.classList.remove('cdc-custom-warehouse-shortcut-active');
        });
    }

    function render() {
        if (!isWarehouseShortcutRoute()) { removeDashboard(); return; }
        var claim = window._cdc_claim_active_dashboard && window._cdc_claim_active_dashboard('cdc-warehouse-shortcut-dashboard', 'section');
        if (!claim) return;
        var body = claim.body;
        var dashboard = claim.dashboard;
        body.classList.add('cdc-custom-warehouse-shortcut-active');
        if (dashboard.dataset.loaded === '1') return;
        dashboard.dataset.loaded = '1';
        dashboard.innerHTML = `
            ${window._cdc_get_breadcrumb_html ? window._cdc_get_breadcrumb_html('Armazéns', 'Atalho de Armazéns') : ''}
            <div class="cdc-groups-shell">
                <section class="cdc-groups-hero cdc-warehouse-shortcut-hero">
                    <div class="cdc-groups-icon cdc-warehouse-shortcut-icon" aria-hidden="true">🏭</div>
                    <div>
                        <span class="cdc-quality-eyebrow">Estrutura de estoque</span>
                        <h1>CDC Armazém</h1>
                        <p>Acesso rápido à lista oficial de Armazéns do ERPNext, com cards, pesquisa, filtros de contexto e permissões nativas.</p>
                    </div>
                    <button type="button" class="btn btn-primary" data-cdc-open-warehouses>Abrir Armazéns</button>
                </section>
                <div class="cdc-groups-benefits">
                    <article><span>01</span><strong>Estrutura oficial</strong><p>Consulte grupos e armazéns operacionais diretamente na fonte oficial do ERPNext.</p></article>
                    <article><span>02</span><strong>Filtros de contexto</strong><p>Localize registros por projeto, empresa, status, tipo, grupo pai, nome ou código.</p></article>
                    <article><span>03</span><strong>Permissões preservadas</strong><p>Cada usuário visualiza somente os armazéns autorizados pelas permissões do ERPNext.</p></article>
                </div>
                <div class="cdc-groups-callout"><strong>Fonte única de dados</strong><span>Nenhum armazém é copiado para esta página; o botão abre diretamente <code>/app/warehouse?disabled=0&amp;company=CDC</code>.</span></div>
            </div>`;
    }

    $(document).on('click', '[data-cdc-open-warehouses]', function() {
        frappe.set_route('List', 'Warehouse', 'List', {disabled: 0, company: 'CDC'});
    });
    function schedule() {
        [0, 200, 700].forEach(function(delay) { setTimeout(render, delay); });
    }
    $(document).ready(schedule);
    $(document).on('page-change', schedule);
    if (window.frappe && frappe.router && frappe.router.on) frappe.router.on('change', schedule);
})();
