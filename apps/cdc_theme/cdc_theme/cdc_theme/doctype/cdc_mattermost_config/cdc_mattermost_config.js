frappe.ui.form.on('CDC Mattermost Config', {
    refresh: function(frm) {
        if (!frm.is_new() && frm.doc.enabled) {
            var channel = frm.doc.channel_name || frm.doc.warehouse;
            frm.dashboard.set_headline_alert(
                '🟢 <b>Integração Ativa & Operacional:</b> Notificações configuradas para o armazém <b>' + 
                frappe.utils.escape_html(frm.doc.warehouse) + '</b> no canal <b>' + 
                frappe.utils.escape_html(channel) + '</b>.', 
                'green'
            );
        } else if (!frm.is_new() && !frm.doc.enabled) {
            frm.dashboard.set_headline_alert(
                '🟡 <b>Integração Pausada:</b> Marque a caixa "Ativo" para habilitar os alertas neste armazém.', 
                'orange'
            );
        }

        frm.add_custom_button(__('🧪 Testar Conexão'), function() {
            if (!frm.doc.webhook_url) {
                frappe.msgprint(__('Por favor, preencha a URL do Webhook antes de testar.'), __('Aviso'), 'orange');
                return;
            }
            frappe.call({
                method: 'test_connection',
                doc: frm.doc,
                freeze: true,
                freeze_message: __('Enviando mensagem de teste ao Mattermost...'),
                callback: function(r) {
                    frm.reload_doc();
                }
            });
        }).addClass('btn-primary');
    }
});
