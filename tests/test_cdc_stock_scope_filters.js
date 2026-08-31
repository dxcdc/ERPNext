'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const js = fs.readFileSync(path.join(__dirname, '..', 'apps', 'cdc_theme', 'cdc_theme', 'public', 'js', 'cdc_theme.js'), 'utf8');
const api = fs.readFileSync(path.join(__dirname, '..', 'apps', 'cdc_theme', 'cdc_theme', 'api.py'), 'utf8');

assert.match(js, /id="cdc-stock-period-filter"/, 'a barra superior deve conter o filtro de período');
assert.match(js, /off\('change', '#cdc-stock-period-filter'\)/, 'o filtro de período deve atualizar o painel');
assert.match(api, /selected_unit not in permitted_warehouses/, 'a seleção deve validar o nome exato permitido');
assert.match(api, /AND warehouse = \{selected_unit_sql\}/, 'saldos devem usar igualdade exata de armazém');
assert.match(api, /selected_sed\.s_warehouse = \{selected_unit_sql\}/, 'movimentos de origem devem respeitar o armazém exato');
assert.match(api, /len\(permitted_warehouses\)/, 'a opção Todos deve preservar a contagem total acessível');
assert.match(api, /occurrence_sed\.\{detail_warehouse_field\} = \{selected_unit_sql\}/, 'o gráfico deve considerar linhas com o armazém exato');
assert.match(api, /previous_period_start/, 'a comparação deve usar um período anterior equivalente');
assert.match(js, /exactStockReportHref\('Entrada de Material'\)/, 'cartão de entradas deve abrir o relatório com o mesmo escopo');
assert.match(js, /exactStockReportHref\('Saída de Material'\)/, 'cartão de saídas deve abrir o relatório com o mesmo escopo');

console.log('CDC stock scope filters test: OK');
