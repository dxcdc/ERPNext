(function () {
    'use strict';

    var states = new WeakMap();

    function escapeHTML(value) {
        var div = document.createElement('div');
        div.textContent = value == null ? '' : String(value);
        return div.innerHTML;
    }

    function call(method, args) {
        return new Promise(function (resolve, reject) {
            frappe.call({
                method: method,
                args: args || {},
                callback: function (response) { resolve(response && response.message); },
                error: reject
            });
        });
    }

    function statusLabel(status) {
        return ({active: 'Ativa', scheduled: 'Agendada', expired: 'Expirada', disabled: 'Desativada'})[status] || status;
    }

    function sourceLabel(cell) {
        if (!cell || !cell.allowed) return '<span class="cdc-access-state is-denied">Sem acesso</span>';
        if (cell.source === 'system-manager') return '<span class="cdc-access-state is-admin">Administrador</span>';
        if (cell.source === 'exception') return '<span class="cdc-access-state is-exception">Exceção</span>';
        return '<span class="cdc-access-state is-native">Perfil</span>';
    }

    function initialize(dashboard) {
        if (!dashboard || states.has(dashboard)) return;
        var root = dashboard.querySelector('#cdc-access-admin-root');
        if (!root) return;
        var state = {
            dashboard: dashboard,
            root: root,
            data: null,
            view: 'matrix',
            loaded: false,
            helpOpen: localStorage.getItem('cdc_access_help_open') !== '0',
            matrixScrollCleanup: null,
            filters: {search: '', role_profile: '', page_key: '', status: ''}
        };
        states.set(dashboard, state);
        dashboard.querySelectorAll('[data-cdc-users-tab]').forEach(function (button) {
            button.addEventListener('click', function () {
                selectMainTab(state, button.dataset.cdcUsersTab);
            });
        });
        selectMainTab(state, sessionStorage.getItem('cdc_users_admin_tab') || 'users');
    }

    function selectMainTab(state, tab) {
        if (tab !== 'permissions') tab = 'users';
        state.dashboard.querySelectorAll('[data-cdc-users-tab]').forEach(function (button) {
            var active = button.dataset.cdcUsersTab === tab;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        state.dashboard.querySelectorAll('[data-cdc-users-pane]').forEach(function (pane) {
            pane.hidden = pane.dataset.cdcUsersPane !== tab;
        });
        var shortcuts = state.dashboard.querySelector('.cdc-users-shortcuts-label');
        if (shortcuts) shortcuts.hidden = tab === 'permissions';
        sessionStorage.setItem('cdc_users_admin_tab', tab);
        if (tab === 'permissions' && !state.loaded) loadData(state);
    }

    function loadData(state) {
        state.root.innerHTML = '<div class="cdc-access-loading">Carregando matriz de acesso...</div>';
        return call('cdc_theme.access_api.get_access_admin_data', state.filters).then(function (data) {
            state.data = data;
            state.loaded = true;
            render(state);
        }).catch(function () {
            state.root.innerHTML = '<div class="cdc-access-error"><strong>Falha ao carregar permissões.</strong><button type="button" class="btn btn-default" data-cdc-access-retry>Tentar novamente</button></div>';
            var retry = state.root.querySelector('[data-cdc-access-retry]');
            if (retry) retry.addEventListener('click', function () { loadData(state); });
        });
    }

    function render(state) {
        var data = state.data || {catalog: {pages: []}, users: [], profiles: [], exceptions: []};
        var profileOptions = '<option value="">Todos os perfis</option>' + (data.profiles || []).map(function (name) {
            return '<option value="' + escapeHTML(name) + '" ' + (state.filters.role_profile === name ? 'selected' : '') + '>' + escapeHTML(name) + '</option>';
        }).join('');
        var pageOptions = '<option value="">Todas as páginas</option>' + (data.catalog.pages || []).map(function (page) {
            return '<option value="' + escapeHTML(page.key) + '" ' + (state.filters.page_key === page.key ? 'selected' : '') + '>' + escapeHTML(page.label) + '</option>';
        }).join('');
        var statusOptions = [
            ['', 'Todas as situações'], ['active', 'Ativas'], ['scheduled', 'Agendadas'],
            ['expired', 'Expiradas'], ['disabled', 'Desativadas']
        ].map(function (option) {
            return '<option value="' + option[0] + '" ' + (state.filters.status === option[0] ? 'selected' : '') + '>' + option[1] + '</option>';
        }).join('');

        state.root.innerHTML = '<section class="cdc-access-admin">'
            + '<div class="cdc-access-heading"><div><h3>Perfis e permissões</h3><p>Acesso efetivo por usuário, página, ação e escopo de armazém.</p></div>'
            + '<div class="cdc-access-heading-actions"><button type="button" class="btn btn-default cdc-access-help-toggle" data-cdc-access-help aria-expanded="' + (state.helpOpen ? 'true' : 'false') + '" aria-controls="cdc-access-help-panel"><span aria-hidden="true">' + (state.helpOpen ? '−' : '+') + '</span> Entenda esta matriz</button>'
            + '<button type="button" class="btn btn-primary" data-cdc-access-new>Nova exceção</button></div></div>'
            + '<section id="cdc-access-help-panel" class="cdc-access-help"' + (state.helpOpen ? '' : ' hidden') + ' aria-label="Como utilizar a matriz de acesso">'
            + '<div class="cdc-access-help-copy"><h4>Como utilizar a matriz</h4>'
            + '<p>Esta matriz apresenta o acesso efetivo de cada usuário às páginas do sistema. As permissões podem vir do perfil ou cargo atribuído ao usuário e são limitadas aos armazéns vinculados a ele.</p>'
            + '<p>A marcação <strong>Perfil</strong> indica um acesso concedido pelo perfil ou cargo. <strong>Exceção</strong> representa uma autorização ou um bloqueio específico para aquele usuário. <strong>Sem acesso</strong> significa que o usuário não pode abrir aquela página.</p>'
            + '<p>Para alterar uma permissão, localize o usuário, selecione a página desejada e configure a exceção. Informe a justificativa e, quando necessário, a validade. Depois, utilize <strong>Ver como este usuário ou perfil</strong> para conferir o resultado.</p></div>'
            + '<div class="cdc-access-help-legend" aria-label="Legenda das permissões">'
            + '<div><span class="cdc-access-state is-native">Perfil</span><small>Acesso herdado do perfil ou cargo.</small></div>'
            + '<div><span class="cdc-access-state is-exception">Exceção</span><small>Regra específica para o usuário ou perfil.</small></div>'
            + '<div><span class="cdc-access-state is-denied">Sem acesso</span><small>A página não está disponível.</small></div>'
            + '<div><span class="cdc-access-state is-admin">Administrador</span><small>Acesso administrativo completo.</small></div></div>'
            + '<div class="cdc-access-help-warning"><strong>Importante:</strong> liberar uma página não amplia os armazéns do usuário. Os dados continuam restritos aos armazéns aos quais ele está vinculado.</div>'
            + '</section>'
            + '<div class="cdc-access-subtabs" role="tablist">'
            + ['matrix', 'exceptions', 'history'].map(function (view) {
                var label = {matrix: 'Matriz de acesso', exceptions: 'Exceções individuais', history: 'Histórico'}[view];
                return '<button type="button" class="' + (state.view === view ? 'is-active' : '') + '" data-cdc-access-view="' + view + '">' + label + '</button>';
            }).join('') + '</div>'
            + '<div class="cdc-access-filters">'
            + '<label><span>Buscar usuário</span><input type="search" data-cdc-access-filter="search" value="' + escapeHTML(state.filters.search) + '" placeholder="Nome, email ou perfil"></label>'
            + '<label><span>Perfil/cargo</span><select data-cdc-access-filter="role_profile">' + profileOptions + '</select></label>'
            + '<label><span>Página</span><select data-cdc-access-filter="page_key">' + pageOptions + '</select></label>'
            + '<label><span>Situação</span><select data-cdc-access-filter="status">' + statusOptions + '</select></label>'
            + '<button type="button" class="btn btn-default" data-cdc-access-apply>Aplicar filtros</button>'
            + '</div><div data-cdc-access-content></div></section>';

        bindShell(state);
        renderCurrentView(state);
    }

    function bindShell(state) {
        var helpButton = state.root.querySelector('[data-cdc-access-help]');
        helpButton.addEventListener('click', function () {
            state.helpOpen = !state.helpOpen;
            state.root.querySelector('#cdc-access-help-panel').hidden = !state.helpOpen;
            helpButton.setAttribute('aria-expanded', state.helpOpen ? 'true' : 'false');
            helpButton.querySelector('[aria-hidden="true"]').textContent = state.helpOpen ? '−' : '+';
            localStorage.setItem('cdc_access_help_open', state.helpOpen ? '1' : '0');
        });
        state.root.querySelectorAll('[data-cdc-access-view]').forEach(function (button) {
            button.addEventListener('click', function () {
                state.view = button.dataset.cdcAccessView;
                state.root.querySelectorAll('[data-cdc-access-view]').forEach(function (item) {
                    item.classList.toggle('is-active', item === button);
                });
                renderCurrentView(state);
            });
        });
        state.root.querySelector('[data-cdc-access-new]').addEventListener('click', function () {
            openExceptionDialog(state, null);
        });
        state.root.querySelector('[data-cdc-access-apply]').addEventListener('click', function () {
            state.root.querySelectorAll('[data-cdc-access-filter]').forEach(function (field) {
                state.filters[field.dataset.cdcAccessFilter] = field.value;
            });
            state.loaded = false;
            loadData(state);
        });
    }

    function renderCurrentView(state) {
        if (state.matrixScrollCleanup) {
            state.matrixScrollCleanup();
            state.matrixScrollCleanup = null;
        }
        if (state.view === 'exceptions') renderExceptions(state);
        else if (state.view === 'history') renderHistory(state);
        else renderMatrix(state);
    }

    function bindSynchronizedMatrixScroll(state, content) {
        var top = content.querySelector('[data-cdc-access-top-scroll]');
        var topContent = content.querySelector('[data-cdc-access-top-scroll-content]');
        var bottom = content.querySelector('.cdc-access-matrix-scroll');
        var table = content.querySelector('.cdc-access-matrix');
        if (!top || !topContent || !bottom || !table) return;

        var syncing = false;
        function sync(source, target) {
            if (syncing) return;
            syncing = true;
            target.scrollLeft = source.scrollLeft;
            syncing = false;
        }
        function refreshWidth() {
            topContent.style.width = table.scrollWidth + 'px';
            top.hidden = table.scrollWidth <= bottom.clientWidth + 1;
            top.scrollLeft = bottom.scrollLeft;
        }
        function fromTop() { sync(top, bottom); }
        function fromBottom() { sync(bottom, top); }
        top.addEventListener('scroll', fromTop);
        bottom.addEventListener('scroll', fromBottom);

        var observer = typeof ResizeObserver === 'function' ? new ResizeObserver(refreshWidth) : null;
        if (observer) {
            observer.observe(bottom);
            observer.observe(table);
        } else {
            window.addEventListener('resize', refreshWidth);
        }
        requestAnimationFrame(refreshWidth);
        state.matrixScrollCleanup = function () {
            top.removeEventListener('scroll', fromTop);
            bottom.removeEventListener('scroll', fromBottom);
            if (observer) observer.disconnect();
            else window.removeEventListener('resize', refreshWidth);
        };
    }

    function renderMatrix(state) {
        var content = state.root.querySelector('[data-cdc-access-content]');
        var pages = (state.data.catalog.pages || []).filter(function (page) {
            return !state.filters.page_key || page.key === state.filters.page_key;
        });
        var head = pages.map(function (page) { return '<th>' + escapeHTML(page.label) + '</th>'; }).join('');
        var rows = (state.data.users || []).map(function (user) {
            var cells = pages.map(function (page) {
                var cell = user.cells[page.key];
                if (page.exception_grantable === false) {
                    return '<td><div class="cdc-access-cell is-locked">' + sourceLabel(cell) + '<small>Protegido pelo sistema</small></div></td>';
                }
                return '<td><button type="button" class="cdc-access-cell" data-cdc-access-user="' + escapeHTML(user.name) + '" data-cdc-access-page="' + escapeHTML(page.key) + '">'
                    + sourceLabel(cell) + '<small>' + Number(cell && cell.warehouse_count || 0) + ' armazém(ns)</small></button></td>';
            }).join('');
            return '<tr><th><strong>' + escapeHTML(user.full_name) + '</strong><small>' + escapeHTML(user.email) + '</small></th>'
                + '<td><span>' + escapeHTML(user.role_profile || 'Sem perfil') + '</span><small>' + Number(user.warehouse_count || 0) + ' armazém(ns)</small></td>' + cells + '</tr>';
        }).join('') || '<tr><td colspan="' + (pages.length + 2) + '">Nenhum usuário encontrado.</td></tr>';
        content.innerHTML = '<div class="cdc-access-legend"><span class="cdc-access-state is-native">Perfil</span><span class="cdc-access-state is-exception">Exceção</span><span class="cdc-access-state is-denied">Sem acesso</span><span class="cdc-access-state is-admin">Administrador</span></div>'
            + '<div class="cdc-access-top-scroll" data-cdc-access-top-scroll aria-label="Rolagem horizontal superior da matriz" tabindex="0"><div data-cdc-access-top-scroll-content></div></div>'
            + '<div class="cdc-access-matrix-scroll"><table class="cdc-access-matrix"><thead><tr><th>Usuário</th><th>Perfil e escopo</th>' + head + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
        bindSynchronizedMatrixScroll(state, content);
        content.querySelectorAll('[data-cdc-access-user]').forEach(function (button) {
            button.addEventListener('click', function () {
                openExceptionDialog(state, {subject_type: 'User', user: button.dataset.cdcAccessUser, page_key: button.dataset.cdcAccessPage});
            });
        });
    }

    function renderExceptions(state) {
        var content = state.root.querySelector('[data-cdc-access-content]');
        var pageByKey = {};
        (state.data.catalog.pages || []).forEach(function (page) { pageByKey[page.key] = page.label; });
        var rows = (state.data.exceptions || []).map(function (item) {
            var subject = item.subject_type === 'User' ? item.user : item.role_profile;
            var actions = item.all_actions ? 'Todas' : item.actions.join(', ');
            var warehouses = item.all_warehouses ? 'Todo o escopo autorizado' : item.warehouses.join(', ');
            var period = (item.valid_from || 'Agora') + ' até ' + (item.valid_until || 'Sem vencimento');
            return '<tr><td><strong>' + escapeHTML(subject) + '</strong><small>' + escapeHTML(item.subject_type === 'User' ? 'Usuário' : 'Perfil/cargo') + '</small></td>'
                + '<td>' + escapeHTML(pageByKey[item.page_key] || item.page_key) + '</td>'
                + '<td><span class="cdc-access-effect ' + (item.effect === 'Allow' ? 'is-allow' : 'is-block') + '">' + (item.effect === 'Allow' ? 'Liberar' : 'Bloquear') + '</span><small>' + escapeHTML(actions) + '</small></td>'
                + '<td>' + escapeHTML(warehouses) + '</td><td>' + escapeHTML(period) + '</td>'
                + '<td><span class="cdc-access-status is-' + escapeHTML(item.status) + '">' + escapeHTML(statusLabel(item.status)) + '</span></td>'
                + '<td><button type="button" class="btn btn-xs btn-default" data-cdc-access-edit="' + escapeHTML(item.name) + '">Editar</button> '
                + (item.enabled ? '<button type="button" class="btn btn-xs btn-default" data-cdc-access-disable="' + escapeHTML(item.name) + '">Desativar</button>' : '') + '</td></tr>';
        }).join('') || '<tr><td colspan="7">Nenhuma exceção encontrada.</td></tr>';
        content.innerHTML = '<div class="cdc-access-table-scroll"><table class="cdc-access-exceptions"><thead><tr><th>Destinatário</th><th>Página</th><th>Permissão</th><th>Armazéns</th><th>Vigência</th><th>Situação</th><th>Ações</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
        content.querySelectorAll('[data-cdc-access-edit]').forEach(function (button) {
            button.addEventListener('click', function () {
                var item = state.data.exceptions.find(function (row) { return row.name === button.dataset.cdcAccessEdit; });
                openExceptionDialog(state, item);
            });
        });
        content.querySelectorAll('[data-cdc-access-disable]').forEach(function (button) {
            button.addEventListener('click', function () { disableException(state, button.dataset.cdcAccessDisable); });
        });
    }

    function renderHistory(state) {
        var content = state.root.querySelector('[data-cdc-access-content]');
        content.innerHTML = '<div class="cdc-access-loading">Carregando histórico...</div>';
        call('cdc_theme.access_api.get_access_audit', {limit: 200}).then(function (rows) {
            var html = (rows || []).map(function (row) {
                return '<tr><td>' + escapeHTML(row.occurred_at) + '</td><td>' + escapeHTML(row.event) + '</td><td>' + escapeHTML(row.target_user || row.target_role_profile || '—') + '</td><td>' + escapeHTML(row.actor) + '</td><td>' + escapeHTML(row.reference_exception || '—') + '</td></tr>';
            }).join('') || '<tr><td colspan="5">Nenhuma alteração registrada.</td></tr>';
            content.innerHTML = '<div class="cdc-access-table-scroll"><table class="cdc-access-history"><thead><tr><th>Data</th><th>Evento</th><th>Destinatário</th><th>Administrador</th><th>Exceção</th></tr></thead><tbody>' + html + '</tbody></table></div>';
        }).catch(function () {
            content.innerHTML = '<div class="cdc-access-error">Não foi possível carregar o histórico.</div>';
        });
    }

    function selected(value, expected) { return String(value || '') === String(expected || '') ? ' selected' : ''; }
    function checked(value) { return value ? ' checked' : ''; }

    function openExceptionDialog(state, item) {
        item = Object.assign({subject_type: 'User', effect: 'Allow', all_actions: false, all_warehouses: true, enabled: true, actions: ['view'], warehouses: []}, item || {});
        var pages = state.data.catalog.pages || [];
        var pageKey = item.page_key || (pages[0] && pages[0].key) || '';
        var page = pages.find(function (candidate) { return candidate.key === pageKey; }) || {actions: ['view']};
        if (!item.all_actions && !(item.actions || []).some(function (action) { return page.actions.indexOf(action) !== -1; })) {
            item.actions = ['view'];
        }
        var userOptions = (state.data.users || []).map(function (user) {
            return '<option value="' + escapeHTML(user.name) + '"' + selected(item.user, user.name) + '>' + escapeHTML(user.full_name + ' — ' + user.email) + '</option>';
        }).join('');
        var profileOptions = (state.data.profiles || []).map(function (profile) {
            return '<option value="' + escapeHTML(profile) + '"' + selected(item.role_profile, profile) + '>' + escapeHTML(profile) + '</option>';
        }).join('');
        var pageOptions = pages.filter(function (candidate) { return candidate.exception_grantable !== false; }).map(function (candidate) {
            return '<option value="' + escapeHTML(candidate.key) + '"' + selected(pageKey, candidate.key) + '>' + escapeHTML(candidate.label) + '</option>';
        }).join('');
        var actionOptions = page.actions.map(function (action) {
            var label = (state.data.catalog.actions.find(function (entry) { return entry.key === action; }) || {}).label || action;
            return '<label><input type="checkbox" name="cdc-access-action" value="' + escapeHTML(action) + '"' + checked((item.actions || []).indexOf(action) !== -1) + '> ' + escapeHTML(label) + '</label>';
        }).join('');
        var warehouseOptions = (state.data.warehouses || []).map(function (warehouse) {
            return '<option value="' + escapeHTML(warehouse.name) + '"' + selected((item.warehouses || []).indexOf(warehouse.name) !== -1 ? warehouse.name : '', warehouse.name) + '>' + escapeHTML((warehouse.is_group ? 'Grupo: ' : '') + (warehouse.warehouse_name || warehouse.name)) + '</option>';
        }).join('');

        var dialog = document.createElement('dialog');
        dialog.className = 'cdc-access-dialog';
        dialog.innerHTML = '<form method="dialog" data-cdc-access-form>'
            + '<div class="cdc-access-dialog-heading"><div><h3>' + (item.name ? 'Editar exceção' : 'Nova exceção') + '</h3><p>A exceção nunca amplia o escopo nativo de armazéns.</p></div><button value="cancel" aria-label="Fechar">×</button></div>'
            + '<input type="hidden" name="name" value="' + escapeHTML(item.name || '') + '">'
            + '<div class="cdc-access-form-grid">'
            + '<label><span>Aplicar a</span><select name="subject_type"><option value="User"' + selected(item.subject_type, 'User') + '>Usuário</option><option value="Role Profile"' + selected(item.subject_type, 'Role Profile') + '>Perfil/cargo</option></select></label>'
            + '<label data-cdc-user-field><span>Usuário</span><select name="user"><option value="">Selecione</option>' + userOptions + '</select></label>'
            + '<label data-cdc-profile-field><span>Perfil/cargo</span><select name="role_profile"><option value="">Selecione</option>' + profileOptions + '</select></label>'
            + '<label><span>Página</span><select name="page_key">' + pageOptions + '</select></label>'
            + '<label><span>Efeito</span><select name="effect"><option value="Allow"' + selected(item.effect, 'Allow') + '>Liberar</option><option value="Block"' + selected(item.effect, 'Block') + '>Bloquear</option></select></label>'
            + '<label><span>Válida a partir de</span><input type="date" name="valid_from" value="' + escapeHTML(item.valid_from || '') + '"></label>'
            + '<label><span>Válida até</span><input type="date" name="valid_until" value="' + escapeHTML(item.valid_until || '') + '"></label>'
            + '</div><fieldset><legend>Ações</legend><label><input type="checkbox" name="all_actions"' + checked(item.all_actions) + '> Todas as ações disponíveis</label><div class="cdc-access-checkboxes" data-cdc-action-options>' + actionOptions + '</div></fieldset>'
            + '<fieldset><legend>Escopo de armazéns</legend><label><input type="checkbox" name="all_warehouses"' + checked(item.all_warehouses) + '> Todo o escopo que o destinatário já possui</label><select name="warehouses" multiple size="6">' + warehouseOptions + '</select><small>Selecionar aqui apenas restringe; nunca concede um armazém novo.</small></fieldset>'
            + '<label class="cdc-access-reason"><span>Justificativa</span><textarea name="justification" rows="3" required minlength="8">' + escapeHTML(item.justification || '') + '</textarea></label>'
            + '<label><input type="checkbox" name="enabled"' + checked(item.enabled !== false) + '> Exceção ativa</label>'
            + '<div class="cdc-access-dialog-actions"><button value="cancel" class="btn btn-default">Cancelar</button><button type="submit" value="save" class="btn btn-primary">Salvar exceção</button></div></form>';
        document.body.appendChild(dialog);
        var form = dialog.querySelector('[data-cdc-access-form]');
        function updateSubject() {
            var isUser = form.elements.subject_type.value === 'User';
            form.querySelector('[data-cdc-user-field]').hidden = !isUser;
            form.querySelector('[data-cdc-profile-field]').hidden = isUser;
        }
        function updateScopeControls() {
            form.elements.warehouses.disabled = form.elements.all_warehouses.checked;
            form.querySelector('[data-cdc-action-options]').classList.toggle('is-disabled', form.elements.all_actions.checked);
        }
        form.elements.subject_type.addEventListener('change', updateSubject);
        form.elements.all_warehouses.addEventListener('change', updateScopeControls);
        form.elements.all_actions.addEventListener('change', updateScopeControls);
        form.elements.page_key.addEventListener('change', function () {
            var nextItem = Object.assign({}, item, {
                subject_type: form.elements.subject_type.value,
                user: form.elements.user.value,
                role_profile: form.elements.role_profile.value,
                page_key: this.value,
                effect: form.elements.effect.value,
                all_actions: form.elements.all_actions.checked,
                actions: Array.from(form.querySelectorAll('[name="cdc-access-action"]:checked')).map(function (field) { return field.value; }),
                all_warehouses: form.elements.all_warehouses.checked,
                warehouses: Array.from(form.elements.warehouses.selectedOptions).map(function (option) { return option.value; }),
                valid_from: form.elements.valid_from.value,
                valid_until: form.elements.valid_until.value,
                enabled: form.elements.enabled.checked,
                justification: form.elements.justification.value
            });
            dialog.close();
            openExceptionDialog(state, nextItem);
        });
        form.addEventListener('submit', function (event) {
            if (event.submitter && event.submitter.value === 'cancel') return;
            event.preventDefault();
            var payload = {
                name: form.elements.name.value,
                subject_type: form.elements.subject_type.value,
                user: form.elements.user.value,
                role_profile: form.elements.role_profile.value,
                page_key: form.elements.page_key.value,
                effect: form.elements.effect.value,
                all_actions: form.elements.all_actions.checked,
                actions: Array.from(form.querySelectorAll('[name="cdc-access-action"]:checked')).map(function (field) { return field.value; }),
                all_warehouses: form.elements.all_warehouses.checked,
                warehouses: Array.from(form.elements.warehouses.selectedOptions).map(function (option) { return option.value; }),
                valid_from: form.elements.valid_from.value,
                valid_until: form.elements.valid_until.value,
                enabled: form.elements.enabled.checked,
                justification: form.elements.justification.value
            };
            call('cdc_theme.access_api.save_access_exception', {payload: JSON.stringify(payload)}).then(function () {
                dialog.close();
                state.loaded = false;
                loadData(state);
                frappe.show_alert({message: 'Exceção salva e acesso recalculado.', indicator: 'green'});
            });
        });
        dialog.addEventListener('close', function () { dialog.remove(); });
        updateSubject();
        updateScopeControls();
        dialog.showModal();
    }

    function disableException(state, name) {
        frappe.prompt([{fieldname: 'reason', fieldtype: 'Small Text', label: 'Motivo da desativação', reqd: 1}], function (values) {
            call('cdc_theme.access_api.disable_access_exception', {name: name, reason: values.reason}).then(function () {
                state.loaded = false;
                loadData(state);
                frappe.show_alert({message: 'Exceção desativada.', indicator: 'green'});
            });
        }, 'Desativar exceção', 'Confirmar');
    }

    function initializeGlobalPreview() {
        if (!window.frappe || !frappe.session || frappe.session.user === 'Guest') return;
        call('cdc_theme.access_api.get_current_access_context').then(function (context) {
            window._cdc_access_context = context;
            mountPreviewControls(context);
            if (typeof window._cdc_apply_effective_access === 'function') {
                window._cdc_apply_effective_access(context);
            }
        });
    }

    function mountPreviewControls(context) {
        document.querySelectorAll('.cdc-access-preview-control, .cdc-access-preview-banner').forEach(function (node) { node.remove(); });
        document.body.classList.toggle('cdc-access-preview-active', Boolean(context && context.preview));
        if (!context || !context.is_system_manager) return;
        var control = document.createElement('button');
        control.type = 'button';
        control.className = 'btn btn-default cdc-access-preview-control';
        control.textContent = context.preview ? 'Alterar pré-visualização' : 'Pré-visualizar acesso';
        control.addEventListener('click', openPreviewDialog);
        document.body.appendChild(control);
        if (!context.preview) return;
        var banner = document.createElement('aside');
        banner.className = 'cdc-access-preview-banner';
        banner.innerHTML = '<div><strong>Modo de pré-visualização:</strong> ' + escapeHTML(context.preview.target)
            + ' <span>Somente leitura · ' + Number((context.preview.warehouse_scope || []).length) + ' armazém(ns)</span></div>'
            + '<button type="button" class="btn btn-sm btn-default" data-cdc-preview-end>Encerrar pré-visualização</button>';
        document.body.appendChild(banner);
        banner.querySelector('[data-cdc-preview-end]').addEventListener('click', function () {
            call('cdc_theme.access_api.end_access_preview').then(function () { window.location.reload(); });
        });
        document.body.classList.add('cdc-access-preview-active');
    }

    function openPreviewDialog() {
        call('cdc_theme.access_api.get_preview_options').then(function (options) {
            var users = (options.users || []).map(function (user) {
                return '<option value="' + escapeHTML(user.name) + '">' + escapeHTML((user.full_name || user.name) + ' — ' + user.name) + '</option>';
            }).join('');
            var profiles = (options.profiles || []).map(function (profile) {
                return '<option value="' + escapeHTML(profile) + '">' + escapeHTML(profile) + '</option>';
            }).join('');
            var warehouses = (options.warehouses || []).map(function (warehouse) {
                return '<option value="' + escapeHTML(warehouse.name) + '">' + escapeHTML(warehouse.warehouse_name || warehouse.name) + '</option>';
            }).join('');
            var dialog = document.createElement('dialog');
            dialog.className = 'cdc-access-dialog cdc-access-preview-dialog';
            dialog.innerHTML = '<form method="dialog" data-cdc-preview-form><div class="cdc-access-dialog-heading"><div><h3>Pré-visualizar acesso</h3><p>Simule menus, páginas e dados sem acessar a conta da pessoa.</p></div><button value="cancel" aria-label="Fechar">×</button></div>'
                + '<div class="cdc-access-form-grid"><label><span>Visualizar como</span><select name="target_type"><option value="User">Usuário</option><option value="Role Profile">Perfil/cargo</option></select></label>'
                + '<label data-cdc-preview-user><span>Usuário</span><select name="user"><option value="">Selecione</option>' + users + '</select></label>'
                + '<label data-cdc-preview-profile hidden><span>Perfil/cargo</span><select name="role_profile"><option value="">Selecione</option>' + profiles + '</select></label></div>'
                + '<label data-cdc-preview-warehouses hidden><span>Armazéns de teste para o perfil/cargo</span><select name="warehouses" multiple size="8">' + warehouses + '</select><small>Para usuário, o sistema utiliza automaticamente os vínculos reais.</small></label>'
                + '<div class="cdc-access-preview-notice"><strong>Somente leitura.</strong> Criação, edição, finalização, cancelamento e exclusão permanecerão bloqueados no servidor.</div>'
                + '<div class="cdc-access-dialog-actions"><button value="cancel" class="btn btn-default">Cancelar</button><button type="submit" value="start" class="btn btn-primary">Iniciar pré-visualização</button></div></form>';
            document.body.appendChild(dialog);
            var form = dialog.querySelector('[data-cdc-preview-form]');
            function updateType() {
                var profile = form.elements.target_type.value === 'Role Profile';
                form.querySelector('[data-cdc-preview-user]').hidden = profile;
                form.querySelector('[data-cdc-preview-profile]').hidden = !profile;
                form.querySelector('[data-cdc-preview-warehouses]').hidden = !profile;
            }
            form.elements.target_type.addEventListener('change', updateType);
            form.addEventListener('submit', function (event) {
                if (event.submitter && event.submitter.value === 'cancel') return;
                event.preventDefault();
                var targetType = form.elements.target_type.value;
                var target = targetType === 'User' ? form.elements.user.value : form.elements.role_profile.value;
                if (!target) {
                    frappe.msgprint('Selecione um usuário ou perfil/cargo.');
                    return;
                }
                var selectedWarehouses = Array.from(form.elements.warehouses.selectedOptions).map(function (option) { return option.value; });
                call('cdc_theme.access_api.start_access_preview', {
                    target_type: targetType,
                    target: target,
                    warehouses: JSON.stringify(selectedWarehouses)
                }).then(function () { window.location.reload(); });
            });
            dialog.addEventListener('close', function () { dialog.remove(); });
            updateType();
            dialog.showModal();
        });
    }

    window._cdc_init_access_admin = initialize;
    if (window.frappe && typeof frappe.ready === 'function') {
        frappe.ready(initializeGlobalPreview);
    } else {
        document.addEventListener('DOMContentLoaded', initializeGlobalPreview);
    }
    if (window.jQuery) {
        window.jQuery(document).off('page-change.cdcAccess').on('page-change.cdcAccess', function () {
            window.setTimeout(initializeGlobalPreview, 80);
        });
    }
})();
