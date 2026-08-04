/**
 * @file supplies.view.js
 * @description Gestión de Insumos y consumibles de la empresa con soporte de códigos de barra/QR.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { BarcodeInput } from '../../../components/forms/barcode-input.js';
import { BarcodeRegistryService } from '../../../services/barcode-registry.service.js';
import { TimeService } from '../../../services/time.service.js';

export class SuppliesView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || '';

    this.state = {
      supplies: [],
      searchQuery: '',
      selectedCategory: '',
      categories: []
    };

    // Initialize DataTable
    this.table = new DataTable({
      columns: [
        { 
          key: 'name', 
          label: 'Insumo',
          render: (val, row) => `
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width:40px;height:40px;border-radius:6px;background:var(--color-bg-tertiary);display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">🧪</div>
              <div style="display: flex; flex-direction: column;">
                <span class="font-semibold text-primary">${val}</span>
                <span class="text-xs text-secondary" style="font-size: 0.7rem; margin-top: 2px;">Categoría: ${row.category || 'General'}</span>
              </div>
            </div>
          `
        },
        { 
          key: 'code', 
          label: 'Código de Barra/QR',
          render: (val) => val ? `<span class="scan-code-badge">📊 ${val}</span>` : '<span class="text-xs text-secondary">Sin asignar</span>'
        },
        { 
          key: 'stock', 
          label: 'Stock Actual',
          render: (val, row) => `
            <span class="font-medium ${Number(val) === 0 ? 'text-danger font-bold' : (Number(val) <= Number(row.minStock || 0) ? 'text-warning font-semibold' : 'text-success')}">
              ${val} ${row.unit || 'uds'}
            </span>
          `
        },
        { 
          key: 'minStock', 
          label: 'Stock Mín.',
          render: (val, row) => `<span class="text-secondary">${val} ${row.unit || 'uds'}</span>`
        },
        { 
          key: 'cost', 
          label: 'Costo Unitario',
          render: (val) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val || 0)
        },
        {
          key: 'id',
          label: 'Acciones',
          render: (val) => `
            <div class="d-flex gap-2">
              <button class="btn btn-secondary btn-sm py-1 px-2 btn-edit-supply" data-id="${val}" style="font-size: 0.7rem;">✏️</button>
              <button class="btn btn-danger btn-sm py-1 px-2 btn-delete-supply" data-id="${val}" style="font-size: 0.7rem;">🗑️</button>
            </div>
          `
        }
      ],
      data: []
    });

    this.layout = new PageLayout({
      title: 'Control de Insumos',
      subtitle: 'Administra materias primas, materiales consumibles de oficina o limpieza y control de niveles mínimos.',
      actionHTML: `
        <button class="btn btn-primary btn-sm" id="btn-add-supply">
          + Registrar Insumo
        </button>
      `,
      contentHTML: `
        <!-- KPI Cards Row -->
        <div class="grid-stats animate-fade-in" id="supplies-kpis">
          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Insumos Registrados</span>
              <div class="kpi-icon kpi-icon-accent">🧪</div>
            </div>
            <h3 class="kpi-value" id="kpi-total-supplies">0</h3>
            <span class="text-xs text-secondary">Artículos en catálogo</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Valor en Insumos</span>
              <div class="kpi-icon kpi-icon-success">💰</div>
            </div>
            <h3 class="kpi-value text-success" id="kpi-total-cost">$0.00</h3>
            <span class="text-xs text-secondary">Valor del stock</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Stock Crítico (Agotados)</span>
              <div class="kpi-icon kpi-icon-danger">⚠️</div>
            </div>
            <h3 class="kpi-value text-danger" id="kpi-critical-supplies">0</h3>
            <span class="text-xs text-secondary">Requieren compra urgente</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Stock Mínimo (Bajo)</span>
              <div class="kpi-icon kpi-icon-warning">📉</div>
            </div>
            <h3 class="kpi-value text-warning" id="kpi-low-supplies">0</h3>
            <span class="text-xs text-secondary">Por debajo del límite establecido</span>
          </div>
        </div>

        <!-- Filter and Search Toolbar -->
        <div class="card p-4 mb-4">
          <div class="inv-toolbar">
            <div class="inv-search">
              <span class="inv-search-icon">🔍</span>
              <input type="text" id="inp-search-supply" class="input input-md" placeholder="Buscar por nombre, código, categoría..." />
            </div>

            <select id="sel-filter-category" class="inv-filter-select">
              <option value="">Todas las categorías</option>
            </select>

            <select id="sel-filter-status" class="inv-filter-select">
              <option value="">Todos los estados</option>
              <option value="OK">Stock Correcto</option>
              <option value="LOW">Stock Bajo</option>
              <option value="OUT">Agotados</option>
            </select>
          </div>
        </div>

        <!-- Main Data Table Container -->
        <div class="card p-5">
          <div id="supplies-table-wrapper"></div>
        </div>
      `
    });

    this.listeners = [];
    this.modalInstance = null;
    this.modalBarcodeInput = null;
  }

  mount() {
    const element = this.layout.mount();

    // Inject table
    const tableWrapper = element.querySelector('#supplies-table-wrapper');
    if (tableWrapper) {
      tableWrapper.appendChild(this.table.mount());
    }

    this.afterMount(element);
    this.subscribeToSupplies(element);

    return element;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    // Search and filters
    const inpSearch = root.querySelector('#inp-search-supply');
    if (inpSearch) {
      inpSearch.addEventListener('input', (e) => {
        this.state.searchQuery = e.target.value.toLowerCase();
        this.applyFilters();
      });
    }

    const selCategory = root.querySelector('#sel-filter-category');
    if (selCategory) {
      selCategory.addEventListener('change', (e) => {
        this.state.selectedCategory = e.target.value;
        this.applyFilters();
      });
    }

    const selStatus = root.querySelector('#sel-filter-status');
    if (selStatus) {
      selStatus.addEventListener('change', (e) => {
        this.state.selectedStatus = e.target.value;
        this.applyFilters();
      });
    }

    // Add Supply click
    const addBtn = root.querySelector('#btn-add-supply');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openSupplyModal());
    }

    // Edit/Delete click delegation
    const tableWrapper = root.querySelector('#supplies-table-wrapper');
    if (tableWrapper) {
      tableWrapper.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.btn-edit-supply');
        if (editBtn) {
          const supplyId = editBtn.getAttribute('data-id');
          const supply = this.state.supplies.find(s => s.id === supplyId);
          if (supply) this.openSupplyModal(supply);
        }

        const deleteBtn = e.target.closest('.btn-delete-supply');
        if (deleteBtn) {
          const supplyId = deleteBtn.getAttribute('data-id');
          if (confirm('¿Estás seguro de que deseas eliminar este insumo del catálogo?')) {
            try {
              await FirestoreService.delete('insumos', supplyId);
              NotificationService.success('Insumo eliminado.');
            } catch (err) {
              console.error('[SuppliesView] Error deleting:', err);
              NotificationService.error('Error al eliminar el insumo.');
            }
          }
        }
      });
    }
  }

  subscribeToSupplies(element) {
    try {
      const listener = FirestoreService.listenToTenant('insumos', (supplies) => {
        this.state.supplies = supplies || [];
        
        // Extract unique categories
        const uniqueCategories = [...new Set(this.state.supplies.map(s => s.category).filter(Boolean))];
        this.state.categories = uniqueCategories;
        this.updateCategoryDropdown(element);

        this.recalculateKPIs(element);
        this.applyFilters();
      });
      this.listeners.push(listener);
    } catch (e) {
      console.warn('[SuppliesView] Error establishing real-time subscription:', e.message);
    }
  }

  updateCategoryDropdown(element) {
    const root = element || this.layout.element;
    const dropdown = root?.querySelector('#sel-filter-category');
    if (dropdown) {
      const selected = this.state.selectedCategory;
      dropdown.innerHTML = `<option value="">Todas las categorías</option>` +
        this.state.categories.map(cat => `<option value="${cat}" ${cat === selected ? 'selected' : ''}>${cat}</option>`).join('');
    }
  }

  recalculateKPIs(element) {
    const root = element || this.layout.element;
    if (!root) return;

    const supplies = this.state.supplies;

    const total = supplies.length;
    const costValue = supplies.reduce((sum, s) => sum + (Number(s.stock || 0) * Number(s.cost || 0)), 0);
    const critical = supplies.filter(s => Number(s.stock || 0) === 0).length;
    const low = supplies.filter(s => {
      const stock = Number(s.stock || 0);
      const min = Number(s.minStock || 0);
      return stock > 0 && stock <= min;
    }).length;

    const totalEl = root.querySelector('#kpi-total-supplies');
    if (totalEl) totalEl.textContent = total;

    const costEl = root.querySelector('#kpi-total-cost');
    if (costEl) {
      costEl.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(costValue);
    }

    const criticalEl = root.querySelector('#kpi-critical-supplies');
    if (criticalEl) criticalEl.textContent = critical;

    const lowEl = root.querySelector('#kpi-low-supplies');
    if (lowEl) lowEl.textContent = low;
  }

  applyFilters() {
    const { searchQuery, selectedCategory, selectedStatus, supplies } = this.state;

    let filtered = supplies.filter(s => {
      const matchesSearch = !searchQuery || 
        (s.name || '').toLowerCase().includes(searchQuery) ||
        (s.category || '').toLowerCase().includes(searchQuery) ||
        (s.code || '').toLowerCase().includes(searchQuery);

      const matchesCategory = !selectedCategory || s.category === selectedCategory;

      let matchesStatus = true;
      if (selectedStatus === 'OK') {
        matchesStatus = Number(s.stock || 0) > Number(s.minStock || 0);
      } else if (selectedStatus === 'LOW') {
        const stock = Number(s.stock || 0);
        const min = Number(s.minStock || 0);
        matchesStatus = stock > 0 && stock <= min;
      } else if (selectedStatus === 'OUT') {
        matchesStatus = Number(s.stock || 0) === 0;
      }

      return matchesSearch && matchesCategory && matchesStatus;
    });

    const tableWrapper = this.layout.$('#supplies-table-wrapper');
    if (tableWrapper) {
      tableWrapper.innerHTML = '';
      this.table.props.data = filtered;
      tableWrapper.appendChild(this.table.mount());
    }
  }

  openSupplyModal(supply = null) {
    const isEdit = !!supply;

    const formHTML = `
      <form id="supply-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary);">
        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="sup-name">Nombre del Insumo</label>
            <input type="text" id="sup-name" class="input input-md" placeholder="Ej. Papel Bond A4" value="${isEdit ? supply.name : ''}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="sup-unit">Unidad de Medida</label>
            <select id="sup-unit" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="uds" ${isEdit && supply.unit === 'uds' ? 'selected' : ''}>Unidades (uds)</option>
              <option value="kg" ${isEdit && supply.unit === 'kg' ? 'selected' : ''}>Kilogramos (kg)</option>
              <option value="L" ${isEdit && supply.unit === 'L' ? 'selected' : ''}>Litros (L)</option>
              <option value="paq" ${isEdit && supply.unit === 'paq' ? 'selected' : ''}>Paquetes (paq)</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Asociar Código de Barras / QR para Insumo</label>
          <div id="sup-barcode-container"></div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="sup-stock">Cantidad en Stock</label>
            <input type="number" id="sup-stock" class="input input-md" placeholder="0" min="0" step="any" value="${isEdit ? supply.stock : '0'}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="sup-min-stock">Stock Mínimo (Alerta)</label>
            <input type="number" id="sup-min-stock" class="input input-md" placeholder="5" min="0" step="any" value="${isEdit ? (supply.minStock || '5') : '5'}" required />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="sup-category">Categoría</label>
            <input type="text" id="sup-category" class="input input-md" placeholder="Ej. Papelería, Limpieza" value="${isEdit ? (supply.category || '') : ''}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="sup-cost">Costo de Adquisición Unitario</label>
            <input type="number" id="sup-cost" class="input input-md" placeholder="0.00" min="0" step="0.01" value="${isEdit ? supply.cost : ''}" />
          </div>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-submit-btn">${isEdit ? 'Guardar Cambios' : 'Registrar Insumo'}</button>
    `;

    this.modalInstance = new Modal({
      title: isEdit ? 'Editar Insumo' : 'Registrar Nuevo Insumo / Material',
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'md',
      onClose: () => {
        if (this.modalBarcodeInput) {
          this.modalBarcodeInput.unmount();
          this.modalBarcodeInput = null;
        }
      }
    });

    document.body.appendChild(this.modalInstance.mount());

    // Mount barcode scanner input
    const barcodeContainer = this.modalInstance.$('#sup-barcode-container');
    if (barcodeContainer) {
      this.modalBarcodeInput = new BarcodeInput({
        id: 'sup-code',
        compact: true,
        placeholder: 'Escanea el código del insumo...',
        value: isEdit ? (supply.code || '') : '',
        onScan: (code) => {
          this.modalBarcodeInput.setValue(code);
        }
      });
      barcodeContainer.appendChild(this.modalBarcodeInput.mount());
    }

    const cancelBtn = this.modalInstance.$('#modal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.modalInstance.close());
    }

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitSupply(supply));
    }
  }

  async submitSupply(supply = null) {
    const form = this.modalInstance.$('#supply-form');
    if (!form || !form.reportValidity()) return;

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }

    const name = this.modalInstance.$('#sup-name').value.trim();
    const unit = this.modalInstance.$('#sup-unit').value;
    const stock = Number(this.modalInstance.$('#sup-stock').value || 0);
    const minStock = Number(this.modalInstance.$('#sup-min-stock').value || 0);
    const category = this.modalInstance.$('#sup-category').value.trim();
    const cost = Number(this.modalInstance.$('#sup-cost').value || 0);
    const code = this.modalBarcodeInput ? this.modalBarcodeInput.getValue() : '';

    const payload = {
      name,
      unit,
      stock,
      minStock,
      category: category || 'Otros',
      cost,
      code,
      updatedAt: Date.now(),
      updatedAtLocal: TimeService.timestamp()
    };

    // Register barcode in the central registry
    if (code) {
      try {
        await BarcodeRegistryService.registerCode(code, {
          productName: name,
          associatedWith: 'insumo'
        });
      } catch (err) {
        console.warn('[SuppliesView] Registry error:', err.message);
      }
    }

    try {
      if (supply) {
        await FirestoreService.update('insumos', supply.id, payload);
        NotificationService.success('Insumo actualizado correctamente.');
        if (code) {
          await BarcodeRegistryService.associateCode(code, supply.id, 'insumo', name).catch(() => {});
        }
      } else {
        payload.createdAt = Date.now();
        payload.createdAtLocal = TimeService.timestamp();
        const newId = await FirestoreService.create('insumos', payload);
        NotificationService.success('Insumo registrado correctamente.');
        if (code && newId) {
          await BarcodeRegistryService.associateCode(code, newId, 'insumo', name).catch(() => {});
        }
      }
      this.modalInstance.close();
    } catch (err) {
      console.error('[SuppliesView] Error saving supply:', err);
      alert(`Error al guardar: ${err.message}`);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = supply ? 'Guardar Cambios' : 'Registrar Insumo';
      }
    }
  }

  unmount() {
    if (this.modalBarcodeInput) {
      this.modalBarcodeInput.unmount();
      this.modalBarcodeInput = null;
    }
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.table.unmount();
    this.layout.unmount();
    super.unmount();
  }
}
