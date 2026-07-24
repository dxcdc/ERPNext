# Postmortem - Análise Sem Culpabilização (Blameless)

Este documento descreve a diretriz e fornece o template padrão para análises pós-incidente operadas pela equipe técnica da CDC.

O objetivo de um Postmortem é realizar uma investigação estruturada sobre um incidente ocorrido em ambiente de produção para entender suas causas, os gargalos operacionais e propor ações corretivas definitivas. Todo o processo deve ser focado em **aprimorar sistemas e processos**, nunca em atribuir culpa a indivíduos.

---

## 📝 Template de Postmortem

Copie o template abaixo para documentar incidentes futuros no repositório.

```markdown
# [ID-ANO-INCIDENTE] Postmortem: [Nome Resumido do Incidente]

**Data do Incidente**: AAAA-MM-DD  
**Responsáveis pela Análise**: [Nomes/Cargos]  
**Severidade**: [Baixa / Média / Alta / Crítica]  
**Ambiente**: [Produção (Hostinger) / Laboratório]  
**Duração da Indisponibilidade**: [X horas e Y minutos]  
**Canal de Coordenação do Mattermost**: `#war-room-incidentes`  

---

### 1. Resumo Executivo
*Descreva brevemente o que aconteceu, as consequências observadas, e como a falha foi solucionada de forma imediata e definitiva.*

### 2. Sintomas
*Quais foram os sinais do erro? Descreva alertas gerados pelo monitoramento, mensagens recebidas via webhook no Mattermost ou reportes dos usuários.*

### 3. Impacto
*Quantificados e qualitativos:*
* **Serviços afetados**: [ex: API de Extrator de dados ou interface ERPNext]
* **Usuários impactados**: [X% de usuários ativos]
* **Impacto Operacional**: [ex: impossibilidade de faturar notas durante 2 horas]
* **Vazamento ou Risco de Dados**: [Sim/Não - se sim, descreva]

### 4. Linha do Tempo (Timeline)
*Tabela cronológica dos acontecimentos importantes:*

| Horário | Evento / Ação executada | Responsável |
| :---: | :--- | :--- |
| **02:05** | Backup diário inicia automaticamente. | Script Cron |
| **02:15** | Alerta no Mattermost avisa falha na criptografia GPG por estouro de disco. | BackupBot |
| **08:30** | Equipe técnica detecta lentidão no ERPNext. | Monitoramento |
| **08:45** | Limpeza de disco executada temporariamente. | DevOps |
| **09:00** | Serviço reestabelecido e normalizado. | DevOps |

### 5. Detecção
*Como a falha foi descoberta? O canal do Mattermost funcionou como esperado? Os alertas do webhook foram claros e imediatos?*

### 6. Resposta e Coordenação
*Detalhes sobre a contenção do incidente e como a equipe colaborou usando os canais do Mattermost. Se houve demora em escalonamento, documente o motivo.*

### 7. Causa Raiz (Metodologia dos 5 Porquês)
1. **Por que o serviço caiu?** Porque o banco de dados MariaDB parou.
2. **Por que o MariaDB parou?** Porque não havia espaço em disco para gravar dados temporários.
3. **Por que não havia espaço em disco?** Porque a pasta de backups locais continha dumps antigos.
4. **Por que a pasta continha dumps antigos?** Porque a política de retenção do script falhou ao tentar apagar subdiretórios vazios.
5. **Por que falhou ao apagar subdiretórios?** Porque o comando `find` do script de backup buscava por arquivos com extensão antiga, ignorando as pastas de dumps criptografados.

### 8. Fatores Contribuintes
*Listagem de fatores técnicos, de permissões ou monitoramento que agravaram o cenário:*
* Monitoramento de espaço em disco no host da Hostinger ausente.
* Alerta do webhook do Mattermost ignorado fora do horário comercial.

### 9. O que funcionou bem?
*Ex: A chave SSH estava disponível e o acesso foi imediato. O container de MariaDB subiu rapidamente após a liberação do espaço.*

### 10. O que não funcionou?
*Ex: O alerta de falha no backup diário foi emitido no Mattermost, mas não havia plantonista configurado para monitorar o canal.*

