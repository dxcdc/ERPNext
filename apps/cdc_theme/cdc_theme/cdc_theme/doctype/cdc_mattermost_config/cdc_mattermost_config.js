frappe.ui.form.on('CDC Mattermost Config', {
    refresh: function(frm) {
        if (!frm.is_new()) {
            frm.add_custom_button(__('🧪 Testar Conexão'), function() {
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
    }
});
