const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pending = fs.readFileSync(path.join(root, 'apps/cdc_theme/cdc_theme/public/js/cdc_pending.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'apps/cdc_theme/cdc_theme/api.py'), 'utf8');
const model = fs.readFileSync(path.join(root, 'apps/cdc_theme/cdc_theme/core_pending.py'), 'utf8');

assert.match(pending, /cdc-pending-stage-card/, 'a tela deve renderizar cards clicáveis de etapa');
assert.match(pending, /selected_stage: selectedStage/, 'a etapa selecionada deve ser enviada ao servidor');
assert.match(pending, /sessionStorage\.setItem\('cdc_pending_stage'/, 'a seleção deve sobreviver à remontagem da página');
assert.match(pending, /warehouseGroups/, 'os pedidos devem ser agrupados por armazém');
assert.match(pending, /cdc-pending-warehouse-group/, 'a tela deve renderizar um bloco expansível por armazém');
assert.match(pending, /scrollIntoView/, 'o clique na etapa deve levar o usuário aos pedidos filtrados');
assert.match(api, /set\(warehouses\)\.issubset\(permitted_warehouses\)/, 'pedidos com vários destinos devem exigir escopo para todos os armazéns');
assert.match(api, /warehouse_map = _active_pending_warehouse_map\(\)/, 'a tela deve usar o cadastro persistente de vínculos ONGSYS');
assert.match(api, /completed_since = add_days\(now_datetime\(\), -30\)/, 'a etapa 6 deve usar a janela declarada de 30 dias');
assert.match(model, /"current_stage": current_stage/, 'o espelho deve persistir a etapa atual entregue pelo Core');

console.log('pending stages checks passed');
