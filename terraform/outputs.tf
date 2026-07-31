output "laboratory_url" {
  value       = "http://localhost:8085"
  description = "URL do Laboratorio Local Nginx"
}

output "active_branch" {
  value       = "lab/estabilizacao-tema-cdc"
  description = "Branch de desenvolvimento do laboratorio"
}

output "telemetry_json_path" {
  value       = "telemetria_laboratorio.json"
  description = "Caminho do relatorio de telemetria JSON"
}
