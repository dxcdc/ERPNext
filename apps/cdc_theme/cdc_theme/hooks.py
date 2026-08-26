app_name = "cdc_theme"
app_title = "CDC Custom Theme"
app_publisher = "CDC Org"
app_description = "CDC Custom Theme, Design Tokens, and Jinja2 Templates for NextERP"
app_email = "admin@cdc.org"
app_license = "mit"
app_version = "1.0.0"

# Global Assets Inclusions
app_include_css = "/assets/cdc_theme/css/cdc_theme.css?v=20260826_theme_gate_v17"
app_include_js = [
    "/assets/cdc_theme/js/cdc_theme.js?v=20260826_theme_gate_v17",
    "/assets/cdc_theme/js/cdc_pending.js?v=20260826_theme_gate_v17",
    "/assets/cdc_theme/js/cdc_tests.js?v=20260826_theme_gate_v17",
    "/assets/cdc_theme/js/cdc_groups.js?v=20260826_theme_gate_v17",
    "/assets/cdc_theme/js/cdc_items.js?v=20260826_theme_gate_v17",
    "/assets/cdc_theme/js/cdc_admin.js?v=20260826_theme_gate_v17",
]

web_include_css = "/assets/cdc_theme/css/cdc_theme.css?v=20260826_theme_gate_v17"
web_include_js = "/assets/cdc_theme/js/cdc_theme.js?v=20260826_theme_gate_v17"

favicon = "/assets/cdc_theme/images/favicon.png"
app_logo_url = "/assets/cdc_theme/images/cdc_logo.png"


override_whitelisted_methods = {
    "frappe.desk.desktop.get_desktop_page": "cdc_theme.api.custom_get_desktop_page"
}

# Fixtures — DocTypes customizados para exportacao/importacao. A fixture de
# Workspace herdada permanece versionada, mas nao e importada automaticamente:
# as quatro workspaces CDC sao reconciliadas de forma idempotente pelo Terraform.

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
