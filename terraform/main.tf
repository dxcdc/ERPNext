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
      echo "🗺️ Criando e ativando declarativamente Workspaces exclusivas CDC (CDC Estoque, CDC Usuários, CDC Integrações)..."
      docker exec -i nexterp-db-1 mysql -u root -p'${var.db_password}' "${var.db_name}" -e "
        DELETE FROM tabWorkspace WHERE name IN ('CDC Estoque', 'CDC Usuários', 'CDC Integrações');
        INSERT INTO tabWorkspace (name, creation, modified, modified_by, owner, docstatus, idx, label, title, sequence_id, module, icon, public, is_hidden, content) VALUES
        ('CDC Estoque', NOW(), NOW(), 'Administrator', 'Administrator', 0, 1, 'CDC Estoque', 'CDC Estoque', 1.0, 'cdc_theme', 'stock', 1, 0, '[]'),
        ('CDC Usuários', NOW(), NOW(), 'Administrator', 'Administrator', 0, 2, 'CDC Usuários', 'CDC Usuários', 2.0, 'cdc_theme', 'users', 1, 0, '[]'),
        ('CDC Integrações', NOW(), NOW(), 'Administrator', 'Administrator', 0, 3, 'CDC Integrações', 'CDC Integrações', 3.0, 'cdc_theme', 'share-2', 1, 0, '[]');
        UPDATE tabWorkspace SET is_hidden = 1 WHERE name NOT IN ('CDC Estoque', 'CDC Usuários', 'CDC Integrações');
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
