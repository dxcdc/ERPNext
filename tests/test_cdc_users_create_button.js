'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'apps', 'cdc_theme', 'cdc_theme', 'public', 'js', 'cdc_theme.js'),
    'utf8'
);

assert.match(
    source,
    /<a class="btn btn-primary cdc-users-create-button" href="\/app\/user\/new-user-byeuadqsvz">Cadastrar novo usuário<\/a>/,
    'CDC Usuários deve exibir o botão de cadastro com a rota solicitada'
);
assert.match(
    source,
    /<a class="btn btn-default cdc-users-link-employee-button" href="\/app\/user-permission">Vincular funcionário<\/a>/,
    'CDC Usuários deve exibir o botão para vincular funcionário'
);

console.log('CDC users create button test: OK');
