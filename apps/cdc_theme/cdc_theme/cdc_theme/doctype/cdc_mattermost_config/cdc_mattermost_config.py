import frappe
from frappe.model.document import Document


class CDCMattermostConfig(Document):

    def validate(self):
        if not self.webhook_url:
            frappe.throw("A URL do Webhook é obrigatória.")
        if not (self.notify_entry or self.notify_exit or self.notify_update):
            frappe.throw("Selecione ao menos um tipo de evento para notificar.")

    @frappe.whitelist()
    def test_connection(self):
        """Envia uma mensagem de teste ao canal Mattermost configurado."""
        import requests

        payload = {
            "text": (
                "✅ **Teste de Conexão — CDC NextERP**\n"
                f"Canal **{self.channel_name}** configurado com sucesso para o armazém **{self.warehouse}**.\n"
                "As notificações de estoque serão enviadas para este canal."
            )
        }

        try:
            url = self.get_password("webhook_url")
            resp = requests.post(url, json=payload, timeout=8)
            if resp.status_code == 200:
                frappe.msgprint(
                    f"✅ Mensagem de teste enviada com sucesso para <b>{self.channel_name}</b>!",
                    title="Conexão OK",
                    indicator="green"
                )
            else:
                frappe.msgprint(
                    f"⚠️ O Mattermost respondeu com status {resp.status_code}: {resp.text}",
                    title="Aviso",
                    indicator="orange"
                )
        except Exception as e:
            frappe.msgprint(
                f"❌ Erro ao conectar: {str(e)}",
                title="Falha na Conexão",
                indicator="red"
            )
