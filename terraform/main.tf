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

# 4. Alinhamento Declarativo de Mapeamento de Workspaces / Guias (Estoque, Usuários, Integrações)
resource "null_resource" "workspace_sanitization" {
  depends_on = [null_resource.cdc_theme_setup]

  provisioner "local-exec" {
    command = <<EOT
      echo "🗺️ Alinhando visibilidade declarativa das Workspaces no MariaDB (Estoque, Usuários, Integrações)..."
      # Oculta todas as Workspaces desnecessarias (incluindo Home, Projects, Buying)
      docker exec -i nexterp-db-1 mysql -u root -p'${var.db_password}' "${var.db_name}" -e "UPDATE tabWorkspace SET is_hidden = 1 WHERE name NOT IN ('Stock', 'Users', 'Integrations');"
      # Ativa estritamente as 3 Workspaces solicitadas pelo usuario: Estoque, Usuários e Integrações
      docker exec -i nexterp-db-1 mysql -u root -p'${var.db_password}' "${var.db_name}" -e "UPDATE tabWorkspace SET is_hidden = 0 WHERE name IN ('Stock', 'Users', 'Integrations');"
      # Forca tema claro limpo no banco
      docker exec -i nexterp-db-1 mysql -u root -p'${var.db_password}' "${var.db_name}" -e "UPDATE tabUser SET desk_theme = 'Light';"
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
