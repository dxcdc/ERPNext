frappe.ui.form.on('CDC Mattermost Config', {
    refresh: function(frm) {
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
                    frappe.msgprint(__('✅ Teste concluído com sucesso! Verifique a notificação no seu canal no Mattermost.'), __('Sucesso'), 'green');
                }
            });
        }).addClass('btn-primary');
    }
});
