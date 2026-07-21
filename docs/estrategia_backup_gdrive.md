# Estratégia de Backups no Google Drive e Escalabilidade

Este documento detalha o funcionamento técnico da rotina de backups offsite direcionada ao Google Drive, o processo de migração das credenciais da equipe antiga para a CDC, e o plano de escalabilidade para suportar múltiplos sistemas da organização.

---

## 1. O que são "Tarballs Locais"?

O termo **Tarball** é um jargão do Linux para arquivos compactados com a extensão **`.tar.gz`** (ou `.tgz`). 
*   **Origem**: "Tar" vem de *Tape Archive* (criado na época em que arquivos eram gravados em fitas magnéticas). "Ball" faz referência a um "bolo" ou pacote de arquivos agrupados.
*   **Diferença para .zip**: O formato `.tar.gz` preserva perfeitamente todas as permissões especiais do Linux, donos dos arquivos (UID/GID) e links simbólicos. Por isso, no ecossistema Linux/Docker, ele é o formato padrão para backups e distribuição de códigos.
*   **Locais**: Refere-se aos arquivos `extractor_scripts.tar.gz` e `backup_scripts.tar.gz` que estão salvos na pasta `/backups` da sua máquina física openSUSE.

---

## 2. Fluxo do Google Drive (Independência da GCP)

A rotina de backup offsite funciona através de um script em Python (`bkp.py`) consumindo a API oficial do Google Drive. **Ela é 100% independente do local de hospedagem**. Ela funcionará na Hostinger da mesma forma que funcionava no GCP, pois exige apenas saída padrão de internet (HTTPS porta 443).

### Como o script se autentica no Google Drive:
1.  **`client_secret.json`**: Contém o ID de cliente e a chave secreta gerados no Console do Google (OAuth 2.0).
2.  **`token.pickle`**: Arquivo binário gerado na primeira execução. Ele armazena o token de acesso (access token) e o token de renovação (refresh token) da conta do Google do usuário que autorizou o script no navegador. 
3.  **Segurança**: Como o `token.pickle` atual pertence ao desenvolvedor antigo, precisamos gerar um novo associado à **sua conta da CDC** para que os backups entrem no seu Drive.

---

## 3. Configuração do Seu Google Drive Destino

### Passo 1: Definir a Pasta Alvo no seu Google Drive
1.  Acesse o seu Google Drive com a conta CDC desejada.
2.  Crie uma pasta chamada `Backups_NextERP_CDC` (ou nome equivalente).
3.  Entre nessa pasta e observe a barra de endereços do seu navegador. A URL será parecida com:
    `https://drive.google.com/drive/folders/1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P`
4.  O código longo ao final da URL (`1A2B3C4D5E6F...`) é o seu **ID da Pasta (Folder ID)**.

### Passo 2: Gerar Novas Credenciais do Google
Para gerar o seu próprio arquivo `token.pickle`:
1.  Executaremos o script `gerar_token.py` (fornecido nos tarballs) localmente na sua máquina openSUSE.
2.  O script abrirá o seu navegador padrão e pedirá para você logar com a sua conta do Google (CDC) e autorizar o aplicativo.
3.  O script gerará o novo arquivo `token.pickle` localmente.
4.  Copiaremos esse `token.pickle` definitivo para a pasta de backups no servidor da Hostinger.

---

## 4. Plano de Escalabilidade: CDC Backups Hub

Para evitar que cada sistema tenha um script diferente com credenciais e chaves espalhadas pela VPS, adotaremos um modelo modular e escalável:

### 4.1 Estrutura de Pastas Centralizada no Google Drive (Google Workspace)
Recomendamos criar uma estrutura hierárquica baseada em um **Drive Compartilhado (Shared Drive)** da empresa, evitando depender de drives pessoais:

```text
CDC - Backups Corporativos/ (Drive Compartilhado)
├── NextERP/
│   ├── Banco/             (Folder ID: ERP_DB_ID)
│   └── Arquivos/          (Folder ID: ERP_FILES_ID)
├── Moodle/
│   ├── Banco/             (Folder ID: MOODLE_DB_ID)
│   └── Arquivos/          (Folder ID: MOODLE_FILES_ID)
└── Outros Sistemas/
    └── Banco/             (Folder ID: OUTROS_DB_ID)
```

