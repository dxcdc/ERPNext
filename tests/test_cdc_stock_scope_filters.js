'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const js = fs.readFileSync(path.join(__dirname, '..', 'apps', 'cdc_theme', 'cdc_theme', 'public', 'js', 'cdc_theme.js'), 'utf8');
const api = fs.readFileSync(path.join(__dirname, '..', 'apps', 'cdc_theme', 'cdc_theme', 'api.py'), 'utf8');

assert.match(js, /id="cdc-stock-date-range-control"/, 'a barra superior deve conter o filtro de intervalo');
assert.match(js, /fieldtype: 'Date Range'/, 'a barra superior deve usar o seletor único de início e fim do Frappe');
assert.match(js, /cdc-stock-period-segments/, 'a barra superior deve manter atalhos segmentados de período');
assert.match(js, /sessionStorage\.getItem\('cdc_period'\) \|\| 'custom'/, 'o painel deve iniciar no intervalo personalizado');
assert.match(js, /getDate\(\) - 89/, 'o intervalo padrão deve conter 90 dias incluindo hoje');
assert.match(api, /selected_unit not in permitted_warehouses/, 'a seleção deve validar o nome exato permitido');
assert.match(api, /AND warehouse = \{selected_unit_sql\}/, 'saldos devem usar igualdade exata de armazém');
assert.match(api, /selected_sed\.s_warehouse = \{selected_unit_sql\}/, 'movimentos de origem devem respeitar o armazém exato');
assert.match(api, /len\(permitted_warehouses\)/, 'a opção Todos deve preservar a contagem total acessível');
assert.match(api, /MAX\(occurrence_sed\.s_warehouse\)/, 'o gráfico deve consultar o armazém de origem nas linhas');
assert.match(api, /MAX\(occurrence_sed\.t_warehouse\)/, 'o gráfico deve consultar o armazém de destino nas linhas');
assert.match(api, /purpose_condition = "se\.purpose IN \('Material Receipt', 'Material Issue', 'Material Transfer'\)"/, 'Todos deve agregar entradas, saídas e transferências');
assert.match(api, /previous_period_start/, 'a comparação deve usar um período anterior equivalente');
assert.match(js, /exactStockReportHref\('Entrada de Material'\)/, 'cartão de entradas deve abrir o relatório com o mesmo escopo');
assert.match(js, /exactStockReportHref\('Saída de Material'\)/, 'cartão de saídas deve abrir o relatório com o mesmo escopo');

console.log('CDC stock scope filters test: OK');
