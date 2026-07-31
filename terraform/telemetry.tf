# ==============================================================================
# Modulo de Telemetria e Diagnostico Passo a Passo HCL
# ==============================================================================

resource "null_resource" "telemetry_report" {
  depends_on = [null_resource.asset_sync]

  provisioner "local-exec" {
    command = <<EOT
      echo "📊 Executando Modulo de Telemetria HCL do Laboratorio..."
      python3 -c "
import subprocess, json, time, urllib.request

start_time = time.time()
report = {
    'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
    'metrics': {},
    'checks': {}
}

# 1. Checkup MariaDB
try:
    res = subprocess.check_output(\"docker exec -i nexterp-db-1 mysql -u root -p'admin' _5e5899d8398b5f7b -e 'SELECT COUNT(*) FROM tabWorkspace WHERE is_hidden = 0;'\", shell=True).decode()
    visible_count = int(res.split('\n')[1].strip())
    report['checks']['visible_workspaces'] = {'status': 'OK', 'count': visible_count}
except Exception as e:
    report['checks']['visible_workspaces'] = {'status': 'ERROR', 'details': str(e)}

# 2. Checkup HTTP Assets Nginx (Porta 8085)
try:
    req = urllib.request.Request('http://localhost:8085/assets/cdc_theme/css/cdc_theme.css', headers={'User-Agent': 'Terraform-Telemetry'})
    with urllib.request.urlopen(req, timeout=5) as response:
        report['checks']['http_css_assets'] = {'status': 'OK', 'code': response.getcode()}
except Exception as e:
    report['checks']['http_css_assets'] = {'status': 'ERROR', 'details': str(e)}

# 3. Checkup API Estoque Dashboard
try:
    cmd = \"docker exec nexterp-backend-1 bench --site frontend execute cdc_theme.api.get_stock_dashboard_data\"
    res = subprocess.check_output(cmd, shell=True).decode()
    report['checks']['stock_api'] = {'status': 'OK', 'data_present': 'receipts_month' in res}
except Exception as e:
    report['checks']['stock_api'] = {'status': 'ERROR', 'details': str(e)}

report['metrics']['total_duration_seconds'] = round(time.time() - start_time, 2)

# Salva JSON de Telemetria
with open('../telemetria_laboratorio.json', 'w') as f:
    json.dump(report, f, indent=2)

print('=== 📊 RELATÓRIO DE TELEMETRIA HCL (CDC NextERP) ===')
print('⏱️ Duração total da Telemetria: ' + str(report['metrics']['total_duration_seconds']) + 's')
print('🏥 Workspaces Operacionais Ativas: ' + str(report['checks'].get('visible_workspaces', {}).get('count', 0)))
print('⚡ Status Nginx Assets: ' + str(report['checks'].get('http_css_assets', {}).get('status', 'ERROR')))
print('📦 API Estoque Dashboard: ' + str(report['checks'].get('stock_api', {}).get('status', 'ERROR')))
print('====================================================')
"
    EOT
  }
}
