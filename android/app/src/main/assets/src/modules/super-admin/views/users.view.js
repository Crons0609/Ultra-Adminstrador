import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { AuthService } from '../../../services/auth.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { TimeService } from '../../../services/time.service.js';
import { GlobalStore } from '../../../core/state.js';
import { ImageDisplay } from '../../../components/ui/image-display.js';
import { I18nService } from '../../../services/i18n.service.js';

export class UsersView extends Component {
  constructor(params = {}) {
    super(params);

    this.allUsers = [];
    this.filteredUsers = [];
    this.companiesList = [];
    this.selectedUser = null;

    this.layout = new PageLayout({
      title: I18nService.t('sa_users_title'),
      subtitle: I18nService.t('sa_users_subtitle'),
      actionHTML: `
        <button type="button" id="btn-refresh-users" class="btn btn-secondary btn-sm" style="display:flex; align-items:center; gap:6px;">
          🔄 ${I18nService.t('refresh')}
        </button>
      `,
      contentHTML: `
        <div style="display: flex; flex-direction: column; gap: var(--space-5);">
          
          <!-- Top Control & Filter Bar -->
          <div class="card p-4" style="display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; justify-content: space-between;">
            
            <!-- Global Search Box -->
            <div style="flex: 1; min-width: 280px; position: relative;">
              <input
                type="text"
                id="search-user-input"
                class="input input-md"
                placeholder="🔍 ${I18nService.t('emp_search')}"
                style="width: 100%; padding-left: 12px;"
              />
            </div>

            <!-- Filter Selectors -->
            <div style="display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center;">
              
              <!-- Role Filter -->
              <select id="filter-role-select" class="input input-md" style="min-width: 140px;">
                <option value="ALL">${I18nService.t('select_all').replace(' Seleccionar Todo', 'Todos')}</option>
                <option value="SUPER_ADMIN">${I18nService.t('sa_users_role_sa')}</option>
                <option value="OWNER">${I18nService.t('sa_users_role_owner')}</option>
                <option value="MANAGER">${I18nService.t('sa_users_role_manager')}</option>
                <option value="CASHIER">${I18nService.t('sa_users_role_cashier')}</option>
                <option value="WAITER">${I18nService.t('sa_users_role_waiter')}</option>
                <option value="KITCHEN">${I18nService.t('sa_users_role_kitchen')}</option>
                <option value="CUSTOMER">${I18nService.t('sa_users_role_customer')}</option>
              </select>

              <!-- Status Filter -->
              <select id="filter-status-select" class="input input-md" style="min-width: 130px;">
                <option value="ALL">${I18nService.t('select_all').replace(' Seleccionar Todo', 'Todos')}</option>
                <option value="ACTIVE">${I18nService.t('sa_users_status_active')}</option>
                <option value="SUSPENDED">${I18nService.t('sa_users_status_suspended')}</option>
                <option value="DISABLED">${I18nService.t('sa_users_status_disabled')}</option>
              </select>

              <!-- Business Filter -->
              <select id="filter-company-select" class="input input-md" style="min-width: 160px;">
                <option value="ALL">${I18nService.t('sa_broadcast_to_all')}</option>
              </select>

            </div>
          </div>

          <!-- Counter Header -->
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div id="users-count-badge" class="text-xs text-secondary font-semibold" style="font-family: monospace;">
              ${I18nService.t('loading_data')}
            </div>
          </div>

          <!-- Users Table Container -->
          <div class="card p-0" style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;">
              <thead>
                <tr style="border-bottom: 1px solid var(--color-border-primary, rgba(255,255,255,0.08)); background: var(--color-bg-secondary, rgba(255,255,255,0.02)); color: var(--color-text-secondary);">
                  <th style="padding: 12px 16px;">${I18nService.t('emp_col_employee')}</th>
                  <th style="padding: 12px 16px;">${I18nService.t('auth_email')}</th>
                  <th style="padding: 12px 16px;">Firebase UID</th>
                  <th style="padding: 12px 16px;">${I18nService.t('emp_role')}</th>
                  <th style="padding: 12px 16px;">${I18nService.t('sa_company_name')}</th>
                  <th style="padding: 12px 16px;">${I18nService.t('status')}</th>
                  <th style="padding: 12px 16px;">${I18nService.t('actions')}</th>
                </tr>
              </thead>
              <tbody id="users-table-body">
                <tr>
                  <td colspan="7" style="padding: 32px; text-align: center; color: var(--color-text-tertiary);">
                    ⏳ ${I18nService.t('loading_data')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>

        <!-- EDIT USER MODAL -->
        <div id="edit-user-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); z-index: 9999; align-items: center; justify-content: center; padding: 16px;">
          <div class="card p-6" style="max-width: 520px; width: 100%; max-height: 90vh; overflow-y: auto; position: relative;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px;">
              <h3 class="text-lg font-bold">✏️ ${I18nService.t('sa_users_edit_profile')}</h3>
              <button type="button" id="btn-close-edit-modal" class="btn btn-secondary btn-sm" style="padding: 2px 8px;">✖</button>
            </div>

            <form id="edit-user-form" style="display: flex; flex-direction: column; gap: 12px;">
              <input type="hidden" id="edit-user-uid" />

              <div class="form-group">
                <label class="form-label" for="edit-user-name">${I18nService.t('emp_full_name')}</label>
                <input type="text" id="edit-user-name" class="input input-md" required />
              </div>

              <div class="form-group">
                <label class="form-label" for="edit-user-email">${I18nService.t('emp_email')}</label>
                <input type="email" id="edit-user-email" class="input input-md" required />
              </div>

              <div class="form-group">
                <label class="form-label" for="edit-user-phone">${I18nService.t('sup_phone')}</label>
                <input type="text" id="edit-user-phone" class="input input-md" placeholder="+52 123 456 7890" />
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="form-group">
                  <label class="form-label" for="edit-user-role">${I18nService.t('emp_role')}</label>
                  <select id="edit-user-role" class="input input-md">
                    <option value="SUPER_ADMIN">${I18nService.t('sa_users_role_sa')}</option>
                    <option value="OWNER">${I18nService.t('sa_users_role_owner')}</option>
                    <option value="MANAGER">${I18nService.t('sa_users_role_manager')}</option>
                    <option value="CASHIER">${I18nService.t('sa_users_role_cashier')}</option>
                    <option value="WAITER">${I18nService.t('sa_users_role_waiter')}</option>
                    <option value="KITCHEN">${I18nService.t('sa_users_role_kitchen')}</option>
                    <option value="CUSTOMER">${I18nService.t('sa_users_role_customer')}</option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label" for="edit-user-status">${I18nService.t('status')}</label>
                  <select id="edit-user-status" class="input input-md">
                    <option value="ACTIVE">${I18nService.t('sa_users_status_active')}</option>
                    <option value="SUSPENDED">${I18nService.t('sa_users_status_suspended')}</option>
                    <option value="DISABLED">${I18nService.t('sa_users_status_disabled')}</option>
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="edit-user-company">${I18nService.t('sa_users_assigned_biz')}</label>
                <select id="edit-user-company" class="input input-md">
                  <option value="global">${I18nService.t('sa_users_global_saas')}</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="edit-user-photo">${I18nService.t('sa_users_photo_url')}</label>
                <input type="url" id="edit-user-photo" class="input input-md" placeholder="https://..." />
              </div>

              <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 16px;">
                <button type="button" id="btn-cancel-edit" class="btn btn-secondary btn-md">${I18nService.t('cancel')}</button>
                <button type="submit" id="btn-save-edit" class="btn btn-primary btn-md">${I18nService.t('save_changes')}</button>
              </div>
            </form>
          </div>
        </div>

        <!-- RESET PASSWORD MODAL -->
        <div id="password-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); z-index: 9999; align-items: center; justify-content: center; padding: 16px;">
          <div class="card p-6" style="max-width: 440px; width: 100%;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px;">
              <h3 class="text-lg font-bold" style="color: #60a5fa;">🔑 ${I18nService.t('sa_users_change_pass_title')}</h3>
              <button type="button" id="btn-close-pass-modal" class="btn btn-secondary btn-sm" style="padding: 2px 8px;">✖</button>
            </div>

            <p id="pass-target-user-info" class="text-xs text-secondary mb-4"></p>

            <form id="reset-password-form" style="display: flex; flex-direction: column; gap: 12px;">
              <input type="hidden" id="pass-user-uid" />
              <input type="hidden" id="pass-user-email" />

              <div class="form-group">
                <label class="form-label" for="new-pass-input">${I18nService.t('sa_users_new_pass_label')}</label>
                <input type="password" id="new-pass-input" class="input input-md" placeholder="******" minlength="6" required />
              </div>

              <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 12px;">
                <button type="button" id="btn-cancel-pass" class="btn btn-secondary btn-md">${I18nService.t('cancel')}</button>
                <button type="submit" id="btn-submit-pass" class="btn btn-primary btn-md">${I18nService.t('settings_change_password').replace('Cambiar', 'Actualizar')}</button>
              </div>
            </form>
          </div>
        </div>

        <!-- DELETE USER CONFIRMATION MODAL -->
        <div id="delete-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); z-index: 9999; align-items: center; justify-content: center; padding: 16px;">
          <div class="card p-6" style="max-width: 460px; width: 100%; border: 1px solid rgba(239,68,68,0.4);">
            <h3 class="text-lg font-bold" style="color: #ef4444; margin-bottom: 12px;">🚨 ${I18nService.t('sa_users_delete_account_title')}</h3>
            
            <p id="delete-target-info" class="text-xs text-secondary mb-4" style="line-height: 1.5;"></p>

            <div style="padding: 12px; background: rgba(239,68,68,0.08); border-radius: 6px; border: 1px solid rgba(239,68,68,0.2); margin-bottom: 16px;">
              <p class="text-xs" style="color: #f87171; margin: 0;">
                ⚠️ ${I18nService.t('sa_users_delete_confirm_hint')}
              </p>
            </div>

            <input type="text" id="delete-confirm-email-input" class="input input-md mb-4" placeholder="${I18nService.t('sa_users_delete_placeholder')}" style="font-family: monospace;" />

            <div style="display: flex; gap: 12px; justify-content: flex-end;">
              <button type="button" id="btn-cancel-delete" class="btn btn-secondary btn-md">${I18nService.t('cancel')}</button>
              <button type="button" id="btn-confirm-delete" class="btn btn-danger btn-md" disabled style="opacity: 0.5; cursor: not-allowed;">🔥 ${I18nService.t('sa_users_delete_permanent_btn')}</button>
            </div>
          </div>
        </div>
      `
    });
  }

