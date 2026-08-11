/**
 * @file branches.view.js
 * @description Módulo de Administración Multi-Sucursales de la Empresa para Ultra Administrador.
 * Permite al Dueño crear, editar, listar, activar/desactivar y configurar sucursales en cualquier
 * categoría de negocio (Restaurantes, Tiendas, Clínicas, Talleres, Farmacias, Servicios, etc.).
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { BranchService } from '../../../services/branch.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { I18nService } from '../../../services/i18n.service.js';

export class BranchesView extends Component {
  constructor(props = {}) {
    super(props);
    const state = GlobalStore.getState();
    this.currentCompany = state.currentCompany || {};

    this.state = {
      branches: [],
      filterCity: '',
      filterStatus: '',
      searchTerm: ''
    };

    this.layout = new PageLayout({
      title: `🏢 ${I18nService.t('branch_title')}`,
      subtitle: `${this.currentCompany.name || I18nService.t('my_account')} — ${I18nService.t('branch_performance')}.`,
      actionHTML: `
        <button class="btn btn-primary btn-sm" id="btn-new-branch">+ ${I18nService.t('branch_add')}</button>
      `,
      contentHTML: `
        <!-- KPIs -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="card p-4 flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xl text-indigo-400">🏢</div>
            <div>
              <div class="text-2xl font-extrabold text-white" id="kpi-total-branches">0</div>
              <div class="text-xs text-secondary">${I18nService.t('total')} ${I18nService.t('nav_branches')}</div>
            </div>
          </div>
          <div class="card p-4 flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl text-emerald-400">✅</div>
            <div>
              <div class="text-2xl font-extrabold text-emerald-400" id="kpi-active-branches">0</div>
              <div class="text-xs text-secondary">${I18nService.t('active')} ${I18nService.t('nav_branches')}</div>
            </div>
          </div>
          <div class="card p-4 flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xl text-amber-400">📍</div>
            <div>
              <div class="text-2xl font-extrabold text-amber-400" id="kpi-cities-count">0</div>
              <div class="text-xs text-secondary">${I18nService.t('col_location')}</div>
            </div>
          </div>
          <div class="card p-4 flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-xl text-cyan-400">🎯</div>
            <div>
              <div class="text-2xl font-extrabold text-cyan-400" id="kpi-selected-context">Consolidado</div>
              <div class="text-xs text-secondary">${I18nService.t('status')}</div>
            </div>
          </div>
        </div>

        <!-- Filters Toolbar -->
        <div class="card p-4 mb-6 flex flex-wrap gap-4 items-center justify-between">
          <div class="flex flex-wrap gap-3 items-center">
            <input type="text" id="branch-search-input" class="input input-sm" placeholder="🔍 ${I18nService.t('search')}..." style="min-width: 240px;" />
            <select id="branch-city-filter" class="input input-sm">
              <option value="">${I18nService.t('view_all')} ${I18nService.t('col_location')}</option>
            </select>
            <select id="branch-status-filter" class="input input-sm">
              <option value="">${I18nService.t('view_all')} ${I18nService.t('status')}</option>
              <option value="ACTIVA">${I18nService.t('active')}</option>
              <option value="INACTIVA">${I18nService.t('inactive')}</option>
            </select>
          </div>
          <div class="text-xs text-secondary" id="branch-count-label">
            ${I18nService.t('loading')}
          </div>
        </div>

        <!-- Branches Container -->
        <div id="branches-list-container">
          <p class="text-center py-10 text-secondary">${I18nService.t('loading_data')}</p>
        </div>
      `
    });

    this._unsubBranchListener = null;
  }

  mount() {
    const element = this.layout.mount();
    this.bindEvents(element);
    this.subscribeData(element);
    return element;
  }

  subscribeData(element) {
    this._unsubBranchListener = GlobalStore.subscribe('branches', (branches) => {
      this.state.branches = branches || [];
      this.updateCityFilterOptions(element);
      this.renderView(element);
    });

    // Initial render with current state
    this.state.branches = GlobalStore.getState().branches || [];
    this.updateCityFilterOptions(element);
    this.renderView(element);
  }

  updateCityFilterOptions(element) {
    const citySelect = element.querySelector('#branch-city-filter');
    if (!citySelect) return;

    const currentVal = citySelect.value;
    const cities = Array.from(new Set(this.state.branches.map(b => (b.city || b.state || 'General').trim()))).filter(Boolean).sort();

    citySelect.innerHTML = `<option value="">Todas las ciudades (${cities.length})</option>` +
      cities.map(c => `<option value="${c}"${c === currentVal ? ' selected' : ''}>${c}</option>`).join('');
  }

  bindEvents(element) {
    element.querySelector('#btn-new-branch')?.addEventListener('click', () => this.openBranchModal());

    element.querySelector('#branch-search-input')?.addEventListener('input', (e) => {
      this.state.searchTerm = e.target.value.toLowerCase().trim();
      this.renderView(element);
    });

    element.querySelector('#branch-city-filter')?.addEventListener('change', (e) => {
      this.state.filterCity = e.target.value;
      this.renderView(element);
    });

    element.querySelector('#branch-status-filter')?.addEventListener('change', (e) => {
      this.state.filterStatus = e.target.value;
      this.renderView(element);
    });

    // Delegation for branch actions
    element.querySelector('#branches-list-container')?.addEventListener('click', (e) => {
      const selectBtn = e.target.closest('.btn-select-branch');
      if (selectBtn) {
        const id = selectBtn.dataset.id;
        BranchService.setSelectedBranch(id);
        NotificationService.success(`Contexto cambiado a: ${selectBtn.dataset.name}`);
        return;
      }

      const editBtn = e.target.closest('.btn-edit-branch');
      if (editBtn) {
        const id = editBtn.dataset.id;
        const branchObj = this.state.branches.find(b => b.id === id);
        if (branchObj) this.openBranchModal(branchObj);
        return;
      }

      const toggleBtn = e.target.closest('.btn-toggle-branch');
      if (toggleBtn) {
        const id = toggleBtn.dataset.id;
        const status = toggleBtn.dataset.status;
        BranchService.toggleStatus(id, status);
        NotificationService.info(`Estado de sucursal actualizado.`);
        return;
      }

      const deleteBtn = e.target.closest('.btn-delete-branch');
      if (deleteBtn) {
        const id = deleteBtn.dataset.id;
        const name = deleteBtn.dataset.name;
        this.confirmDeleteBranch(id, name);
      }
    });
  }


  renderView(element) {
    const container = element.querySelector('#branches-list-container');
    if (!container) return;

    const { branches, searchTerm, filterCity, filterStatus } = this.state;
    const { selectedBranchId } = GlobalStore.getState();

    // Filter
    let filtered = branches;
    if (searchTerm) {
      filtered = filtered.filter(b =>
        (b.name || '').toLowerCase().includes(searchTerm) ||
        (b.code || '').toLowerCase().includes(searchTerm) ||
        (b.city || '').toLowerCase().includes(searchTerm) ||
        (b.address || '').toLowerCase().includes(searchTerm)
      );
    }
    if (filterCity) {
      filtered = filtered.filter(b => (b.city || b.state || 'General').trim() === filterCity);
    }
    if (filterStatus) {
      filtered = filtered.filter(b => b.status === filterStatus);
    }

    // Update KPIs
    const q = sel => element.querySelector(sel);
    if (q('#kpi-total-branches')) q('#kpi-total-branches').textContent = branches.length;
    if (q('#kpi-active-branches')) q('#kpi-active-branches').textContent = branches.filter(b => b.status === 'ACTIVA').length;
    if (q('#kpi-cities-count')) q('#kpi-cities-count').textContent = new Set(branches.map(b => (b.city || 'General').trim())).size;
    if (q('#kpi-selected-context')) {
      const activeObj = branches.find(b => b.id === selectedBranchId);
      q('#kpi-selected-context').textContent = selectedBranchId === 'all' ? I18nService.t('branch_all') : (activeObj?.name || I18nService.t('col_branch'));
    }
    if (q('#branch-count-label')) q('#branch-count-label').textContent = `${I18nService.t('view')} ${filtered.length} ${I18nService.t('of')} ${branches.length} ${I18nService.t('nav_branches')}`;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="card p-10 text-center text-secondary">
          <div style="margin-bottom:12px;display:flex;justify-content:center;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48" style="color:var(--color-text-tertiary);"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/></svg>
          </div>
          <h4 class="font-bold text-white text-lg">${I18nService.t('branch_no_branches')}</h4>
          <p class="text-xs mt-1">${I18nService.t('no_results')}</p>
        </div>
      `;
      return;
    }

    // Group by City
    const grouped = BranchService.groupBranchesByCity(filtered);

    let html = '';
    Object.entries(grouped).forEach(([city, list]) => {
      html += `
        <div class="mb-8">
          <div class="flex items-center gap-2 mb-4 pb-2 border-b border-gray-800">
            <h3 class="text-base font-bold text-white">${city}</h3>
            <span class="badge badge-accent ml-auto">${list.length} sucursal(es)</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            ${list.map(b => this.renderBranchCard(b, selectedBranchId)).join('')}
          </div>
        </div>
      `;
    });

    container.innerHTML = `<div class="animate-fade-in">${html}</div>`;
  }

  renderBranchCard(branch, selectedBranchId) {
    const isSelected = branch.id === selectedBranchId;
    const isActive = branch.status === 'ACTIVA';

    return `
      <div class="card card-interactive p-5 flex flex-col justify-between ${isSelected ? 'border-indigo-500 shadow-indigo-500/20' : ''}" style="${isSelected ? 'background: rgba(99, 102, 241, 0.08); border-color: rgba(99, 102, 241, 0.4);' : ''}">
        <div>
          <!-- Header badge & status -->
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded border border-indigo-500/20">
              ${branch.code || 'SUC-01'}
            </span>
            <span class="badge ${isActive ? 'badge-success' : 'badge-danger'}">
              ${isActive ? I18nService.t('active') : I18nService.t('inactive')}
            </span>
          </div>

          <!-- Branch Name & City -->
          <h4 class="text-lg font-bold text-white mb-1 flex items-center gap-2">
            ${branch.name}
            ${branch.isDefault ? `<span class="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">${I18nService.t('branch_main')}</span>` : ''}
          </h4>
          <p class="text-xs text-secondary mb-3">
            ${branch.city || I18nService.t('nav_general')}${branch.state ? `, ${branch.state}` : ''} &bull; ${branch.address || I18nService.t('no_data')}
          </p>

          <!-- Operational Info -->
          <div class="text-xs text-secondary space-y-1 py-3 border-t border-b border-gray-800/80 my-3">
            <div class="flex justify-between">
              <span>${I18nService.t('col_manager')}:</span>
              <strong class="text-slate-300">${branch.managerName || I18nService.t('select')}</strong>
            </div>
            <div class="flex justify-between">
              <span>${I18nService.t('time')}:</span>
              <strong class="text-slate-300">${branch.openingHours || '08:00 AM'} - ${branch.closingHours || '06:00 PM'}</strong>
            </div>
            <div class="flex justify-between">
              <span>${I18nService.t('col_phone')}:</span>
              <strong class="text-slate-300">${branch.phone || branch.whatsapp || '—'}</strong>
            </div>
          </div>
        </div>

        <!-- Action Footer -->
        <div class="flex items-center gap-2 mt-2 pt-2">
          <button class="btn ${isSelected ? 'btn-primary' : 'btn-secondary'} btn-xs flex-1 btn-select-branch" data-id="${branch.id}" data-name="${branch.name}">
            ${isSelected ? `✓ ${I18nService.t('active')}` : I18nService.t('select')}
          </button>
          <button class="btn btn-secondary btn-xs btn-edit-branch" data-id="${branch.id}" title="${I18nService.t('edit')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          </button>
          <button class="btn btn-secondary btn-xs btn-toggle-branch" data-id="${branch.id}" data-status="${branch.status}" title="${isActive ? I18nService.t('disabled') : I18nService.t('enabled')}">
            ${isActive ? I18nService.t('inactive') : I18nService.t('active')}
          </button>
          ${!branch.isDefault ? `
            <button class="btn btn-danger btn-xs btn-delete-branch" data-id="${branch.id}" data-name="${branch.name}" title="${I18nService.t('delete')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }



  openBranchModal(branchToEdit = null) {
    const isEdit = !!branchToEdit;
    const b = branchToEdit || {};

    const bodyHTML = `
      <div class="space-y-4 text-left">
        <!-- DATOS GENERALES -->
        <div class="text-xs font-bold uppercase tracking-wider text-indigo-400 pb-1 border-b border-gray-800">
          1. ${I18nService.t('nav_general')}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="form-group">
            <label class="form-label" for="branch-form-name">${I18nService.t('branch_name')} *</label>
            <input type="text" id="branch-form-name" class="input input-md" placeholder="Ej. Pizza Cat León 1" value="${b.name || ''}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="branch-form-code">${I18nService.t('inv_product_code')} *</label>
            <input type="text" id="branch-form-code" class="input input-md" placeholder="Ej. LEON-01" value="${b.code || ''}" required />
          </div>
        </div>

        <!-- UBICACIÓN -->
        <div class="text-xs font-bold uppercase tracking-wider text-indigo-400 pt-2 pb-1 border-b border-gray-800">
          2. ${I18nService.t('col_location')}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="form-group">
            <label class="form-label" for="branch-form-country">${I18nService.t('settings_company_details')}</label>
            <input type="text" id="branch-form-country" class="input input-md" value="${b.country || 'Nicaragua'}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="branch-form-state">Estado</label>
            <input type="text" id="branch-form-state" class="input input-md" placeholder="Ej. León" value="${b.state || ''}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="branch-form-city">Ciudad *</label>
            <input type="text" id="branch-form-city" class="input input-md" placeholder="Ej. León" value="${b.city || ''}" required />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="branch-form-address">${I18nService.t('branch_address')}</label>
          <input type="text" id="branch-form-address" class="input input-md" placeholder="..." value="${b.address || ''}" />
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="form-group">
            <label class="form-label" for="branch-form-phone">${I18nService.t('col_phone')}</label>
            <input type="tel" id="branch-form-phone" class="input input-md" placeholder="+505 8888 8888" value="${b.phone || b.whatsapp || ''}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="branch-form-email">${I18nService.t('col_email')}</label>
            <input type="email" id="branch-form-email" class="input input-md" placeholder="leon1@pizzacat.com" value="${b.email || ''}" />
          </div>
        </div>

        <!-- INFORMACIÓN OPERATIVA -->
        <div class="text-xs font-bold uppercase tracking-wider text-indigo-400 pt-2 pb-1 border-b border-gray-800">
          3. ${I18nService.t('nav_operations')}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="form-group">
            <label class="form-label" for="branch-form-manager">${I18nService.t('branch_manager')}</label>
            <input type="text" id="branch-form-manager" class="input input-md" placeholder="Ej. Juan Pérez" value="${b.managerName || ''}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="branch-form-opening">${I18nService.t('time')} Opening</label>
            <input type="time" id="branch-form-opening" class="input input-md" value="${b.openingHours || '08:00'}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="branch-form-closing">${I18nService.t('time')} Closing</label>
            <input type="time" id="branch-form-closing" class="input input-md" value="${b.closingHours || '18:00'}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="branch-form-notes">${I18nService.t('col_notes')}</label>
          <textarea id="branch-form-notes" class="input input-md" rows="2" placeholder="...">${b.notes || ''}</textarea>
        </div>
      </div>
    `;

    const modal = new Modal({
      title: isEdit ? `✏️ ${I18nService.t('edit')} ${I18nService.t('col_branch')}: ${b.name}` : `🏢 ${I18nService.t('branch_add')}`,
      bodyHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-modal-branch-cancel">${I18nService.t('cancel')}</button>
        <button class="btn btn-primary btn-sm" id="btn-modal-branch-save">${isEdit ? I18nService.t('save_changes') : I18nService.t('create')}</button>
      `
    });

    document.body.appendChild(modal.mount());

    modal.$('#btn-modal-branch-cancel')?.addEventListener('click', () => modal.close());
    modal.$('#btn-modal-branch-save')?.addEventListener('click', async () => {
      const name = modal.$('#branch-form-name')?.value?.trim();
      const code = modal.$('#branch-form-code')?.value?.trim();
      const city = modal.$('#branch-form-city')?.value?.trim();

      if (!name || !code || !city) {
        NotificationService.error('Por favor ingresa: Nombre, Código Interno y Ciudad.');
        return;
      }

      const payload = {
        name,
        code,
        country: modal.$('#branch-form-country')?.value || 'Nicaragua',
        state: modal.$('#branch-form-state')?.value || '',
        city,
        address: modal.$('#branch-form-address')?.value || '',
        phone: modal.$('#branch-form-phone')?.value || '',
        whatsapp: modal.$('#branch-form-phone')?.value || '',
        email: modal.$('#branch-form-email')?.value || '',
        managerName: modal.$('#branch-form-manager')?.value || '',
        openingHours: modal.$('#branch-form-opening')?.value || '08:00',
        closingHours: modal.$('#branch-form-closing')?.value || '18:00',
        notes: modal.$('#branch-form-notes')?.value || '',
        status: b.status || 'ACTIVA'
      };

      try {
        if (isEdit) {
          await BranchService.updateBranch(b.id, payload);
          NotificationService.success(`Sucursal "${name}" actualizada correctamente.`);
        } else {
          const newId = await BranchService.createBranch(payload);
          NotificationService.success(`Sucursal "${name}" creada con éxito.`);
          // Switch to new branch
          BranchService.setSelectedBranch(newId);
        }
        modal.close();
      } catch (err) {
        console.error('[BranchesView] Error saving branch:', err);
        NotificationService.error('Error al guardar la sucursal.');
      }
    });
  }

  async confirmDeleteBranch(branchId, branchName) {
    const employees = await BranchService.getEmployeesByBranch(branchId);
    const otherBranches = (this.state.branches || []).filter(b => b.id !== branchId);

    let employeeActionHTML = '';
    if (employees.length > 0) {
      const optionsOtherBranches = otherBranches.map(b => 
        `<option value="${b.id}">${b.name} (${b.city || I18nService.t('nav_general')})</option>`
      ).join('');

      employeeActionHTML = `
        <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: var(--radius-md); padding: 14px; margin-top: 12px;">
          <div style="font-weight: 700; color: #ef4444; font-size: 0.85rem; margin-bottom: 6px;">
            ⚠️ ${I18nService.t('warning')}: ${I18nService.t('branch_title')} ${I18nService.t('of')} ${employees.length} ${I18nService.t('nav_employees')}:
          </div>
          <div style="font-size: 0.8rem; color: var(--color-text-secondary); margin-bottom: 12px;">
            ${employees.map(e => `• <strong>${e.displayName || e.name || e.email}</strong> (${e.customRole || e.role})`).join('<br>')}
          </div>

          <div style="font-weight: 600; font-size: 0.82rem; color: #fff; margin-bottom: 8px;">
            ${I18nService.t('confirm_action')}?
          </div>

          ${otherBranches.length > 0 ? `
            <label style="display: flex; align-items: flex-start; gap: 8px; font-size: 0.8rem; color: #e2e8f0; cursor: pointer; margin-bottom: 8px;">
              <input type="radio" name="emp-action" value="transfer" checked style="margin-top: 2px;" />
              <div>
                <strong>🔁 ${I18nService.t('nav_transfers')} ${I18nService.t('nav_employees')}:</strong>
                <select id="delete-target-branch-select" class="input input-sm" style="margin-top: 6px; width: 100%;">
                  ${optionsOtherBranches}
                </select>
              </div>
            </label>
          ` : ''}

          <label style="display: flex; align-items: flex-start; gap: 8px; font-size: 0.8rem; color: #e2e8f0; cursor: pointer;">
            <input type="radio" name="emp-action" value="delete" ${otherBranches.length === 0 ? 'checked' : ''} style="margin-top: 2px;" />
            <div>
              <strong style="color: #ef4444;">🗑️ ${I18nService.t('delete')} permanentemente</strong>
            </div>
          </label>
        </div>
      `;
    }

    const bodyHTML = `
      <div style="text-align: left; padding: 4px 0;">
        <p style="font-size: 0.9rem; color: var(--color-text-primary); margin-bottom: 8px;">
          ${I18nService.t('confirm_delete')} <strong style="color: #6366f1;">${branchName}</strong>?
        </p>
      </div>
    `;

    const modal = new Modal({
      title: `🗑️ ${I18nService.t('delete')} ${I18nService.t('col_branch')}: ${branchName}`,
      bodyHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-cancel-del-branch">${I18nService.t('cancel')}</button>
        <button class="btn btn-danger btn-sm" id="btn-confirm-del-branch">${I18nService.t('delete')}</button>
      `
    });

    document.body.appendChild(modal.mount());

    modal.$('#btn-cancel-del-branch')?.addEventListener('click', () => modal.close());
    modal.$('#btn-confirm-del-branch')?.addEventListener('click', async () => {
      try {
        let targetBranchId = null;
        let deleteEmployees = false;

        if (employees.length > 0) {
          const selectedAction = modal.$('input[name="emp-action"]:checked')?.value;
          if (selectedAction === 'transfer') {
            targetBranchId = modal.$('#delete-target-branch-select')?.value || null;
          } else if (selectedAction === 'delete') {
            deleteEmployees = true;
          }
        }

        await BranchService.deleteBranchWithEmployees(branchId, { targetBranchId, deleteEmployees });

        NotificationService.success(`Sucursal "${branchName}" eliminada correctamente.`);
        modal.close();
      } catch (err) {
        console.error('[BranchesView] Error deleting branch:', err);
        NotificationService.error('Error al eliminar la sucursal.');
      }
    });
  }

  unmount() {
    if (this._unsubBranchListener) {
      this._unsubBranchListener();
      this._unsubBranchListener = null;
    }
    this.layout.unmount();
    super.unmount();
  }
}
