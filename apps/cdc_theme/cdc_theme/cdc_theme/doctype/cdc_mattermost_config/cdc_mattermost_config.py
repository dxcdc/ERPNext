import frappe
from frappe.model.document import Document


class CDCMattermostConfig(Document):

    def validate(self):
        if not self.webhook_url:
            frappe.throw("A URL do Webhook é obrigatória.")
        if not (self.notify_entry or self.notify_exit or self.notify_transfer):
            frappe.throw("Selecione ao menos um tipo de evento para notificar.")

    def on_update(self):
        """Ao salvar o formulário, se a integração estiver ativa, envia notificação de confirmação ao Mattermost."""
        if self.enabled:
            self.test_connection(auto_save=True)

    @frappe.whitelist()
    def test_connection(self, auto_save=False):
        """Envia uma mensagem de teste/feedback ao canal Mattermost configurado."""
        import requests
        from frappe.utils import now_datetime, format_datetime

        now_str = format_datetime(now_datetime(), "dd/MM/yyyy HH:mm:ss")
        channel = self.channel_name or self.warehouse

        header_text = "🔄 **Notificação de Configuração — CDC NextERP**" if auto_save else "✅ **Teste de Conexão — CDC NextERP**"

        payload = {
            "text": (
                f"{header_text}\n"
                f"O canal **{channel}** foi ativado/atualizado com sucesso no ERPNext para o armazém **{self.warehouse}** em **{now_str}**.\n"
                "As movimentações de estoque registradas para este armazém serão notificadas aqui automaticamente."
            )
        }

        try:
            url = self.get_password("webhook_url")
            if not url:
                return
            resp = requests.post(url, json=payload, timeout=8)
            if resp.status_code == 200:
                # Registra evento detalhado na seção de Atividade do formulário
                self.add_comment(
                    "Comment",
                    f"✅ <b>Integração Conectada com Sucesso!</b><br>"
                    f"• <b>Canal:</b> {channel}<br>"
                    f"• <b>Armazém:</b> {self.warehouse}<br>"
                    f"• <b>Data/Hora:</b> {now_str}<br>"
                    f"• <b>Resposta HTTP:</b> 200 OK (Mensagem entregue)"
                )

                frappe.msgprint(
                    msg=(
                        f"<div style='font-size:14px; line-height:1.6; padding: 4px;'>"
                        f"🎉 <b>INTEGRAÇÃO CONECTADA COM SUCESSO!</b><br><br>"
                        f"✅ <b>Status da Conexão:</b> <span style='color:green; font-weight:bold;'>HTTP 200 OK (Ativa)</span><br>"
                        f"📍 <b>Armazém Mapeado:</b> {self.warehouse}<br>"
                        f"💬 <b>Canal Mattermost:</b> {channel}<br>"
                        f"🕒 <b>Confirmado em:</b> {now_str}<br><br>"
                        f"<i>Sua mensagem de teste já foi entregue no seu chat do Mattermost!</i>"
                        f"</div>"
                    ),
                    title="✅ Sucesso — Mattermost Operacional",
                    indicator="green"
                )
            else:
                self.add_comment(
                    "Comment",
                    f"⚠️ <b>Alerta no Teste do Mattermost:</b><br>"
                    f"O servidor respondeu com status <b>{resp.status_code}</b>: {resp.text}"
                )
                frappe.msgprint(
                    f"⚠️ O Mattermost respondeu com status {resp.status_code}: {resp.text}",
                    title="Aviso Mattermost",
                    indicator="orange"
                )
        except Exception as e:
            self.add_comment(
                "Comment",
                f"❌ <b>Erro de Conexão com o Mattermost:</b><br>{str(e)}"
            )
            frappe.msgprint(
                f"❌ Erro ao conectar com o Mattermost: {str(e)}",
                title="Falha na Conexão",
                indicator="red"
            )
