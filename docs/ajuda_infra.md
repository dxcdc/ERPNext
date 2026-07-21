# Ajuda de Infraestrutura

Este documento descreve a infraestrutura baseada em Docker Compose, a topologia de rede isolada por serviço, as portas expostas, a configuração de variáveis de ambiente e a integração de alertas com o Mattermost.

---

## Arquitetura atual
A arquitetura do NextERP está conteinerizada e dividida em microsserviços para garantir resiliência e facilidade de atualização:

* **Aplicação Principal**: ERPNext v14 (rodando em Python/Frappe).
* **Banco de Dados**: MariaDB v10.6.
* **Cache e Filas**: Redis v6.2 (separado em instâncias de cache, fila e socketio).
* **Proxy Web**: Nginx (para servir assets estáticos e proxy reverso local).
* **Extrator de Dados**: Script isolado em Python que faz sincronização de dados via API.
* **Comunicação/Alertas**: Mattermost via Webhooks de Entrada.

---

## Containers (Docker Compose de Referência)
Abaixo está o arquivo `docker-compose.yml` que define os serviços locais e de produção:

```yaml
version: '3.8'

services:
  db:
    image: mariadb:10.6
    container_name: erpnext-db
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
    volumes:
      - db-data:/var/lib/mysql
    networks:
      - backend-net
    restart: always

  redis-cache:
    image: redis:6.2-alpine
    container_name: erpnext-redis-cache
    networks:
      - backend-net
    restart: always

  redis-queue:
    image: redis:6.2-alpine
    container_name: erpnext-redis-queue
    networks:
      - backend-net
    restart: always

  redis-socketio:
    image: redis:6.2-alpine
    container_name: erpnext-redis-socketio
    networks:
      - backend-net
    restart: always

  erpnext-app:
    image: frappe/erpnext:v14
    container_name: erpnext-app
    environment:
      DB_HOST: db
      REDIS_CACHE: redis-cache:6379
      REDIS_QUEUE: redis-queue:6379
      REDIS_SOCKETIO: redis-socketio:6379
      MATTERMOST_ENABLED: ${MATTERMOST_ENABLED}
      MATTERMOST_WEBHOOK_URL: ${MATTERMOST_WEBHOOK_URL}
      MATTERMOST_CHANNEL: ${MATTERMOST_CHANNEL}
    volumes:
      - assets-volume:/home/frappe/frappe-bench/sites/assets
      - sites-volume:/home/frappe/frappe-bench/sites
    networks:
      - backend-net
      - frontend-net
    restart: always

  erpnext-worker-default:
    image: frappe/erpnext:v14
    container_name: erpnext-worker-default
    command: bench worker
    volumes:
      - sites-volume:/home/frappe/frappe-bench/sites
    networks:
      - backend-net
    restart: always

  erpnext-scheduler:
    image: frappe/erpnext:v14
    container_name: erpnext-scheduler
    command: bench schedule
    volumes:
      - sites-volume:/home/frappe/frappe-bench/sites
    networks:
      - backend-net
    restart: always

  nginx:
    image: frappe/nginx:v14
    container_name: erpnext-nginx
    environment:
      UPSTREAM_REAL_IP_ADDRESS: erpnext-app
      UPSTREAM_REAL_IP_PORT: 8000
    volumes:
      - assets-volume:/usr/share/nginx/html/assets
      - sites-volume:/usr/share/nginx/html/sites
    ports:
      - "8080:80"
    networks:
      - frontend-net
    restart: always

  data-extractor:
    build: ./services/extractor
    container_name: isolated-data-extractor
    environment:
      - ERPNEXT_API_URL=http://nginx/api/method/
      - ERPNEXT_API_KEY=${EXTRACTOR_API_KEY}
      - ERPNEXT_API_SECRET=${EXTRACTOR_API_SECRET}
    networks:
      - extractor-net
      - frontend-net
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
    restart: always

networks:
  frontend-net:
    driver: bridge
  backend-net:
    driver: bridge
  extractor-net:
    driver: bridge

volumes:
  db-data:
  assets-volume:
  sites-volume:
```

