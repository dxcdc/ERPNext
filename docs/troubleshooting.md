# Resolução de Problemas (Troubleshooting)

Este manual provê orientações rápidas para diagnóstico e solução de incidentes na infraestrutura do NextERP, divididos por categorias operacionais.

---

## 🚨 Checklist de Emergência (Sequência Rápida de Diagnóstico)
Em caso de indisponibilidade ou falha crítica do sistema, execute os seguintes passos na ordem indicada:

1. **Verificar espaço em disco**: Execute `df -h` para garantir que o disco não está com 100% de uso.
2. **Verificar uso de memória**: Execute `free -m` para checar se há memória RAM disponível.
3. **Verificar contêineres ativos**: Execute `docker compose ps` para ver se algum container caiu ou está em loop de reinicialização.
4. **Verificar healthchecks**: Inspecione o status dos serviços com `docker inspect --format='{{json .State.Health}}' <container_id>`.
5. **Verificar portas escutando**: Rode `sudo ss -tulpn` para ver se a porta `8080` do Nginx está ativa.
6. **Verificar conexão com o banco**: Teste a conectividade do MariaDB rodando `docker exec -it erpnext-db mysqladmin -u root -p ping`.
7. **Ler logs recentes**: Rode `docker compose logs -f --tail=100` e procure por exceções.
8. **Verificar resolução DNS**: Execute `nslookup erp.<DOMINIO_DO_PROJETO>` para garantir o apontamento de IP.
9. **Verificar certificados**: Cheque se os certificados SSL do Let's Encrypt não estão expirados.
10. **Testar envio para o Mattermost**: Force o envio de um alerta manual para checar se a comunicação está ativa.
11. **Registrar as ações**: Anote todas as alterações executadas e comandos rodados para o Postmortem.
12. **Comunicar o status**: Envie atualizações no canal apropriado de incidentes do Mattermost.

---

## 1. Problemas de Contêineres e Docker

### Sintoma: Container em loop de reinicialização (`Restarting...`)
* **Causa provável**: Arquivo `.env` ausente ou mal configurado no host, variáveis obrigatórias vazias ou conflito de portas de rede.
* **Diagnóstico**: Inspecione os logs do contêiner específico:
  ```bash
  docker logs erpnext-app --tail=50
  ```
* **Correção**: Compare as variáveis do arquivo `.env` local com o `.env.example`. Valide se todas as variáveis obrigatórias do MariaDB e Redis possuem valores.
* **Prevenção**: Garanta que as imagens Docker sejam exaustivamente testadas localmente antes do deploy.

### Sintoma: Erro de permissão em volumes montados (`Permission Denied`)
* **Causa provável**: O Docker montou a pasta local sob propriedade do usuário `root` do host, enquanto o container Frappe tenta ler/escrever usando o usuário interno `frappe` (UID 1000).
* **Como Resolver**: NUNCA utilize `chmod 777`. Ajuste a propriedade e as permissões mínimas no host:
  ```bash
  # Mudar proprietário das pastas de volumes montados
  sudo chown -R 1000:1000 /var/lib/docker/volumes/next-erp-sites/
  # Garantir permissão de leitura/escrita para o proprietário
  chmod -R 755 /var/lib/docker/volumes/next-erp-sites/
  ```

---

## 2. Problemas do Banco de Dados (MariaDB)

### Sintoma: Conexão Recusada (`Can't connect to MySQL server on 'db'`)
* **Causa provável**: O MariaDB ainda não inicializou totalmente ou parou devido a falha na configuração de codificação de caracteres exigida pelo Frappe.
* **Diagnóstico**: Verifique os logs do banco de dados:
  ```bash
  docker logs erpnext-db
  ```
* **Correção**: Certifique-se de que o arquivo customizado `mariadb.cnf` foi mapeado para `/etc/mysql/conf.d/` no container. Ele deve conter:
  ```ini
  [mysqld]
  character-set-client-handshake = FALSE
  character-set-server = utf8mb4
  collation-server = utf8mb4_unicode_ci
  ```
* **Validação**: Teste conectar ao mysql de dentro do container da aplicação:
  ```bash
  docker exec -it erpnext-app mysql -u root -p -h db
  ```

---

## 3. Problemas da Aplicação (ERPNext/Frappe)

### Sintoma: Quebra de layout ou CSS ausente na interface web
* **Causa provável**: Assets estáticos do Frappe/ERPNext não foram compilados ou a pasta de assets não foi mapeada corretamente para o volume compartilhado do Nginx.
* **Correção**: Execute a compilação e migração de assets por dentro do container do app:
  ```bash
  docker exec -it erpnext-app bench --site site1.local build
  docker exec -it erpnext-app bench --site site1.local clear-cache
  ```

