'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'apps', 'cdc_theme', 'cdc_theme', 'public', 'js');
const management = fs.readFileSync(path.join(root, 'cdc_management.js'), 'utf8');
const groups = fs.readFileSync(path.join(root, 'cdc_groups.js'), 'utf8');
const items = fs.readFileSync(path.join(root, 'cdc_items.js'), 'utf8');
const warehouses = fs.readFileSync(path.join(root, 'cdc_warehouse.js'), 'utf8');

assert.match(management, /get_catalog_management_dashboard_data/, 'dados devem vir do endpoint real');
assert.match(management, /breadcrumb: 'Armazéns'/, 'CDC Armazém deve usar o rótulo plural registrado no breadcrumb');
assert.doesNotMatch(management, /config\.title\.replace\('CDC ', ''\)/, 'breadcrumb não deve ser inferido do título visível');
assert.match(management, /_cdc_claim_active_dashboard/, 'montagem deve usar somente a página SPA ativa');
assert.match(management, /serial !== state\.serial/, 'respostas antigas devem ser descartadas');
assert.match(management, /window\.clearTimeout\(state\.timer\)/, 'watchdog deve ser cancelado após resposta');
assert.match(management, /data-cdc-manager-retry/, 'falha deve oferecer nova tentativa');
assert.match(management, /data-cdc-manager-native/, 'falha e resumo devem preservar acesso à fonte oficial');
assert.match(management, /O período altera movimentações; saldos e valores representam a posição atual/, 'semântica temporal deve estar explícita');
assert.match(management, /Fonte oficial do ERPNext; nenhuma informação é simulada/, 'origem dos dados deve estar explícita');
assert.match(management, /renderCards\(data\.cards\)/, 'cards gerenciais devem ser renderizados');
assert.match(management, /data\.charts/, 'gráficos gerenciais devem ser renderizados');
assert.match(management, /renderAlerts\(data\.alerts\)/, 'alertas objetivos devem ser renderizados');
assert.match(management, /renderTable\(data\.table/, 'tabela resumida deve ser renderizada');
assert.match(management, /row\.dataset\.movement === '0'/, 'alerta sem movimentação deve filtrar pela atividade real');
assert.match(management, /row\.dataset\.positive === '1'/, 'card com estoque deve filtrar pela quantidade positiva');
assert.doesNotMatch(management, /frappe\.db/, 'frontend não pode acessar o banco diretamente');

for (const [name, source, page] of [
    ['grupos', groups, 'groups'],
    ['itens', items, 'items'],
    ['armazéns', warehouses, 'warehouses'],
]) {
    assert.match(source, new RegExp(`page: '${page}'`), `${name} deve declarar seu tipo de painel`);
    assert.match(source, /_cdc_render_management_dashboard\(OPTIONS\)/, `${name} deve usar o motor compartilhado`);
    assert.match(source, /_cdc_remove_management_dashboard\(OPTIONS\)/, `${name} deve remover estado ao sair da rota`);
    assert.match(source, /renderTimers\.forEach\(clearTimeout\)/, `${name} deve cancelar agendamentos SPA anteriores`);
}

assert.match(management, /state\.pending && state\.key === requestKey/, 'requisições idênticas em andamento devem ser deduplicadas');
assert.match(management, /currentClaim\.dashboard/, 'callback deve recuperar o contêiner SPA ativo após a workspace finalizar');
assert.match(management, /function watchDashboardContent/, 'painel deve observar remoções tardias feitas pela workspace');
assert.match(management, /window\._cdc_get_active_page_body\(\)/, 'restauração deve localizar somente o contêiner SPA ativo');
assert.match(management, /activeBody \? activeBody\.querySelector\('#' \+ config\.dashboardId\)/, 'restauração deve exigir o dashboard correto na página ativa');
assert.match(management, /renderDashboard\(currentDashboard, config, state\.data\)/, 'nó substituído deve ser restaurado com o último resultado real');
assert.match(management, /function guardDashboardContent/, 'painel deve ter verificação periódica contra substituições silenciosas da workspace');
assert.match(management, /window\.setInterval\(function\(\)/, 'verificação de integridade deve continuar após os eventos iniciais da rota');
assert.match(management, /renderDashboard\(activeDashboard, config, state\.data\)/, 'verificador deve reutilizar somente o último resultado real');
assert.match(management, /if \(state\.guard\) window\.clearInterval\(state\.guard\)/, 'verificador deve ser encerrado ao sair da página');

for (const control of [
    'data-cdc-manager-search', 'data-cdc-manager-company', 'data-cdc-manager-project',
    'data-cdc-manager-warehouse', 'data-cdc-manager-group', 'data-cdc-manager-period',
]) {
    assert.ok(management.includes(control), `filtro gerencial ausente: ${control}`);
}

console.log('CDC catalog management dashboards test: OK');
