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
