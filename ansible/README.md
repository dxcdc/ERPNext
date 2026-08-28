# Ansible da VPS CDC NextERP

Esta automacao gerencia a VPS Docker Compose em `/opt/nexterp/code`. O Terraform existente
continua responsavel pelo laboratorio Docker local.

## Principios de seguranca

- O primeiro contato deve usar apenas `audit.yml`.
- Nenhum segredo, chave ou senha pertence ao inventario versionado.
- O deploy exige SHA completo, worktree remoto limpo e backup anterior.
- O dominio publico passa pela Cloudflare; o inventario usa o endereco SSH direto.
- O timer ONGSYS em Systemd e observado, mas nao e alterado nesta primeira versao.
- Reinicios usam nomes explicitos de conteineres e nao carregam segredos do `.env`.
- O deploy recusa revisoes que ainda nao estejam disponiveis no Git da VPS.
- Rollback de codigo e restauracao de banco sao operacoes diferentes.
- A restauracao automatica de banco permanece bloqueada ate existir ensaio fora
  de producao.
- Um HTTP publico nao substitui a validacao autenticada da interface.

## Preparacao local

```bash
python3 -m venv ansible/.venv
ansible/.venv/bin/pip install -r ansible/requirements.txt
```

## Auditoria somente leitura

```bash
cd ansible
ANSIBLE_HOME=.home .venv/bin/ansible-playbook playbooks/audit.yml --diff
```

O playbook remoto e somente leitura; apenas o relatorio local em
`ansible/reports/` e criado e ele nao sera versionado.

## Validacoes locais

```bash
cd ansible
ANSIBLE_HOME=.home .venv/bin/ansible-playbook playbooks/audit.yml --syntax-check
ANSIBLE_HOME=.home .venv/bin/ansible-playbook playbooks/deploy.yml --syntax-check \
  -e release_commit=0000000000000000000000000000000000000000
ANSIBLE_HOME=.home XDG_CACHE_HOME=.home/cache .venv/bin/ansible-lint
```

## Backup explicito

```bash
ANSIBLE_HOME=.home .venv/bin/ansible-playbook playbooks/backup.yml
```

## Deploy

O SHA precisa existir previamente no repositório da VPS. O primeiro deploy real
somente deve ocorrer depois da revisao do relatorio de auditoria.

```bash
ANSIBLE_HOME=.home .venv/bin/ansible-playbook playbooks/deploy.yml \
  -e release_commit=<sha-completo>
```

## Rollback de codigo

```bash
ANSIBLE_HOME=.home .venv/bin/ansible-playbook playbooks/rollback.yml \
  -e rollback_commit=<sha-completo> \
  -e confirm_rollback=ROLLBACK-CODIGO
```

`restore_database.yml` valida a autorizacao e o arquivo, mas termina bloqueado
por projeto. A restauracao somente sera implementada depois de um ensaio em
ambiente nao produtivo.
