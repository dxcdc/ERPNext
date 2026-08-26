'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'apps', 'cdc_theme', 'cdc_theme', 'public', 'js', 'cdc_theme.js'),
    'utf8'
);
const start = source.indexOf('function getActiveWorkspaceBody()');
const end = source.indexOf('window._cdc_get_active_page_body', start);
assert.ok(start >= 0 && end > start, 'helper de navegação SPA não encontrado');

const helperSource = source.slice(start, end);
let staleRemoved = false;
const staleDashboard = {remove() { staleRemoved = true; }};
const activeDashboard = {parentNode: null};
const activeBody = {
    isConnected: true,
    firstChild: null,
    querySelector(selector) {
        return selector === '#cdc-stock-exec-dashboard' ? activeDashboard : null;
    },
    insertBefore(node) {
        node.parentNode = this;
        this.firstChild = node;
    }
};
const currentPage = {
    querySelector(selector) {
        return selector === '.layout-main-section' ? activeBody : null;
    }
};
const fakeWindow = {frappe: {container: {page: currentPage}}};
const fakeDocument = {
    querySelectorAll(selector) {
        return selector === '#cdc-stock-exec-dashboard' ? [staleDashboard, activeDashboard] : [];
    },
    querySelector() { return null; },
    createElement() { return {parentNode: null}; }
};

const helpers = new Function(
    'window',
    'document',
    'frappe',
    `${helperSource}; return {getActiveWorkspaceBody, claimActiveDashboard};`
)(fakeWindow, fakeDocument, fakeWindow.frappe);
const claim = helpers.claimActiveDashboard('cdc-stock-exec-dashboard', 'div');

assert.equal(claim.body, activeBody, 'o painel deve usar o contêiner da página ativa');
assert.equal(claim.dashboard, activeDashboard, 'o painel ativo deve ser preservado');
assert.equal(activeBody.firstChild, activeDashboard, 'o painel deve ser montado no início da página ativa');
assert.equal(staleRemoved, true, 'o painel duplicado da página anterior deve ser removido');

console.log('SPA navigation container test: OK');
