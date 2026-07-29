import frappe
from frappe.model.document import Document


class CDCMattermostConfig(Document):

    def validate(self):
        if not self.webhook_url:
            frappe.throw("A URL do Webhook é obrigatória.")
        if not (self.notify_entry or self.notify_exit or self.notify_update):
            frappe.throw("Selecione ao menos um tipo de evento para notificar.")

    def on_update(self):
        """Ao salvar o formulário, se a integração estiver ativa, envia notificação de confirmação ao Mattermost."""
        if self.enabled:
            self.test_connection(auto_save=True)

    @frappe.whitelist()
    def test_connection(self, auto_save=False):
        """Envia uma mensagem de teste/feedback ao canal Mattermost configurado."""
        import requests

        header_text = "🔄 **Notificação de Configuração — CDC NextERP**" if auto_save else "✅ **Teste de Conexão — CDC NextERP**"

        payload = {
            "text": (
                f"{header_text}\n"
                f"O canal **{self.channel_name or 'Configurado'}** foi ativado/atualizado com sucesso no ERPNext para o armazém **{self.warehouse}**.\n"
                "As movimentações de estoque registradas para este armazém serão notificadas aqui automaticamente."
            )
        }

        try:
            url = self.get_password("webhook_url")
            if not url:
                return
            resp = requests.post(url, json=payload, timeout=8)
            if resp.status_code == 200:
                frappe.msgprint(
                    f"✅ Conexão ativada! Mensagem de feedback enviada com sucesso ao canal <b>{self.channel_name or self.warehouse}</b> no Mattermost.",
                    title="Mattermost Conectado",
                    indicator="green"
                )
            else:
                frappe.msgprint(
                    f"⚠️ O Mattermost respondeu com status {resp.status_code}: {resp.text}",
                    title="Aviso Mattermost",
                    indicator="orange"
                )
        except Exception as e:
            frappe.msgprint(
                f"❌ Erro ao conectar com o Mattermost: {str(e)}",
                title="Falha na Conexão",
                indicator="red"
            )
