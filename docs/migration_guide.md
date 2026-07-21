# Guia de Migração e Acesso Seguro

Este guia orienta o administrador de sistemas e engenheiro DevOps no estabelecimento de acessos SSH seguros, no diagnóstico somente leitura da infraestrutura antiga no GCP, e nos procedimentos de exportação, transferência e validação do NextERP.

---

## Acesso SSH seguro

### 1. Geração de chave ED25519 criptografada
Gere a chave na sua máquina de desenvolvimento (openSUSE) com uma senha robusta:
```bash
ssh-keygen -t ed25519 -a 100 -f ~/.ssh/gcp_key -C "vier"
```
*Sempre insira uma passphrase forte para proteger a chave privada em caso de perda do dispositivo.*

### 2. Configurar permissões corretas
O cliente SSH rejeitará chaves privadas com permissões muito expostas:
```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/gcp_key
chmod 644 ~/.ssh/gcp_key.pub
```

### 3. Atalho de conexão em `~/.ssh/config`
Crie ou edite o arquivo `~/.ssh/config` local para simplificar a conexão:
```text
Host prod1-gcp
    HostName <SSH_HOST>
    User vier
    Port <SSH_PORT>
    IdentityFile ~/.ssh/gcp_key
    IdentitiesOnly yes
```
Agora, basta rodar: `ssh prod1-gcp`

### 4. Endurecimento do Servidor SSH (Prática Recomendada)
No arquivo `/etc/ssh/sshd_config` do servidor de destino, certifique-se de configurar as seguintes diretivas de segurança:
* **Desativar acesso root direto**: `PermitRootLogin no`
* **Desativar login por senha**: `PasswordAuthentication no`
* **Permitir apenas chaves públicas**: `PubkeyAuthentication yes`

---

## Diagnóstico em modo somente leitura (GCP VM)

Execute estes comandos de leitura na VM antiga para mapear as especificações do ambiente sem risco de parada:

### Sistema Operacional e Recursos
```bash
# Versão do Kernel e OS
uname -a
cat /etc/os-release

# Memória RAM livre e total
free -h

# Uso de CPU por núcleo
lscpu
top -b -n 1 | head -n 20

# Espaço em disco e uso de Inodes
df -h
df -i
```

### Portas, Processos e Redes
```bash
# Listar processos Python e serviços ativos
ps aux | grep -iE "python|bench|nginx|supervisor"

# Verificar portas e conexões abertas no host
sudo ss -tulpn

# Listar redes internas do Docker e volumes
docker network ls
docker volume ls
```

### Conectividade com Mattermost e Certificados SSL
```bash
# Testar resolução DNS e conectividade com a API do Mattermost (sem webhook real)
curl -I https://mattermost.com 2>/dev/null

# Verificar validade do certificado SSL local
sudo openssl x509 -noout -dates -in /etc/letsencrypt/live/<DOMINIO_DO_PROJETO>/fullchain.pem
```

---

## Preparação para migração (Checklist)

Antes da virada definitiva, garanta o cumprimento deste checklist de preparação:

- [ ] **Congelamento de Alterações**: Bloqueio de novos cadastros ou alterações de código durante a migração.
- [ ] **Inventário de Volumes**: Mapeamento de todas as pastas persistidas no host antigo.
- [ ] **Validação de Espaço**: Garantir que o host de destino (Hostinger) possui espaço em disco suficiente.
- [ ] **Backup do Banco**: Exportação da base MariaDB realizada e validada.
- [ ] **Sincronização de Arquivos**: Transferência das pastas `public/files` e `private/files` executada.
- [ ] **Janela de Manutenção**: Comunicar a equipe e os usuários e exibir tela de manutenção.
- [ ] **Notificação de Início**: Alerta emitido no canal do Mattermost.

---

## Exportação do banco de dados (MariaDB/MySQL)

Para evitar expor a senha do banco de dados no histórico do terminal (segurança de processos), utilize um arquivo de opções temporário protegido.

### Passo 1: Criar arquivo de opções seguro `.db_secrets.cnf`
```ini
[mysqldump]
host=localhost
port=3306
user=root
password=SUA_SENHA_AQUI
```
```bash
# Restringir acesso ao arquivo
chmod 600 .db_secrets.cnf
```

### Passo 2: Executar mysqldump com o arquivo de opções
```bash
mysqldump --defaults-extra-file=.db_secrets.cnf --single-transaction --routines --triggers --events <NOME_DO_BANCO> | gzip > "database_$(date +%Y%m%d_%H%M%S).sql.gz"
```

### Passo 3: Remover o arquivo de opções imediatamente
```bash
rm -f .db_secrets.cnf
```

---

## Compactação e transferência

### 1. Compactar pastas de arquivos anexos
```bash
# Compactar pastas públicas e privadas do Frappe/ERPNext
tar -czvf files_backup.tar.gz -C /home/frappe/frappe-bench/sites/[nome_do_site]/ private/files/ public/files/
```

### 2. Transferência segura usando `rsync`
O `rsync` é superior ao `scp` pois permite retomar a cópia em caso de oscilação de rede:
```bash
# Sincronizar banco e arquivos compactados do host antigo para a máquina local
rsync -avzP -e "ssh -i ~/.ssh/gcp_key -p <SSH_PORT>" vier@<SSH_HOST>:/var/backups/erpnext/database_*.sql.gz ./
rsync -avzP -e "ssh -i ~/.ssh/gcp_key -p <SSH_PORT>" vier@<SSH_HOST>:/var/backups/erpnext/files_backup.tar.gz ./
```

### 3. Validar integridade com SHA-256
```bash
# No servidor antigo (GCP)
sha256sum database_*.sql.gz > checksum.sha256

# Na máquina local (openSUSE)
sha256sum -c checksum.sha256
```

---

## Comunicação da migração no Mattermost

Utilize os seguintes modelos de payload para comunicar as janelas no Mattermost:

### Início da Migração:
```json
{
  "username": "MigrationBot",
  "text": "🚧 **MIGRAÇÃO INICIADA**: O NextERP está entrando em modo de manutenção para a migração planejada para a Hostinger. O acesso estará temporariamente indisponível."
}
```

### Conclusão com Sucesso:
```json
{
  "username": "MigrationBot",
  "text": "🎉 **MIGRAÇÃO CONCLUÍDA**: O ambiente NextERP foi migrado para a Hostinger com sucesso! Os testes de sanidade foram aprovados e o sistema está online."
}
```

---

## Validação pós-migração
Após subir o Docker Compose na Hostinger e restaurar a base de dados, execute as validações de integridade antes de reabrir o sistema:

1. **Checar integridade física de tabelas**:
   ```bash
   docker exec -it erpnext-db mysqlcheck -u root -p --all-databases
   ```
2. **Executar migrações pendentes e limpar cache**:
   ```bash
   docker exec -it erpnext-app bench --site site1.local migrate
   ```
3. **Validar uploads e permissões de escrita nos volumes**:
   ```bash
   docker exec -it erpnext-app touch /home/frappe/frappe-bench/sites/site1.local/public/files/.write_test
   docker exec -it erpnext-app rm /home/frappe/frappe-bench/sites/site1.local/public/files/.write_test
   ```
4. **Verificar logs de erro**:
   ```bash
   docker compose logs -f --tail=100
   ```
5. **Enviar notificação de conclusão ao Mattermost**.
