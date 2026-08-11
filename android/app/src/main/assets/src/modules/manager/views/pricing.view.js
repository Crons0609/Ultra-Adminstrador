/**
 * @file pricing.view.js
 * @description Gestión de Precios Especiales, Descuentos de Empleados y Tarifas Preferenciales.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { TimeService } from '../../../services/time.service.js';
import { I18nService } from '../../../services/i18n.service.js';

export class PricingView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || '';

    this.state = {
      rules: [],
      products: [],
      categories: [],
      searchQuery: '',
      selectedTarget: ''
    };

    // Initialize DataTable
    this.table = new DataTable({
      columns: [
        { 
          key: 'name', 
          label: I18nService.t('price_name'),
          render: (val, row) => `
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width:40px;height:40px;border-radius:6px;background:var(--color-bg-tertiary);display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">🏷️</div>
              <div style="display: flex; flex-direction: column;">
                <span class="font-semibold text-primary">${val}</span>
                <span class="text-xs text-secondary" style="font-size: 0.7rem; margin-top: 2px;">
                  ${I18nService.t('price_applies_to')}: <strong>${row.scopeLabel || row.scope || I18nService.t('all_products')}</strong>
                </span>
              </div>
            </div>
          `
        },
        { 
          key: 'targetType', 
          label: I18nService.t('price_target_label').replace(' *',''),
          render: (val) => {
            const labels = {
              EMPLEADO: I18nService.t('price_target_staff'),
              CLIENTE_VIP: I18nService.t('price_target_vip'),
              MAYORISTA: I18nService.t('price_target_wholesale'),
              GENERAL: I18nService.t('price_target_general')
            };
            return `<span class="badge" style="background:var(--color-bg-tertiary);color:var(--color-text-primary);font-size:0.75rem;">${labels[val] || val || I18nService.t('price_target_general')}</span>`;
          }
        },
        { 
          key: 'discountType', 
          label: I18nService.t('price_benefit_type_label').replace(' *',''),
          render: (val, row) => {
            const num = Number(row.value || 0);
            if (val === 'PORCENTAJE') {
              return `<span class="font-bold text-accent">${num}% ${I18nService.t('discount')}</span>`;
            }
            if (val === 'MONTO_FIJO') {
              return `<span class="font-bold text-success">-$${num.toFixed(2)} ${I18nService.t('discount')}</span>`;
            }
            return `<span class="font-bold text-warning">$${num.toFixed(2)} ${I18nService.t('price_fixed')}</span>`;
          }
        },
        { 
          key: 'status', 
          label: I18nService.t('status'),
          render: (val) => {
            const isActive = val !== 'INACTIVO';
            return `<span class="stock-badge ${isActive ? 'stock-ok' : 'stock-out'}">${isActive ? I18nService.t('active') : I18nService.t('inactive')}</span>`;
          }
        },
        {
          key: 'id',
          label: I18nService.t('actions'),
          render: (val) => `
            <div class="d-flex gap-2">
              <button class="btn btn-secondary btn-sm py-1 px-2 btn-edit-rule" data-id="${val}" style="font-size: 0.7rem;">✏️</button>
              <button class="btn btn-danger btn-sm py-1 px-2 btn-delete-rule" data-id="${val}" style="font-size: 0.7rem;">🗑️</button>
            </div>
          `
        }
      ],
      data: []
    });

    this.layout = new PageLayout({
      title: I18nService.t('price_title'),
      subtitle: I18nService.t('price_subtitle'),
      actionHTML: `
        <button class="btn btn-primary btn-sm" id="btn-add-rule">
          <span>+</span> ${I18nService.t('price_add_title')}
        </button>
      `,
      contentHTML: `
        <!-- KPI Row -->
        <div class="grid-stats mb-6">
          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">${I18nService.t('price_active_kpi')}</span>
              <div class="kpi-icon kpi-icon-accent">🏷️</div>
            </div>
            <h3 class="kpi-value" id="kpi-total-rules">0</h3>
            <span class="kpi-change text-secondary">${I18nService.t('price_active_desc')}</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">${I18nService.t('price_staff_kpi')}</span>
              <div class="kpi-icon kpi-icon-success">👨‍🍳</div>
            </div>
            <h3 class="kpi-value" id="kpi-staff-rules">0</h3>
            <span class="kpi-change text-secondary">${I18nService.t('price_staff_desc')}</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">${I18nService.t('price_vip_kpi')}</span>
              <div class="kpi-icon kpi-icon-warning">⭐</div>
            </div>
            <h3 class="kpi-value" id="kpi-vip-rules">0</h3>
            <span class="kpi-change text-secondary">${I18nService.t('price_vip_desc')}</span>
          </div>
        </div>

        <!-- Filter & Search Toolbar -->
        <div class="card p-4 mb-6 d-flex justify-content-between align-items-center flex-wrap gap-4">
          <div class="d-flex gap-3 flex-wrap align-items-center" style="flex: 1; min-width: 280px;">
            <input type="text" id="pricing-search" class="input input-md" placeholder="${I18nService.t('price_search_placeholder')}" style="max-width: 320px;" />
            
            <select id="filter-target" class="input input-md" style="max-width: 220px; background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); color: var(--color-text-primary);">
              <option value="">${I18nService.t('price_all_targets')}</option>
              <option value="EMPLEADO">${I18nService.t('price_target_staff')}</option>
              <option value="CLIENTE_VIP">${I18nService.t('price_target_vip')}</option>
              <option value="MAYORISTA">${I18nService.t('price_target_wholesale')}</option>
              <option value="GENERAL">${I18nService.t('price_target_general')}</option>
            </select>
          </div>

          <div class="text-xs text-secondary" id="rules-counter-label">
            ${I18nService.t('loading_data')}
          </div>
        </div>

        <!-- Rules Table Container -->
        <div class="card p-5" id="pricing-table-container"></div>
      `
    });

    this.listeners = [];
  }

  mount() {
    const element = this.layout.mount();
    
    // Append DataTable to container
    const container = element.querySelector('#pricing-table-container');
    if (container) {
      container.appendChild(this.table.mount());
    }

    this.subscribeToRealtimeData(element);
    this.bindEvents(element);
    return element;
  }

  subscribeToRealtimeData(element) {
    if (!this.companyId) return;

    // Listen to precios_especiales collection
    const rulesUnsub = FirestoreService.listenToTenant('precios_especiales', (rules) => {
      this.state.rules = rules || [];
      this.updateUI(element);
    });
    this.listeners.push(rulesUnsub);

    // Listen to products for scope dropdown
    const prodUnsub = FirestoreService.listenToTenant('productos', (products) => {
      this.state.products = products || [];
      this.state.categories = ['Todos', ...new Set(this.state.products.map(p => p.category).filter(Boolean))];
    });
    this.listeners.push(prodUnsub);
  }

  updateUI(element) {
    let filtered = [...this.state.rules];

    // Filter by search query
    if (this.state.searchQuery) {
      const q = this.state.searchQuery.toLowerCase();
      filtered = filtered.filter(r => (r.name || '').toLowerCase().includes(q));
    }

    // Filter by target
    if (this.state.selectedTarget) {
      filtered = filtered.filter(r => r.targetType === this.state.selectedTarget);
    }

    // Update DataTable
    this.table.updateData(filtered);

    // Update KPIs
    const activeRules = this.state.rules.filter(r => r.status !== 'INACTIVO');
    const totalEl = element.querySelector('#kpi-total-rules');
    const staffEl = element.querySelector('#kpi-staff-rules');
    const vipEl   = element.querySelector('#kpi-vip-rules');
    const countEl = element.querySelector('#rules-counter-label');

    if (totalEl) totalEl.textContent = activeRules.length;
    if (staffEl) staffEl.textContent = activeRules.filter(r => r.targetType === 'EMPLEADO').length;
    if (vipEl)   vipEl.textContent   = activeRules.filter(r => r.targetType === 'CLIENTE_VIP' || r.targetType === 'MAYORISTA').length;
    if (countEl) countEl.textContent = I18nService.t('price_rules_count', { count: filtered.length });

    // Re-bind edit/delete event handlers
    setTimeout(() => this.bindTableEvents(element), 50);
  }

  bindEvents(element) {
    // Search input
    element.querySelector('#pricing-search')?.addEventListener('input', (e) => {
      this.state.searchQuery = e.target.value.trim();
      this.updateUI(element);
    });

    // Filter target select
    element.querySelector('#filter-target')?.addEventListener('change', (e) => {
      this.state.selectedTarget = e.target.value;
      this.updateUI(element);
    });

    // Add rule button
    element.querySelector('#btn-add-rule')?.addEventListener('click', () => {
      this.openModal();
    });
  }

  bindTableEvents(element) {
    // Edit buttons
    element.querySelectorAll('.btn-edit-rule').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-id');
        const rule = this.state.rules.find(r => r.id === id);
        if (rule) this.openModal(rule);
      };
    });

    // Delete buttons
    element.querySelectorAll('.btn-delete-rule').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-id');
        if (confirm(I18nService.t('price_confirm_delete'))) {
          try {
            await FirestoreService.delete('precios_especiales', id);
            NotificationService.success(I18nService.t('price_deleted_success'));
          } catch (e) {
            NotificationService.error(`${I18nService.t('price_delete_error')}${e.message}`);
          }
        }
      };
    });
  }

  openModal(rule = null) {
    const isEdit = !!rule;
    const title = isEdit ? I18nService.t('price_edit_title') : I18nService.t('price_add_title');

    const categoryOptions = (this.state.categories || []).map(c => `<option value="${c}" ${rule?.scopeValue === c ? 'selected' : ''}>${c}</option>`).join('');
    const productOptions  = (this.state.products || []).map(p => `<option value="${p.id}" ${rule?.scopeValue === p.id ? 'selected' : ''}>${p.name} ($${p.price || 0})</option>`).join('');

    const bodyHTML = `
      <form id="form-pricing-rule" style="display: flex; flex-direction: column; gap: var(--space-4);">
        <div class="form-group">
          <label class="form-label" for="rule-name">${I18nService.t('price_name_label')}</label>
          <input type="text" id="rule-name" class="input input-md" value="${rule?.name || ''}" placeholder="${I18nService.t('price_name_placeholder')}" required />
        </div>

        <div class="grid-responsive" style="gap: var(--space-4);">
          <div class="col-6">
            <div class="form-group">
              <label class="form-label" for="rule-target">${I18nService.t('price_target_label')}</label>
              <select id="rule-target" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); color: var(--color-text-primary);">
                <option value="EMPLEADO" ${rule?.targetType === 'EMPLEADO' ? 'selected' : ''}>${I18nService.t('price_target_staff')}</option>
                <option value="CLIENTE_VIP" ${rule?.targetType === 'CLIENTE_VIP' ? 'selected' : ''}>${I18nService.t('price_target_vip')}</option>
                <option value="MAYORISTA" ${rule?.targetType === 'MAYORISTA' ? 'selected' : ''}>${I18nService.t('price_target_wholesale')}</option>
                <option value="GENERAL" ${rule?.targetType === 'GENERAL' ? 'selected' : ''}>${I18nService.t('price_target_general')}</option>
              </select>
            </div>
          </div>

          <div class="col-6">
            <div class="form-group">
              <label class="form-label" for="rule-scope">${I18nService.t('price_applies_to_label')}</label>
              <select id="rule-scope" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); color: var(--color-text-primary);">
                <option value="TODOS" ${rule?.scope === 'TODOS' ? 'selected' : ''}>${I18nService.t('all_products')}</option>
                <option value="CATEGORIA" ${rule?.scope === 'CATEGORIA' ? 'selected' : ''}>${I18nService.t('price_scope_category')}</option>
                <option value="PRODUCTO" ${rule?.scope === 'PRODUCTO' ? 'selected' : ''}>${I18nService.t('price_scope_product')}</option>
              </select>
            </div>
          </div>
        </div>

        <div class="form-group" id="group-scope-value" style="display: ${rule?.scope && rule.scope !== 'TODOS' ? 'block' : 'none'};">
          <label class="form-label" id="label-scope-value" for="rule-scope-value">${I18nService.t('price_scope_value_label')}</label>
          <select id="rule-scope-value" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); color: var(--color-text-primary);">
            ${categoryOptions}
          </select>
        </div>

        <div class="grid-responsive" style="gap: var(--space-4);">
          <div class="col-6">
            <div class="form-group">
              <label class="form-label" for="rule-discount-type">${I18nService.t('price_benefit_type_label')}</label>
              <select id="rule-discount-type" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); color: var(--color-text-primary);">
                <option value="PORCENTAJE" ${rule?.discountType === 'PORCENTAJE' ? 'selected' : ''}>${I18nService.t('price_benefit_percent')}</option>
                <option value="MONTO_FIJO" ${rule?.discountType === 'MONTO_FIJO' ? 'selected' : ''}>${I18nService.t('price_benefit_amount')}</option>
                <option value="PRECIO_FIJO" ${rule?.discountType === 'PRECIO_FIJO' ? 'selected' : ''}>${I18nService.t('price_benefit_fixed')}</option>
              </select>
            </div>
          </div>

          <div class="col-6">
            <div class="form-group">
              <label class="form-label" for="rule-value">${I18nService.t('price_value_label')}</label>
              <input type="number" step="0.01" min="0" id="rule-value" class="input input-md" value="${rule?.value || ''}" placeholder="${I18nService.t('price_value_placeholder')}" required />
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="rule-status">${I18nService.t('status')} *</label>
          <select id="rule-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); color: var(--color-text-primary);">
            <option value="ACTIVO" ${rule?.status !== 'INACTIVO' ? 'selected' : ''}>✅ ${I18nService.t('active')}</option>
            <option value="INACTIVO" ${rule?.status === 'INACTIVO' ? 'selected' : ''}>❌ ${I18nService.t('inactive')}</option>
          </select>
        </div>
      </form>
    `;

    const modal = new Modal({
      title,
      bodyHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-cancel-modal">${I18nService.t('cancel')}</button>
        <button class="btn btn-primary btn-sm" id="btn-save-rule">${isEdit ? I18nService.t('save_changes') : I18nService.t('create')}</button>
      `
    });

    const modalElement = modal.mount();
    document.body.appendChild(modalElement);

    const scopeSelect = modalElement.querySelector('#rule-scope');
    const scopeGroup  = modalElement.querySelector('#group-scope-value');
    const scopeLabel  = modalElement.querySelector('#label-scope-value');
    const scopeValueSelect = modalElement.querySelector('#rule-scope-value');

    const updateScopeOptions = () => {
      const scope = scopeSelect.value;
      if (scope === 'TODOS') {
        scopeGroup.style.display = 'none';
      } else if (scope === 'CATEGORIA') {
        scopeGroup.style.display = 'block';
        if (scopeLabel) scopeLabel.textContent = 'Seleccionar Categoría *';
        if (scopeValueSelect) scopeValueSelect.innerHTML = categoryOptions;
      } else if (scope === 'PRODUCTO') {
        scopeGroup.style.display = 'block';
        if (scopeLabel) scopeLabel.textContent = 'Seleccionar Producto *';
        if (scopeValueSelect) scopeValueSelect.innerHTML = productOptions;
      }
    };

    scopeSelect?.addEventListener('change', updateScopeOptions);

    modalElement.querySelector('#btn-cancel-modal')?.addEventListener('click', () => modal.close());

    modalElement.querySelector('#btn-save-rule')?.addEventListener('click', async () => {
      const name = modalElement.querySelector('#rule-name').value.trim();
      const targetType = modalElement.querySelector('#rule-target').value;
      const scope = modalElement.querySelector('#rule-scope').value;
      const scopeValue = scope !== 'TODOS' ? modalElement.querySelector('#rule-scope-value').value : '';
      const discountType = modalElement.querySelector('#rule-discount-type').value;
      const value = Number(modalElement.querySelector('#rule-value').value);
      const status = modalElement.querySelector('#rule-status').value;

      if (!name || isNaN(value) || value < 0) {
        NotificationService.warn(I18nService.t('error_required_fields'));
        return;
      }

      let scopeLabel = I18nService.t('all_products');
      if (scope === 'CATEGORIA') {
        scopeLabel = `${I18nService.t('category')}: ${scopeValue}`;
      } else if (scope === 'PRODUCTO') {
        const prod = this.state.products.find(p => p.id === scopeValue);
        scopeLabel = `${I18nService.t('ale_product')}: ${prod ? prod.name : scopeValue}`;
      }

      const payload = {
        name,
        targetType,
        scope,
        scopeValue,
        scopeLabel,
        discountType,
        value,
        status,
        updatedAt: Date.now()
      };

      try {
        if (isEdit) {
          await FirestoreService.update('precios_especiales', rule.id, payload);
          NotificationService.success(I18nService.t('price_updated_success'));
        } else {
          await FirestoreService.create('precios_especiales', {
            ...payload,
            createdAt: Date.now()
          });
          NotificationService.success(I18nService.t('price_saved_success'));
        }
        modal.close();
      } catch (e) {
        NotificationService.error(`${I18nService.t('price_save_error')}${e.message}`);
      }
    });
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.layout.unmount();
    super.unmount();
  }
}
