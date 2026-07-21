# Diretrizes de Documentação

Este documento estabelece as regras de governança para a criação, revisão, manutenção e evolução de toda a documentação técnica deste repositório.

---

## Objetivo da documentação
A documentação existe para atingir os seguintes objetivos estratégicos e operacionais:
* **Reduzir dependência de conhecimento informal**: Evitar o cenário de "banco de dados na cabeça das pessoas" e silos de informação.
* **Facilitar onboarding**: Acelerar a entrada de novos desenvolvedores, analistas de infraestrutura e engenheiros DevOps.
* **Registrar decisões técnicas**: Servir como registro histórico de decisões arquiteturais e mudanças estruturais.
* **Permitir reconstrução de ambientes**: Garantir que o ambiente de laboratório local (openSUSE) ou o de produção (Hostinger) possam ser reerguidos do zero em caso de desastre.
* **Facilitar diagnóstico de incidentes**: Prover guias de troubleshooting e histórico de postmortems objetivos e rápidos de ler durante crises.
* **Apoiar migrações e auditorias**: Assegurar conformidade técnica de segurança e de processos.
* **Registrar integrações e alertas do Mattermost**: Documentar como e quando alertas operacionais são disparados para canais centralizados, protegendo os webhooks.

---

## Princípios
* **Documentação como parte do projeto**: Nenhuma alteração técnica de infraestrutura ou código está concluída sem a respectiva documentação.
* **Atualização junto com o código**: As atualizações de docs devem ocorrer na mesma branch e pull request que a modificação correspondente.
* **Segurança por padrão**: Nunca publicar credenciais, chaves, senhas ou URLs reais de webhooks nos documentos.
* **Clareza e Completude**: Comandos devem ser descritos de forma completa e prontos para execução, utilizando placeholders claros.
* **Cultura sem culpabilização (Blameless)**: Análises de incidentes (postmortems) visam a melhoria de processos e da infraestrutura, não a punição de indivíduos.

---

## Estrutura oficial

A documentação do repositório está padronizada na pasta `docs/` com a seguinte finalidade por arquivo:

| Arquivo | Finalidade |
| :--- | :--- |
| [diretrizes_documentacao.md](./diretrizes_documentacao.md) | Regras para criação, manutenção e evolução da documentação. |
| [estrategia_execucao.md](./estrategia_execucao.md) | Estratégia de desenvolvimento, branches, ambientes, releases e Mattermost. |
| [migration_guide.md](./migration_guide.md) | Acesso SSH, checklists de migração e coleta segura de backups do GCP VM. |
| [ajuda_infra.md](./ajuda_infra.md) | Topologia Docker Compose, isolamento de portas, redes e integração Mattermost. |
| [postmortem.md](./postmortem.md) | Metodologia blameless e template padrão para análise e registro de incidentes. |
| [troubleshooting.md](./troubleshooting.md) | Diagnósticos e resoluções para problemas comuns do ERPNext, Docker e Nginx. |
| [politica_backup.md](./politica_backup.md) | Rotina 3-2-1, script Bash de backup, criptografia GPG e envio de alertas. |
| [prompt_ia.md](./prompt_ia.md) | Bloco de contexto do projeto e prompts de engenharia para assistentes de IA. |

---

## Regras de atualização
A documentação deve ser revisada e atualizada obrigatoriamente sempre que houver:
* Mudança de tecnologia ou de versão de container/sistema.
* Alteração de portas públicas ou internas e faixas de rede Docker.
* Inclusão ou remoção de contêineres e volumes persistentes no Docker Compose.
* Novas variáveis no `.env.example` ou mudanças na estratégia de e-mail (SMTP).
* Alterações no processo de implantação, fluxo de branches ou critérios de promoção.
* Mudanças em RPO, RTO ou retenção na política de backup.
* Ocorrência de incidentes relevantes que exijam postmortem.
* Inclusão, remoção ou reconfiguração de canais de alertas do Mattermost.

---