### 11. Avaliação de Comunicação (Mattermost)
*As mensagens de incidentes enviadas pelo webhook mantiveram a confidencialidade das variáveis e senhas? O canal de coordenação foi efetivo?*

### 12. Ações Corretivas e Preventivas
*Lista de tarefas criadas para sanar e evitar a recorrência:*

| Ação | Tipo | Prioridade | Responsável | Prazo | Status |
| :--- | :---: | :---: | :--- | :---: | :---: |
| Correção do script de remoção de pastas em `politica_backup.md` | Correção | Alta | DevOps | AAAA-MM-DD | Pendente |
| Configuração de alerta de espaço em disco inferior a 15% | Prevenção | Crítica | Infra | AAAA-MM-DD | Pendente |

### 13. Lições Aprendidas
*Resumo dos aprendizados obtidos após este incidente.*

### 14. Evidências (Sanitizadas)
*Cole logs de erro, gráficos de monitoramento ou commits relacionados. Lembre-se de remover senhas ou tokens das evidências antes de registrar.*
```

---

## 📋 Caso Prático Registrado: [INC-2026-01] Falha na Automação de Issues do GitHub Actions (Label 'docker' Not Found)

**Data do Incidente**: 2026-07-24  
**Responsáveis pela Análise**: Equipe de Governança e DevOps CDC  
**Severidade**: Média (Falha no pipeline de CI/CD)  
**Ambiente**: GitHub Actions Runner (Workflow `.github/workflows/automatizar_issues.yml`)  
**Duração da Indisponibilidade**: 10 minutos  

---

### 1. Resumo Executivo
Ao executar o workflow automatizado de publicação de tarefas no GitHub (`automatizar_issues.yml`), o Job falhou com Código de Erro 1 ao tentar atribuir rótulos (*labels*) customizados às novas Issues. A falha foi corrigida implementando uma função de verificação e criação dinâmica de rótulos (`ensure_labels_exist`) via GitHub CLI (`gh label create --force`).

### 2. Sintomas e Logs do Erro
Log emitido pelo GitHub Actions Runner:
```text
Run set -e
--------------------------------------------------
Verificando se a issue '[ARCH] Conteinerização Completa e Isolamento de Recursos do Extrator' já existe...
=> Criando nova Issue no GitHub: '[ARCH] Conteinerização Completa e Isolamento de Recursos do Extrator'...
could not add label: 'docker' not found
Error: Process completed with exit code 1.
```

### 3. Causa Raiz (Metodologia dos 5 Porquês)
1. **Por que o workflow falhou?** Porque o comando `gh issue create --label "docker"` retornou um erro fatal de execução.
2. **Por que retornou erro fatal?** Porque o rótulo `docker` não foi encontrado no metadado do repositório GitHub.
3. **Por que a label não existia?** Porque o repositório possuía apenas os rótulos padrão do GitHub (`bug`, `enhancement`, `documentation`), sem os rótulos customizados do projeto CDC (`docker`, `architecture`, `rclone`, `mattermost`, etc.).
4. **Por que o script assumiu que a label existia?** Porque o script dependia do cadastro prévio manual de rótulos no painel web do GitHub.
5. **Por que dependia de ação manual?** Ausência de tratamento de idempotência no script para criar as dependências de rótulos antes da criação das Issues.

### 4. Ações Corretivas Aplicadas
* **Implementação de Função Resiliente**: Criada a função `ensure_labels_exist()` que percorre a lista de rótulos da Issue e executa `gh label create "$label" --force --color "0E8A16"` antes de chamar `gh issue create`.
* **Idempotência**: Com o parâmetro `--force`, caso a label já exista, ela é ignorada/atualizada sem lançar erros; caso não exista, é criada em tempo de execução.

### 5. Lições Aprendidas
1. **Idempotência em CI/CD**: Automações que interagem com APIs externas (como a API do GitHub) nunca devem assumir que metadados prévios (como rótulos, Webhooks ou pastas) existem.
2. **Resiliência de Dependências**: Todo workflow que depende de elementos de interface deve possuir auto-provisionamento de suas dependências.

