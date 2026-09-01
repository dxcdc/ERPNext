import frappe
from frappe.model.document import Document


class CDCAccessAuditLog(Document):
    def validate(self):
        if not self.is_new():
            frappe.throw("O histórico de acesso é imutável.")

    def on_trash(self):
        frappe.throw("O histórico de acesso não pode ser excluído.")
