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
6. Timer habilitado apenas após a prova de idempotência.
