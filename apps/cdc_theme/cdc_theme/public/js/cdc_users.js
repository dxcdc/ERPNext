(function() {
    'use strict';

    var observer;
    var observerTimeout;
    var renderTimer;

    function normalizeRoute(value) {
        return decodeURIComponent(String(value || '')).toLowerCase().normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
    }

    function isUsersRoute() {
        var route = window.frappe && frappe.get_route ? frappe.get_route() : [];
        if (route && route.length) {
            return route.map(normalizeRoute).some(function(part) {
                return part === 'cdc-usuarios' || part === 'usuarios';
            });
        }
        return normalizeRoute(window.location.pathname).indexOf('/app/cdc-usuarios') !== -1;
    }

    function requestRender() {
        if (!isUsersRoute()) return;
        window.clearTimeout(renderTimer);
        renderTimer = window.setTimeout(function() {
            if (typeof window._cdc_render_users_dashboard === 'function') {
                window._cdc_render_users_dashboard();
            }
            var dashboard = document.getElementById('cdc-users-dashboard');
            if (dashboard && dashboard.dataset.loaded === '1') stopObserver();
        }, 40);
    }

    function stopObserver() {
        if (observer) observer.disconnect();
        observer = null;
        window.clearTimeout(observerTimeout);
    }

    function startObserver() {
        stopObserver();
        if (!isUsersRoute() || !document.body) return;
        observer = new MutationObserver(requestRender);
        observer.observe(document.body, {childList: true, subtree: true});
        observerTimeout = window.setTimeout(stopObserver, 15000);
        requestRender();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserver, {once: true});
    } else {
        startObserver();
    }

    window.addEventListener('hashchange', startObserver);
    document.addEventListener('page-change', startObserver);
    if (window.frappe && frappe.router && frappe.router.on) {
        frappe.router.on('change', startObserver);
    }
})();
