(function() {
    'use strict';

    var renderTimers = [];
    var OPTIONS = {page: 'warehouses', dashboardId: 'cdc-warehouse-shortcut-dashboard', activeClass: 'cdc-custom-warehouse-shortcut-active'};

    function normalize(value) {
        return decodeURIComponent(String(value || '')).toLowerCase().normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
    }

    function isWarehouseShortcutRoute() {
        var route = window.frappe && frappe.get_route ? frappe.get_route() : [];
        var pathname = normalize(window.location.pathname);
        return pathname === '/app/cdc-armazem' || pathname === '/app/cdc-armazemo' ||
            (route || []).some(function(part) {
                var normalized = normalize(part);
                return normalized === 'cdc-armazem' || normalized === 'cdc-armazemo';
            });
    }

    function removeDashboard() {
        if (typeof window._cdc_remove_management_dashboard === 'function') window._cdc_remove_management_dashboard(OPTIONS);
    }

    function render() {
        if (!isWarehouseShortcutRoute()) { removeDashboard(); return; }
        if (typeof window._cdc_render_management_dashboard === 'function') window._cdc_render_management_dashboard(OPTIONS);
    }

    function schedule() {
        renderTimers.forEach(clearTimeout);
        renderTimers = [0, 250, 800, 1600].map(function(delay) { return setTimeout(render, delay); });
    }

    $(document).ready(schedule);
    $(document).on('page-change', schedule);
    if (window.frappe && frappe.router && frappe.router.on) frappe.router.on('change', schedule);
})();
