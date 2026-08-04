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
          label: 'Regla / Tarifa',
          render: (val, row) => `
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width:40px;height:40px;border-radius:6px;background:var(--color-bg-tertiary);display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">🏷️</div>
              <div style="display: flex; flex-direction: column;">
                <span class="font-semibold text-primary">${val}</span>
                <span class="text-xs text-secondary" style="font-size: 0.7rem; margin-top: 2px;">
                  Aplica a: <strong>${row.scopeLabel || row.scope || 'Todos los productos'}</strong>
                </span>
              </div>
            </div>
          `
        },
        { 
          key: 'targetType', 
          label: 'Beneficiario',
          render: (val) => {
            const labels = {
              EMPLEADO: '👨‍🍳 Empleado / Staff',
              CLIENTE_VIP: '⭐ Cliente VIP',
              MAYORISTA: '📦 Mayorista',
              GENERAL: '🌐 Público General'
            };
            return `<span class="badge" style="background:var(--color-bg-tertiary);color:var(--color-text-primary);font-size:0.75rem;">${labels[val] || val || 'General'}</span>`;
          }
        },
        { 
          key: 'discountType', 
          label: 'Beneficio',
          render: (val, row) => {
            const num = Number(row.value || 0);
            if (val === 'PORCENTAJE') {
              return `<span class="font-bold text-accent">${num}% Descuento</span>`;
            }
            if (val === 'MONTO_FIJO') {
              return `<span class="font-bold text-success">-$${num.toFixed(2)} Descuento</span>`;
            }
            return `<span class="font-bold text-warning">$${num.toFixed(2)} Precio Fijo</span>`;
          }
        },
        { 
          key: 'status', 
          label: 'Estado',
          render: (val) => {
            const isActive = val !== 'INACTIVO';
            return `<span class="stock-badge ${isActive ? 'stock-ok' : 'stock-out'}">${isActive ? 'Activo' : 'Inactivo'}</span>`;
          }
        },
        {
          key: 'id',
          label: 'Acciones',
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
      title: 'Precios Especiales y Tarifas Preferenciales',
      subtitle: 'Configura reglas de precios reducidos y descuentos automáticos para empleados, vendedores y clientes VIP.',
      actionHTML: `
        <button class="btn btn-primary btn-sm" id="btn-add-rule">
          <span>+</span> Nueva Regla de Precio
        </button>
      `,
      contentHTML: `
        <!-- KPI Row -->
        <div class="grid-stats mb-6">
          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Reglas Activas</span>
              <div class="kpi-icon kpi-icon-accent">🏷️</div>
            </div>
            <h3 class="kpi-value" id="kpi-total-rules">0</h3>
            <span class="kpi-change text-secondary">Configuraciones vigentes</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Descuentos Empleados</span>
              <div class="kpi-icon kpi-icon-success">👨‍🍳</div>
            </div>
            <h3 class="kpi-value" id="kpi-staff-rules">0</h3>
            <span class="kpi-change text-secondary">Tarifas para personal</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Precios VIP / Mayorista</span>
              <div class="kpi-icon kpi-icon-warning">⭐</div>
            </div>
            <h3 class="kpi-value" id="kpi-vip-rules">0</h3>
            <span class="kpi-change text-secondary">Tarifas preferenciales</span>
          </div>
        </div>

        <!-- Filter & Search Toolbar -->
        <div class="card p-4 mb-6 d-flex justify-content-between align-items-center flex-wrap gap-4">
          <div class="d-flex gap-3 flex-wrap align-items-center" style="flex: 1; min-width: 280px;">
            <input type="text" id="pricing-search" class="input input-md" placeholder="Buscar por nombre de regla..." style="max-width: 320px;" />
            
            <select id="filter-target" class="input input-md" style="max-width: 220px; background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); color: var(--color-text-primary);">
              <option value="">Todos los beneficiarios</option>
              <option value="EMPLEADO">👨‍🍳 Empleado / Staff</option>
              <option value="CLIENTE_VIP">⭐ Cliente VIP</option>
              <option value="MAYORISTA">📦 Mayorista</option>
              <option value="GENERAL">🌐 Público General</option>
            </select>
          </div>

          <div class="text-xs text-secondary" id="rules-counter-label">
            Cargando reglas...
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
    if (countEl) countEl.textContent = `${filtered.length} reglas registradas`;

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
        if (confirm('¿Seguro que deseas eliminar esta regla de precio especial?')) {
          try {
            await FirestoreService.delete('precios_especiales', id);
            NotificationService.success('Regla eliminada de la base de datos.');
          } catch (e) {
            NotificationService.error(`Error al eliminar: ${e.message}`);
          }
        }
      };
    });
  }

  openModal(rule = null) {
    const isEdit = !!rule;
    const title = isEdit ? 'Editar Regla de Precio Especial' : 'Nueva Regla de Precio Especial';

    const categoryOptions = (this.state.categories || []).map(c => `<option value="${c}" ${rule?.scopeValue === c ? 'selected' : ''}>${c}</option>`).join('');
    const productOptions  = (this.state.products || []).map(p => `<option value="${p.id}" ${rule?.scopeValue === p.id ? 'selected' : ''}>${p.name} ($${p.price || 0})</option>`).join('');

    const bodyHTML = `
      <form id="form-pricing-rule" style="display: flex; flex-direction: column; gap: var(--space-4);">
        <div class="form-group">
          <label class="form-label" for="rule-name">Nombre de la Regla / Tarifa *</label>
          <input type="text" id="rule-name" class="input input-md" value="${rule?.name || ''}" placeholder="Ej. Descuento Personal 15%" required />
        </div>

        <div class="grid-responsive" style="gap: var(--space-4);">
          <div class="col-6">
            <div class="form-group">
              <label class="form-label" for="rule-target">Beneficiario *</label>
              <select id="rule-target" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); color: var(--color-text-primary);">
                <option value="EMPLEADO" ${rule?.targetType === 'EMPLEADO' ? 'selected' : ''}>👨‍🍳 Empleado / Staff</option>
                <option value="CLIENTE_VIP" ${rule?.targetType === 'CLIENTE_VIP' ? 'selected' : ''}>⭐ Cliente VIP</option>
                <option value="MAYORISTA" ${rule?.targetType === 'MAYORISTA' ? 'selected' : ''}>📦 Mayorista</option>
                <option value="GENERAL" ${rule?.targetType === 'GENERAL' ? 'selected' : ''}>🌐 Público General</option>
              </select>
            </div>
          </div>

          <div class="col-6">
            <div class="form-group">
              <label class="form-label" for="rule-scope">Aplica a *</label>
              <select id="rule-scope" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); color: var(--color-text-primary);">
                <option value="TODOS" ${rule?.scope === 'TODOS' ? 'selected' : ''}>Todos los Productos</option>
                <option value="CATEGORIA" ${rule?.scope === 'CATEGORIA' ? 'selected' : ''}>Categoría Específica</option>
                <option value="PRODUCTO" ${rule?.scope === 'PRODUCTO' ? 'selected' : ''}>Producto Específico</option>
              </select>
            </div>
          </div>
        </div>

        <div class="form-group" id="group-scope-value" style="display: ${rule?.scope && rule.scope !== 'TODOS' ? 'block' : 'none'};">
          <label class="form-label" id="label-scope-value" for="rule-scope-value">Seleccionar Categoría o Producto</label>
          <select id="rule-scope-value" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); color: var(--color-text-primary);">
            ${categoryOptions}
          </select>
        </div>

        <div class="grid-responsive" style="gap: var(--space-4);">
          <div class="col-6">
            <div class="form-group">
              <label class="form-label" for="rule-discount-type">Tipo de Beneficio *</label>
              <select id="rule-discount-type" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); color: var(--color-text-primary);">
                <option value="PORCENTAJE" ${rule?.discountType === 'PORCENTAJE' ? 'selected' : ''}>% Porcentaje de Descuento</option>
                <option value="MONTO_FIJO" ${rule?.discountType === 'MONTO_FIJO' ? 'selected' : ''}>$ Monto de Descuento Fijo</option>
                <option value="PRECIO_FIJO" ${rule?.discountType === 'PRECIO_FIJO' ? 'selected' : ''}>$ Precio Fijo Especial</option>
              </select>
            </div>
          </div>

          <div class="col-6">
            <div class="form-group">
              <label class="form-label" for="rule-value">Valor / Monto *</label>
              <input type="number" step="0.01" min="0" id="rule-value" class="input input-md" value="${rule?.value || ''}" placeholder="Ej. 15 o 50.00" required />
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="rule-status">Estado *</label>
          <select id="rule-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); color: var(--color-text-primary);">
            <option value="ACTIVO" ${rule?.status !== 'INACTIVO' ? 'selected' : ''}>✅ Activo</option>
            <option value="INACTIVO" ${rule?.status === 'INACTIVO' ? 'selected' : ''}>❌ Inactivo</option>
          </select>
        </div>
      </form>
    `;

    const modal = new Modal({
      title,
      bodyHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-cancel-modal">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="btn-save-rule">${isEdit ? 'Guardar Cambios' : 'Crear Regla'}</button>
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
        NotificationService.warn('Por favor completa los campos obligatorios con valores válidos.');
        return;
      }

      let scopeLabel = 'Todos los productos';
      if (scope === 'CATEGORIA') {
        scopeLabel = `Categoría: ${scopeValue}`;
      } else if (scope === 'PRODUCTO') {
        const prod = this.state.products.find(p => p.id === scopeValue);
        scopeLabel = `Producto: ${prod ? prod.name : scopeValue}`;
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
          NotificationService.success('Regla de precio actualizada.');
        } else {
          await FirestoreService.create('precios_especiales', {
            ...payload,
            createdAt: Date.now()
          });
          NotificationService.success('Regla de precio creada exitosamente.');
        }
        modal.close();
      } catch (e) {
        NotificationService.error(`Error al guardar: ${e.message}`);
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
