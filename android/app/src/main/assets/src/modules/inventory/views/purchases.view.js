import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { BarcodeInput } from '../../../components/forms/barcode-input.js';
import { BarcodeScannerService } from '../../../services/barcode-scanner.service.js';
import { I18nService } from '../../../services/i18n.service.js';

export class PurchasesView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || '';

    this.state = {
      purchases: [],
      suppliers: [],
      products: [],
      newOrderItems: [] // temp items for modal creation
    };

    // Initialize DataTable
    this.table = new DataTable({
      columns: [
        { 
          key: 'id', 
          label: I18nService.t('pur_order_id'),
          render: (val) => `<span class="text-xs text-secondary font-mono">#${(val || '').slice(-6).toUpperCase()}</span>`
        },
        { key: 'supplierName', label: I18nService.t('pur_supplier') },
        { 
          key: 'total', 
          label: I18nService.t('pur_total_amount'),
          render: (val) => `<strong>${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val || 0)}</strong>`
        },
        { 
          key: 'date', 
          label: I18nService.t('pur_order_date'),
          render: (val) => new Date(val).toLocaleDateString()
        },
        { 
          key: 'status', 
          label: I18nService.t('status'),
          render: (val) => {
            let label = I18nService.t('pending');
            let badgeClass = 'purchase-pending';
            if (val === 'RECEIVED') {
              label = I18nService.t('pur_status_received');
              badgeClass = 'purchase-received';
            } else if (val === 'CANCELLED') {
              label = I18nService.t('cancelled');
              badgeClass = 'purchase-cancelled';
            }
            return `<span class="stock-badge ${badgeClass}">${label}</span>`;
          }
        },
        {
          key: 'id',
          label: I18nService.t('actions'),
          render: (val, row) => {
            if (row.status === 'PENDING') {
              return `
                <div class="d-flex gap-2">
                  <button class="btn btn-success btn-sm py-1 px-2 btn-receive-order" data-id="${val}" style="font-size: 0.7rem;">${I18nService.t('pur_receive_btn')}</button>
                  <button class="btn btn-secondary btn-sm py-1 px-2 btn-cancel-order" data-id="${val}" style="font-size: 0.7rem;">🚫</button>
                </div>
              `;
            }
            return `<span class="text-xs text-secondary">${I18nService.t('pur_finished')}</span>`;
          }
        }
      ],
      data: []
    });

    this.layout = new PageLayout({
      title: I18nService.t('pur_title_full'),
      subtitle: I18nService.t('pur_subtitle'),
      actionHTML: `
        <button class="btn btn-primary btn-sm" id="btn-add-purchase">
          ${I18nService.t('pur_add_new')}
        </button>
      `,
      contentHTML: `
        <!-- KPI Cards Row -->
        <div class="grid-stats animate-fade-in">
          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">${I18nService.t('pur_total_kpi')}</span>
              <div class="kpi-icon kpi-icon-accent">📄</div>
            </div>
            <h3 class="kpi-value" id="kpi-total-orders">0</h3>
            <span class="text-xs text-secondary">${I18nService.t('pur_total_desc')}</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">${I18nService.t('pur_pending_kpi')}</span>
              <div class="kpi-icon kpi-icon-warning">⏳</div>
            </div>
            <h3 class="kpi-value text-warning" id="kpi-pending-orders">0</h3>
            <span class="text-xs text-secondary">${I18nService.t('pur_pending_desc')}</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">${I18nService.t('pur_cost_kpi')}</span>
              <div class="kpi-icon kpi-icon-success">💰</div>
            </div>
            <h3 class="kpi-value text-success" id="kpi-total-purchase-cost">$0.00</h3>
            <span class="text-xs text-secondary">${I18nService.t('pur_cost_desc')}</span>
          </div>
        </div>

        <!-- Main Data Table Container -->
        <div class="card p-5">
          <div id="purchases-table-wrapper"></div>
        </div>
      `
    });

    this.listeners = [];
    this.modalInstance = null;
  }

  mount() {
    const element = this.layout.mount();

    // Inject table
    const tableWrapper = element.querySelector('#purchases-table-wrapper');
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

    // Add Purchase click
    const addBtn = root.querySelector('#btn-add-purchase');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openPurchaseModal());
    }

    // Action buttons delegation
    const tableWrapper = root.querySelector('#purchases-table-wrapper');
    if (tableWrapper) {
      tableWrapper.addEventListener('click', async (e) => {
        const receiveBtn = e.target.closest('.btn-receive-order');
        if (receiveBtn) {
          const purchaseId = receiveBtn.getAttribute('data-id');
          if (confirm(I18nService.t('pur_confirm_receive'))) {
            await this.receiveOrder(purchaseId);
          }
        }

        const cancelBtn = e.target.closest('.btn-cancel-order');
        if (cancelBtn) {
          const purchaseId = cancelBtn.getAttribute('data-id');
          if (confirm(I18nService.t('pur_confirm_cancel'))) {
            try {
              await FirestoreService.update('compras', purchaseId, { status: 'CANCELLED' });
              NotificationService.success(I18nService.t('pur_cancelled_success'));
            } catch (err) {
              console.error('[PurchasesView] Error cancelling:', err);
              NotificationService.error(I18nService.t('pur_cancel_error'));
            }
          }
        }
      });
    }
  }

  subscribeToData(element) {
    try {
      // 1. Listen to Purchases
      const purchasesListener = FirestoreService.listenToTenant('compras', (purchases) => {
        this.state.purchases = purchases || [];
        this.recalculateKPIs(element);
        this.refreshTable();
      });
      this.listeners.push(purchasesListener);

      // 2. Listen to Suppliers
      const suppliersListener = FirestoreService.listenToTenant('proveedores', (suppliers) => {
        this.state.suppliers = (suppliers || []).filter(s => s.status !== 'INACTIVO');
      });
      this.listeners.push(suppliersListener);

      // 3. Listen to Products
      const productsListener = FirestoreService.listenToTenant('productos', (products) => {
        this.state.products = products || [];
      });
      this.listeners.push(productsListener);
    } catch (e) {
      console.warn('[PurchasesView] Error setting up RTDB listeners:', e.message);
    }
  }

  recalculateKPIs(element) {
    const purchases = this.state.purchases;

    const totalOrders = purchases.length;
    const pendingOrders = purchases.filter(p => p.status === 'PENDING').length;
    const totalCost = purchases
      .filter(p => p.status === 'RECEIVED')
      .reduce((sum, p) => sum + Number(p.total || 0), 0);

    const totalEl = element.querySelector('#kpi-total-orders');
    if (totalEl) totalEl.textContent = totalOrders;

    const pendingEl = element.querySelector('#kpi-pending-orders');
    if (pendingEl) pendingEl.textContent = pendingOrders;

    const costEl = element.querySelector('#kpi-total-purchase-cost');
    if (costEl) {
      costEl.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalCost);
    }
  }

  refreshTable() {
    const tableWrapper = this.layout.$('#purchases-table-wrapper');
    if (tableWrapper) {
      tableWrapper.innerHTML = '';
      this.table.props.data = this.state.purchases;
      tableWrapper.appendChild(this.table.mount());
    }
  }

  openPurchaseModal() {
    this.state.newOrderItems = [];

    const supplierOptionsHTML = this.state.suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    const formHTML = `
      <form id="purchase-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary);">
        <div class="form-group">
          <label class="form-label" for="pur-supplier">${I18nService.t('pur_select_supplier')}</label>
          <select id="pur-supplier" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);" required>
            <option value="">${I18nService.t('select')}...</option>
            ${supplierOptionsHTML}
          </select>
        </div>

        <div style="margin-bottom: var(--space-2);">
          <label class="form-label font-semibold" style="font-size: 0.85rem; display: flex; align-items: center; gap: 4px;">
            <span>📊</span> ${I18nService.t('pur_scan_to_add')}
          </label>
          <div id="pur-barcode-input-container"></div>
        </div>

        <div style="border-top: 1px dashed var(--color-border); padding-top: var(--space-2);">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="form-label" style="font-weight: 600;">${I18nService.t('pur_items_detail')}</span>
            <button type="button" class="btn btn-secondary btn-xs" id="btn-add-item-row" style="font-size: 0.7rem; padding: 2px 8px;">${I18nService.t('pur_add_row')}</button>
          </div>

          <div id="pur-items-container" class="d-flex flex-column gap-2" style="max-height: 250px; overflow-y: auto; padding-right: 4px;">
            <p class="text-xs text-secondary text-center py-3">${I18nService.t('pur_empty_items')}</p>
          </div>
        </div>

        <div style="border-top: 1px solid var(--color-border); padding-top: var(--space-2); display: flex; justify-content: space-between; align-items: center;">
          <span class="text-sm font-semibold">${I18nService.t('pur_estimated_total')}</span>
          <span class="text-lg font-bold text-success" id="pur-grand-total">$0.00</span>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">${I18nService.t('cancel')}</button>
      <button class="btn btn-primary btn-sm" id="modal-submit-btn">${I18nService.t('pur_save_order')}</button>
    `;

    this.modalInstance = new Modal({
      title: I18nService.t('pur_add_title'),
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'md',
      onClose: () => {
        if (this._modalBarcodeInput) {
          this._modalBarcodeInput.unmount();
          this._modalBarcodeInput = null;
        }
      }
    });

    document.body.appendChild(this.modalInstance.mount());

    // Initialize Barcode Input
    const barcodeContainer = this.modalInstance.$('#pur-barcode-input-container');
    if (barcodeContainer) {
      this._modalBarcodeInput = new BarcodeInput({
        id: 'pur-barcode-scan',
        compact: true,
        placeholder: I18nService.t('pur_scan_placeholder'),
        onScan: (code, format) => {
          const product = this.state.products.find(p =>
            (p.sku && p.sku.toLowerCase() === code.toLowerCase()) ||
            (p.barcode && p.barcode.toLowerCase() === code.toLowerCase())
          );
          if (product) {
            this.addItemRow(product.id, 1, product.purchasePrice || 0);
            NotificationService.success(I18nService.t('pur_item_added_toast', { name: product.name }));
          } else {
            NotificationService.warning(I18nService.t('pur_code_not_found', { code }));
          }
          // Clear and refocus input
          setTimeout(() => {
            if (this._modalBarcodeInput) {
              this._modalBarcodeInput.setValue('');
              this._modalBarcodeInput.focus();
            }
          }, 600);
        }
      });
      barcodeContainer.appendChild(this._modalBarcodeInput.mount());
    }

    const cancelBtn = this.modalInstance.$('#modal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.modalInstance.close());
    }

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitPurchaseOrder());
    }

    // Row addition trigger
    const addRowBtn = this.modalInstance.$('#btn-add-item-row');
    if (addRowBtn) {
      addRowBtn.addEventListener('click', () => this.addItemRow());
    }
  }

  addItemRow(productId = '', qty = 1, price = null) {
    const container = this.modalInstance.$('#pur-items-container');
    if (!container) return;

    // Remove empty state message
    const emptyMsg = container.querySelector('p');
    if (emptyMsg) emptyMsg.remove();

    // Check if product row already exists
    if (productId) {
      const existingRows = container.querySelectorAll('div[id^="row-"]');
      for (const row of existingRows) {
        const prodSelect = row.querySelector('.pur-row-prod');
        if (prodSelect && prodSelect.value === productId) {
          const qtyInput = row.querySelector('.pur-row-qty');
          if (qtyInput) {
            qtyInput.value = Number(qtyInput.value || 0) + Number(qty);
            this.recalculateModalTotal();
            return;
          }
        }
      }
    }

    const rowId = 'row-' + Date.now() + Math.random().toString(36).substr(2, 5);
    const productOptionsHTML = this.state.products.map(p => `<option value="${p.id}" ${p.id === productId ? 'selected' : ''}>${p.name} (SKU: ${p.sku || 'N/A'})</option>`).join('');

    const rowHTML = document.createElement('div');
    rowHTML.id = rowId;
    rowHTML.style.cssText = 'display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 8px; align-items: center;';

    // Resolve price
    let initialPrice = '';
    if (price !== null) {
      initialPrice = price;
    } else if (productId) {
      const prod = this.state.products.find(p => p.id === productId);
      if (prod) initialPrice = prod.purchasePrice || 0;
    }

    rowHTML.innerHTML = `
      <select class="input input-sm pur-row-prod" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);" required>
        <option value="">${I18nService.t('pur_select_item')}</option>
        ${productOptionsHTML}
      </select>
      <input type="number" class="input input-sm pur-row-qty" min="1" value="${qty}" placeholder="${I18nService.t('quantity_short')}" required style="width:100%" />
      <input type="number" class="input input-sm pur-row-price" min="0" step="0.01" value="${initialPrice}" placeholder="${I18nService.t('inv_cost')}" required style="width:100%" />
      <button type="button" class="btn btn-danger btn-xs btn-remove-row" style="padding:4px 8px;">🗑️</button>
    `;

    container.appendChild(rowHTML);

    // Watch inputs to update Grand Total
    const qtyInput = rowHTML.querySelector('.pur-row-qty');
    const priceInput = rowHTML.querySelector('.pur-row-price');
    const prodSelect = rowHTML.querySelector('.pur-row-prod');

    const updateCosts = () => {
      const prodId = prodSelect.value;
      const selectedProd = this.state.products.find(p => p.id === prodId);
      if (selectedProd && !priceInput.value) {
        priceInput.value = selectedProd.purchasePrice || 0;
      }
      this.recalculateModalTotal();
    };

    prodSelect.addEventListener('change', updateCosts);
    qtyInput.addEventListener('input', () => this.recalculateModalTotal());
    priceInput.addEventListener('input', () => this.recalculateModalTotal());

    rowHTML.querySelector('.btn-remove-row').addEventListener('click', () => {
      rowHTML.remove();
      this.recalculateModalTotal();
    });
  }

  recalculateModalTotal() {
    const container = this.modalInstance.$('#pur-items-container');
    if (!container) return;

    let grandTotal = 0;
    const rows = container.children;
    for (let row of rows) {
      const qty = Number(row.querySelector('.pur-row-qty')?.value || 0);
      const price = Number(row.querySelector('.pur-row-price')?.value || 0);
      grandTotal += qty * price;
    }

    const totalEl = this.modalInstance.$('#pur-grand-total');
    if (totalEl) {
      totalEl.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(grandTotal);
    }
  }

  async submitPurchaseOrder() {
    const form = this.modalInstance.$('#purchase-form');
    if (!form || !form.reportValidity()) return;

    const supplierId = this.modalInstance.$('#pur-supplier').value;
    const supplier = this.state.suppliers.find(s => s.id === supplierId);
    const supplierName = supplier ? supplier.name : 'Varios';

    const itemsContainer = this.modalInstance.$('#pur-items-container');
    const rows = itemsContainer.children;
    
    if (rows.length === 0 || (rows.length === 1 && rows[0].tagName === 'P')) {
      alert(I18nService.t('pur_error_no_items'));
      return;
    }

    const items = [];
    let total = 0;

    for (let row of rows) {
      const productId = row.querySelector('.pur-row-prod').value;
      const product = this.state.products.find(p => p.id === productId);
      const name = product ? product.name : I18nService.t('inv_product_name');
      const qty = Number(row.querySelector('.pur-row-qty').value);
      const purchasePrice = Number(row.querySelector('.pur-row-price').value);

      items.push({
        productId,
        name,
        qty,
        purchasePrice
      });
      total += qty * purchasePrice;
    }

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = I18nService.t('saving');
    }

    try {
      await FirestoreService.create('compras', {
        supplierId,
        supplierName,
        items,
        total,
        status: 'PENDING',
        date: Date.now(),
        createdAt: Date.now()
      });

      NotificationService.success(I18nService.t('pur_saved_success'));
      this.modalInstance.close();
    } catch (err) {
      console.error('[PurchasesView] Error submitting order:', err);
      alert(I18nService.t('pur_save_error', { error: err.message }));
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = I18nService.t('pur_save_order');
      }
    }
  }

  async receiveOrder(purchaseId) {
    const order = this.state.purchases.find(p => p.id === purchaseId);
    if (!order) return;

    try {
      // 1. Update purchase status
      await FirestoreService.update('compras', purchaseId, { status: 'RECEIVED' });

      // 2. Increment stock for all items
      for (const item of (order.items || [])) {
        const prod = this.state.products.find(p => p.id === item.productId);
        if (prod) {
          const newStock = Number(prod.stock || 0) + Number(item.qty || 0);
          await FirestoreService.update('productos', item.productId, {
            stock: newStock,
            purchasePrice: item.purchasePrice // update product's default purchase price
          });
        }
      }

      NotificationService.success(I18nService.t('pur_received_success'));
    } catch (err) {
      console.error('[PurchasesView] Error receiving order:', err);
      NotificationService.error(I18nService.t('pur_receive_error'));
    }
  }

  unmount() {
    if (this._modalBarcodeInput) {
      this._modalBarcodeInput.unmount();
      this._modalBarcodeInput = null;
    }
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.table.unmount();
    this.layout.unmount();
    super.unmount();
  }
}