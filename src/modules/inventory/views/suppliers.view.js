import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';

export class SuppliersView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || '';

    this.state = {
      suppliers: [],
      searchQuery: ''
    };

    // Initialize DataTable
    this.table = new DataTable({
      columns: [
        { 
          key: 'name', 
          label: 'Proveedor',
          render: (val, row) => `
            <div style="display: flex; flex-direction: column;">
              <span class="font-semibold text-primary">${val}</span>
              <span class="text-xs text-secondary" style="font-size: 0.7rem; margin-top: 2px;">📍 ${row.address || 'Sin dirección'}</span>
            </div>
          `
        },
        { key: 'contact', label: 'Contacto' },
        { key: 'phone', label: 'Teléfono' },
        { key: 'email', label: 'Correo Electrónico' },
        { 
          key: 'categories', 
          label: 'Insumos / Categorías',
          render: (val) => val ? val.split(',').map(c => `<span class="badge" style="background-color: var(--color-bg-tertiary); color: var(--color-text-primary); border: 1px solid var(--color-border); padding: 2px 6px; border-radius: var(--radius-md); font-size: 0.7rem; margin-right: 4px;">${c.trim()}</span>`).join('') : 'Varios'
        },
        { 
          key: 'status', 
          label: 'Estado',
          render: (val) => {
            const isActive = val !== 'INACTIVO';
            return `<span class="badge" style="display:inline-flex;padding:2px 8px;font-size:0.75rem;font-weight:500;border-radius:var(--radius-full);background-color:var(--color-${isActive ? 'success' : 'secondary'}-light);color:var(--color-${isActive ? 'success' : 'secondary'});">${isActive ? 'Activo' : 'Inactivo'}</span>`;
          }
        },
        {
          key: 'id',
          label: 'Acciones',
          render: (val) => `
            <div class="d-flex gap-2">
              <button class="btn btn-secondary btn-sm py-1 px-2 btn-edit-supplier" data-id="${val}" style="font-size: 0.7rem;">✏️ Editar</button>
              <button class="btn btn-danger btn-sm py-1 px-2 btn-delete-supplier" data-id="${val}" style="font-size: 0.7rem;">🗑️</button>
            </div>
          `
        }
      ],
      data: []
    });

    this.layout = new PageLayout({
      title: 'Directorio de Proveedores',
      subtitle: 'Administra tus contactos comerciales, categorías de insumos contratados y pedidos mayoristas.',
      actionHTML: `
        <button class="btn btn-primary btn-sm" id="btn-add-supplier">
          + Registrar Proveedor
        </button>
      `,
      contentHTML: `
        <!-- KPI Cards Row -->
        <div class="grid-stats animate-fade-in">
          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Proveedores Totales</span>
              <div class="kpi-icon kpi-icon-accent">👥</div>
            </div>
            <h3 class="kpi-value" id="kpi-total-suppliers">0</h3>
            <span class="text-xs text-secondary">Contactos en el directorio</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Proveedores Activos</span>
              <div class="kpi-icon kpi-icon-success">✔️</div>
            </div>
            <h3 class="kpi-value text-success" id="kpi-active-suppliers">0</h3>
            <span class="text-xs text-secondary">Cuentas con compras vigentes</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Categorías Surtidas</span>
              <div class="kpi-icon kpi-icon-warning">🏷️</div>
            </div>
            <h3 class="kpi-value text-warning" id="kpi-total-categories">0</h3>
            <span class="text-xs text-secondary">Líneas de insumos diferentes</span>
          </div>
        </div>

        <!-- Filter and Search Toolbar -->
        <div class="card p-4 mb-4">
          <div class="inv-toolbar">
            <div class="inv-search" style="flex-grow: 1;">
              <span class="inv-search-icon">🔍</span>
              <input type="text" id="inp-search-supplier" class="input input-md" placeholder="Buscar por nombre, contacto o correo..." />
            </div>
          </div>
        </div>

        <!-- Main Data Table Container -->
        <div class="card p-5">
          <div id="suppliers-table-wrapper"></div>
        </div>
      `
    });

    this.listeners = [];
    this.modalInstance = null;
  }

  mount() {
    const element = this.layout.mount();

    // Inject table
    const tableWrapper = element.querySelector('#suppliers-table-wrapper');
    if (tableWrapper) {
      tableWrapper.appendChild(this.table.mount());
    }

    this.afterMount(element);
    this.subscribeToSuppliers(element);

    return element;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    // Search input
    const inpSearch = root.querySelector('#inp-search-supplier');
    if (inpSearch) {
      inpSearch.addEventListener('input', (e) => {
        this.state.searchQuery = e.target.value.toLowerCase();
        this.applyFilters();
      });
    }

    // Add Supplier click
    const addBtn = root.querySelector('#btn-add-supplier');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openSupplierModal());
    }

    // Edit/Delete click delegation
    const tableWrapper = root.querySelector('#suppliers-table-wrapper');
    if (tableWrapper) {
      tableWrapper.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.btn-edit-supplier');
        if (editBtn) {
          const supplierId = editBtn.getAttribute('data-id');
          const supplier = this.state.suppliers.find(s => s.id === supplierId);
          if (supplier) this.openSupplierModal(supplier);
        }

        const deleteBtn = e.target.closest('.btn-delete-supplier');
        if (deleteBtn) {
          const supplierId = deleteBtn.getAttribute('data-id');
          if (confirm('¿Estás seguro de que deseas eliminar este proveedor del directorio?')) {
            try {
              await FirestoreService.delete('proveedores', supplierId);
              NotificationService.success('Proveedor eliminado correctamente.');
            } catch (err) {
              console.error('[SuppliersView] Error deleting:', err);
              NotificationService.error('Error al eliminar el proveedor.');
            }
          }
        }
      });
    }
  }

  subscribeToSuppliers(element) {
    try {
      const suppliersListener = FirestoreService.listenToTenant('proveedores', (suppliers) => {
        this.state.suppliers = suppliers || [];
        this.recalculateKPIs(element);
        this.applyFilters();
      });
      this.listeners.push(suppliersListener);
    } catch (e) {
      console.warn('[SuppliersView] Error setting up RTDB listener:', e.message);
    }
  }

  recalculateKPIs(element) {
    const suppliers = this.state.suppliers;

    const totalSuppliers = suppliers.length;
    const activeSuppliers = suppliers.filter(s => s.status !== 'INACTIVO').length;

    // Collect all unique categories
    const allCategories = new Set();
    suppliers.forEach(s => {
      if (s.categories) {
        s.categories.split(',').forEach(c => allCategories.add(c.trim().toLowerCase()));
      }
    });

    const totalEl = element.querySelector('#kpi-total-suppliers');
    if (totalEl) totalEl.textContent = totalSuppliers;

    const activeEl = element.querySelector('#kpi-active-suppliers');
    if (activeEl) activeEl.textContent = activeSuppliers;

    const categoriesEl = element.querySelector('#kpi-total-categories');
    if (categoriesEl) categoriesEl.textContent = allCategories.size || 0;
  }

  applyFilters() {
    const { searchQuery, suppliers } = this.state;

    const filtered = suppliers.filter(s => {
      return !searchQuery || 
        (s.name || '').toLowerCase().includes(searchQuery) ||
        (s.contact || '').toLowerCase().includes(searchQuery) ||
        (s.email || '').toLowerCase().includes(searchQuery) ||
        (s.phone || '').toLowerCase().includes(searchQuery);
    });

    const tableWrapper = this.layout.$('#suppliers-table-wrapper');
    if (tableWrapper) {
      tableWrapper.innerHTML = '';
      this.table.props.data = filtered;
      tableWrapper.appendChild(this.table.mount());
    }
  }

  openSupplierModal(supplier = null) {
    const isEdit = !!supplier;

    const formHTML = `
      <form id="supplier-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary);">
        <div class="form-group">
          <label class="form-label" for="sup-name">Nombre de la Empresa / Comercial</label>
          <input type="text" id="sup-name" class="input input-md" placeholder="Ej. Distribuidora de Alimentos S.A." value="${isEdit ? supplier.name : ''}" required />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="sup-contact">Nombre de Contacto</label>
            <input type="text" id="sup-contact" class="input input-md" placeholder="Ej. Juan Pérez" value="${isEdit ? supplier.contact : ''}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="sup-phone">Teléfono de Contacto</label>
            <input type="tel" id="sup-phone" class="input input-md" placeholder="Ej. 555-123-4567" value="${isEdit ? (supplier.phone || '') : ''}" required />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="sup-email">Correo Electrónico</label>
            <input type="email" id="sup-email" class="input input-md" placeholder="Ej. ventas@distribuidora.com" value="${isEdit ? (supplier.email || '') : ''}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="sup-status">Estado</label>
            <select id="sup-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="ACTIVO" ${isEdit && supplier.status === 'ACTIVO' ? 'selected' : ''}>Activo (Disponible)</option>
              <option value="INACTIVO" ${isEdit && supplier.status === 'INACTIVO' ? 'selected' : ''}>Inactivo (Deshabilitado)</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="sup-categories">Líneas de Producto / Categorías (Separadas por comas)</label>
          <input type="text" id="sup-categories" class="input input-md" placeholder="Ej. Abarrotes, Verduras, Carnes, Bebidas" value="${isEdit ? (supplier.categories || '') : ''}" required />
        </div>

        <div class="form-group">
          <label class="form-label" for="sup-address">Dirección Física / Despacho</label>
          <input type="text" id="sup-address" class="input input-md" placeholder="Ej. Av. Central #123, Col. Centro" value="${isEdit ? (supplier.address || '') : ''}" />
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-submit-btn">${isEdit ? 'Guardar Cambios' : 'Registrar Proveedor'}</button>
    `;

    this.modalInstance = new Modal({
      title: isEdit ? 'Editar Registro de Proveedor' : 'Registrar Nuevo Proveedor',
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
      submitBtn.addEventListener('click', () => this.submitSupplier(supplier));
    }
  }

  async submitSupplier(supplier = null) {
    const form = this.modalInstance.$('#supplier-form');
    if (!form || !form.reportValidity()) return;

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }

    const name = this.modalInstance.$('#sup-name').value.trim();
    const contact = this.modalInstance.$('#sup-contact').value.trim();
    const phone = this.modalInstance.$('#sup-phone').value.trim();
    const email = this.modalInstance.$('#sup-email').value.trim();
    const categories = this.modalInstance.$('#sup-categories').value.trim();
    const address = this.modalInstance.$('#sup-address').value.trim();
    const status = this.modalInstance.$('#sup-status').value;

    const payload = {
      name,
      contact,
      phone,
      email,
      categories,
      address,
      status,
      updatedAt: Date.now()
    };

    try {
      if (supplier) {
        await FirestoreService.update('proveedores', supplier.id, payload);
        NotificationService.success('Proveedor actualizado correctamente.');
      } else {
        payload.createdAt = Date.now();
        await FirestoreService.create('proveedores', payload);
        NotificationService.success('Proveedor registrado correctamente.');
      }
      this.modalInstance.close();
    } catch (err) {
      console.error('[SuppliersView] Error saving supplier:', err);
      alert(`Error al registrar el proveedor: ${err.message}`);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = supplier ? 'Guardar Cambios' : 'Registrar Proveedor';
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