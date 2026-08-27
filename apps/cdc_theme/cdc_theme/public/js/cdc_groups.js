(function() {
    'use strict';

    var renderTimer;
    var OPTIONS = {page: 'groups', dashboardId: 'cdc-groups-dashboard', activeClass: 'cdc-custom-groups-active'};

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
        if (typeof window._cdc_remove_management_dashboard === 'function') window._cdc_remove_management_dashboard(OPTIONS);
    }

    function render() {
        if (!isGroupsRoute()) { removeDashboard(); return; }
        if (typeof window._cdc_render_management_dashboard === 'function') window._cdc_render_management_dashboard(OPTIONS);
    }

    function schedule() {
        if (renderTimer) clearTimeout(renderTimer);
        renderTimer = setTimeout(render, 120);
    }

    $(document).ready(schedule);
    $(document).on('page-change', schedule);
    if (window.frappe && frappe.router && frappe.router.on) frappe.router.on('change', schedule);
})();
