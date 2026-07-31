variable "http_port" {
  type        = string
  default     = "8085"
  description = "Porta HTTP do servidor Nginx do laboratorio local"
}

variable "db_password" {
  type        = string
  default     = "admin"
  description = "Senha do usuario root do MariaDB"
}

variable "db_name" {
  type        = string
  default     = "_5e5899d8398b5f7b"
  description = "Nome do banco de dados do site Frappe"
}

variable "site_name" {
  type        = string
  default     = "frontend"
  description = "Nome do site Frappe"
}

variable "gcp_backup_path" {
  type        = string
  default     = "bkp gcp/gcp-prod-database-latest.sql.gz"
  description = "Caminho do arquivo de backup exportado da GCP"
}

variable "gcp_public_files_path" {
  type        = string
  default     = "bkp gcp/gcp-prod-public-files.tar"
  description = "Caminho do arquivo de arquivos públicos exportado da GCP"
}

variable "gcp_private_files_path" {
  type        = string
  default     = "bkp gcp/gcp-prod-private-files.tar"
  description = "Caminho do arquivo de arquivos privados exportado da GCP"
}
