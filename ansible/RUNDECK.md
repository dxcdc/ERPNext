# Contrato do Rundeck para o CDC NextERP

Este documento descreve a integração segura do NextERP com o **Rundeck (Community Edition)** no repositório central **CDC Automatiza** (`https://automatiza.cdc.org.br/`).
Ele não autoriza deploy automático sem a chave SHA completa e não armazena credenciais no repositório.

---

## 📌 Recursos do Projeto `NextERP` no Rundeck

- **Repositório Git:** `ssh://git@github-dxcdc:dxcdc/ERPNext.git`
- **Branch Inicial Controlada:** `lab/estabilizacao-tema-cdc`
- **Inventário do Repositório (Node Source):** `ansible/inventories/production/hosts.yml`
- **Diretório de Trabalho dos Jobs:** `ansible`
- **Credencial do Repositório:** Chave de deploy GitHub (somente leitura)
- **Credencial de Acesso aos Nós:** Chave SSH cadastrada no Rundeck Key Storage (`keys/cdc_vps_ssh`)

As chaves devem ser separadas, cadastradas no *Key Storage* do Rundeck e nunca gravadas no repositório. O acesso SSH à VPS deve utilizar o princípio do menor privilégio.

---

## 📋 Mapeamento de Jobs do NextERP

Criar no projeto `NextERP` do Rundeck os seguintes Jobs:

| Job no Rundeck | Playbook Ansible | Mutável | Liberação Inicial |
| :--- | :--- | :--- | :--- |
| **Auditoria NextERP** | `playbooks/audit.yml` | Não (Somente leitura) | Liberado |
| **Validação NextERP** | `playbooks/validate.yml` | Não (Somente leitura) | Liberado |
| **Backup NextERP** | `playbooks/backup.yml` | Sim | Liberado |
| **Deploy NextERP** | `playbooks/deploy.yml` | Sim | Requer entrada de `release_commit` |
| **Rollback NextERP** | `playbooks/rollback.yml` | Sim | Requer `confirm_rollback` |
| **Importar pedidos Core no estoque NextERP** | `06_core_stock_import.yml` no CDC Automatiza | Sim | Execução liberada; agenda suspensa durante reconciliação do backlog |

O deploy exige que o SHA completo de 40 caracteres já exista no Git da VPS. Não se deve contornar essa proteção usando a última revisão da branch.

---

## 🛡️ Entradas Obrigatórias & Parâmetros

- **Deploy:** Parâmetro `release_commit` (exatamente 40 caracteres hexadecimais).
- **Rollback:** Parâmetro `rollback_commit` e confirmação `confirm_rollback=ROLLBACK-CODIGO`.
- **Restauração de Banco:** Não criar Job enquanto os ensaios fora de produção não tiverem sido concluídos.

Não permitir argumentos Ansible livres para operadores comuns. As entradas devem ser campos estritamente controlados pelo formulário de opções do Job no Rundeck.

---

## 🔒 Concorrência e Auditoria

Backup, deploy e rollback compartilham o lock de execução `cdc_deploy_lock`. Assim, Jobs simultâneos não podem alterar a VPS ao mesmo tempo. Auditoria e validação permanecem em modo somente leitura.

O importador de estoque também respeita o lock de deploy e o lock próprio do
extrator. O `cdc-ongsys-stock-import.timer` deve permanecer desabilitado para
que o Rundeck seja o único agendador. O job versionado roda no minuto 50,
depois da atualização do snapshot do Core no minuto 40, mas sua agenda somente
deve ser habilitada após reconciliar ou delimitar o backlog anterior.

O histórico de execuções é retido e auditado na própria interface do Rundeck com suporte a alertas via Webhook no canal de infraestrutura do Mattermost.
