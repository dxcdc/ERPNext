# Guia de Automação de CI/CD com GitHub Actions: NextERP (CDC)

Este documento detalha os fluxos automatizados do GitHub Actions configurados no repositório **NextERP (CDC)**. As automações seguem o padrão corporativo de governança de TI da CDC (`dxcdc`), garantindo rastreabilidade, aprovação de contribuições e publicação contínua de tarefas.

---

## 📌 Visão Geral dos Workflows

O repositório possui dois fluxos principais de automação localizados no diretório `.github/workflows/`:

1. **`automatizar_issues.yml`**: Automação da publicação e sincronização de GitHub Issues a partir do backlog de planejamento do projeto.
2. **`auto_merge_pr.yml`**: Aprovação e fusão (*merge*) automática de Pull Requests validados, com limpeza da branch de trabalho.

---

## 🚀 1. Workflow: Automatizar Criação de Issues (`automatizar_issues.yml`)

### Propósito
Garantir que todas as tarefas e demandas técnicas mapeadas no planejamento estratégico (`docs/issues_planejamento.md`) sejam automaticamente convertidas em **GitHub Issues** interativas na aba *Issues* do repositório, sem duplicação.

### Gatilhos (`on`)
- **`push`** na branch `main`.
- **`workflow_dispatch`** (disparo manual no painel do GitHub Actions).

### Permissões Exigidas
```yaml
permissions:
  contents: read
  issues: write
```

### Mecanismo de Prevenção de Duplicidade
Antes de criar qualquer Issue, o script executa uma consulta pela API do GitHub usando o GitHub CLI (`gh issue list --search`):
```bash
existing=$(gh issue list --search "$search_term" --json title --jq '.[] | .title' | head -n 1)
```
Se a busca retornar um resultado existente, o fluxo ignora a criação e prossegue para a próxima tarefa.

### Estrutura das Issues Criadas
Cada Issue criada contém:
- **Prefixo de Categoria**: `[ARCH]`, `[FEAT]`, `[CONFIG]`, `[SECURITY]`, `[DOCS]`, `[BUG]`.
- **Rótulos (Labels)**: Classificação adequada (ex: `enhancement`, `docker`, `security`, `devops`).
- **Checklists Interativos**: Caixas de verificação `- [ ]` para acompanhamento do progresso.
- **Links para Documentação**: Links diretos apontando para arquivos em `docs/`.

### Auto-provisionamento Idempotente de Rótulos (Labels)
Para prevenir falhas do tipo `could not add label: 'x' not found` em repositórios novos, o workflow executa a função `ensure_labels_exist()` antes da criação de cada Issue:
```bash
ensure_labels_exist() {
  local labels="$1"
  IFS=',' read -ra LABEL_ARRAY <<< "$labels"
  for label in "${LABEL_ARRAY[@]}"; do
    label=$(echo "$label" | xargs)
    if [ -n "$label" ]; then
      gh label create "$label" --force --color "0E8A16" --description "Label corporativa CDC" 2>/dev/null || true
    fi
  done
}
```
O uso do parâmetro `--force` garante a criação idempotente do rótulo sem interromper o workflow caso ele já exista.

---

## 🔀 2. Workflow: Auto-Merge de Pull Requests (`auto_merge_pr.yml`)

### Propósito
Agilizar a integração contínua (CI) ao aprovar e mesclar automaticamente Pull Requests de contribuição ou atualizações de dependências após validação.

### Gatilhos (`on`)
- **`pull_request_target`** com os eventos: `opened`, `synchronize`, `reopened`.

### Permissões Exigidas
```yaml
permissions:
  contents: write
  pull-requests: write
```

### Sequência de Execução
```bash
# 1. Aprovação do PR
gh pr review "$PR_URL" --approve --body "Aprovado automaticamente via GitHub Actions CI/CD CDC Standard."

# 2. Fusão do PR e exclusão da branch
gh pr merge "$PR_URL" --merge --delete-branch
```

---

## 🔐 Configuração de Segredos e Permissões

Todos os workflows utilizam a variável de ambiente secreta padrão do GitHub:
```yaml
env:
  GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Configurações necessárias no repositório GitHub:
1. Em **Settings > Actions > General > Workflow permissions**:
   - Selecione **Read and write permissions**.
   - Marque a opção **Allow GitHub Actions to create and approve pull requests**.

---

## 📋 Resumo das Boas Práticas

| Item | Regra de Governança CDC |
| :--- | :--- |
| **Sintaxe de Scripts** | Todos os scripts Bash em workflows devem passar pela validação `bash -n`. |
| **Segurança** | Nunca expor tokens pessoais; utilizar sempre o `${{ secrets.GITHUB_TOKEN }}`. |
| **Idempotência** | Fluxos de criação de recursos devem verificar a existência antes da criação. |
| **Limpeza de Branches** | Branches temporárias de PR devem ser removidas automaticamente após o merge. |