### 4.2 Script de Upload Modularizado (Gdrive Uploader CLI)
Vamos refatorar o script herdado da equipe antiga para se tornar um utilitário de linha de comando reutilizável. O script receberá o arquivo e a pasta destino como parâmetros:

```bash
# Exemplo de comando no cron de qualquer sistema:
python3 gdrive_uploader.py --file /backups/moodle_db.sql.gz --folder-id MOODLE_DB_ID
```

#### Código Conceitual do Uploader Reutilizável:
O script carregará as credenciais mestres (`token.pickle`) e usará o parâmetro `--folder-id` dinamicamente no payload do Google Drive:

```python
# Trecho do payload do uploader dinâmico
file_metadata = {
    'name': filename,
    'parents': [args.folder_id]  # ID da pasta destino passado como argumento
}
```

### 4.3 Alertas Unificados de Falha no Mattermost
Todos os scripts que fizerem upload para o Google Drive usarão a mesma API de alertas que configuramos. Em caso de falha de conexão ou token expirado do Google Drive, um alerta com o nome do sistema falho será enviado imediatamente para a equipe CDC:

> 🚨 **FALHA NO BACKUP OFFSITE**
> *   **Sistema**: Moodle CDC
> *   **Destino**: Google Drive Folder ID (`MOODLE_DB_ID`)
> *   **Erro**: `Access Token Expired` ou `Quota Exceeded`

---

## 5. Rclone: O Canivete Suíço Open Source para Backups em Nuvem

Embora possamos refatorar o script legado em Python (`bkp.py`), a melhor prática recomendada de engenharia de confiabilidade (DevOps) para consolidar o **CDC Backups Hub** é adotar o **Rclone**. Trata-se de um utilitário de linha de comando de código aberto que gerencia nativamente a sincronização com mais de 40 provedores de nuvem, incluindo o Google Drive.

### 5.1 Vantagens de Adotar o Rclone
*   **Manutenção Zero**: O Rclone gerencia a expiração e renovação de tokens OAuth de forma transparente. Não é necessário monitorar logs por falhas de tokens ou re-autenticar scripts Python manualmente.
*   **Sincronização Avançada**: Suporta cópias em lote, sincronização incremental (copia apenas novos arquivos) e verificação por hash MD5/SHA-1 para garantir que o arquivo subiu sem corrupção.
*   **Criptografia Integrada (Rclone Crypt)**: Permite que os arquivos sejam criptografados localmente na memória do servidor antes do upload para o Google Drive. Os arquivos salvos no Drive ficam totalmente ilegíveis para invasores ou administradores terceiros sem a chave mestra.
*   **Alta Performance**: Escrito em Go, é extremamente rápido e consome uma fração insignificante de memória RAM.

### 5.2 Fluxo de Configuração no Servidor
1.  **Instalação**:
    No openSUSE de laboratório ou na VPS de destino (Hostinger):
    ```bash
    sudo zypper install rclone  # openSUSE
    sudo apt install rclone     # Ubuntu/Debian na VPS Hostinger
    ```
2.  **Configuração Interativa**:
    Rode o utilitário interativo e crie uma nova conexão remota (ex: nome `cdc-gdrive`):
    ```bash
    rclone config
    ```
    *Siga o assistente de terminal escolhendo o tipo `Google Drive` e autorize o acesso através da tela de login do navegador da conta CDC.*

### 5.3 Comandos Práticos do "Backup Hub"
Com o Rclone configurado centralmente no host, qualquer cronjob ou script de qualquer sistema no servidor consegue enviar backups para o Drive com comandos extremamente limpos:

```bash
# 1. Enviar o dump de banco do NextERP para sua pasta específica:
rclone copy /backups/gcp-prod-database.sql.gz cdc-gdrive:CDC_Backups/NextERP/Banco/

# 2. Enviar arquivos de mídia do Moodle de forma incremental:
rclone copy /var/www/moodle/data cdc-gdrive:CDC_Backups/Moodle/Arquivos/ --size-only

# 3. Listar arquivos armazenados na nuvem para auditoria de TI:
rclone lsf cdc-gdrive:CDC_Backups/NextERP/Banco/
```

