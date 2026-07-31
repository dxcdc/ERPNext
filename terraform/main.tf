# ==============================================================================
# CDC NextERP - Terraform HCL Infrastructure & Setup Automation
# ==============================================================================

# 1. Verificacao de Containers Docker do Laboratorio
resource "null_resource" "docker_check" {
  provisioner "local-exec" {
    command = "docker ps --format '{{.Names}}' | grep -q 'nexterp-backend-1' || (cd .. && docker compose up -d)"
  }
}

# 2. Restauracao Declarativa e Sanitizada do Backup GCP
resource "null_resource" "gcp_backup_restore" {
  depends_on = [null_resource.docker_check]

  triggers = {
    backup_hash = fileexists("../${var.gcp_backup_path}") ? md5("../${var.gcp_backup_path}") : "default"
  }

  provisioner "local-exec" {
    command = <<EOT
      echo "📦 Restaurando backup da GCP no MariaDB (${var.gcp_backup_path})..."
      docker exec -i nexterp-db-1 mysql -u root -p'${var.db_password}' -e "CREATE DATABASE IF NOT EXISTS \`${var.db_name}\`;"
      zcat "../${var.gcp_backup_path}" | docker exec -i nexterp-db-1 mysql -u root -p'${var.db_password}' "${var.db_name}"
    EOT
  }
}

# 3. Instalacao do Tema CDC (Estoque + Usuarios + Integracoes)
resource "null_resource" "cdc_theme_setup" {
  depends_on = [null_resource.gcp_backup_restore]

  provisioner "local-exec" {
    command = <<EOT
      echo "🎨 Instalando e migrando aplicativo cdc_theme..."
      docker exec nexterp-backend-1 /home/frappe/frappe-bench/env/bin/pip install -e /home/frappe/frappe-bench/apps/cdc_theme
      docker exec nexterp-backend-1 bench --site ${var.site_name} install-app cdc_theme || true
      docker exec nexterp-backend-1 bench --site ${var.site_name} migrate
      docker exec nexterp-backend-1 bench --site ${var.site_name} build
      docker exec nexterp-backend-1 bench --site ${var.site_name} clear-cache
      docker restart nexterp-backend-1
    EOT
  }
}

# 4. Alinhamento Declarativo de Mapeamento de Workspaces Exclusivas do CDC
resource "null_resource" "workspace_sanitization" {
  depends_on = [null_resource.cdc_theme_setup]

  provisioner "local-exec" {
    command = <<EOT
      echo "🗺️ Garantindo Workspaces com conteúdo GCP e JSON 100% Válido (Estoque, Usuários, Integrações)..."
      docker exec -i nexterp-db-1 mysql -u root -p'${var.db_password}' "${var.db_name}" -e "
        DELETE FROM tabWorkspace WHERE name IN ('cdc-estoque', 'cdc-usuarios', 'cdc-integracoes', 'CDC Estoque', 'CDC Usuários', 'CDC Integrações');
        UPDATE tabWorkspace SET label = 'Estoque', title = 'Estoque', is_hidden = 0, content = '[{\"id\":\"i75oOgSdFT\",\"type\":\"number_card\",\"data\":{\"number_card_name\":\"Total de Armazém\",\"col\":12}},{\"id\":\"wwAoBx30p3\",\"type\":\"spacer\",\"data\":{\"col\":12}},{\"id\":\"_D_9nEcxkv\",\"type\":\"chart\",\"data\":{\"chart_name\":\"Estoque\",\"col\":12}},{\"id\":\"LkqrpJHM9X\",\"type\":\"header\",\"data\":{\"text\":\"<span class=\\'h4\\'><b>Atalho</b></span>\",\"col\":12}},{\"id\":\"0EYKOrx6U1\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"Lançamento no Estoque\",\"col\":3}},{\"id\":\"4APLzv0c56\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"Conciliação de Estoque\",\"col\":3}},{\"id\":\"Yt53LeRakq\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"Livro de inventario\",\"col\":3}},{\"id\":\"o3sdEnNy34\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"Balanço de Estoque\",\"col\":3}},{\"id\":\"Uon_-6uicQ\",\"type\":\"spacer\",\"data\":{\"col\":12}},{\"id\":\"OAGNH9njt7\",\"type\":\"card\",\"data\":{\"card_name\":\"Catálogo\",\"col\":4}},{\"id\":\"jF9eKz0qr0\",\"type\":\"card\",\"data\":{\"card_name\":\"Movimentação\",\"col\":4}}]' WHERE name = 'Stock';

        UPDATE tabWorkspace SET label = 'Usuários', title = 'Usuários', is_hidden = 0, content = '[{\"id\":\"v-dY5c4bpt\",\"type\":\"header\",\"data\":{\"text\":\"<span style=\\'font-size: 18px; letter-spacing: 0.18px;\\'><b>Users</b><br></span>\",\"col\":12}},{\"id\":\"bS-k5_e8U3\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"User\",\"col\":3}},{\"id\":\"Wp_31s1k61\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"Role Profile\",\"col\":3}},{\"id\":\"c_9XnF7Sgq\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"User Permission\",\"col\":3}},{\"id\":\"h2yYy94M4D\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"User Group\",\"col\":3}}]' WHERE name = 'Users';

        UPDATE tabWorkspace SET label = 'Integrações', title = 'Integrações', is_hidden = 0, content = '[{\"id\":\"hQ-2qgq-0c\",\"type\":\"header\",\"data\":{\"text\":\"<span style=\\'font-size: 18px; letter-spacing: 0.18px;\\'><b>Integrations</b><br></span>\",\"col\":12}},{\"id\":\"y_1n0pT5E2\",\"type\":\"card\",\"data\":{\"card_name\":\"Integrations\",\"col\":4}},{\"id\":\"4pX_9oTq0W\",\"type\":\"card\",\"data\":{\"card_name\":\"Settings\",\"col\":4}}]' WHERE name = 'Integrations';

        UPDATE tabWorkspace SET is_hidden = 1 WHERE name NOT IN ('Stock', 'Users', 'Integrations');
        UPDATE tabUser SET desk_theme = 'Light';
      "
      docker exec nexterp-backend-1 bench --site ${var.site_name} clear-cache
    EOT
  }
}








# 5. Sincronizacao de Assets Compilados para o Frontend Nginx
resource "null_resource" "asset_sync" {
  depends_on = [null_resource.workspace_sanitization]

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
