# ==============================================================================
# CDC NextERP - Terraform HCL Infrastructure & Setup Automation
# ==============================================================================

# 1. Verificacao de Containers Docker do Laboratorio
resource "null_resource" "docker_check" {
  triggers = {
    compose_hash = filesha256("../docker-compose.yml")
  }

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    command     = <<EOT
      set -euo pipefail
      cd ..
      echo "⏳ Inicializando volumes compartilhados por um único serviço..."
      docker compose up -d db redis-cache redis-queue configurator
      configurator_status=$(docker wait nexterp-configurator-1)
      if [ "$configurator_status" != "0" ]; then
        docker logs nexterp-configurator-1 >&2
        exit "$configurator_status"
      fi
      docker compose up -d

      echo "⏳ Aguardando MariaDB aceitar conexões autenticadas..."
      for attempt in $(seq 1 90); do
        if docker exec nexterp-db-1 mysqladmin ping -u root -p'${var.db_password}' --silent >/dev/null 2>&1; then
          break
        fi
        if [ "$attempt" -eq 90 ]; then
          echo "MariaDB não ficou pronto dentro de 90 segundos" >&2
          exit 1
        fi
        sleep 1
      done

      echo "⏳ Aguardando criação do site..."
      site_status=$(docker wait nexterp-create-site-1)
      if [ "$site_status" != "0" ]; then
        docker logs nexterp-create-site-1 >&2
        exit "$site_status"
      fi
      docker exec nexterp-frontend-1 test -f /home/frappe/frappe-bench/sites/${var.site_name}/site_config.json
    EOT
  }
}

