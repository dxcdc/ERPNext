import frappe


COST_CENTER = "1.02.01.001"
WAREHOUSE = "INSTITUCIONAL - C"


def execute():
    if not frappe.db.exists("Warehouse", WAREHOUSE):
        frappe.throw(f"Armazém obrigatório ausente: {WAREHOUSE}")

    values = {
        "description": "INSTITUCIONAL",
        "warehouse": WAREHOUSE,
        "status": "Ativo automático",
        "enabled": 1,
        "evidence_order_id": "3051",
        "confidence": 100,
        "validation_detail": "Pedido 3051 finalizado no Core com destino institucional confirmado.",
        "activation_mode": "Migração versionada",
        "evidence_found_at": frappe.utils.now_datetime(),
        "source": "ONGSYS",
        "verified_by": "Administrator",
        "verified_at": frappe.utils.now_datetime(),
        "notes": "Alias operacional observado para o centro institucional.",
    }
    name = frappe.db.exists("CDC ONGSYS Warehouse Mapping", COST_CENTER)
    if name:
        frappe.db.set_value("CDC ONGSYS Warehouse Mapping", name, values, update_modified=False)
        return
    frappe.get_doc({
        "doctype": "CDC ONGSYS Warehouse Mapping",
        "cost_center_code": COST_CENTER,
        **values,
    }).insert(ignore_permissions=True)
