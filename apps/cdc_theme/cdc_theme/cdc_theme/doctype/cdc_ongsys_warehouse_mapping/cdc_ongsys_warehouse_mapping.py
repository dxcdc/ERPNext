import frappe
from frappe.model.document import Document


class CDCONGSYSWarehouseMapping(Document):
    def validate(self):
        self.cost_center_code = (self.cost_center_code or "").strip()
        if not self.cost_center_code:
            frappe.throw("Informe o código do centro de custo.")
        if self.status == "Ativo":
            if not self.warehouse:
                frappe.throw("Selecione um armazém antes de ativar o mapeamento.")
            warehouse = frappe.db.get_value("Warehouse", self.warehouse, ["is_group", "disabled"], as_dict=True)
            if not warehouse or warehouse.is_group or warehouse.disabled:
                frappe.throw("O armazém precisa existir, ser operacional e estar ativo.")
            if not self.verified_by or not self.verified_at:
                frappe.throw("Valide o mapeamento antes de ativá-lo.")

