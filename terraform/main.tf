# ==============================================================================
# CDC NextERP - Terraform HCL Infrastructure & Setup Automation
# ==============================================================================

# 1. Verificacao de Containers Docker do Laboratorio
resource "null_resource" "docker_check" {
  triggers = {
    compose_hash = filesha256("../docker-compose.yml")
  }

  provisioner "local-exec" {
    command = "cd .. && docker compose up -d"
  }
}

# 2. Restauracao Declarativa e Sanitizada do Backup GCP
resource "null_resource" "gcp_backup_restore" {
  depends_on = [null_resource.docker_check]

  triggers = {
    backup_hash        = filesha256("../${var.gcp_backup_path}")
    public_files_hash  = filesha256("../${var.gcp_public_files_path}")
    private_files_hash = filesha256("../${var.gcp_private_files_path}")
  }

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    command     = <<EOT
      set -euo pipefail
      echo "📦 Restaurando backup da GCP no MariaDB (${var.gcp_backup_path})..."
      gzip -t "../${var.gcp_backup_path}"
      tar -tf "../${var.gcp_public_files_path}" > /dev/null
      tar -tf "../${var.gcp_private_files_path}" > /dev/null
      mkdir -p ../backups/pre_restore
      docker exec nexterp-db-1 mariadb-dump -u root -p'${var.db_password}' --single-transaction --routines --triggers "${var.db_name}" | gzip > ../backups/pre_restore/local-before-gcp-restore.sql.gz
      docker exec nexterp-frontend-1 mkdir -p /home/frappe/frappe-bench/sites/${var.site_name}/public/files /home/frappe/frappe-bench/sites/${var.site_name}/private/files
      docker exec nexterp-frontend-1 tar -C /home/frappe/frappe-bench/sites -cf - ${var.site_name}/public/files ${var.site_name}/private/files > ../backups/pre_restore/local-files-before-gcp-restore.tar
      restore_services() { (cd .. && docker compose start backend queue-long queue-short scheduler) || true; }
      trap restore_services EXIT
      (cd .. && docker compose stop backend queue-long queue-short scheduler)
      docker exec -i nexterp-db-1 mysql -u root -p'${var.db_password}' -e "DROP DATABASE IF EXISTS \`${var.db_name}\`; CREATE DATABASE \`${var.db_name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
      zcat "../${var.gcp_backup_path}" | docker exec -i nexterp-db-1 mysql -u root -p'${var.db_password}' "${var.db_name}"
      docker exec -i nexterp-frontend-1 tar -C /home/frappe/frappe-bench/sites -xf - < "../${var.gcp_public_files_path}"
      docker exec -i nexterp-frontend-1 tar -C /home/frappe/frappe-bench/sites -xf - < "../${var.gcp_private_files_path}"
      (cd .. && docker compose start backend queue-long queue-short scheduler)
      trap - EXIT
    EOT
  }
}

# 3. Instalacao do Tema CDC (Estoque + Usuarios + Integracoes)
resource "null_resource" "cdc_theme_setup" {
  depends_on = [null_resource.gcp_backup_restore]

  triggers = {
    database_backup_hash    = filesha256("../${var.gcp_backup_path}")
    app_config_hash         = filesha256("../apps/cdc_theme/pyproject.toml")
    hooks_hash              = filesha256("../apps/cdc_theme/cdc_theme/hooks.py")
    api_hash                = filesha256("../apps/cdc_theme/cdc_theme/api.py")
    doctype_hash            = filesha256("../apps/cdc_theme/cdc_theme/cdc_theme/doctype/cdc_mattermost_config/cdc_mattermost_config.json")
    controller_hash         = filesha256("../apps/cdc_theme/cdc_theme/cdc_theme/doctype/cdc_mattermost_config/cdc_mattermost_config.py")
    doctype_js_hash         = filesha256("../apps/cdc_theme/cdc_theme/cdc_theme/doctype/cdc_mattermost_config/cdc_mattermost_config.js")
    javascript_hash         = filesha256("../apps/cdc_theme/cdc_theme/public/js/cdc_theme.js")
    users_javascript_hash   = filesha256("../apps/cdc_theme/cdc_theme/public/js/cdc_users.js")
    pending_javascript_hash = filesha256("../apps/cdc_theme/cdc_theme/public/js/cdc_pending.js")
    pending_doctype_hash    = filesha256("../apps/cdc_theme/cdc_theme/cdc_theme/doctype/cdc_ongsys_pending_order/cdc_ongsys_pending_order.json")
    stylesheet_hash         = filesha256("../apps/cdc_theme/cdc_theme/public/css/cdc_theme.css")
  }

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    command     = <<EOT
      set -euo pipefail
      echo "🎨 Instalando e migrando aplicativo cdc_theme..."
      node --check ../apps/cdc_theme/cdc_theme/public/js/cdc_theme.js
      docker exec nexterp-backend-1 sh -lc "bench --site ${var.site_name} list-apps | grep -qx cdc_theme || bench --site ${var.site_name} install-app cdc_theme"
      docker exec nexterp-backend-1 bench --site ${var.site_name} migrate
      docker exec nexterp-backend-1 bench build
      docker exec nexterp-backend-1 bench --site ${var.site_name} clear-cache
      cd .. && docker compose restart backend queue-long queue-short scheduler frontend
    EOT
  }
}

