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
assert.match(api, /if not unrestricted and warehouse not in permitted_warehouses/, 'a contagem deve ocorrer após o escopo por armazém');
assert.match(api, /completed_since = add_days\(now_datetime\(\), -30\)/, 'a etapa 6 deve usar a janela declarada de 30 dias');
assert.match(model, /"current_stage": current_stage/, 'o espelho deve persistir a etapa atual entregue pelo Core');

console.log('pending stages checks passed');
