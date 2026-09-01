app_name = "cdc_theme"
app_title = "CDC Custom Theme"
app_publisher = "CDC Org"
app_description = "CDC Custom Theme, Design Tokens, and Jinja2 Templates for NextERP"
app_email = "admin@cdc.org"
app_license = "mit"
app_version = "1.0.0"

# Global Assets Inclusions
app_include_css = "/assets/cdc_theme/css/cdc_theme.css?v=20260901_profile_guidance_v75"
app_include_js = [
    "/assets/cdc_theme/js/cdc_theme.js?v=20260901_access_matrix_v73",
    "/assets/cdc_theme/js/cdc_pending.js?v=20260829_attention_help_v60",
    "/assets/cdc_theme/js/cdc_tests.js?v=20260829_attention_help_v60",
    "/assets/cdc_theme/js/cdc_management.js?v=20260829_attention_help_v60",
    "/assets/cdc_theme/js/cdc_groups.js?v=20260829_attention_help_v60",
    "/assets/cdc_theme/js/cdc_items.js?v=20260829_attention_help_v60",
    "/assets/cdc_theme/js/cdc_warehouse.js?v=20260829_attention_help_v60",
    "/assets/cdc_theme/js/cdc_stock_routes.js?v=20260831_stock_warehouse_memory_v68",
    "/assets/cdc_theme/js/cdc_admin.js?v=20260829_attention_help_v60",
    "/assets/cdc_theme/js/cdc_reports.js?v=20260831_reports_loading_v71",
    "/assets/cdc_theme/js/cdc_access.js?v=20260901_profile_guidance_v75",
]

web_include_css = "/assets/cdc_theme/css/cdc_theme.css?v=20260901_profile_guidance_v75"
web_include_js = "/assets/cdc_theme/js/cdc_theme.js?v=20260901_access_matrix_v73"

favicon = "/assets/cdc_theme/images/favicon.png"
app_logo_url = "/assets/cdc_theme/images/cdc_logo.png"


override_whitelisted_methods = {
    "frappe.desk.desktop.get_desktop_page": "cdc_theme.api.custom_get_desktop_page"
}

before_request = [
    "cdc_theme.access_control.enforce_cdc_request_access",
    "cdc_theme.access_control.block_preview_mutations",
]

permission_query_conditions = {
    "Warehouse": "cdc_theme.permissions.warehouse_query",
    "User": "cdc_theme.permissions.user_query",
    "Stock Entry": "cdc_theme.permissions.stock_entry_query",
    "Bin": "cdc_theme.permissions.bin_query",
    "Stock Ledger Entry": "cdc_theme.permissions.stock_ledger_entry_query",
    "CDC ONGSYS Pending Order": "cdc_theme.permissions.deny_common_query",
    "User Permission": "cdc_theme.permissions.deny_common_query",
}

has_permission = {
    "Warehouse": "cdc_theme.permissions.warehouse_has_permission",
    "User": "cdc_theme.permissions.user_has_permission",
    "Stock Entry": "cdc_theme.permissions.stock_entry_has_permission",
    "Bin": "cdc_theme.permissions.bin_has_permission",
    "Stock Ledger Entry": "cdc_theme.permissions.stock_ledger_entry_has_permission",
    "CDC ONGSYS Pending Order": "cdc_theme.permissions.deny_common_has_permission",
    "User Permission": "cdc_theme.permissions.deny_common_has_permission",
}

# Fixtures — DocTypes customizados para exportacao/importacao. A fixture de
# Workspace herdada permanece versionada, mas nao e importada automaticamente:
# as workspaces CDC sao reconciliadas de forma idempotente pelo Terraform.

fixtures = [
    {"dt": "Custom DocType", "filters": [["module", "=", "cdc_theme"]]}
]

# Eventos de documento — notificacoes Mattermost por armazem
doc_events = {
    "*": {
        "before_insert": "cdc_theme.access_control.block_preview_document_write",
        "before_save": "cdc_theme.access_control.block_preview_document_write",
        "before_submit": "cdc_theme.access_control.block_preview_document_write",
        "before_cancel": "cdc_theme.access_control.block_preview_document_write",
        "on_trash": "cdc_theme.access_control.block_preview_document_write",
    },
    "Stock Entry": {
        "on_submit": "cdc_theme.api.notify_stock_entry_mattermost",
        "on_update_after_submit": "cdc_theme.api.notify_stock_entry_mattermost",
    }
}


doctype_js = {
    "CDC Mattermost Config": "cdc_theme/doctype/cdc_mattermost_config/cdc_mattermost_config.js"
}
