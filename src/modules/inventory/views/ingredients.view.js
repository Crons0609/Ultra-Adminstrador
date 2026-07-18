import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';

export class IngredientsView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || '';

    this.state = {
      ingredients: [],
      suppliers: [],
      searchQuery: '',
      selectedCategory: ''
    };

    // Initialize DataTable
    this.table = new DataTable({
      columns: [
        { 
          key: 'name', 
          label: 'Insumo / Materia Prima',
          render: (val, row) => `
            <div style="display: flex; flex-direction: column;">
              <span class="font-semibold text-primary">${val}</span>
              <span class="text-xs text-secondary" style="font-size: 0.7rem; margin-top: 2px;">🏷️ ${row.category || 'Otros'}</span>
            </div>
          `
        },
        { 
          key: 'stock', 
          label: 'Stock Actual',
          render: (val, row) => `
            <span class="font-medium ${Number(val) === 0 ? 'text-danger font-bold' : (Number(val) <= Number(row.minStock || 0) ? 'text-warning font-semibold' : 'text-success')}">
              ${val} ${row.unit || 'kg'}
            </span>
          `
        },
        { 
          key: 'minStock', 
          label: 'Stock Mínimo',
          render: (val, row) => `<span class="text-secondary">${val} ${row.unit || 'kg'}</span>`
        },
        { key: 'supplierName', label: 'Proveedor' },
        { 
          key: 'expiryDate', 
          label: 'Vencimiento',
          render: (val) => {
            if (!val) return '<span class="text-secondary">—</span>';
            const expDate = new Date(val);
            const today = new Date();
            const daysLeft = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
            
            if (daysLeft < 0) {
              return `<span class="badge" style="background-color: var(--color-danger-light); color: var(--color-danger); font-size: 0.7rem; padding: 2px 6px;">Vencido</span>`;
            } else if (daysLeft <= 7) {
              return `<span class="badge" style="background-color: var(--color-warning-light); color: var(--color-warning); font-size: 0.7rem; padding: 2px 6px;">Próximo (${daysLeft}d)</span>`;
            }
            return `<span class="text-secondary" style="font-size: 0.8rem;">${expDate.toLocaleDateString()}</span>`;
          }
        },
        {
          key: 'id',
          label: 'Acciones',
          render: (val) => `
            <div class="d-flex gap-2">
              <button class="btn btn-secondary btn-sm py-1 px-2 btn-edit-ingredient" data-id="${val}" style="font-size: 0.7rem;">✏️</button>
              <button class="btn btn-danger btn-sm py-1 px-2 btn-delete-ingredient" data-id="${val}" style="font-size: 0.7rem;">🗑️</button>
            </div>
          `
        }
      ],
      data: []
    });

    this.layout = new PageLayout({
      title: 'Materia Prima e Insumos',
      subtitle: 'Monitorea ingredientes, insumos base de producción, unidades de medida y vencimientos.',
      actionHTML: `
        <button class="btn btn-primary btn-sm" id="btn-add-ingredient">
          + Registrar Insumo
        </button>
      `,
      contentHTML: `
        <!-- KPI Cards Row -->
        <div class="grid-stats animate-fade-in">
          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Insumos Registrados</span>
              <div class="kpi-icon kpi-icon-accent">🌱</div>
            </div>
            <h3 class="kpi-value" id="kpi-total-ings">0</h3>
            <span class="text-xs text-secondary">Materias primas activas</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Stock Crítico (Bajos/Agotados)</span>
              <div class="kpi-icon kpi-icon-danger">⚠️</div>
            </div>
            <h3 class="kpi-value text-danger" id="kpi-critical-ings">0</h3>
            <span class="text-xs text-secondary">Requieren orden de reabastecimiento</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Próximos a Vencer</span>
              <div class="kpi-icon kpi-icon-warning">⏰</div>
            </div>
            <h3 class="kpi-value text-warning" id="kpi-expiring-ings">0</h3>
            <span class="text-xs text-secondary">Vencen en los próximos 7 días</span>
          </div>
        </div>

        <!-- Filter and Search Toolbar -->
        <div class="card p-4 mb-4">
          <div class="inv-toolbar">
            <div class="inv-search">
              <span class="inv-search-icon">🔍</span>
              <input type="text" id="inp-search-ing" class="input input-md" placeholder="Buscar insumos..." />
            </div>

            <select id="sel-filter-ing-cat" class="inv-filter-select">
              <option value="">Todas las categorías</option>
            </select>
          </div>
        </div>

        <!-- Main Data Table Container -->
        <div class="card p-5">
          <div id="ingredients-table-wrapper"></div>
        </div>
      `
    });

    this.listeners = [];
    this.modalInstance = null;
  }

  mount() {
    const element = this.layout.mount();

    // Inject table
    const tableWrapper = element.querySelector('#ingredients-table-wrapper');
    if (tableWrapper) {
      tableWrapper.appendChild(this.table.mount());
    }

    this.afterMount(element);
    this.subscribeToData(element);

    return element;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    // Search and category input filter triggers
    const inpSearch = root.querySelector('#inp-search-ing');
    if (inpSearch) {
      inpSearch.addEventListener('input', (e) => {
        this.state.searchQuery = e.target.value.toLowerCase();
        this.applyFilters();
      });
    }

    const selCategory = root.querySelector('#sel-filter-ing-cat');
    if (selCategory) {
      selCategory.addEventListener('change', (e) => {
        this.state.selectedCategory = e.target.value;
        this.applyFilters();
      });
    }

    // Add Insumo button
    const addBtn = root.querySelector('#btn-add-ingredient');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openIngredientModal());
    }

    // Edit/Delete buttons click delegation
    const tableWrapper = root.querySelector('#ingredients-table-wrapper');
    if (tableWrapper) {
      tableWrapper.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.btn-edit-ingredient');
        if (editBtn) {
          const ingId = editBtn.getAttribute('data-id');
          const ing = this.state.ingredients.find(i => i.id === ingId);
          if (ing) this.openIngredientModal(ing);
        }

        const deleteBtn = e.target.closest('.btn-delete-ingredient');
        if (deleteBtn) {
          const ingId = deleteBtn.getAttribute('data-id');
          if (confirm('¿Estás seguro de que deseas eliminar este insumo?')) {
            try {
              await FirestoreService.delete('insumos', ingId);
              NotificationService.success('Insumo eliminado del catálogo.');
            } catch (err) {
              console.error('[IngredientsView] Error deleting:', err);
              NotificationService.error('Error al eliminar el insumo.');
            }
          }
        }
      });
    }
  }

  subscribeToData(element) {
    try {
      // 1. Listen to Insumos
      const insumosListener = FirestoreService.listenToTenant('insumos', (ingredients) => {
        this.state.ingredients = ingredients || [];
        
        // Extract unique categories
        const uniqueCategories = [...new Set(this.state.ingredients.map(i => i.category).filter(Boolean))];
        this.updateCategoryFilterDropdown(element, uniqueCategories);

        this.recalculateKPIs(element);
        this.applyFilters();
      });
      this.listeners.push(insumosListener);

      // 2. Listen to active suppliers
      const suppliersListener = FirestoreService.listenToTenant('proveedores', (suppliers) => {
        this.state.suppliers = (suppliers || []).filter(s => s.status !== 'INACTIVO');
      });
      this.listeners.push(suppliersListener);
    } catch (e) {
      console.warn('[IngredientsView] Error setting up RTDB listeners:', e.message);
    }
  }

  updateCategoryFilterDropdown(element, categories) {
    const dropdown = element.querySelector('#sel-filter-ing-cat');
    if (dropdown) {
      const selected = this.state.selectedCategory;
      dropdown.innerHTML = `<option value="">Todas las categorías</option>` +
        categories.map(cat => `<option value="${cat}" ${cat === selected ? 'selected' : ''}>${cat}</option>`).join('');
    }
  }

  recalculateKPIs(element) {
    const ingredients = this.state.ingredients;
    const today = new Date();

    const totalIngs = ingredients.length;
    const criticalIngs = ingredients.filter(i => Number(i.stock || 0) <= Number(i.minStock || 0)).length;

    const expiringIngs = ingredients.filter(i => {
      if (!i.expiryDate) return false;
      const daysLeft = Math.ceil((new Date(i.expiryDate) - today) / (1000 * 60 * 60 * 24));
      return daysLeft >= 0 && daysLeft <= 7;
    }).length;

    const totalEl = element.querySelector('#kpi-total-ings');
    if (totalEl) totalEl.textContent = totalIngs;

    const criticalEl = element.querySelector('#kpi-critical-ings');
    if (criticalEl) criticalEl.textContent = criticalIngs;

    const expiringEl = element.querySelector('#kpi-expiring-ings');
    if (expiringEl) expiringEl.textContent = expiringIngs;
  }

  applyFilters() {
    const { searchQuery, selectedCategory, ingredients } = this.state;

    const filtered = ingredients.filter(i => {
      const matchesSearch = !searchQuery || (i.name || '').toLowerCase().includes(searchQuery);
      const matchesCategory = !selectedCategory || i.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });

    const tableWrapper = this.layout.$('#ingredients-table-wrapper');
    if (tableWrapper) {
      tableWrapper.innerHTML = '';
      this.table.props.data = filtered;
      tableWrapper.appendChild(this.table.mount());
    }
  }

  openIngredientModal(ing = null) {
    const isEdit = !!ing;

    const supplierOptionsHTML = this.state.suppliers.map(s => `<option value="${s.name}" ${isEdit && ing.supplierName === s.name ? 'selected' : ''}>${s.name}</option>`).join('');

    const formHTML = `
      <form id="ingredient-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary);">
        <div class="form-group">
          <label class="form-label" for="ing-name">Nombre del Insumo</label>
          <input type="text" id="ing-name" class="input input-md" placeholder="Ej. Harina de Trigo, Queso Mozzarella" value="${isEdit ? ing.name : ''}" required />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="ing-category">Categoría</label>
            <input type="text" id="ing-category" class="input input-md" placeholder="Ej. Lácteos, Carnes, Verduras" value="${isEdit ? (ing.category || '') : ''}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="ing-unit">Unidad de Medida</label>
            <select id="ing-unit" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="kg" ${isEdit && ing.unit === 'kg' ? 'selected' : ''}>Kilogramos (kg)</option>
              <option value="L" ${isEdit && ing.unit === 'L' ? 'selected' : ''}>Litros (L)</option>
              <option value="uds" ${isEdit && ing.unit === 'uds' ? 'selected' : ''}>Unidades (uds)</option>
              <option value="g" ${isEdit && ing.unit === 'g' ? 'selected' : ''}>Gramos (g)</option>
              <option value="paq" ${isEdit && ing.unit === 'paq' ? 'selected' : ''}>Paquete (paq)</option>
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="ing-stock">Stock Actual</label>
            <input type="number" id="ing-stock" class="input input-md" min="0" step="any" placeholder="0" value="${isEdit ? ing.stock : '0'}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="ing-min-stock">Stock Mínimo (Alerta)</label>
            <input type="number" id="ing-min-stock" class="input input-md" min="0" step="any" placeholder="5" value="${isEdit ? (ing.minStock || '5') : '5'}" required />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="ing-supplier">Proveedor Principal</label>
            <select id="ing-supplier" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="">Ninguno...</option>
              ${supplierOptionsHTML}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="ing-expiry">Fecha de Vencimiento (Opcional)</label>
            <input type="date" id="ing-expiry" class="input input-md" value="${isEdit && ing.expiryDate ? ing.expiryDate : ''}" />
          </div>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-submit-btn">${isEdit ? 'Guardar Cambios' : 'Registrar Insumo'}</button>
    `;

    this.modalInstance = new Modal({
      title: isEdit ? 'Editar Insumo de Producción' : 'Registrar Nuevo Insumo',
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'md'
    });

    document.body.appendChild(this.modalInstance.mount());

    const cancelBtn = this.modalInstance.$('#modal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.modalInstance.close());
    }

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitIngredient(ing));
    }
  }

  async submitIngredient(ing = null) {
    const form = this.modalInstance.$('#ingredient-form');
    if (!form || !form.reportValidity()) return;

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }

    const name = this.modalInstance.$('#ing-name').value.trim();
    const category = this.modalInstance.$('#ing-category').value.trim() || 'Otros';
    const unit = this.modalInstance.$('#ing-unit').value;
    const stock = Number(this.modalInstance.$('#ing-stock').value);
    const minStock = Number(this.modalInstance.$('#ing-min-stock').value);
    const supplierName = this.modalInstance.$('#ing-supplier').value || 'Varios';
    const expiryDate = this.modalInstance.$('#ing-expiry').value || '';

    const payload = {
      name,
      category,
      unit,
      stock,
      minStock,
      supplierName,
      expiryDate,
      updatedAt: Date.now()
    };

    try {
      if (ing) {
        await FirestoreService.update('insumos', ing.id, payload);
        NotificationService.success('Insumo actualizado correctamente.');
      } else {
        payload.createdAt = Date.now();
        await FirestoreService.create('insumos', payload);
        NotificationService.success('Insumo registrado correctamente.');
      }
      this.modalInstance.close();
    } catch (err) {
      console.error('[IngredientsView] Error saving ingredient:', err);
      alert(`Error al registrar el insumo: ${err.message}`);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = ing ? 'Guardar Cambios' : 'Registrar Insumo';
      }
    }
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.table.unmount();
    this.layout.unmount();
    super.unmount();
  }
}