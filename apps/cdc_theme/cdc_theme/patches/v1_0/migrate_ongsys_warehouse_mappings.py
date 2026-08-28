import frappe


LEGACY_MAPPINGS = (
    ("01.02.01", "INSTITUCIONAL"),
    ("2.13.01.001", "CAB ATITUDE - ANT"), ("2.13.01.002", "CAB ATITUDE - BREVE"), ("2.13.01.003", "CAB ATITUDE - INT"),
    ("2.13.02.001", "CAR ATITUDE - ANT"), ("2.13.02.002", "CAR ATITUDE - BREVE"), ("2.13.02.003", "CAR ATITUDE - INT"),
    ("2.13.03.001", "JAB ATITUDE - ANT"), ("2.13.03.002", "JAB ATITUDE - BREVE"), ("2.13.03.003", "JAB ATITUDE - INT"),
    ("2.13.04.001", "REC ATITUDE - ANT"), ("2.13.04.002", "REC ATITUDE - BREVE"), ("2.13.04.003", "REC ATITUDE - INT"),
    ("2.14.01.001", "LONGEVIDADE E ARTICULAÇÃO"), ("2.06.01.002", "PROVITA"), ("2.07.01.003", "PPCAAM"),
    ("02.08", "BEM VIVER OLINDA"), ("2.08.01.002", "PPDPI"), ("02.09", "ATM II"),
    ("2.10", "MAIS VIDA"), ("2.11", "PPVIDA"), ("2.12", "PVT PERMUTADOS"),
    ("3.01.01.001", "CAB ATITUDE II.I - DESPESAS DIRETAS - ANT"), ("3.01.01.002", "CAB ATITUDE II.I - DESPESAS DIRETAS - BREVE"),
    ("3.01.01.003", "CAB ATITUDE II.I - DESPESAS DIRETAS - INT"), ("3.01.01.004", "CAB ATITUDE II.I - DESPESAS DIRETAS"),
    ("3.02.01.001", "CAR ATITUDE II.I - DESPESAS DIRETAS - ANT"), ("3.02.01.002", "CAR ATITUDE II.I - DESPESAS DIRETAS - BREVE"),
    ("3.02.01.003", "CAR ATITUDE II.I - DESPESAS DIRETAS - INT"), ("3.02.01.004", "CAR ATITUDE II.I - DESPESAS DIRETAS"),
    ("3.03.01.001", "JAB ATITUDE II.I - DESPESAS DIRETAS - ANT"), ("3.03.01.002", "JAB ATITUDE II.I - DESPESAS DIRETAS - BREVE"),
    ("3.03.01.003", "JAB ATITUDE II.I - DESPESAS DIRETAS - INT"), ("3.03.01.004", "JAB ATITUDE II.I - DESPESAS DIRETAS"),
    ("3.04.01.001", "REC ATITUDE II.I - DESPESAS DIRETAS - ANT"), ("3.04.01.002", "REC ATITUDE II.I - DESPESAS DIRETAS - BREVE"),
    ("3.04.01.003", "REC ATITUDE II.I - DESPESAS DIRETAS - INT"), ("3.04.01.004", "REC ATITUDE II.I - DESPESAS DIRETAS"),
    ("2.17.01.001", "CAIS OLINDA"), ("2.18.01.001", "TRANSFORMACAO DIGITAL"),
)


def execute():
    doctype = "CDC ONGSYS Warehouse Mapping"
    frappe.reload_doc("cdc_theme", "doctype", "cdc_ongsys_warehouse_mapping", force=True)
    for code, warehouse_name in LEGACY_MAPPINGS:
        if frappe.db.exists(doctype, code):
            continue
        warehouse = f"{warehouse_name} - C"
        warehouse_exists = frappe.db.exists("Warehouse", warehouse)
        is_cais = code == "2.17.01.001" and warehouse_exists
        doc = frappe.get_doc({
            "doctype": doctype, "cost_center_code": code,
            "description": warehouse_name, "warehouse": warehouse if warehouse_exists else None,
            "status": "Validado" if is_cais else "Pendente", "enabled": 0,
            "evidence_order_id": "3089" if is_cais else None,
            "source": "CSV legado",
            "verified_by": "Administrator" if is_cais else None,
            "verified_at": frappe.utils.now_datetime() if is_cais else None,
            "notes": "Migrado do de-para operacional; requer revisão administrativa antes da ativação.",
        })
        doc.insert(ignore_permissions=True)
