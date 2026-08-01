# ==============================================================================
# ESTEIRA AUTOMATIZADA DE TESTES PASSO A PASSO (CDC NextERP Laboratório)
# ==============================================================================

resource "null_resource" "esteira_testes_pipeline" {
  depends_on = [null_resource.telemetry_report]

  triggers = {
    pipeline_hash = filesha256("${path.module}/run_pipeline.py")
  }

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    command     = "python3 ${path.module}/run_pipeline.py --site '${var.site_name}' --database '${var.db_name}' --password '${var.db_password}'"
  }
}

# Auditoria transversal não bloqueante. Achados são registrados com severidade
# em auditoria_perspectivas.json sem impedir uma atualização funcional.
resource "null_resource" "auditoria_perspectivas" {
  depends_on = [null_resource.esteira_testes_pipeline]

  triggers = {
    audit_hash = filesha256("${path.module}/run_extended_audit.py")
    api_hash   = filesha256("../apps/cdc_theme/cdc_theme/api.py")
    css_hash   = filesha256("../apps/cdc_theme/cdc_theme/public/css/cdc_theme.css")
    js_hash    = filesha256("../apps/cdc_theme/cdc_theme/public/js/cdc_theme.js")
  }

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    command     = "python3 ${path.module}/run_extended_audit.py --site '${var.site_name}' --database '${var.db_name}' --password '${var.db_password}'"
  }
}
