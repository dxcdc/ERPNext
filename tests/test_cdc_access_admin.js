'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const theme = fs.readFileSync(path.join(root, 'apps', 'cdc_theme', 'cdc_theme', 'public', 'js', 'cdc_theme.js'), 'utf8');
const access = fs.readFileSync(path.join(root, 'apps', 'cdc_theme', 'cdc_theme', 'public', 'js', 'cdc_access.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'apps', 'cdc_theme', 'cdc_theme', 'access_api.py'), 'utf8');
const control = fs.readFileSync(path.join(root, 'apps', 'cdc_theme', 'cdc_theme', 'access_control.py'), 'utf8');
const hooks = fs.readFileSync(path.join(root, 'apps', 'cdc_theme', 'cdc_theme', 'hooks.py'), 'utf8');

assert.match(theme, /canManageUsers \? `<div class="cdc-users-tabs"/, 'guia administrativa deve depender da autorização do backend');
assert.match(theme, /data-cdc-users-tab="permissions">Perfis e permissões/, 'segunda guia deve ter o nome aprovado');
assert.match(access, /cdc_theme\.access_api\.get_access_admin_data/, 'matriz deve carregar por API administrativa');
assert.match(access, /Matriz de acesso/);
assert.match(access, /Exceções individuais/);
assert.match(access, /Histórico/);
assert.match(access, /data-cdc-access-filter="search"/);
assert.match(access, /data-cdc-access-filter="role_profile"/);
assert.match(access, /data-cdc-access-filter="page_key"/);
assert.match(access, /data-cdc-access-filter="status"/);
assert.match(access, /A exceção nunca amplia o escopo nativo de armazéns/);
assert.match(access, /Entenda esta matriz/, 'ajuda expansível deve ter um rótulo claro');
assert.match(access, /Esta matriz apresenta o acesso efetivo de cada usuário/, 'ajuda deve explicar o acesso efetivo');
assert.match(access, /liberar uma página não amplia os armazéns do usuário/, 'ajuda deve preservar a distinção entre página e escopo');
assert.match(access, /data-cdc-access-top-scroll/, 'matriz deve oferecer rolagem horizontal superior');
assert.match(access, /bindSynchronizedMatrixScroll/, 'as duas barras horizontais devem permanecer sincronizadas');
assert.match(access, /aria-expanded/, 'ajuda expansível deve expor seu estado para tecnologias assistivas');
assert.match(access, /get_current_access_context/, 'controle global deve consultar o acesso efetivo');
assert.match(access, /Pré-visualizar acesso/);
assert.match(access, /Somente leitura/);
assert.match(access, /end_access_preview/);
assert.match(api, /def save_access_exception\(payload\):/);
assert.match(api, /require_system_manager\(\)/, 'API administrativa deve validar System Manager no backend');
assert.match(control, /def evaluate_access\(/);
assert.match(control, /native_scope/, 'avaliador deve intersectar com escopo nativo');
assert.match(control, /def start_preview\(/);
assert.match(control, /def block_preview_mutations\(/);
assert.match(control, /def block_preview_document_write\(/);
assert.match(hooks, /cdc_access\.js\?v=20260901_access_help_v74/);
assert.match(hooks, /cdc_theme\.access_control\.enforce_cdc_request_access/);
assert.match(hooks, /cdc_theme\.access_control\.block_preview_mutations/);
assert.match(theme, /window\._cdc_apply_effective_access/);
assert.match(theme, /firstAllowedCDCPath/);

console.log('CDC access administration test: OK');
