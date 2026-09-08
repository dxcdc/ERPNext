import frappe


CANDIDATES = (
    ("2.06.01.001", "PROVITA", "PROVITA - C", "Prefixo legado e identificação observada no pedido."),
    ("2.06.01.003", "PROVITA", "PROVITA - C", "Compatibilidade com o prefixo legado 2.06."),
    ("2.07.01.001", "PPCAAM", "PPCAAM - C", "Compatibilidade com o prefixo legado 2.07."),
    ("2.09.01.001", "ATM II", "ATM II - C", "Compatibilidade com o de-para legado 02.09."),
    ("2.11.01.001", "PPVIDA", "PPVIDA - C", "Prefixo legado e identificação observada no pedido."),
    ("2.11.01.002", "PPVIDA", "PPVIDA - C", "Compatibilidade com o de-para legado 2.11."),
)


def execute():
    """Registra hipóteses para revisão sem ativar vínculos nem criar estoque."""
    doctype = "CDC ONGSYS Warehouse Mapping"
    frappe.reload_doc("cdc_theme", "doctype", "cdc_ongsys_warehouse_mapping", force=True)
    for code, description, warehouse, detail in CANDIDATES:
        if frappe.db.exists(doctype, code):
            continue
        frappe.get_doc({
            "doctype": doctype,
            "cost_center_code": code,
            "description": description,
            "warehouse": warehouse if frappe.db.exists("Warehouse", warehouse) else None,
            "status": "Revisão necessária",
            "enabled": 0,
            "validation_detail": detail,
            "source": "CSV legado",
            "notes": "Candidato cadastrado pelo inquérito das pendências; requer validação administrativa antes da ativação.",
        }).insert(ignore_permissions=True)