## Responsabilidades
* **Quem altera o código**: Deve verificar o impacto no `README.md` e nos arquivos afetados.
* **Quem altera a infraestrutura**: Deve atualizar o `ajuda_infra.md`.
* **Quem altera o processo de implantação**: Deve atualizar o `estrategia_execucao.md`.
* **Quem realiza migração/diagnóstico**: Deve revisar e documentar no `migration_guide.md`.
* **Quem altera backup/restauração**: Deve atualizar o `politica_backup.md`.
* **Quem resolve problemas recorrentes**: Deve registrar a correção no `troubleshooting.md`.
* **Quem gerencia incidentes**: Deve preencher ou atualizar o `postmortem.md`.
* **Quem cria regras de IA**: Deve atualizar o `prompt_ia.md`.

---

## Fluxo recomendado no Git
1. Realize as mudanças documentais na mesma branch da alteração de código ou infraestrutura.
2. Inclua os commits de documentação no mesmo pull request.
3. Use mensagens de commit claras e padronizadas no formato:
   * `docs: atualizar procedimento de backup`
   * `docs: documentar nova porta do serviço web`
   * `docs: adicionar solução para erro de permissão`
   * `docs: documentar alertas de backup no Mattermost`
4. Teste os links relativos do Markdown localmente antes do push.

---

## Controle de versões e revisão periódica
O histórico principal é mantido pelo controle de versão do Git. Para grandes atualizações, utilize o rodapé do arquivo para documentar o histórico de revisão:

```text
Última revisão: <AAAA-MM-DD>
Responsável pela revisão: <NOME OU EQUIPE>
Motivo da revisão: <DESCRIÇÃO>
```

### Frequência de revisão recomendada:
* `diretrizes_documentacao.md`: Trimestral.
* `estrategia_execucao.md`: A cada release relevante de infraestrutura.
* `migration_guide.md`: Trimestral ou imediatamente antes de uma nova migração.
* `ajuda_infra.md`: Sempre que a infraestrutura mudar.
* `postmortem.md`: Após cada incidente relevante em produção.
* `troubleshooting.md`: Sempre que surgir um novo erro recorrente solucionado.
* `politica_backup.md`: Trimestral (realizando testes de restauração).
* `prompt_ia.md`: Sempre que houver novas restrições ou padrões operacionais.

---

## Informações proibidas e placeholders oficiais
**NUNCA registre dados sensíveis reais** (senhas, chaves privadas, tokens, webhooks reais do Mattermost). Utilize placeholders oficiais:
* `<APP_SECRET>`
* `<DB_PASSWORD>`
* `<API_TOKEN>`
* `<MATTERMOST_WEBHOOK_URL>`
* `<MATTERMOST_CHANNEL>`
* `<SMTP_PASSWORD>`
* `<SSH_HOST>`
* `<SSH_USER>`
* `<SSH_PORT>`
* `<DOMINIO_DO_PROJETO>`
* `<ENDERECO_DO_SERVIDOR>`

---

## Checklist para pull requests

O seguinte checklist de documentação deve ser respondido em todo Pull Request:

```markdown
- [ ] Esta alteração modifica arquitetura?
- [ ] Esta alteração modifica infraestrutura?
- [ ] Esta alteração cria ou remove variáveis de ambiente?
- [ ] Esta alteração modifica portas ou redes?
- [ ] Esta alteração modifica o banco de dados?
- [ ] Esta alteração modifica o processo de implantação?
- [ ] Esta alteração modifica o processo de backup?
- [ ] Esta alteração cria um novo procedimento de suporte?
- [ ] Esta alteração modifica alertas ou integrações do Mattermost?
- [ ] Os documentos afetados foram atualizados?
- [ ] O `.env.example` foi atualizado quando necessário?
- [ ] Os exemplos não contêm credenciais reais?
- [ ] Os comandos foram validados?
- [ ] Os links internos continuam funcionando?
- [ ] Os testes de webhook usam somente variáveis de ambiente?
```

---

## Processo de descontinuação
Documentos antigos não devem ser deletados sem histórico. Ao descontinuar um procedimento:
1. Atualize o documento principal inserindo um aviso de descontinuação no topo.
2. Indique a data e aponte para o novo procedimento correspondente.
3. Preserve a versão antiga no histórico de commits do Git.
4. Desative ou modifique os alertas correspondentes no Mattermost.