# 2. Restauracao Declarativa e Sanitizada do Backup GCP
resource "null_resource" "gcp_backup_restore" {
  depends_on = [null_resource.docker_check]

  triggers = {
    restore_enabled    = tostring(var.restore_backup)
    backup_hash        = filesha256("../${var.gcp_backup_path}")
    public_files_hash  = filesha256("../${var.gcp_public_files_path}")
    private_files_hash = filesha256("../${var.gcp_private_files_path}")
    site_config_hash   = filesha256("../${var.gcp_site_config_path}")
  }

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    command     = <<EOT
      set -euo pipefail
      if [ "${var.restore_backup}" != "true" ]; then
        echo "⏭️ Restauração do backup desativada. Use -var=restore_backup=true para autorizá-la explicitamente."
        exit 0
      fi
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
      docker exec -i nexterp-frontend-1 python -c 'import json, sys; source=json.load(sys.stdin); path="/home/frappe/frappe-bench/sites/${var.site_name}/site_config.json"; target=json.load(open(path)); target["encryption_key"]=source["encryption_key"]; open(path, "w").write(json.dumps(target, indent=1) + "\n")' < "../${var.gcp_site_config_path}"
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
    management_js_hash      = filesha256("../apps/cdc_theme/cdc_theme/public/js/cdc_management.js")
    stock_routes_js_hash    = filesha256("../apps/cdc_theme/cdc_theme/public/js/cdc_stock_routes.js")
    pending_doctype_hash    = filesha256("../apps/cdc_theme/cdc_theme/cdc_theme/doctype/cdc_ongsys_pending_order/cdc_ongsys_pending_order.json")
    pending_state_hash      = filesha256("../apps/cdc_theme/cdc_theme/cdc_theme/doctype/cdc_ongsys_sync_state/cdc_ongsys_sync_state.json")
    stylesheet_hash         = filesha256("../apps/cdc_theme/cdc_theme/public/css/cdc_theme.css")
  }

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    command     = <<EOT
      set -euo pipefail
      echo "🎨 Instalando e migrando aplicativo cdc_theme..."
      node --check ../apps/cdc_theme/cdc_theme/public/js/cdc_theme.js
      node --check ../apps/cdc_theme/cdc_theme/public/js/cdc_management.js
      node --check ../apps/cdc_theme/cdc_theme/public/js/cdc_stock_routes.js
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
    workspace_schema     = "20260827-cdc-warehouse-v6"
  }

  provisioner "local-exec" {
    command = <<EOT
      echo "🗺️ Garantindo as Workspaces e Tabelas-Filhas do CDC..."
      docker exec -i nexterp-db-1 mysql -u root -p'${var.db_password}' "${var.db_name}" -e "
        DELETE FROM tabWorkspace WHERE name IN ('cdc-estoque', 'cdc-usuarios', 'cdc-integracoes', 'cdc-integrações', 'CDC Usuários dup');
        DELETE FROM tabWorkspace WHERE name IN ('CDC Estoque', 'CDC Usuários', 'CDC Grupos', 'CDC Itens', 'CDC Armazém', 'CDC Integrações', 'CDC Pendências', 'CDC Monitoramento', 'CDC Testes', 'CDC Admin');

        INSERT INTO tabWorkspace (name, creation, modified, modified_by, owner, docstatus, idx, label, title, sequence_id, module, icon, public, is_hidden, content) VALUES
        ('CDC Estoque', NOW(), NOW(), 'Administrator', 'Administrator', 0, 1, 'CDC Estoque', 'CDC Estoque', 1.0, 'Stock', 'stock', 1, 0, '[]'),
        ('CDC Usuários', NOW(), NOW(), 'Administrator', 'Administrator', 0, 2, 'CDC Usuários', 'CDC Usuários', 2.0, 'Core', 'users', 1, 0, '[{\"id\":\"YpGCeLfign\",\"type\":\"header\",\"data\":{\"text\":\"<span class=\\'h4\\'><b>Seus Atalhos</b></span>\",\"col\":12}},{\"id\":\"b7abeqw4NZ\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"User\",\"col\":3}},{\"id\":\"eghSJPhZRC\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"Role\",\"col\":3}},{\"id\":\"uAzl_lT_C0\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\" Gerenciador de permissões\",\"col\":3}},{\"id\":\"EpBz2lplSt\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"User Profile\",\"col\":3}},{\"id\":\"vHWhzaFoAH\",\"type\":\"shortcut\",\"data\":{\"shortcut_name\":\"User Type\",\"col\":3}},{\"id\":\"oFB4l28FMU\",\"type\":\"spacer\",\"data\":{\"col\":12}},{\"id\":\"NMpIkExl3i\",\"type\":\"card\",\"data\":{\"card_name\":\"Usuários\",\"col\":4}},{\"id\":\"VepG3durKm\",\"type\":\"card\",\"data\":{\"card_name\":\"Logs\",\"col\":4}},{\"id\":\"S9FeWt7xXE\",\"type\":\"card\",\"data\":{\"card_name\":\"Permissions\",\"col\":4}}]'),
        ('CDC Grupos', NOW(), NOW(), 'Administrator', 'Administrator', 0, 3, 'CDC Grupos', 'CDC Grupos', 3.0, 'Core', 'folder-normal', 1, 0, '[]'),
        ('CDC Itens', NOW(), NOW(), 'Administrator', 'Administrator', 0, 4, 'CDC Itens', 'CDC Itens', 4.0, 'Core', 'assets', 1, 0, '[]'),
        ('CDC Armazém', NOW(), NOW(), 'Administrator', 'Administrator', 0, 5, 'CDC Armazém', 'CDC Armazém', 5.0, 'Core', 'home', 1, 0, '[]'),
        ('CDC Integrações', NOW(), NOW(), 'Administrator', 'Administrator', 0, 6, 'CDC Integrações', 'CDC Integrações', 6.0, 'Integrations', 'integration', 1, 0, '[{\"id\":\"NPK_AfSLQ2\",\"type\":\"header\",\"data\":{\"text\":\"<span class=\\'h4\\'><b>Reports &amp; Masters</b></span>\",\"col\":12}},{\"id\":\"lDOo58F7ZI\",\"type\":\"card\",\"data\":{\"card_name\":\"Backup\",\"col\":4}},{\"id\":\"ij1pcK8jst\",\"type\":\"card\",\"data\":{\"card_name\":\"Google Services\",\"col\":4}},{\"id\":\"aTlMujEHpN\",\"type\":\"card\",\"data\":{\"card_name\":\"Authentication\",\"col\":4}},{\"id\":\"gY5NXKtXss\",\"type\":\"card\",\"data\":{\"card_name\":\"Settings\",\"col\":4}},{\"id\":\"n_CI3GGqW-\",\"type\":\"card\",\"data\":{\"card_name\":\"Push Notifications\",\"col\":4}}]'),
        ('CDC Pendências', NOW(), NOW(), 'Administrator', 'Administrator', 0, 7, 'CDC Pendências', 'CDC Pendências', 7.0, 'Core', 'list-alt', 1, 0, '[{\"id\":\"cdc-pendencias-header\",\"type\":\"header\",\"data\":{\"text\":\"<span class=\\'h4\\'><b>Pendências</b></span>\",\"col\":12}},{\"id\":\"cdc-pendencias-spacer\",\"type\":\"spacer\",\"data\":{\"col\":12}}]'),
        ('CDC Monitoramento', NOW(), NOW(), 'Administrator', 'Administrator', 0, 8, 'CDC Monitoramento', 'CDC Monitoramento', 8.0, 'Core', 'dashboard', 1, 0, '[{\"id\":\"cdc-monitoring-header\",\"type\":\"header\",\"data\":{\"text\":\"<span class=\\'h4\\'><b>Monitoramento</b></span>\",\"col\":12}}]'),
        ('CDC Testes', NOW(), NOW(), 'Administrator', 'Administrator', 0, 9, 'CDC Testes', 'CDC Testes', 9.0, 'Core', 'check', 1, 0, '[]'),
        ('CDC Admin', NOW(), NOW(), 'Administrator', 'Administrator', 0, 10, 'CDC Admin', 'CDC Admin', 10.0, 'Core', 'tool', 1, 0, '[]');

        UPDATE tabWorkspace SET is_hidden = 1 WHERE name NOT IN ('CDC Estoque', 'CDC Usuários', 'CDC Grupos', 'CDC Itens', 'CDC Armazém', 'CDC Integrações', 'CDC Pendências', 'CDC Monitoramento', 'CDC Testes', 'CDC Admin');
        UPDATE tabWorkspace SET is_hidden = 0 WHERE name IN ('CDC Estoque', 'CDC Usuários', 'CDC Grupos', 'CDC Itens', 'CDC Armazém', 'CDC Integrações', 'CDC Pendências', 'CDC Monitoramento', 'CDC Testes', 'CDC Admin');
        UPDATE tabWorkspace SET icon = 'integration' WHERE name = 'CDC Integrações';
        UPDATE tabWorkspace SET icon = 'list-alt' WHERE name = 'CDC Pendências';
        UPDATE tabWorkspace SET icon = 'dashboard' WHERE name = 'CDC Monitoramento';
        UPDATE tabWorkspace SET icon = 'check' WHERE name = 'CDC Testes';
        UPDATE tabWorkspace SET icon = 'folder-normal' WHERE name = 'CDC Grupos';
        UPDATE tabWorkspace SET icon = 'assets' WHERE name = 'CDC Itens';
        UPDATE tabWorkspace SET icon = 'home' WHERE name = 'CDC Armazém';
        UPDATE tabWorkspace SET icon = 'tool' WHERE name = 'CDC Admin';
        UPDATE tabWorkspace SET content = '[]' WHERE name = 'CDC Estoque';


        UPDATE \`tabWorkspace Shortcut\` SET parent = 'CDC Estoque' WHERE parent = 'Stock';
        UPDATE \`tabWorkspace Link\` SET parent = 'CDC Estoque' WHERE parent = 'Stock';
        UPDATE \`tabWorkspace Chart\` SET parent = 'CDC Estoque' WHERE parent = 'Stock';
        UPDATE \`tabWorkspace Number Card\` SET parent = 'CDC Estoque' WHERE parent = 'Stock';

        UPDATE \`tabWorkspace Shortcut\` SET parent = 'CDC Usuários' WHERE parent = 'Users';
        UPDATE \`tabWorkspace Link\` SET parent = 'CDC Usuários' WHERE parent = 'Users';

        UPDATE \`tabWorkspace Link\` SET parent = 'CDC Integrações' WHERE parent = 'Integrations';

      "
      docker exec nexterp-backend-1 bench --site ${var.site_name} clear-cache
    EOT
  }
}

# 5. Endurecimento de idempotencia e saneamento de artefatos herdados
resource "null_resource" "cdc_data_hardening" {
  depends_on = [null_resource.workspace_sanitization]

  triggers = {
    database_backup_hash = filesha256("../${var.gcp_backup_path}")
    importer_hash        = filesha256("../extractor/5_extrator_requisicoes_v2.py")
    runner_hash          = filesha256("../extractor/run_extractors.py")
    job_hash             = filesha256("../extractor/run_job.sh")
  }

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    command     = <<EOT
      set -euo pipefail
      echo "🔒 Aplicando idempotência ONGSYS e saneando relatórios herdados..."
      duplicates="$(docker exec -i nexterp-db-1 mysql -N -u root -p'${var.db_password}' '${var.db_name}' -e "SELECT COUNT(*) FROM (SELECT idpedido_ongsys FROM \`tabStock Entry\` WHERE idpedido_ongsys IS NOT NULL AND idpedido_ongsys <> '' GROUP BY idpedido_ongsys HAVING COUNT(*) > 1) d")"
      test "$duplicates" = "0" || { echo "Duplicidades ONGSYS impedem a criação do índice único: $duplicates"; exit 1; }
      docker exec -i nexterp-db-1 mysql -u root -p'${var.db_password}' '${var.db_name}' -e "
        INSERT INTO \`tabCustom Field\`
          (name, creation, modified, modified_by, owner, docstatus, idx,
           dt, label, fieldname, insert_after, fieldtype, depends_on,
           read_only, no_copy, print_hide, print_hide_if_no_value)
        SELECT
          'Stock Entry-cdc_ongsys_section', NOW(6), NOW(6),
          'Administrator', 'Administrator', 0, 0,
          'Stock Entry', 'Integração ONGSYS', 'cdc_ongsys_section',
          'posting_date', 'Section Break',
          'eval:doc.idpedido_ongsys || doc.titulo_ongsys',
          0, 1, 1, 1
        WHERE NOT EXISTS (
          SELECT 1 FROM \`tabCustom Field\`
           WHERE dt='Stock Entry' AND fieldname='cdc_ongsys_section'
        );
        UPDATE \`tabCustom Field\`
           SET label='Integração ONGSYS', fieldtype='Section Break',
               insert_after='posting_date',
               depends_on='eval:doc.idpedido_ongsys || doc.titulo_ongsys',
               no_copy=1, print_hide=1, print_hide_if_no_value=1
         WHERE dt='Stock Entry' AND fieldname='cdc_ongsys_section';
        UPDATE \`tabCustom Field\`
           SET fieldtype='Data', label='ID do pedido ONGSYS', \`unique\`=1,
               in_standard_filter=1, read_only=1, no_copy=1,
               print_hide_if_no_value=1, insert_after='titulo_ongsys'
         WHERE dt='Stock Entry' AND fieldname='idpedido_ongsys';
        UPDATE \`tabCustom Field\`
           SET label='Título do pedido ONGSYS', read_only=1, no_copy=1,
               print_hide_if_no_value=1, insert_after='cdc_ongsys_section'
         WHERE dt='Stock Entry' AND fieldname='titulo_ongsys';
        ALTER TABLE \`tabStock Entry\` MODIFY \`idpedido_ongsys\` VARCHAR(140) NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_stock_entry_idpedido_ongsys
          ON \`tabStock Entry\` (\`idpedido_ongsys\`);
        UPDATE tabReport
           SET json=JSON_SET(
             json,
             '$.filters.from_date', DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-%d'),
             '$.filters.to_date', DATE_FORMAT(CURDATE(), '%Y-%m-%d')
           )
         WHERE name IN ('Balanço de Estoque - CDC', 'Livro de Inventarios - CDC', 'Livro de inventario - CDC')
           AND JSON_VALID(json);
        UPDATE tabReport
           SET disabled=0, reference_report='Stock Ledger'
         WHERE name='Livro de inventario - CDC';
        UPDATE tabReport
           SET disabled=0, reference_report='Livro de inventario - CDC'
         WHERE name='Livro de Inventarios - CDC';
        UPDATE tabReport
           SET json=JSON_SET(json, '$.columns[0].label', 'Data', '$.columns[0].name', 'Data')
         WHERE name IN ('Livro de Inventarios - CDC', 'Livro de inventario - CDC')
           AND JSON_VALID(json);
        UPDATE tabWorkspace
           SET content=REPLACE(content, 'Total de Armazém', 'Total Warehouses')
         WHERE name IN ('Stock', 'CDC Estoque') AND content LIKE '%Total de Armazém%';
      "
      python3 -m py_compile ../extractor/common.py ../extractor/run_extractors.py ../extractor/5_sync_ongsys_pending.py ../extractor/5_extrator_requisicoes_v2.py
      bash -n ../extractor/run_job.sh
      docker exec nexterp-backend-1 bench --site ${var.site_name} clear-cache
    EOT
  }
}










# 6. Sincronizacao de Assets Compilados para o Frontend Nginx
resource "null_resource" "asset_sync" {
  depends_on = [null_resource.cdc_data_hardening]

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
