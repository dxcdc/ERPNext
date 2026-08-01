app_name = "cdc_theme"
app_title = "CDC Custom Theme"
app_publisher = "CDC Org"
app_description = "CDC Custom Theme, Design Tokens, and Jinja2 Templates for NextERP"
app_email = "admin@cdc.org"
app_license = "mit"
app_version = "1.0.0"

# Global Assets Inclusions com Cache Busting Version Query
app_include_css = "/assets/cdc_theme/css/cdc_theme.css?v=20260801_v151"
app_include_js = [
    "/assets/cdc_theme/js/cdc_theme.js?v=20260801_v151",
    "/assets/cdc_theme/js/cdc_users.js?v=20260801_v151",
    "/assets/cdc_theme/js/cdc_pending.js?v=20260801_v151",
]

web_include_css = "/assets/cdc_theme/css/cdc_theme.css?v=20260801_v151"
web_include_js = "/assets/cdc_theme/js/cdc_theme.js?v=20260801_v151"












override_whitelisted_methods = {
    "frappe.desk.desktop.get_desktop_page": "cdc_theme.api.custom_get_desktop_page"
}

# Fixtures — DocTypes customizados para exportacao/importacao

fixtures = [
    {"dt": "Custom DocType", "filters": [["module", "=", "cdc_theme"]]}
]

# Eventos de documento — notificacoes Mattermost por armazem
doc_events = {
    "Stock Entry": {
        "on_submit": "cdc_theme.api.notify_stock_entry_mattermost",
        "on_update_after_submit": "cdc_theme.api.notify_stock_entry_mattermost",
    }
}


doctype_js = {
    "CDC Mattermost Config": "cdc_theme/doctype/cdc_mattermost_config/cdc_mattermost_config.js"
}
