app_name = "cdc_theme"
app_title = "CDC Custom Theme"
app_publisher = "CDC Org"
app_description = "CDC Custom Theme, Design Tokens, and Jinja2 Templates for NextERP"
app_email = "admin@cdc.org"
app_license = "mit"
app_version = "1.0.0"

# Global Assets Inclusions com Cache Busting Version Query
app_include_css = "/assets/cdc_theme/css/cdc_theme.css?v=20260730_v9"
app_include_js = "/assets/cdc_theme/js/cdc_theme.js?v=20260730_v9"

web_include_css = "/assets/cdc_theme/css/cdc_theme.css?v=20260730_v9"
web_include_js = "/assets/cdc_theme/js/cdc_theme.js?v=20260730_v9"





# Fixtures — DocTypes e Workspaces customizados para exportacao/importacao automatica no bench migrate
fixtures = [
    {"dt": "Workspace", "filters": [["name", "in", ["Stock", "Estoque"]]]}
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
