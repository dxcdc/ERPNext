# Recuperação das entradas OngSys em 08/09/2026

## Diagnóstico

- O timer `cdc-ongsys-stock-import.timer` estava instalado, desabilitado e sem execuções registradas na VPS CDC.
- O último `Stock Entry` identificado por `idpedido_ongsys` havia sido criado em 28/08/2026.
- O centro de custo institucional observado no Core é `1.02.01.001`; o de-para legado continha somente `01.02.01`.
- O snapshot M2M do Core continha 3.147 pedidos e estava completo até 08/09/2026 01:11:49 UTC.

## Escopo validado antes da recuperação

- 146 pedidos finalizados de produto, ainda não importados e dentro da janela de 30 dias.
- 1.719 linhas e 33.321 unidades.
- 15 pedidos para `INSTITUCIONAL - C` e 5 para `CAIS OLINDA - C` na janela automática.
- Dez pedidos adicionais de CAIS exigem importação controlada por estarem fora da janela.
- Todos os códigos de item e armazéns dos 146 candidatos existem no ERPNext.

## Controles

1. Backup verificável antes de qualquer lançamento.
2. Importador abastecido pelo snapshot completo e versionado do Core M2M.
3. De-para institucional persistido por migração e mantido no fallback versionado.
4. Idempotência pelo campo único `idpedido_ongsys`.
5. Primeira execução manual, reconciliação por armazém e segunda execução sem novas gravações.
6. O timer local permanece desabilitado; o Rundeck é o único responsável pela agenda.

## Resultado nos armazéns autorizados

- `CAIS OLINDA - C`: 15 entradas, 88 linhas e 8.799 unidades.
- `INSTITUCIONAL - C`: 15 entradas, 66 linhas e 414 unidades.
- Segunda execução controlada: zero criados e 30 já existentes.
- Cabeçalhos e razão de estoque ficaram sem duplicidades e com as mesmas quantidades.

## Backlog separado

Outros 126 pedidos recentes, com 1.623 linhas e 24.597 unidades, continuam sem
importação. A agenda do job de estoque permanece desabilitada até existir
autorização explícita para reconciliar esse conjunto ou definir um marco inicial.

O contrato do job está versionado em `ops/core-m2m/rundeck-stock-job.yaml` e a
implementação canônica pertence ao repositório CDC Automatiza. A execução está
liberada para operação manual auditável, enquanto `scheduleEnabled` permanece
falso. O executor recusa operar se detectar o timer local ativo ou habilitado.
