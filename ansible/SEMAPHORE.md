# Contrato do Semaphore para o CDC NextERP

Este documento descreve a primeira integracao segura com o Ansible Semaphore.
Ele nao autoriza deploy nem armazena credenciais.

## Recursos do projeto

- Repositorio: `ssh://git@github.com/dxcdc/ERPNext.git`
- Branch inicial controlada: `lab/estabilizacao-tema-cdc`
- Inventario do repositorio: `ansible/inventories/production/hosts.yml`
- Diretorio de trabalho dos templates: `ansible`
- Credencial do repositorio: chave de deploy GitHub somente leitura
- Credencial do inventario: chave SSH exclusiva do Semaphore

As chaves devem ser diferentes, cadastradas no Key Store e nunca gravadas no
repositorio. A chave da VPS deve iniciar com o menor privilegio operacional
possivel; enquanto o inventario usar `root`, seu uso deve ficar restrito aos
templates e operadores autorizados.

## Primeira liberacao

Criar inicialmente apenas estes templates:

| Template | Playbook | Mutavel | Liberacao inicial |
| --- | --- | --- | --- |
| Auditoria NextERP | `playbooks/audit.yml` | Nao | Liberado |
| Validacao NextERP | `playbooks/validate.yml` | Nao | Liberado |
| Backup NextERP | `playbooks/backup.yml` | Sim | Apos teste de lock |
| Deploy NextERP | `playbooks/deploy.yml` | Sim | Bloqueado |
| Rollback NextERP | `playbooks/rollback.yml` | Sim | Bloqueado |

O deploy permanece bloqueado porque exige que o SHA completo ja exista no Git
da VPS. Nao se deve contornar essa protecao usando a ultima revisao da branch.
Primeiro sera implementado e testado um transporte verificavel da revisao.

## Entradas obrigatorias

- Deploy: `release_commit`, exatamente 40 caracteres hexadecimais.
- Rollback: `rollback_commit` e `confirm_rollback=ROLLBACK-CODIGO`.
- Restauracao de banco: nao criar template enquanto o ensaio externo nao tiver
  sido concluido.

Nao permitir argumentos Ansible livres para operadores comuns. As entradas
devem ser campos controlados pelo template.

## Concorrencia e auditoria

Backup, deploy e rollback compartilham `cdc_deploy_lock`. Assim, templates
diferentes tambem nao podem alterar a VPS ao mesmo tempo. Auditoria e validacao
continuam somente leitura.

Manter historico de execucoes e limitar sua retencao conforme a politica da CDC.
O relatorio JSON da auditoria e produzido no controlador e nao deve conter
segredos.

## Ordem de homologacao

1. Conectar repositorio com chave somente leitura.
2. Cadastrar a chave SSH exclusiva e o inventario.
3. Executar Auditoria NextERP.
4. Executar Validacao NextERP.
5. Testar concorrencia do Backup NextERP sem deploy simultaneo.
6. Implementar transporte verificavel do SHA para a VPS.
7. Homologar Deploy e Rollback com operador autorizado.

Essa mesma separacao entre repositorio, inventario, credenciais e templates deve
ser repetida no Core, sem compartilhar chaves entre as duas aplicacoes.