---

## 4. Problemas de E-mail (SMTP)

### Sintoma: E-mails não são disparados ou dão timeout
* **Causa provável**: Porta SMTP incorreta configurada (ex: tentar usar TLS puro na porta 587 em vez de STARTTLS), ou regras de firewall bloqueando conexões de saída nas portas `465` ou `587`.
* **Diagnóstico**: Teste a conectividade SMTP por dentro do container do ERPNext usando telnet/nc:
  ```bash
  docker exec -it erpnext-app nc -zv <SERVIDOR_SMTP> 587
  ```
* **Correção**: Verifique se o formato no `.env` está correto. Utilize preferencialmente STARTTLS na porta `587` ou SSL puro na porta `465`.

---

## 5. Problemas de Interface e Layout

### Sintoma: Quebra de layout, CSS/SCSS desalinhado ou ícones quebrados
* **Causa provável**: Arquivos CSS/SCSS de customizações conflitantes ou falha no mapeamento do volume de assets compartilhado com o Nginx.
* **Diagnóstico**: Inspecione o console do desenvolvedor do navegador (F12) para ver se há erros HTTP 404 ao carregar arquivos `.css` ou `.js`.
* **Correção**:
  * Force a recompilação e sincronização dos assets do Frappe:
    ```bash
    docker exec -it erpnext-app bench --site site1.local build
    docker exec -it erpnext-app bench --site site1.local clear-cache
    ```
  * Verifique se as permissões de leitura do volume compartilhado de assets estão adequadas:
    ```bash
    sudo chmod -R 755 /var/lib/docker/volumes/next-erp-assets/_data/
    ```

### Sintoma: Botões não responsivos ou travamentos de tela (Variáveis JS indefinidas)
* **Causa provável**: Cache corrompido no LocalStorage do navegador do usuário ou scripts customizados com variáveis indefinidas.
* **Correção**: 
  * Instrua o usuário a realizar a limpeza de cache local (Ctrl+Shift+R) ou limpar o LocalStorage do navegador via console do desenvolvedor:
    ```javascript
    localStorage.clear();
    sessionStorage.clear();
    ```
  * Inspecione o log de erros de JS no console do navegador e corrija a ordem de carregamento dos scripts no arquivo `hooks.py` do Custom App.

---

## 6. Problemas do Webhook do Mattermost

Ao integrar notificações automáticas, o webhook pode falhar e registrar erros HTTP. Utilize este guia de mitigação de erros HTTP:

### Erros de Payload e Conectividade
* **HTTP 400 (Bad Request)**: Payload JSON inválido. Garanta que o JSON enviado pelo curl ou script esteja devidamente escapado (ex: aspas duplas, barras invertidas e caracteres de quebra de linha tratados).
* **HTTP 403 (Forbidden) ou 404 (Not Found)**: A URL do webhook foi alterada, expirou ou o canal de alertas foi deletado do Mattermost.
* **HTTP 429 (Too Many Requests)**: Limite de taxa de envio de mensagens estourado no servidor do Mattermost (rate limiting).
* **Timeout ou Erros de DNS**: O container não consegue resolver o domínio do Mattermost. Verifique a resolução DNS de dentro do container:
  ```bash
  docker exec -it erpnext-app nslookup mattermost.com
  ```

> [!IMPORTANT]
> **Sanitização de Logs**: NUNCA copie strings de logs contendo tokens de webhooks do Mattermost ou credenciais em texto puro ao debugar. Sempre substitua a URL real por `<MATTERMOST_WEBHOOK_URL>` antes de arquivar ou postar mensagens no fórum de suporte.

---

## 6. Mapeamento e Análise de Logs

### Comandos úteis de monitoramento de logs:
```bash
# Ler logs consolidados de todos os contêineres do docker-compose
docker compose logs -f --tail=100

# Filtrar por erros no container do ERPNext App
docker logs erpnext-app 2>&1 | grep -iE "error|exception|critical"

# Acompanhar logs de erros do Nginx proxy
docker logs erpnext-nginx 2>&1 | grep -i "error"
```

---

## 7. Histórico de Ocorrências e Lições Aprendidas (Laboratório Local)

Esta seção documenta problemas reais ocorridos durante a homologação e testes de migração no laboratório local (openSUSE) e suas respectivas soluções permanentes. **Não remova registros anteriores.**

