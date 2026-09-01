import frappe
from frappe.model.document import Document
from frappe.utils import getdate, now_datetime

from cdc_theme.access_control import (
    ACTIONS,
    PAGE_CATALOG,
    audit_event,
    normalize_action,
    normalize_page_key,
)


class CDCAccessException(Document):
    def validate(self):
        self._validate_subject()
        self.page_key = normalize_page_key(self.page_key)
        if not PAGE_CATALOG[self.page_key].get("exception_grantable", True):
            frappe.throw("Esta página permanece exclusiva de System Manager e não aceita exceções.")
        if self.effect not in {"Allow", "Block"}:
            frappe.throw("Efeito de exceção inválido.")
        self._validate_actions()
        self._validate_warehouses()
        self._validate_period()
        self.justification = str(self.justification or "").strip()
        if len(self.justification) < 8:
            frappe.throw("Informe uma justificativa com pelo menos 8 caracteres.")
        if self.effect == "Block" and self.user and "System Manager" in frappe.get_roles(self.user):
            frappe.throw("O acesso de um System Manager não pode ser bloqueado por esta camada.")
        self.approved_by = frappe.session.user
        self.approved_at = now_datetime()

    def _validate_subject(self):
        if self.subject_type == "User":
            if not self.user:
                frappe.throw("Selecione o usuário da exceção.")
            self.role_profile = None
        elif self.subject_type == "Role Profile":
            if not self.role_profile:
                frappe.throw("Selecione o perfil/cargo da exceção.")
            self.user = None
        else:
            frappe.throw("Tipo de destinatário inválido.")

    def _validate_actions(self):
        if self.all_actions:
            return
        selected = []
        for row in self.actions or []:
            row.action = normalize_action(row.action, self.page_key)
            selected.append(row.action)
        if not selected:
            frappe.throw("Selecione ao menos uma ação ou marque todas as ações.")
        if len(selected) != len(set(selected)):
            frappe.throw("Não repita ações na mesma exceção.")

    def _validate_warehouses(self):
        if self.all_warehouses:
            return
        selected = [row.warehouse for row in (self.warehouses or []) if row.warehouse]
        if not selected:
            frappe.throw("Selecione ao menos um armazém ou use todo o escopo autorizado.")
        if len(selected) != len(set(selected)):
            frappe.throw("Não repita armazéns na mesma exceção.")

    def _validate_period(self):
        if self.valid_from and self.valid_until and getdate(self.valid_from) > getdate(self.valid_until):
            frappe.throw("A data inicial não pode ser posterior à data final.")

    def after_insert(self):
        audit_event(
            "Exception created", self.as_dict(), self.name, self.user, self.role_profile,
        )

    def on_update(self):
        if self.flags.in_insert:
            return
        before = self.get_doc_before_save()
        audit_event(
            "Exception updated",
            {"before": before.as_dict() if before else {}, "after": self.as_dict()},
            self.name, self.user, self.role_profile,
        )

    def on_trash(self):
        frappe.throw("Exceções devem ser desativadas para preservar o histórico.")
