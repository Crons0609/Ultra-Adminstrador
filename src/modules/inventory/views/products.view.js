import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';

export class ProductsView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || '';

    this.state = {
      products: [],
      categories: [],
      searchQuery: '',
      selectedCategory: '',
      selectedStatus: ''
    };

    // Initialize DataTable
    this.table = new DataTable({
      columns: [
        { 
          key: 'name', 
          label: 'Producto',
          render: (val, row) => `
            <div style="display: flex; align-items: center; gap: 10px;">
              ${row.image 
                ? `<img src="${row.image}" alt="" style="width:40px;height:40px;border-radius:6px;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none'" />` 
                : `<div style="width:40px;height:40px;border-radius:6px;background:var(--color-bg-tertiary);display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">📦</div>`
              }
              <div style="display: flex; flex-direction: column;">
                <span class="font-semibold text-primary">${val}</span>
                <span class="text-xs text-secondary" style="font-size: 0.7rem; margin-top: 2px;">📦 ${row.category || 'Sin categoría'}</span>
              </div>
            </div>
          `
        },
        { key: 'sku', label: 'SKU / Código' },
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
          key: 'purchasePrice', 
          label: 'P. Compra',
          render: (val) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val || 0)
        },
        { 
          key: 'price', 
          label: 'P. Venta',
          render: (val) => `<strong class="text-primary">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val || 0)}</strong>`
        },
        { 
          key: 'margin', 
          label: 'Margen',
          render: (_, row) => {
            const purchase = Number(row.purchasePrice || 0);
            const sale = Number(row.price || 0);
            if (sale === 0) return '0%';
            const pct = Math.round(((sale - purchase) / sale) * 100);
            return `<span class="${pct > 30 ? 'text-success' : 'text-warning'} font-medium">${pct}%</span>`;
          }
        },
        { 
          key: 'status', 
          label: 'Estado',
          render: (_, row) => {
            const stock = Number(row.stock || 0);
            const min = Number(row.minStock || 0);
            if (stock === 0) {
              return `<span class="stock-badge stock-out">Agotado</span>`;
            } else if (stock <= min) {
              return `<span class="stock-badge stock-low">Bajo Stock</span>`;
            } else {
              return `<span class="stock-badge stock-ok">Disponible</span>`;
            }
          }
        },
        {
          key: 'id',
          label: 'Acciones',
          render: (val) => `
            <div class="d-flex gap-2">
              <button class="btn btn-secondary btn-sm py-1 px-2 btn-edit-product" data-id="${val}" style="font-size: 0.7rem;">✏️</button>
              <button class="btn btn-danger btn-sm py-1 px-2 btn-delete-product" data-id="${val}" style="font-size: 0.7rem;">🗑️</button>
            </div>
          `
        }
      ],
      data: []
    });

    this.layout = new PageLayout({
      title: 'Inventario de Productos',
      subtitle: 'Administra el catálogo de artículos, niveles de stock, precios y márgenes de ganancia.',
      actionHTML: `
        <button class="btn btn-primary btn-sm" id="btn-add-product">
          + Agregar Producto
        </button>
      `,
      contentHTML: `
        <!-- KPI Cards Row -->
        <div class="grid-stats animate-fade-in" id="products-kpis">
          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Artículos Registrados</span>
              <div class="kpi-icon kpi-icon-accent">📦</div>
            </div>
            <h3 class="kpi-value" id="kpi-total-items">0</h3>
            <span class="text-xs text-secondary">Productos únicos activos</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Valor del Inventario</span>
              <div class="kpi-icon kpi-icon-success">💰</div>
            </div>
            <h3 class="kpi-value" id="kpi-total-value">$0.00</h3>
            <span class="text-xs text-secondary">Costo total acumulado</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Stock Crítico (Agotados)</span>
              <div class="kpi-icon kpi-icon-danger">⚠️</div>
            </div>
            <h3 class="kpi-value text-danger" id="kpi-critical-items">0</h3>
            <span class="text-xs text-secondary">Requieren reabastecimiento urgente</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Stock Mínimo (Bajo)</span>
              <div class="kpi-icon kpi-icon-warning">📉</div>
            </div>
            <h3 class="kpi-value text-warning" id="kpi-low-items">0</h3>
            <span class="text-xs text-secondary">Artículos por debajo del límite</span>
          </div>
        </div>

        <!-- Filter and Search Toolbar -->
        <div class="card p-4 mb-4">
          <div class="inv-toolbar">
            <div class="inv-search">
              <span class="inv-search-icon">🔍</span>
              <input type="text" id="inp-search" class="input input-md" placeholder="Buscar por nombre o SKU..." />
            </div>

            <select id="sel-filter-category" class="inv-filter-select">
              <option value="">Todas las categorías</option>
            </select>

            <select id="sel-filter-status" class="inv-filter-select">
              <option value="">Todos los estados</option>
              <option value="OK">Disponibles</option>
              <option value="LOW">Stock Bajo</option>
              <option value="OUT">Agotados</option>
            </select>
          </div>
        </div>

        <!-- Main Data Table Container -->
        <div class="card p-5">
          <div id="products-table-wrapper"></div>
        </div>
      `
    });

    this.listeners = [];
    this.modalInstance = null;
  }

  mount() {
    const element = this.layout.mount();

    // Inject table
    const tableWrapper = element.querySelector('#products-table-wrapper');
    if (tableWrapper) {
      tableWrapper.appendChild(this.table.mount());
    }

    this.afterMount(element);
    this.subscribeToProducts(element);

    return element;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    // Search and filters
    const inpSearch = root.querySelector('#inp-search');
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

    // Add Product click
    const addBtn = root.querySelector('#btn-add-product');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openProductModal());
    }

    // Edit/Delete click delegation
    const tableWrapper = root.querySelector('#products-table-wrapper');
    if (tableWrapper) {
      tableWrapper.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.btn-edit-product');
        if (editBtn) {
          const prodId = editBtn.getAttribute('data-id');
          const prod = this.state.products.find(p => p.id === prodId);
          if (prod) this.openProductModal(prod);
        }

        const deleteBtn = e.target.closest('.btn-delete-product');
        if (deleteBtn) {
          const prodId = deleteBtn.getAttribute('data-id');
          if (confirm('¿Estás seguro de que deseas eliminar este producto del inventario?')) {
            try {
              await FirestoreService.delete('productos', prodId);
              NotificationService.success('Producto eliminado del inventario.');
            } catch (err) {
              console.error('[ProductsView] Error deleting:', err);
              NotificationService.error('Error al eliminar el producto.');
            }
          }
        }
      });
    }
  }

  subscribeToProducts(element) {
    try {
      // 1. Listen to products in real time
      const productsListener = FirestoreService.listenToTenant('productos', (products) => {
        this.state.products = products || [];
        
        // Extract unique categories from actual products
        const uniqueCategories = [...new Set(this.state.products.map(p => p.category).filter(Boolean))];
        this.state.categories = uniqueCategories;
        this.updateCategoryFilterDropdown(element);

        this.recalculateKPIs(element);
        this.applyFilters();
      });
      this.listeners.push(productsListener);
    } catch (e) {
      console.warn('[ProductsView] Error establishing real-time subscription:', e.message);
    }
  }

  updateCategoryFilterDropdown(element) {
    const dropdown = element.querySelector('#sel-filter-category');
    if (dropdown) {
      const selected = this.state.selectedCategory;
      dropdown.innerHTML = `<option value="">Todas las categorías</option>` +
        this.state.categories.map(cat => `<option value="${cat}" ${cat === selected ? 'selected' : ''}>${cat}</option>`).join('');
    }
  }

  recalculateKPIs(element) {
    const products = this.state.products;

    const totalItems = products.length;
    const criticalItems = products.filter(p => Number(p.stock || 0) === 0).length;
    const lowItems = products.filter(p => {
      const stock = Number(p.stock || 0);
      const min = Number(p.minStock || 0);
      return stock > 0 && stock <= min;
    }).length;

    const totalValue = products.reduce((sum, p) => sum + (Number(p.stock || 0) * Number(p.purchasePrice || 0)), 0);

    const totalEl = element.querySelector('#kpi-total-items');
    if (totalEl) totalEl.textContent = totalItems;

    const valueEl = element.querySelector('#kpi-total-value');
    if (valueEl) {
      valueEl.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalValue);
    }

    const criticalEl = element.querySelector('#kpi-critical-items');
    if (criticalEl) criticalEl.textContent = criticalItems;

    const lowEl = element.querySelector('#kpi-low-items');
    if (lowEl) lowEl.textContent = lowItems;
  }

  applyFilters() {
    const { searchQuery, selectedCategory, selectedStatus, products } = this.state;

    let filtered = products.filter(p => {
      // 1. Search Query filter (matches name or SKU)
      const matchesSearch = !searchQuery || 
        (p.name || '').toLowerCase().includes(searchQuery) ||
        (p.sku || '').toLowerCase().includes(searchQuery);

      // 2. Category filter
      const matchesCategory = !selectedCategory || p.category === selectedCategory;

      // 3. Status filter
      let matchesStatus = true;
      if (selectedStatus === 'OK') {
        matchesStatus = Number(p.stock || 0) > Number(p.minStock || 0);
      } else if (selectedStatus === 'LOW') {
        const stock = Number(p.stock || 0);
        const min = Number(p.minStock || 0);
        matchesStatus = stock > 0 && stock <= min;
      } else if (selectedStatus === 'OUT') {
        matchesStatus = Number(p.stock || 0) === 0;
      }

      return matchesSearch && matchesCategory && matchesStatus;
    });

    const tableWrapper = this.layout.$('#products-table-wrapper');
    if (tableWrapper) {
      tableWrapper.innerHTML = '';
      this.table.props.data = filtered;
      tableWrapper.appendChild(this.table.mount());
    }
  }

  openProductModal(product = null) {
    const isEdit = !!product;

    const categoriesList = this.state.categories;
    const categoryOptionsHTML = categoriesList.map(cat => `<option value="${cat}">${cat}</option>`).join('');

    const formHTML = `
      <form id="product-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary);">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="prod-name">Nombre del Producto</label>
            <input type="text" id="prod-name" class="input input-md" placeholder="Ej. Coca-Cola 600ml" value="${isEdit ? product.name : ''}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="prod-sku">Código de Barras / SKU</label>
            <input type="text" id="prod-sku" class="input input-md" placeholder="Ej. 750105530007" value="${isEdit ? (product.sku || '') : ''}" />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="prod-category">Categoría</label>
            <div style="display: flex; gap: var(--space-2);">
              <select id="prod-category" class="input input-md" style="flex: 1; background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
                <option value="">Selecciona...</option>
                ${categoryOptionsHTML}
              </select>
              <input type="text" id="prod-new-category" class="input input-md" style="flex: 1;" placeholder="Nueva categoría..." />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="prod-unit">Unidad de Medida</label>
            <select id="prod-unit" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="uds" ${isEdit && product.unit === 'uds' ? 'selected' : ''}>Unidades (uds)</option>
              <option value="kg" ${isEdit && product.unit === 'kg' ? 'selected' : ''}>Kilogramos (kg)</option>
              <option value="L" ${isEdit && product.unit === 'L' ? 'selected' : ''}>Litros (L)</option>
              <option value="g" ${isEdit && product.unit === 'g' ? 'selected' : ''}>Gramos (g)</option>
              <option value="paq" ${isEdit && product.unit === 'paq' ? 'selected' : ''}>Paquete (paq)</option>
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="prod-stock">Stock Actual</label>
            <input type="number" id="prod-stock" class="input input-md" min="0" step="any" placeholder="0" value="${isEdit ? product.stock : '0'}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="prod-min-stock">Stock Mínimo (Alerta)</label>
            <input type="number" id="prod-min-stock" class="input input-md" min="0" step="any" placeholder="5" value="${isEdit ? (product.minStock || '5') : '5'}" required />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="prod-purchase-price">Precio de Compra (Costo)</label>
            <input type="number" id="prod-purchase-price" class="input input-md" min="0" step="0.01" placeholder="0.00" value="${isEdit ? product.purchasePrice : '0'}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="prod-price">Precio de Venta al Público</label>
            <input type="number" id="prod-price" class="input input-md" min="0" step="0.01" placeholder="0.00" value="${isEdit ? product.price : '0'}" required />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="prod-description">Descripción (visible en catálogo público)</label>
          <textarea id="prod-description" class="input input-md" rows="2" style="resize:vertical;" placeholder="Describe brevemente el producto para tus clientes...">${isEdit ? (product.description || '') : ''}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label" for="prod-image">🖼️ URL de Imagen del Producto (opcional)</label>
          <input type="url" id="prod-image" class="input input-md" placeholder="https://ejemplo.com/imagen.jpg" value="${isEdit ? (product.image || '') : ''}" />
          <div id="prod-image-preview" style="margin-top: var(--space-2); display: ${isEdit && product.image ? 'flex' : 'none'}; align-items: center; gap: var(--space-3);">
            <img id="prod-image-thumb" src="${isEdit ? (product.image || '') : ''}" alt="Vista previa" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:2px solid var(--color-border);" />
            <span style="font-size:0.78rem;color:var(--color-text-secondary);">Vista previa de la imagen</span>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: var(--space-2);">
          <input type="checkbox" id="prod-on-sale" ${isEdit && product.onSale ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--color-accent);" />
          <label for="prod-on-sale" class="form-label" style="margin:0;">Marcar como <strong>En Oferta</strong> en el catálogo público</label>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-submit-btn">${isEdit ? 'Guardar Cambios' : 'Registrar Producto'}</button>
    `;

    this.modalInstance = new Modal({
      title: isEdit ? 'Editar Producto del Inventario' : 'Registrar Nuevo Producto',
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'md'
    });

    document.body.appendChild(this.modalInstance.mount());

    // Bind category select/new field toggles
    const selectCat = this.modalInstance.$('#prod-category');
    if (product && selectCat) {
      selectCat.value = product.category || '';
    }

    const cancelBtn = this.modalInstance.$('#modal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.modalInstance.close());
    }

    // Live image preview
    const imageInput = this.modalInstance.$('#prod-image');
    if (imageInput) {
      imageInput.addEventListener('input', () => {
        const url = imageInput.value.trim();
        const preview = this.modalInstance.$('#prod-image-preview');
        const thumb = this.modalInstance.$('#prod-image-thumb');
        if (url && preview && thumb) {
          thumb.src = url;
          preview.style.display = 'flex';
        } else if (preview) {
          preview.style.display = 'none';
        }
      });
    }

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitProduct(product));
    }
  }

  async submitProduct(product = null) {
    const form = this.modalInstance.$('#product-form');
    if (!form || !form.reportValidity()) return;

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }

    const name = this.modalInstance.$('#prod-name').value.trim();
    const sku = this.modalInstance.$('#prod-sku').value.trim();
    
    // Choose category: typed input takes preference over select dropdown
    const selectCat = this.modalInstance.$('#prod-category').value;
    const inputCat = this.modalInstance.$('#prod-new-category').value.trim();
    const category = inputCat || selectCat || 'Otros';

    const unit = this.modalInstance.$('#prod-unit').value;
    const stock = Number(this.modalInstance.$('#prod-stock').value);
    const minStock = Number(this.modalInstance.$('#prod-min-stock').value);
    const purchasePrice = Number(this.modalInstance.$('#prod-purchase-price').value);
    const price = Number(this.modalInstance.$('#prod-price').value);

    const payload = {
      name,
      sku,
      category,
      unit,
      stock,
      minStock,
      purchasePrice,
      price,
      description: (this.modalInstance.$('#prod-description')?.value.trim()) || '',
      image: (this.modalInstance.$('#prod-image')?.value.trim()) || '',
      onSale: this.modalInstance.$('#prod-on-sale')?.checked || false,
      updatedAt: Date.now()
    };

    try {
      if (product) {
        // Edit mode
        await FirestoreService.update('productos', product.id, payload);
        NotificationService.success('Producto actualizado correctamente.');
      } else {
        // Create mode
        payload.createdAt = Date.now();
        await FirestoreService.create('productos', payload);
        NotificationService.success('Producto registrado correctamente en el inventario.');
      }
      this.modalInstance.close();
    } catch (err) {
      console.error('[ProductsView] Error saving product:', err);
      alert(`Error al registrar el producto: ${err.message}`);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = product ? 'Guardar Cambios' : 'Registrar Producto';
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