---

## Isolamento de rede
Para impedir vulnerabilidades na rede interna:
* **MariaDB (`db`) e instâncias Redis**: Estão presentes apenas na rede privada `backend-net`. Eles **não possuem portas publicadas no host**.
* **ERPNext Web (`erpnext-app`) e Nginx**: Atuam como intermediários, expondo apenas a porta `8080` do Nginx no host.
* **Extrator de Dados (`data-extractor`)**: Fica na rede privada `extractor-net` e acessa o Nginx na rede `frontend-net`. Ele **não consegue acessar** diretamente o MariaDB ou o Redis do ERPNext.

---

## Configuração do arquivo `.env`
O arquivo `.env` contém os valores reais das credenciais do projeto e fica excluído do Git (declarado no `.gitignore`). 

Para configurar o ambiente de execução:
1. Copie o modelo do arquivo de exemplo:
   ```bash
   cp .env.example .env
   ```
2. Abra o `.env` e preencha com as senhas, chaves de criptografia e webhooks reais.

> [!WARNING]
> **Segurança de credenciais**: NUNCA envie o arquivo `.env` preenchido ao repositório Git.

---

## Integração com Mattermost
O NextERP suporta alertas automáticos operacionais (dumps de backup, indisponibilidades, auditorias e logs de erro).

* **Webhook de Entrada**: O webhook é configurado pela variável `MATTERMOST_WEBHOOK_URL`.
* **Tratamento de Segredo**: O webhook é tratado como chave de segurança. Ele nunca deve constar em códigos, documentações ou ser enviado em texto limpo nas notificações.
* **Independência Operacional**: Se o Mattermost cair, as tarefas do sistema (como backups e transações do ERPNext) **devem continuar rodando** normalmente. O script deve capturar o erro da requisição de webhook, logar o erro localmente e seguir em frente sem travar o processo principal.

### Teste Manual de Integração do Mattermost:
Execute este comando no terminal para testar se a integração com o Mattermost está funcionando, utilizando a variável carregada:
```bash
curl --fail --silent --show-error --max-time "${MATTERMOST_TIMEOUT_SECONDS:-10}" -X POST -H "Content-Type: application/json" -d '{"text":"Teste de conexão do webhook do Mattermost realizado com sucesso."}' "$MATTERMOST_WEBHOOK_URL"
```

---

## DNS e serviços externos
Mapeamento dos registros DNS essenciais para o funcionamento do ambiente na Hostinger:

| Tipo | Nome | Destino ou valor | TTL | Finalidade |
| :--- | :--- | :--- | :--- | :--- |
| A | erp.<DOMINIO_DO_PROJETO> | <ENDERECO_DO_SERVIDOR> | 3600 | Acesso ao ERPNext |
| TXT | erp.<DOMINIO_DO_PROJETO> | v=spf1 include:hosts.hostinger.com ~all | 3600 | Política SPF para e-mails |

---

## Portas

| Serviço | Porta interna | Porta externa | Protocolo | Exposição |
| :--- | :---: | :---: | :--- | :--- |
| Nginx (`nginx`) | 80 | 8080 | TCP | Externa (Receptor HTTP) |
| MariaDB (`db`) | 3306 | - | TCP | Apenas interna (`backend-net`) |
| Redis (`redis-cache`) | 6379 | - | TCP | Apenas interna (`backend-net`) |

---

## Inicialização e encerramento

### Comandos de Controle da Infraestrutura:
```bash
# Subir contêineres em segundo plano
docker compose up -d

# Parar serviços (preservando volumes)
docker compose down

# Parar serviços removendo volumes (Cuidado: apaga banco local)
docker compose down -v

# Acompanhar logs de erros em tempo real
docker compose logs -f --tail=50

# Reconstruir a imagem do Extrator de Dados
docker compose build data-extractor
```