### Ocorrência 01: Conflito de Portas de Rede (Bind Port 8080 Failed)
*   **Sintoma**: O contêiner do frontend do ERPNext falha ao iniciar com o erro: `Bind for 0.0.0.0:8080 failed: port is already allocated`.
*   **Causa**: Outro serviço local no host (como Nginx Proxy Manager) já estava escutando e reservando a porta `8080`.
*   **Solução Aplicada**: Alterada a porta mapeada do frontend no arquivo `docker-compose.yml` local para `8085:8080`. O acesso local foi redirecionado para `http://localhost:8085`.
*   **Lição Aprendida**: Em ambientes de homologação ou laboratórios locais compartilhados, portas padrões de web proxies (`8080`, `80`, `443`) frequentemente colidem com ferramentas locais. Utilizar portas não convencionais (`8085`, `8090`) garante o isolamento dos testes.

### Ocorrência 02: Ambiente Virtual Python Corrompido (Debian -> openSUSE)
*   **Sintoma**: Ao rodar o script de agendamento do extrator (`run_job.sh`), o pip falhava acusando o erro `externally-managed-environment` (bloqueio PEP 668 de pacotes do sistema).
*   **Causa**: O diretório `venv` (virtualenv) foi copiado diretamente do servidor GCP que roda Debian. Os atalhos e links simbólicos internos apontavam para o interpretador e caminhos absolutos do Debian, falhando no openSUSE e fazendo o pip tentar instalar as dependências de forma global no sistema.
*   **Solução Aplicada**: Deletada a pasta de ambiente virtual importada do GCP (`rm -rf legacy_src/extractor/cdcimplant/venv`) e executado o script novamente, permitindo que o interpretador local do openSUSE criasse um `venv` nativo e isolado.
*   **Lição Aprendida**: NUNCA migre ou reaproveite pastas de ambientes virtuais (`venv`, `.env`, `node_modules`) entre sistemas operacionais ou distribuições Linux diferentes. O deploy deve sempre prever a reconstrução limpa das dependências locais.

### Ocorrência 03: Erro de Acesso Negado ao Banco de Dados (Access Denied / HTTP 500)
*   **Sintoma**: O ERPNext local retornava `HTTP 500` na API e os logs do backend mostravam `pymysql.err.OperationalError: (1045, "Access denied for user '_5e5899d8398b5f7b'...")`.
*   **Causa**: O container de subida inicial (`create-site`) havia criado o site `frontend` com uma senha de banco de dados gerada aleatoriamente. Quando copiamos o arquivo de configuração de produção `site_config.json` (que contém a senha de produção antiga) e restauramos os dados, o usuário interno do MariaDB permaneceu associado à senha aleatória criada no primeiro boot, resultando em desalinhamento de credenciais.
*   **Solução Aplicada**: Acessado o container de banco MariaDB (`nexterp-db-1`) e executada a alteração manual da senha do usuário do site para coincidir com o `site_config.json`: `ALTER USER '_5e5899d8398b5f7b'@'%' IDENTIFIED BY '4aeed6qdlEJYeyIN'; FLUSH PRIVILEGES;`.
*   **Lição Aprendida**: Em restaurações onde os contêineres realizam rotinas automáticas de criação de bancos antes de aplicar os dumps, certifique-se de forçar a sincronia da senha do banco de dados no MariaDB com o valor configurado no arquivo `site_config.json`.

### Ocorrência 04: Falha ao Criar Issues no GitHub Actions (`could not add label: 'x' not found`)
*   **Sintoma**: O workflow `.github/workflows/automatizar_issues.yml` falhava com `Error: Process completed with exit code 1` exibindo a mensagem `could not add label: 'docker' not found`.
*   **Causa**: O comando GitHub CLI `gh issue create --label "..."` exige que os rótulos especificados já existam nos metadados do repositório GitHub. Em repositórios novos, rótulos customizados (`docker`, `architecture`, `rclone`, `mattermost`, etc.) não vêm pré-cadastrados.
*   **Solução Aplicada**: Implementada a função `ensure_labels_exist` utilizando `gh label create "$label" --force --color "0E8A16"` antes de chamar `gh issue create`. O uso de `--force` torna a criação idempotente (cria o rótulo se ausente, ou o mantém inalterado se existente).
*   **Lição Aprendida**: Scripts de automação de CI/CD não devem assumir a presença de metadados externos. Sempre providencie o auto-provisionamento idempotente das dependências antes de invocar comandos de atribuição.

