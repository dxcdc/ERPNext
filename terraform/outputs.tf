output "laboratory_url" {
  value       = "http://localhost:${var.http_port}"
  description = "URL do Laboratorio Local Nginx"
}

output "active_branch" {
  value       = "main"
  description = "Branch canônica esperada para a receita versionada"
}

output "telemetry_json_path" {
  value       = "telemetria_laboratorio.json"
  description = "Caminho do relatorio de telemetria JSON"
}
