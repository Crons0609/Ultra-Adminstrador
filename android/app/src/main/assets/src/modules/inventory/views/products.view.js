import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { BarcodeScannerService } from '../../../services/barcode-scanner.service.js';
import { BarcodeRegistryService } from '../../../services/barcode-registry.service.js';
import { TimeService } from '../../../services/time.service.js';
import { ImageStorageService } from '../../../services/image-storage.service.js';
import { ImageDisplay } from '../../../components/ui/image-display.js';
import { ImageUploader } from '../../../components/ui/image-uploader.js';
import { I18nService } from '../../../services/i18n.service.js';

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
          label: I18nService.t('inv_product_name'),
          render: (val, row) => `
            <div style="display: flex; align-items: center; gap: 10px;">
              ${(row.imageId || row.image)
                ? ImageDisplay.renderTag(row.imageId || null, 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><text y=%2220%22 font-size=%2220%22>📦</text></svg>', 'width:40px;height:40px;border-radius:6px;object-fit:cover;flex-shrink:0;')
                : `<div style="width:40px;height:40px;border-radius:6px;background:var(--color-bg-tertiary);display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">📦</div>`
              }
              <div style="display: flex; flex-direction: column;">
                <span class="font-semibold text-primary">${val}</span>
                <span class="text-xs text-secondary" style="font-size: 0.7rem; margin-top: 2px;">📦 ${row.category || I18nService.t('inv_no_category')}</span>
              </div>
            </div>
          `
        },
        { key: 'sku', label: I18nService.t('inv_product_code') },
        { 
          key: 'stock', 
          label: I18nService.t('inv_stock'),
          render: (val, row) => `
            <span class="font-medium ${Number(val) === 0 ? 'text-danger font-bold' : (Number(val) <= Number(row.minStock || 0) ? 'text-warning font-semibold' : 'text-success')}">
              ${val} ${row.unit || 'uds'}
            </span>
          `
        },
        { 
          key: 'minStock', 
          label: I18nService.t('inv_min_stock'),
          render: (val, row) => `<span class="text-secondary">${val} ${row.unit || 'uds'}</span>`
        },
        { 
          key: 'purchasePrice', 
          label: I18nService.t('inv_cost'),
          render: (val) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val || 0)
        },
        { 
          key: 'price', 
          label: I18nService.t('inv_price'),
          render: (val) => `<strong class="text-primary">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val || 0)}</strong>`
        },
        { 
          key: 'margin', 
          label: I18nService.t('inv_margin'),
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
          label: I18nService.t('status'),
          render: (_, row) => {
            const stock = Number(row.stock || 0);
            const min = Number(row.minStock || 0);
            if (stock === 0) {
              return `<span class="stock-badge stock-out">${I18nService.t('inv_out_of_stock')}</span>`;
            } else if (stock <= min) {
              return `<span class="stock-badge stock-low">${I18nService.t('inv_low_stock')}</span>`;
            } else {
              return `<span class="stock-badge stock-ok">${I18nService.t('inv_in_stock')}</span>`;
            }
          }
        },
        {
          key: 'id',
          label: I18nService.t('actions'),
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
      title: I18nService.t('inv_title'),
      subtitle: I18nService.t('inv_subtitle'),
      actionHTML: `
        <button class="btn btn-primary btn-sm" id="btn-add-product">
          ${I18nService.t('inv_add_product')}
        </button>
      `,
      contentHTML: `
        <!-- KPI Cards Row -->
        <div class="grid-stats animate-fade-in" id="products-kpis">
          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">${I18nService.t('inv_total_products')}</span>
              <div class="kpi-icon kpi-icon-accent">📦</div>
            </div>
            <h3 class="kpi-value" id="kpi-total-items">0</h3>
            <span class="text-xs text-secondary">${I18nService.t('inv_active_products_desc')}</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">${I18nService.t('inv_total_value')}</span>
              <div class="kpi-icon kpi-icon-success">💰</div>
            </div>
            <h3 class="kpi-value" id="kpi-total-value">$0.00</h3>
            <span class="text-xs text-secondary">${I18nService.t('inv_total_value_desc')}</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">${I18nService.t('inv_critical_stock')}</span>
              <div class="kpi-icon kpi-icon-danger">⚠️</div>
            </div>
            <h3 class="kpi-value text-danger" id="kpi-critical-items">0</h3>
            <span class="text-xs text-secondary">${I18nService.t('inv_critical_stock_desc')}</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">${I18nService.t('inv_low_stock_kpi')}</span>
              <div class="kpi-icon kpi-icon-warning">📉</div>
            </div>
            <h3 class="kpi-value text-warning" id="kpi-low-items">0</h3>
            <span class="text-xs text-secondary">${I18nService.t('inv_low_stock_desc')}</span>
          </div>
        </div>

        <!-- Barcode Scan Search Bar -->
        <div class="card p-4 mb-4">
          <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3);">
            <span style="font-size: 1rem;">📊</span>
            <span class="form-label" style="margin: 0; font-weight: 600; font-size: 0.85rem;">${I18nService.t('inv_scan_search')}</span>
          </div>
          <div class="barcode-input-wrapper barcode-input-compact">
            <div class="barcode-input-container">
              <div class="barcode-input-icon-left">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 5v14"/><path d="M6 5v14"/><path d="M9 5v14"/><path d="M12 5v14"/><path d="M16 5v14"/><path d="M19 5v14"/><path d="M21 5v14"/>
                </svg>
              </div>
              <input type="text" id="inp-barcode-scan" class="input input-md barcode-input-field" placeholder="${I18nService.t('inv_scan_placeholder')}" autocomplete="off" autocorrect="off" spellcheck="false" />
              <div class="barcode-input-indicator"><span class="barcode-pulse"></span></div>
            </div>
            <div id="barcode-scan-feedback" class="barcode-input-feedback" style="display: none;">
              <span id="barcode-scan-feedback-icon"></span>
              <span id="barcode-scan-feedback-text"></span>
            </div>
          </div>
        </div>

        <!-- Filter and Search Toolbar -->
        <div class="card p-4 mb-4">
          <div class="inv-toolbar">
            <div class="inv-search">
              <span class="inv-search-icon">🔍</span>
              <input type="text" id="inp-search" class="input input-md" placeholder="${I18nService.t('inv_search_placeholder')}" />
            </div>

            <select id="sel-filter-category" class="inv-filter-select">
              <option value="">${I18nService.t('inv_all_categories')}</option>
            </select>

            <select id="sel-filter-status" class="inv-filter-select">
              <option value="">${I18nService.t('inv_all_statuses')}</option>
              <option value="OK">${I18nService.t('inv_available')}</option>
              <option value="LOW">${I18nService.t('inv_low_stock')}</option>
              <option value="OUT">${I18nService.t('inv_out_of_stock')}</option>
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

    // Barcode scan search bar
    const barcodeInput = root.querySelector('#inp-barcode-scan');
    if (barcodeInput) {
      this._scannerSearchCleanup = BarcodeScannerService.attach(barcodeInput, {
        onScan: (code, format) => this._handleBarcodeScan(code, format, root)
      });
    }

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
          if (confirm(I18nService.t('inv_confirm_delete'))) {
            try {
              await FirestoreService.delete('productos', prodId);
              NotificationService.success(I18nService.t('inv_product_deleted'));
            } catch (err) {
              console.error('[ProductsView] Error deleting:', err);
              NotificationService.error(I18nService.t('inv_delete_error'));
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
      dropdown.innerHTML = `<option value="">${I18nService.t('inv_all_categories')}</option>` +
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
      // 1. Search Query filter (matches name, SKU, or barcode)
      const matchesSearch = !searchQuery || 
        (p.name || '').toLowerCase().includes(searchQuery) ||
        (p.sku || '').toLowerCase().includes(searchQuery) ||
        (p.barcode || '').toLowerCase().includes(searchQuery);

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

  /**
   * Handle a barcode scan from the dedicated scan search bar.
   * Searches for the product and either opens its editor or offers to create it.
   */
  async _handleBarcodeScan(code, format, root) {
    const feedback = root.querySelector('#barcode-scan-feedback');
    const feedbackIcon = root.querySelector('#barcode-scan-feedback-icon');
    const feedbackText = root.querySelector('#barcode-scan-feedback-text');

    const showFeedback = (icon, text, type) => {
      if (feedback && feedbackIcon && feedbackText) {
        feedbackIcon.textContent = icon;
        feedbackText.textContent = text;
        feedback.className = `barcode-input-feedback barcode-feedback-${type}`;
        feedback.style.display = 'flex';
      }
    };

    showFeedback('🔍', I18nService.t('inv_searching_code', { code }), 'info');

    // Register the scan in Firebase
    try {
      await BarcodeRegistryService.registerCode(code, { format });
    } catch (e) {
      console.warn('[ProductsView] Could not register code:', e.message);
    }

    // Search for product by SKU/barcode
    const product = this.state.products.find(p =>
      (p.sku && p.sku.toLowerCase() === code.toLowerCase()) ||
      (p.barcode && p.barcode.toLowerCase() === code.toLowerCase())
    );

    if (product) {
      showFeedback('✅', I18nService.t('inv_product_found_msg', { name: product.name, stock: product.stock, unit: product.unit || 'uds' }), 'success');
      NotificationService.success(I18nService.t('inv_product_found_toast', { name: product.name }));

      // Scroll to product in the table or open edit modal
      setTimeout(() => this.openProductModal(product), 500);
    } else {
      showFeedback('⚠️', I18nService.t('inv_code_not_registered', { code }), 'warning');
      NotificationService.warning(I18nService.t('inv_code_not_found_toast', { code }));

      // Auto-open creation modal with the code pre-filled
      setTimeout(() => {
        this.openProductModal(null, code);
      }, 800);
    }

    // Clear the scan input for next scan
    const scanInput = root.querySelector('#inp-barcode-scan');
    if (scanInput) {
      setTimeout(() => { scanInput.value = ''; scanInput.focus(); }, 1500);
    }
  }

  async openProductModal(product = null, prefilledCode = '') {
    const isEdit = !!product;

    const categoriesList = this.state.categories;
    const categoryOptionsHTML = categoriesList.map(cat => `<option value="${cat}">${cat}</option>`).join('');

    const formHTML = `
      <form id="product-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary);">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="prod-name">${I18nService.t('inv_product_name')}</label>
            <input type="text" id="prod-name" class="input input-md" placeholder="${I18nService.t('inv_product_name_placeholder')}" value="${isEdit ? product.name : ''}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="prod-sku">${I18nService.t('inv_product_code')}</label>
            <input type="text" id="prod-sku" class="input input-md barcode-input-field" placeholder="${I18nService.t('inv_code_placeholder')}" value="${isEdit ? (product.sku || product.barcode || '') : prefilledCode}" autocomplete="off" autocorrect="off" spellcheck="false" style="font-family: 'JetBrains Mono', 'Fira Code', monospace; letter-spacing: 0.5px;" />
            <span class="text-xs text-secondary">${I18nService.t('inv_code_hint')}</span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="prod-category">${I18nService.t('inv_category')}</label>
            <div style="display: flex; gap: var(--space-2);">
              <select id="prod-category" class="input input-md" style="flex: 1; background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
                <option value="">${I18nService.t('select')}...</option>
                ${categoryOptionsHTML}
              </select>
              <input type="text" id="prod-new-category" class="input input-md" style="flex: 1;" placeholder="${I18nService.t('inv_new_category_placeholder')}" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="prod-unit">${I18nService.t('inv_unit')}</label>
            <select id="prod-unit" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="uds" ${isEdit && product.unit === 'uds' ? 'selected' : ''}>${I18nService.t('inv_unit_units')}</option>
              <option value="kg" ${isEdit && product.unit === 'kg' ? 'selected' : ''}>${I18nService.t('inv_unit_kg')}</option>
              <option value="L" ${isEdit && product.unit === 'L' ? 'selected' : ''}>${I18nService.t('inv_unit_liters')}</option>
              <option value="g" ${isEdit && product.unit === 'g' ? 'selected' : ''}>${I18nService.t('inv_unit_grams')}</option>
              <option value="paq" ${isEdit && product.unit === 'paq' ? 'selected' : ''}>${I18nService.t('inv_unit_package')}</option>
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="prod-stock">${I18nService.t('inv_stock')}</label>
            <input type="number" id="prod-stock" class="input input-md" min="0" step="any" placeholder="0" value="${isEdit ? product.stock : '0'}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="prod-min-stock">${I18nService.t('inv_min_stock')}</label>
            <input type="number" id="prod-min-stock" class="input input-md" min="0" step="any" placeholder="5" value="${isEdit ? (product.minStock || '5') : '5'}" required />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="prod-purchase-price">${I18nService.t('inv_cost')}</label>
            <input type="number" id="prod-purchase-price" class="input input-md" min="0" step="0.01" placeholder="0.00" value="${isEdit ? product.purchasePrice : '0'}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="prod-price">${I18nService.t('inv_price')}</label>
            <input type="number" id="prod-price" class="input input-md" min="0" step="0.01" placeholder="0.00" value="${isEdit ? product.price : '0'}" required />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="prod-description">${I18nService.t('inv_description_label')}</label>
          <textarea id="prod-description" class="input input-md" rows="2" style="resize:vertical;" placeholder="${I18nService.t('inv_description_placeholder')}">${isEdit ? (product.description || '') : ''}</textarea>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="prod-brand">${I18nService.t('inv_brand_label')}</label>
            <input type="text" id="prod-brand" class="input input-md" placeholder="${I18nService.t('inv_brand_placeholder')}" value="${isEdit ? (product.brand || '') : ''}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="prod-presentation">${I18nService.t('inv_presentation_label')}</label>
            <input type="text" id="prod-presentation" class="input input-md" placeholder="${I18nService.t('inv_presentation_placeholder')}" value="${isEdit ? (product.presentation || '') : ''}" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="prod-location">${I18nService.t('inv_location_label')}</label>
          <input type="text" id="prod-location" class="input input-md" placeholder="${I18nService.t('inv_location_placeholder')}" value="${isEdit ? (product.location || '') : ''}" />
          <span class="text-xs text-secondary" style="margin-top:2px; display:block;">${I18nService.t('inv_location_hint')}</span>
        </div>

        <div class="form-group">
          <label class="form-label" for="prod-nutrition">${I18nService.t('inv_nutrition_label')}</label>
          <textarea id="prod-nutrition" class="input input-md" rows="2" style="resize:vertical;" placeholder="${I18nService.t('inv_nutrition_placeholder')}">${isEdit ? (product.nutritionInfo || '') : ''}</textarea>
        </div>

        <div class="form-group" id="prod-image-uploader-slot">
          <!-- ImageUploader component will be mounted here after modal renders -->
          <div style="border:2px dashed var(--color-border); border-radius:var(--radius-lg); background:var(--color-bg-tertiary); padding:16px; text-align:center; color:var(--color-text-secondary); font-size:0.8rem;">
            ${I18nService.t('inv_loading_uploader')}
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); align-items: center;">
          <div style="display: flex; align-items: center; gap: var(--space-2);">
            <input type="checkbox" id="prod-on-sale" ${isEdit && product.onSale ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--color-accent);" />
            <label for="prod-on-sale" class="form-label" style="margin:0;">${I18nService.t('inv_on_sale_label')}</label>
          </div>
          <div class="form-group" id="prod-old-price-group" style="display: ${isEdit && product.onSale ? 'block' : 'none'}; margin-bottom: 0;">
            <label class="form-label" for="prod-old-price">${I18nService.t('inv_old_price_label')}</label>
            <input type="number" id="prod-old-price" class="input input-md" min="0" step="0.01" placeholder="0.00" value="${isEdit ? (product.oldPrice || '') : ''}" />
          </div>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">${I18nService.t('cancel')}</button>
      <button class="btn btn-primary btn-sm" id="modal-submit-btn">${isEdit ? I18nService.t('save_changes') : I18nService.t('inv_add_product')}</button>
    `;

    this.modalInstance = new Modal({
      title: isEdit ? I18nService.t('inv_edit_product') : I18nService.t('inv_add_product'),
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

    // Toggle old price field when on-sale checkbox changes
    const onSaleCheck = this.modalInstance.$('#prod-on-sale');
    if (onSaleCheck) {
      onSaleCheck.addEventListener('change', () => {
        const oldPriceGroup = this.modalInstance.$('#prod-old-price-group');
        if (oldPriceGroup) oldPriceGroup.style.display = onSaleCheck.checked ? 'block' : 'none';
      });
    }

    // Mount ImageUploader into the slot
    this._pendingImageId = (product && product.imageId) ? product.imageId : null;
    const uploaderSlot = this.modalInstance.$('#prod-image-uploader-slot');
    if (uploaderSlot) {
      this._imageUploader = new ImageUploader({
        preset: 'PRODUCT',
        currentImageId: this._pendingImageId,
        label: '🖼️ Imagen del Producto',
        onImageUploaded: (imageId) => { this._pendingImageId = imageId; },
        onImageRemoved: () => { this._pendingImageId = null; }
      });
      uploaderSlot.innerHTML = '';
      uploaderSlot.appendChild(this._imageUploader.mount());
    }

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitProduct(product));
    }

    const skuInput = this.modalInstance.$('#prod-sku');
    this._scannerCleanup = BarcodeScannerService.attach(skuInput, {
      onScan: (code) => {
        skuInput.value = code;
        NotificationService.success(I18nService.t('inv_code_scanned_toast', { code }));
      }
    });
  }

  async submitProduct(product = null) {
    const form = this.modalInstance.$('#product-form');
    if (!form || !form.reportValidity()) return;

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = I18nService.t('saving');
    }

    const name = this.modalInstance.$('#prod-name').value.trim();
    const sku = this.modalInstance.$('#prod-sku').value.trim();
    
    // Choose category: typed input takes preference over select dropdown
    const selectCat = this.modalInstance.$('#prod-category').value;
    const inputCat = this.modalInstance.$('#prod-new-category').value.trim();
    const category = inputCat || selectCat || I18nService.t('inv_category_others');

    const unit = this.modalInstance.$('#prod-unit').value;
    const stock = Number(this.modalInstance.$('#prod-stock').value);
    const minStock = Number(this.modalInstance.$('#prod-min-stock').value);
    const purchasePrice = Number(this.modalInstance.$('#prod-purchase-price').value);
    const price = Number(this.modalInstance.$('#prod-price').value);

    const payload = {
      name,
      sku,
      barcode: sku,
      brand: (this.modalInstance.$('#prod-brand')?.value.trim()) || '',
      category,
      presentation: (this.modalInstance.$('#prod-presentation')?.value.trim()) || '',
      location: (this.modalInstance.$('#prod-location')?.value.trim()) || '',
      nutritionInfo: (this.modalInstance.$('#prod-nutrition')?.value.trim()) || '',
      unit,
      stock,
      minStock,
      purchasePrice,
      price,
      description: (this.modalInstance.$('#prod-description')?.value.trim()) || '',
      imageId: this._pendingImageId || null,
      onSale: this.modalInstance.$('#prod-on-sale')?.checked || false,
      oldPrice: this.modalInstance.$('#prod-on-sale')?.checked
        ? Number(this.modalInstance.$('#prod-old-price')?.value || 0)
        : null,
      updatedAt: Date.now(),
      updatedAtLocal: TimeService.timestamp()
    };

    // Register the barcode in the persistent registry
    if (sku) {
      try {
        await BarcodeRegistryService.registerCode(sku, {
          productName: name,
          associatedWith: 'producto'
        });
      } catch (regErr) {
        console.warn('[ProductsView] Could not register barcode:', regErr.message);
      }
    }

    try {
      if (product) {
        // Edit mode
        await FirestoreService.update('productos', product.id, payload);
        NotificationService.success(I18nService.t('inv_product_updated'));

        // Update registry association
        if (sku) {
          await BarcodeRegistryService.associateCode(sku, product.id, 'producto', name).catch(() => {});
        }
      } else {
        // Create mode
        payload.createdAt = Date.now();
        payload.createdAtLocal = TimeService.timestamp();
        const newId = await FirestoreService.create('productos', payload);
        NotificationService.success(I18nService.t('inv_product_saved'));

        // Associate the code with the new product
        if (sku && newId) {
          await BarcodeRegistryService.associateCode(sku, newId, 'producto', name).catch(() => {});
        }
      }
      this.modalInstance.close();
    } catch (err) {
      console.error('[ProductsView] Error saving product:', err);
      alert(I18nService.t('inv_save_error', { error: err.message }));
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = product ? I18nService.t('save_changes') : I18nService.t('inv_add_product');
      }
    }
  }

  unmount() {
    if (this._scannerCleanup) this._scannerCleanup();
    if (this._scannerSearchCleanup) this._scannerSearchCleanup();
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.table.unmount();
    this.layout.unmount();
    super.unmount();
  }
}