  mount() {
    const element = this.layout.mount();
    this.afterMount(element);
    this.loadInitialData(element);
    return element;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    // Refresh button
    const refreshBtn = root.querySelector('#btn-refresh-users');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadInitialData(root));
    }

    // Search and Filters
    const searchInput = root.querySelector('#search-user-input');
    const roleSelect = root.querySelector('#filter-role-select');
    const statusSelect = root.querySelector('#filter-status-select');
    const companySelect = root.querySelector('#filter-company-select');

    const applyFilters = () => this.filterUsers(root);

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (roleSelect) roleSelect.addEventListener('change', applyFilters);
    if (statusSelect) statusSelect.addEventListener('change', applyFilters);
    if (companySelect) companySelect.addEventListener('change', applyFilters);

    // Edit modal events
    const editForm = root.querySelector('#edit-user-form');
    if (editForm) editForm.addEventListener('submit', (e) => this.handleSaveUserEdit(e, root));

    const closeEditBtn = root.querySelector('#btn-close-edit-modal');
    const cancelEditBtn = root.querySelector('#btn-cancel-edit');
    [closeEditBtn, cancelEditBtn].forEach(btn => btn && btn.addEventListener('click', () => this.closeModal('#edit-user-modal', root)));

    // Password modal events
    const passForm = root.querySelector('#reset-password-form');
    if (passForm) passForm.addEventListener('submit', (e) => this.handleSubmitPasswordChange(e, root));

    const closePassBtn = root.querySelector('#btn-close-pass-modal');
    const cancelPassBtn = root.querySelector('#btn-cancel-pass');
    [closePassBtn, cancelPassBtn].forEach(btn => btn && btn.addEventListener('click', () => this.closeModal('#password-modal', root)));

    // Delete modal events
    const deleteEmailInput = root.querySelector('#delete-confirm-email-input');
    const confirmDeleteBtn = root.querySelector('#btn-confirm-delete');
    const cancelDeleteBtn = root.querySelector('#btn-cancel-delete');

    if (deleteEmailInput && confirmDeleteBtn) {
      deleteEmailInput.addEventListener('input', () => {
        const val = deleteEmailInput.value.trim().toLowerCase();
        const expected = (this.selectedUser?.email || '').trim().toLowerCase();
        const isValid = val === expected && expected.length > 0;
        confirmDeleteBtn.disabled = !isValid;
        confirmDeleteBtn.style.opacity = isValid ? '1' : '0.5';
        confirmDeleteBtn.style.cursor = isValid ? 'pointer' : 'not-allowed';
      });

      confirmDeleteBtn.addEventListener('click', () => this.handleConfirmDeleteUser(root));
    }
    if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', () => this.closeModal('#delete-modal', root));
  }

  async loadInitialData(root) {
    try {
      console.log('[UsersView] Cargando lista global de usuarios y empresas...');
      
      const countBadge = root.querySelector('#users-count-badge');
      if (countBadge) countBadge.textContent = I18nService.t('sa_users_querying_firebase');

      // Load companies for select options
      const companies = await FirestoreService.getCompanies();
      this.companiesList = companies || [];
      this.populateCompanySelects(root);

      // Load all users
      this.allUsers = await AuthService.getAllUsersWithCompanies();
      this.filteredUsers = [...this.allUsers];

      this.renderUsersTable(root);
      console.log(`[UsersView] ✅ Cargados ${this.allUsers.length} usuarios.`);
    } catch (err) {
      console.error('[UsersView] Error al cargar usuarios:', err);
      NotificationService.error(I18nService.t('sa_users_error_load', { error: err.message || err }));
      const tbody = root.querySelector('#users-table-body');
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="padding: 24px; text-align: center; color: #ef4444;">
              ❌ ${I18nService.t('sa_users_error_fetch', { error: err.message || err })}
            </td>
          </tr>
        `;
      }
    }
  }

  populateCompanySelects(root) {
    const filterSelect = root.querySelector('#filter-company-select');
    const editSelect = root.querySelector('#edit-user-company');

    let optionsHTML = `<option value="ALL">${I18nService.t('sa_users_all_biz')}</option><option value="global">${I18nService.t('sa_users_global_saas')}</option>`;
    let editOptionsHTML = `<option value="global">${I18nService.t('sa_users_global_saas')}</option>`;

    this.companiesList.forEach(c => {
      const name = c.informacion_local?.nombre || c.name || c.id;
      optionsHTML += `<option value="${c.id}">${name}</option>`;
      editOptionsHTML += `<option value="${c.id}">${name}</option>`;
    });

    if (filterSelect) filterSelect.innerHTML = optionsHTML;
    if (editSelect) editSelect.innerHTML = editOptionsHTML;
  }

  filterUsers(root) {
    const searchVal = (root.querySelector('#search-user-input')?.value || '').trim().toLowerCase();
    const roleVal = root.querySelector('#filter-role-select')?.value || 'ALL';
    const statusVal = root.querySelector('#filter-status-select')?.value || 'ALL';
    const companyVal = root.querySelector('#filter-company-select')?.value || 'ALL';

    this.filteredUsers = this.allUsers.filter(user => {
      // Role filter
      if (roleVal !== 'ALL' && user.role !== roleVal) return false;
      // Status filter
      if (statusVal !== 'ALL' && (user.status || 'ACTIVE') !== statusVal) return false;
      // Company filter
      if (companyVal !== 'ALL' && user.companyId !== companyVal) return false;

      // Text search
      if (searchVal) {
        const text = `${user.displayName} ${user.email} ${user.uid} ${user.phone} ${user.role} ${user.companyName}`.toLowerCase();
        if (!text.includes(searchVal)) return false;
      }

      return true;
    });

    this.renderUsersTable(root);
  }

  renderUsersTable(root) {
    const tbody = root.querySelector('#users-table-body');
    const countBadge = root.querySelector('#users-count-badge');

    if (countBadge) {
      countBadge.textContent = I18nService.t('sa_users_showing_count', { count: this.filteredUsers.length, total: this.allUsers.length });
    }

    if (!tbody) return;

    if (this.filteredUsers.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="padding: 32px; text-align: center; color: var(--color-text-tertiary);">
            🔍 ${I18nService.t('sa_users_not_found')}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.filteredUsers.map(user => {
      // Resolve avatar: new imageId system → legacy photoURL → initials
      const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'U')}&background=6366f1&color=fff&size=56`;
      const avatarHTML = user.avatarImageId
        ? ImageDisplay.renderTag(
            user.avatarImageId,
            user.photoURL || fallbackAvatar,
            'width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1px solid var(--color-border);',
            user.companyId
          )
        : user.photoURL
          ? `<img src="${user.photoURL}" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.onerror=null;this.src='${fallbackAvatar}'" />`
          : `<div style="width:28px;height:28px;border-radius:50%;background:var(--color-accent,#6366f1);color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:bold;flex-shrink:0;">${(user.displayName || 'U').charAt(0).toUpperCase()}</div>`;

      const roleBadge = this.getRoleBadgeHTML(user.role);
      const statusBadge = this.getStatusBadgeHTML(user.status);

      return `
        <tr style="border-bottom: 1px solid var(--color-border-primary, rgba(255,255,255,0.05)); hover: background: rgba(255,255,255,0.02);">
          <td style="padding: 12px 16px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              ${avatarHTML}
              <div>
                <div style="font-weight: 600; color: var(--color-text-primary);">${this.escapeHTML(user.displayName)}</div>
                ${user.phone ? `<div style="font-size: 0.7rem; color: var(--color-text-tertiary);">${this.escapeHTML(user.phone)}</div>` : ''}
              </div>
            </div>
          </td>
          <td style="padding: 12px 16px; font-family: monospace; font-size: 0.8rem; color: var(--color-text-secondary);">
            ${this.escapeHTML(user.email)}
          </td>
          <td style="padding: 12px 16px;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <code style="font-size: 0.7rem; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px; color: #a7f3d0;">${user.uid.slice(0, 10)}...</code>
              <button type="button" class="btn-copy-uid btn btn-secondary btn-sm" data-uid="${user.uid}" title="Copiar UID completo" style="padding: 1px 4px; font-size: 0.65rem;">📋</button>
            </div>
          </td>
          <td style="padding: 12px 16px;">${roleBadge}</td>
          <td style="padding: 12px 16px; font-size: 0.8rem; color: var(--color-text-secondary);">${this.escapeHTML(user.companyName)}</td>
          <td style="padding: 12px 16px;">${statusBadge}</td>
          <td style="padding: 12px 16px;">
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button type="button" class="btn-edit-user btn btn-secondary btn-sm" data-uid="${user.uid}" title="${I18nService.t('edit')}">✏️ ${I18nService.t('edit')}</button>
              <button type="button" class="btn-pass-user btn btn-secondary btn-sm" data-uid="${user.uid}" title="${I18nService.t('settings_change_password')}">🔑 ${I18nService.t('auth_password')}</button>
              <button type="button" class="btn-delete-user btn btn-danger btn-sm" data-uid="${user.uid}" title="${I18nService.t('delete')}" style="background: rgba(239,68,68,0.15); color: #f87171; border-color: rgba(239,68,68,0.3);">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Bind row action listeners
    tbody.querySelectorAll('.btn-copy-uid').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const uid = e.currentTarget.getAttribute('data-uid');
        navigator.clipboard.writeText(uid);
        NotificationService.success(I18nService.t('copied'));
      });
    });

    tbody.querySelectorAll('.btn-edit-user').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const uid = e.currentTarget.getAttribute('data-uid');
        this.openEditUserModal(uid, root);
      });
    });

    tbody.querySelectorAll('.btn-pass-user').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const uid = e.currentTarget.getAttribute('data-uid');
        this.openResetPasswordModal(uid, root);
      });
    });

    tbody.querySelectorAll('.btn-delete-user').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const uid = e.currentTarget.getAttribute('data-uid');
        this.openDeleteUserModal(uid, root);
      });
    });
  }

  getRoleBadgeHTML(role) {
    const roles = {
      SUPER_ADMIN: { label: I18nService.t('sa_users_role_sa'), bg: 'rgba(139,92,246,0.2)', color: '#c084fc', border: 'rgba(139,92,246,0.4)' },
      OWNER: { label: I18nService.t('sa_users_role_owner'), bg: 'rgba(234,179,8,0.2)', color: '#fde047', border: 'rgba(234,179,8,0.4)' },
      MANAGER: { label: I18nService.t('sa_users_role_manager'), bg: 'rgba(59,130,246,0.2)', color: '#60a5fa', border: 'rgba(59,130,246,0.4)' },
      CASHIER: { label: I18nService.t('sa_users_role_cashier'), bg: 'rgba(16,185,129,0.2)', color: '#34d399', border: 'rgba(16,185,129,0.4)' },
      WAITER: { label: I18nService.t('sa_users_role_waiter'), bg: 'rgba(249,115,22,0.2)', color: '#fb923c', border: 'rgba(249,115,22,0.4)' },
      KITCHEN: { label: I18nService.t('sa_users_role_kitchen'), bg: 'rgba(236,72,153,0.2)', color: '#f472b6', border: 'rgba(236,72,153,0.4)' },
      CUSTOMER: { label: I18nService.t('sa_users_role_customer'), bg: 'rgba(107,114,128,0.2)', color: '#9ca3af', border: 'rgba(107,114,128,0.4)' }
    };
    const r = roles[role] || { label: role, bg: 'rgba(255,255,255,0.1)', color: '#fff', border: 'rgba(255,255,255,0.2)' };
    return `<span style="font-size: 0.7rem; font-weight: 600; padding: 2px 8px; border-radius: 12px; background: ${r.bg}; color: ${r.color}; border: 1px solid ${r.border};">${r.label}</span>`;
  }

  getStatusBadgeHTML(status = 'ACTIVE') {
    if (status === 'SUSPENDED') {
      return `<span style="font-size: 0.7rem; font-weight: 600; padding: 2px 8px; border-radius: 12px; background: rgba(234,179,8,0.15); color: #fde047; border: 1px solid rgba(234,179,8,0.3);">${I18nService.t('sa_users_status_suspended')}</span>`;
    }
    if (status === 'DISABLED') {
      return `<span style="font-size: 0.7rem; font-weight: 600; padding: 2px 8px; border-radius: 12px; background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3);">${I18nService.t('sa_users_status_disabled')}</span>`;
    }
    return `<span style="font-size: 0.7rem; font-weight: 600; padding: 2px 8px; border-radius: 12px; background: rgba(16,185,129,0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.3);">${I18nService.t('sa_users_status_active')}</span>`;
  }

  openEditUserModal(uid, root) {
    const user = this.allUsers.find(u => u.uid === uid);
    if (!user) return;
    this.selectedUser = user;

    root.querySelector('#edit-user-uid').value = user.uid;
    root.querySelector('#edit-user-name').value = user.displayName;
    root.querySelector('#edit-user-email').value = user.email;
    root.querySelector('#edit-user-phone').value = user.phone || '';
    root.querySelector('#edit-user-role').value = user.role;
    root.querySelector('#edit-user-status').value = user.status || 'ACTIVE';
    root.querySelector('#edit-user-company').value = user.companyId || 'global';
    root.querySelector('#edit-user-photo').value = user.photoURL || '';

    this.openModal('#edit-user-modal', root);
  }

  async handleSaveUserEdit(e, root) {
    e.preventDefault();
    const uid = root.querySelector('#edit-user-uid').value;
    const displayName = root.querySelector('#edit-user-name').value.trim();
    const email = root.querySelector('#edit-user-email').value.trim();
    const phone = root.querySelector('#edit-user-phone').value.trim();
    const role = root.querySelector('#edit-user-role').value;
    const status = root.querySelector('#edit-user-status').value;
    const companyId = root.querySelector('#edit-user-company').value;
    const photoURL = root.querySelector('#edit-user-photo').value.trim();
    const saveBtn = root.querySelector('#btn-save-edit');

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = I18nService.t('saving');
    }

    try {
      await AuthService.adminUpdateUserProfile(uid, {
        displayName,
        email,
        phone,
        role,
        status,
        companyId,
        photoURL
      });

      NotificationService.success(I18nService.t('sa_users_updated_toast', { name: displayName }));
      this.closeModal('#edit-user-modal', root);
      await this.loadInitialData(root);
    } catch (err) {
      console.error('[UsersView] Error al actualizar perfil:', err);
      NotificationService.error(I18nService.t('sa_users_update_error_toast', { error: err.message || err }));
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = I18nService.t('save_changes');
      }
    }
  }

  openResetPasswordModal(uid, root) {
    const user = this.allUsers.find(u => u.uid === uid);
    if (!user) return;
    this.selectedUser = user;

    root.querySelector('#pass-user-uid').value = user.uid;
    root.querySelector('#pass-user-email').value = user.email;
    root.querySelector('#pass-target-user-info').innerHTML = `${I18nService.t('sa_users_modifying_pass_for')} <strong>${this.escapeHTML(user.displayName)}</strong> (${user.email})`;
    root.querySelector('#new-pass-input').value = '';

    this.openModal('#password-modal', root);
  }

  async handleSubmitPasswordChange(e, root) {
    e.preventDefault();
    const uid = root.querySelector('#pass-user-uid').value;
    const email = root.querySelector('#pass-user-email').value;
    const newPassword = root.querySelector('#new-pass-input').value;
    const submitBtn = root.querySelector('#btn-submit-pass');

    if (!newPassword || newPassword.length < 6) {
      NotificationService.error(I18nService.t('sa_users_pass_short_error'));
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = I18nService.t('updating');
    }

    try {
      await AuthService.adminUpdateUserPassword(uid, email, newPassword);
      NotificationService.success(I18nService.t('sa_users_pass_updated_toast', { email }));
      this.closeModal('#password-modal', root);
      await this.loadInitialData(root);
    } catch (err) {
      console.error('[UsersView] Error al actualizar clave:', err);
      NotificationService.error(I18nService.t('sa_users_pass_error_toast', { error: err.message || err }));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = I18nService.t('settings_change_password').replace('Cambiar', 'Actualizar');
      }
    }
  }

  openDeleteUserModal(uid, root) {
    const user = this.allUsers.find(u => u.uid === uid);
    if (!user) return;
    this.selectedUser = user;

    root.querySelector('#delete-target-info').innerHTML = `
      ${I18nService.t('sa_users_about_to_delete')} <strong>${this.escapeHTML(user.displayName)}</strong><br/>
      ${I18nService.t('auth_email')}: <code style="color:#60a5fa;">${user.email}</code><br/>
      ${I18nService.t('emp_role')}: <strong>${user.role}</strong> | ${I18nService.t('ri_invoice_num').replace('Factura', 'Negocio')}: <strong>${user.companyName}</strong>
    `;

    const confirmInput = root.querySelector('#delete-confirm-email-input');
    const deleteBtn = root.querySelector('#btn-confirm-delete');

    if (confirmInput) confirmInput.value = '';
    if (deleteBtn) {
      deleteBtn.disabled = true;
      deleteBtn.style.opacity = '0.5';
      deleteBtn.style.cursor = 'not-allowed';
    }

    this.openModal('#delete-modal', root);
  }

  async handleConfirmDeleteUser(root) {
    if (!this.selectedUser) return;

    const user = this.selectedUser;
    const deleteBtn = root.querySelector('#btn-confirm-delete');

    if (deleteBtn) {
      deleteBtn.disabled = true;
      deleteBtn.textContent = I18nService.t('deleting');
    }

    try {
      await AuthService.adminDeleteUserAccount(user.uid, user.email, user.companyId);
      NotificationService.success(I18nService.t('sa_users_deleted_toast', { name: user.displayName }));
      this.closeModal('#delete-modal', root);
      await this.loadInitialData(root);
    } catch (err) {
      console.error('[UsersView] Error al eliminar usuario:', err);
      NotificationService.error(I18nService.t('sa_users_delete_error_toast', { error: err.message || err }));
    } finally {
      if (deleteBtn) {
        deleteBtn.disabled = false;
        deleteBtn.textContent = '🔥 ' + I18nService.t('sa_users_delete_permanent_btn');
      }
    }
  }

  openModal(selector, root) {
    const modal = root.querySelector(selector);
    if (modal) modal.style.display = 'flex';
  }

  closeModal(selector, root) {
    const modal = root.querySelector(selector);
    if (modal) modal.style.display = 'none';
  }

  escapeHTML(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  unmount() {
    this.layout.unmount();
    super.unmount();
  }
}
