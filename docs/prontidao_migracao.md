# Painel de prontidão da migração NextERP

Este documento substitui a interpretação de uma única porcentagem de fidelidade. Uma média alta não compensa uma falha crítica de permissão, integração ou recuperação.

## Escala de decisão

- **Aprovado**: existe prova reproduzível e recente.
- **Condicionado**: funciona parcialmente, mas falta uma prova relevante.
- **Bloqueado**: há uma falha crítica ou nenhuma prova do resultado.

Cada conclusão deve registrar também a confiança da evidência (`alta`, `média` ou `baixa`) e seu impacto (`crítico`, `relevante` ou `limitado`). Indicadores críticos bloqueados impedem a migração definitiva independentemente da média geral.

## Situação observada em 01/08/2026

| Indicador | Estado | Confiança | Impacto | Evidência atual | Prova que falta |
|---|---|---|---|---|---|
| Integridade semântica dos dados | Aprovado | Alta | Crítico | Checksums equivalentes de estoque, itens, armazéns, saldos, razão e permissões | Repetir após o dump final |
| Equivalência funcional | Condicionado | Média | Crítico | Esteira automatizada 8/8 | Jornada completa com perfil operacional |
| Equivalência de permissões | Condicionado | Alta | Crítico | Guest e Website User negados; Administrador aprovado | Definir e testar o papel operacional autorizado |
| Reprodutibilidade da infraestrutura | Condicionado | Alta | Crítico | Compose e Terraform válidos | Construção em host vazio incluindo proxy e segredos |
| Continuidade das integrações | Bloqueado | Alta | Crítico | Cron e logs comprovados na GCP; código local protegido | Ciclo ONGSYS controlado e agendamento declarativo |
| Recuperabilidade comprovada | Bloqueado | Alta | Crítico | Dumps e tarballs íntegros | Restore completo cronometrado em host vazio |
| Observabilidade operacional | Bloqueado | Alta | Relevante | Logs existentes | Alertas de atraso, falha, disco e backup |
| Capacidade e estabilidade | Condicionado | Média | Relevante | Ciclo produtivo observado em cerca de 18 minutos | Ensaio prolongado e cenário de API lenta |
| Reversibilidade | Condicionado | Média | Crítico | Backup local antes do restore | Ensaio e reconciliação após rollback |
| Dependências externas | Bloqueado | Alta | Crítico | ONGSYS, Drive, Mattermost, cron e proxy mapeados | Recriação declarativa e teste isolado |

## Evidências automatizadas no repositório

- `terraform/run_pipeline.py`: valida aplicação, dados, rotas, relatórios e idempotência.
- `terraform/run_extended_audit.py`: procura riscos transversais de segurança, integridade, acessibilidade e tempo.
- `esteira_resultados.json`: resultado da última esteira reproduzível.
- `auditoria_perspectivas.json`: achados da última auditoria ampliada.
- `CHECKLIST_AUDITORIA_CDC.md`: histórico consolidado da homologação.

## Regra para autorização da migração

A migração definitiva somente deve ser autorizada quando:

1. não houver indicador crítico em estado **Bloqueado**;
2. o dump final repetir os checksums e contagens de controle;
3. a restauração completa tiver RPO e RTO medidos;
4. um perfil operacional concluir o roteiro manual;
5. integração, backup, monitoramento e rollback tiverem responsáveis definidos.

## Limite desta avaliação

O laboratório é uma evolução da produção, pois inclui o app `cdc_theme`, novas workspaces e endurecimentos. O objetivo é equivalência operacional com melhorias controladas, não identidade byte a byte de toda a instalação.