# 4. Alinhamento Declarativo de Mapeamento de Workspaces Exclusivas do CDC
resource "null_resource" "workspace_sanitization" {
  depends_on = [null_resource.cdc_theme_setup]

  triggers = {
    database_backup_hash = filesha256("../${var.gcp_backup_path}")
  }

  provisioner "local-exec" {
    command = <<EOT
      echo "🗺️ Garantindo as quatro Workspaces e Tabelas-Filhas do CDC..."
      docker exec -i nexterp-db-1 mysql -u root -p'${var.db_password}' "${var.db_name}" -e "
        DELETE FROM tabWorkspace WHERE name IN ('Stock', 'Users', 'Integrations', 'cdc-estoque', 'cdc-usuarios', 'cdc-integracoes', 'cdc-integrações');
        DELETE FROM tabWorkspace WHERE name IN ('CDC Estoque', 'CDC Usuários', 'CDC Integrações', 'CDC Pendências');

        INSERT INTO tabWorkspace (name, creation, modified, modified_by, owner, docstatus, idx, label, title, sequence_id, module, icon, public, is_hidden, content) VALUES
        ('CDC Estoque', NOW(), NOW(), 'Administrator', 'Administrator', 0, 1, 'CDC Estoque', 'CDC Estoque', 1.0, 'Stock', 'stock', 1, 0, '[{\"id\":\"i75oOgSdFT\",\"type\":\"number_card\",\"data\":{\"number_card_name\":\"Total de Armazém\",\"col\":12}},{\"id\":\"wwAoBx30p3\",\"type\":\"spacer\",\"data\":{\"col\":12}},{\"id\":\"_D_9nEcxkv\",\"type\":\"chart\",\"data\":{\"chart_name\":\"Estoque\",\"col\":12}},{\"id\":\"LkqrpJHM9X\",\"type\":\"header\",\"data\":{\"text\":\"<span class=\\'h4\\'><b>Atalho</b></span>\",\"col\":12}},{\"id\":\"0EYKOrx6U1\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"Lançamento no Estoque\",\"col\":3}},{\"id\":\"4APLzv0c56\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"Conciliação de Estoque\",\"col\":3}},{\"id\":\"Yt53LeRakq\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"Livro de inventario\",\"col\":3}},{\"id\":\"03sdEnNy34\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"Balanço de Estoque\",\"col\":3}},{\"id\":\"Uon_-6uicQ\",\"type\":\"spacer\",\"data\":{\"col\":12}},{\"id\":\"OAGNH9njt7\",\"type\":\"card\",\"data\":{\"card_name\":\"Catálogo\",\"col\":4}},{\"id\":\"jF9eKz0qr0\",\"type\":\"card\",\"data\":{\"card_name\":\"Movimentação\",\"col\":4}}]'),
        ('CDC Usuários', NOW(), NOW(), 'Administrator', 'Administrator', 0, 2, 'CDC Usuários', 'CDC Usuários', 2.0, 'Core', 'users', 1, 0, '[{\"id\":\"v-dY5c4bpt\",\"type\":\"header\",\"data\":{\"text\":\"<span style=\\'font-size: 18px; letter-spacing: 0.18px;\\'><b>Users</b><br></span>\",\"col\":12}},{\"id\":\"bS-k5_e8U3\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"User\",\"col\":3}},{\"id\":\"Wp_31s1k61\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"Role Profile\",\"col\":3}},{\"id\":\"c_9XnF7Sgq\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"User Permission\",\"col\":3}},{\"id\":\"h2yYy94M4D\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"User Group\",\"col\":3}}]'),
        ('CDC Integrações', NOW(), NOW(), 'Administrator', 'Administrator', 0, 3, 'CDC Integrações', 'CDC Integrações', 3.0, 'Integrations', 'share-2', 1, 0, '[{\"id\":\"hQ-2qgq-0c\",\"type\":\"header\",\"data\":{\"text\":\"<span style=\\'font-size: 18px; letter-spacing: 0.18px;\\'><b>Integrations</b><br></span>\",\"col\":12}},{\"id\":\"y_1n0pT5E2\",\"type\":\"card\",\"data\":{\"card_name\":\"Integrations\",\"col\":4}},{\"id\":\"4pX_9oTq0W\",\"type\":\"card\",\"data\":{\"card_name\":\"Settings\",\"col\":4}}]'),
        ('CDC Pendências', NOW(), NOW(), 'Administrator', 'Administrator', 0, 4, 'CDC Pendências', 'CDC Pendências', 4.0, 'Core', 'list-checks', 1, 0, '[{\"id\":\"cdc-pendencias-header\",\"type\":\"header\",\"data\":{\"text\":\"<span class=\\'h4\\'><b>Pendências</b></span>\",\"col\":12}},{\"id\":\"cdc-pendencias-spacer\",\"type\":\"spacer\",\"data\":{\"col\":12}}]');

        UPDATE tabWorkspace SET is_hidden = 1 WHERE name NOT IN ('CDC Estoque', 'CDC Usuários', 'CDC Integrações', 'CDC Pendências');
        UPDATE tabWorkspace SET is_hidden = 0 WHERE name IN ('CDC Estoque', 'CDC Usuários', 'CDC Integrações', 'CDC Pendências');


        UPDATE \`tabWorkspace Shortcut\` SET parent = 'CDC Estoque' WHERE parent = 'Stock';
        UPDATE \`tabWorkspace Link\` SET parent = 'CDC Estoque' WHERE parent = 'Stock';
        UPDATE \`tabWorkspace Chart\` SET parent = 'CDC Estoque' WHERE parent = 'Stock';
        UPDATE \`tabWorkspace Number Card\` SET parent = 'CDC Estoque' WHERE parent = 'Stock';

        UPDATE \`tabWorkspace Shortcut\` SET parent = 'CDC Usuários' WHERE parent = 'Users';
        UPDATE \`tabWorkspace Link\` SET parent = 'CDC Usuários' WHERE parent = 'Users';

        UPDATE \`tabWorkspace Link\` SET parent = 'CDC Integrações' WHERE parent = 'Integrations';

        UPDATE tabUser SET desk_theme = 'Light';
      "
      docker exec nexterp-backend-1 bench --site ${var.site_name} clear-cache
    EOT
  }
}










# 5. Sincronizacao de Assets Compilados para o Frontend Nginx
resource "null_resource" "asset_sync" {
  depends_on = [null_resource.workspace_sanitization]

  triggers = {
    theme_setup_id = null_resource.cdc_theme_setup.id
  }

  provisioner "local-exec" {
    command = <<EOT
      echo "⚡ Sincronizando bundles de assets compilados com o container frontend..."
      rm -rf /tmp/frappe_dist_sync /tmp/erpnext_dist_sync
      docker cp nexterp-backend-1:/home/frappe/frappe-bench/apps/frappe/frappe/public/dist /tmp/frappe_dist_sync
      docker cp nexterp-backend-1:/home/frappe/frappe-bench/apps/erpnext/erpnext/public/dist /tmp/erpnext_dist_sync
      docker exec nexterp-frontend-1 rm -rf /home/frappe/frappe-bench/apps/frappe/frappe/public/dist /home/frappe/frappe-bench/apps/erpnext/erpnext/public/dist
      docker cp /tmp/frappe_dist_sync nexterp-frontend-1:/home/frappe/frappe-bench/apps/frappe/frappe/public/dist
      docker cp /tmp/erpnext_dist_sync nexterp-frontend-1:/home/frappe/frappe-bench/apps/erpnext/erpnext/public/dist
      docker restart nexterp-frontend-1
    EOT
  }
}

