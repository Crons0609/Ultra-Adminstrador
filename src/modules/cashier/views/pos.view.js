/**
 * @file pos.view.js
 * @description Real-time Point of Sale (POS) View.
 * Supports direct catalog sales, barcode scanning, loading table orders, and cover/capacity management for Bars/Clubs.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { BarcodeInput } from '../../../components/forms/barcode-input.js';
import { BarcodeScannerService } from '../../../services/barcode-scanner.service.js';
import { BarcodeRegistryService } from '../../../services/barcode-registry.service.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { TimeService } from '../../../services/time.service.js';
import { GlobalStore } from '../../../core/state.js';
import { getBusinessCategory } from '../../../config/business-types.config.js';

export class POSView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || '';
    this.sellerName = currentUser.displayName || currentUser.name || 'Cajero';

    const company = GlobalStore.getState().currentCompany || {};
    this.businessCategory = getBusinessCategory(company.businessType || '');
    this.isBar = this.businessCategory === 'BAR_DISCOTECA';

    this.state = {
      products: [],
      categories: [],
      tables: [],
      orders: [],
      cart: [],
      searchQuery: '',
      selectedCategory: '',
      paymentMethod: 'EFECTIVO', // EFECTIVO, TARJETA, TRANSFERENCIA
      amountPaid: '',
      change: 0,
      loadedTableId: '',
      loadedOrderId: '',
      aforo: { actual: 0, limite: 300 }
    };

    this.layout = new PageLayout({
      title: this.isBar ? 'Punto de Venta & Taquilla (POS)' : 'Punto de Venta (POS)',
      subtitle: this.isBar 
        ? 'Procesa cobros de barras, VIPs y registros de covers/entradas.'
        : 'Procesa cobros de mesas, órdenes separadas y ventas directas.',
      contentHTML: `
        <div class="pos-grid animate-fade-in">
          <!-- Left Panel: Ticket & Checkout -->
          <div class="pos-billing-panel">
            
            <!-- Cover & Capacity Tracker (Only for Bars/Clubs) -->
            <div id="pos-aforo-panel" style="display:${this.isBar ? 'block' : 'none'}; background: rgba(168, 85, 247, 0.08); border: 1px solid rgba(168, 85, 247, 0.2); border-radius: var(--radius-lg); padding: var(--space-4); margin-bottom: 12px;">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-xs font-bold" style="color:#a855f7;">🕺 Aforo actual: <strong id="pos-aforo-count">0 / 300</strong></span>
                <button class="btn btn-xs btn-primary font-semibold" id="pos-btn-cover" style="background:#a855f7; border:none; padding:4px 10px; border-radius:6px; cursor:pointer;">+ Cover ($100)</button>
              </div>
              <div class="kpi-progress-bar" style="background:rgba(255,255,255,0.06); height:6px;">
                <div id="pos-aforo-bar" class="kpi-progress-fill" style="width: 0%; background:#a855f7; transition:width 0.4s;"></div>
              </div>
            </div>

            <div class="pos-panel-header" style="display:flex; flex-direction:column; gap: var(--space-2); margin-bottom: 12px; border-bottom: 1px solid var(--color-border); padding-bottom: 12px;">
              
              <!-- Panel de Solicitudes de Cuenta Pendientes -->
              <div id="pos-bill-requests-panel" style="display:none; background: rgba(251,146,60,0.07); border: 1px solid rgba(251,146,60,0.25); border-radius: var(--radius-md); padding: 10px 12px; margin-bottom: 8px;">
                <div class="d-flex align-items-center gap-2 mb-2">
                  <span style="font-size:0.9rem;">🧾</span>
                  <span class="font-bold" style="font-size:0.78rem; color:#fb923c;">Solicitudes de Cuenta</span>
                  <span id="pos-bill-requests-count" class="badge animate-pulse" style="background:#fb923c22; color:#fb923c; border:1px solid #fb923c44; font-size:0.65rem; margin-left:auto;">0</span>
                </div>
                <div id="pos-bill-requests-list" style="display:flex; flex-direction:column; gap:4px;"></div>
              </div>

              <!-- Table / Comanda Loader -->
              <div>
                <label class="form-label font-semibold" style="font-size: 0.8rem; margin-bottom: 4px; display: block;">📥 Cargar ${this.isBar ? 'VIP / Área / Barra' : 'Mesa / Pedido Activo'}</label>
                <select id="pos-table-selector" class="input input-sm w-full" style="height:36px; font-size:0.82rem;">
                  <option value="">-- Venta Directa (Sin Mesa) --</option>
                </select>
              </div>

              <!-- Client Selector for Separated Bills -->
              <div id="pos-client-selector-group" style="display:none;">
                <label class="form-label" style="font-size:0.75rem; margin-bottom: 4px; display: block;">👤 Cliente (Cuenta Separada):</label>
                <select id="pos-client-selector" class="input input-sm w-full" style="height:36px; font-size:0.82rem;">
                  <option value="">-- Seleccionar Cliente --</option>
                </select>
              </div>

              <!-- Barcode scanner input -->
              <div style="margin-top: 4px;">
                <label class="form-label font-semibold" style="font-size: 0.8rem; display: flex; align-items: center; gap: 4px; margin-bottom: 4px;">
                  <span>⚡</span> Escaneo Continuo
                </label>
                <div id="pos-scan-container"></div>
              </div>
            </div>

            <!-- Cart Items List -->
            <div class="pos-ticket-container" id="pos-ticket-container" style="max-height: 280px; overflow-y: auto;">
              <div class="pos-ticket-empty">
                <div class="pos-ticket-empty-icon">🛒</div>
                <h4>El ticket está vacío</h4>
                <p class="text-xs">Carga una mesa ocupada, escanea un artículo o haz clic en los productos del catálogo.</p>
              </div>
            </div>

            <!-- Summary & Payment -->
            <div class="pos-billing-summary">
              <div class="pos-calc-row">
                <span>Subtotal:</span>
                <span id="pos-summary-subtotal">$0.00</span>
              </div>
              <div class="pos-calc-row">
                <span>Impuesto (15%):</span>
                <span id="pos-summary-tax">$0.00</span>
              </div>
              <div class="pos-calc-row" style="font-weight: 700;">
                <span class="text-primary">Total a Pagar:</span>
                <span class="pos-calc-total" id="pos-summary-total">$0.00</span>
              </div>

              <!-- Payment Method Selection -->
              <div style="margin-top: var(--space-3);">
                <span class="form-label font-semibold" style="font-size: 0.78rem;">Método de Pago:</span>
                <div class="pos-payment-selector">
                  <button type="button" class="pos-payment-btn active" data-method="EFECTIVO">💵 Efectivo</button>
                  <button type="button" class="pos-payment-btn" data-method="TARJETA">💳 Tarjeta</button>
                  <button type="button" class="pos-payment-btn" data-method="TRANSFERENCIA">🏦 Transf.</button>
                </div>
              </div>

              <!-- Cash payment input & change calculator -->
              <div id="pos-cash-details" class="form-group" style="margin-bottom: var(--space-3); margin-top:8px;">
                <div style="display: flex; gap: var(--space-2); align-items: center;">
                  <div style="flex: 1;">
                    <label class="form-label" style="font-size: 0.72rem; margin-bottom: 2px;" for="pos-cash-paid">Efectivo Recibido:</label>
                    <input type="number" id="pos-cash-paid" class="input input-sm" placeholder="0.00" min="0" step="any" style="width:100%" />
                  </div>
                  <div style="flex: 1; text-align: right;">
                    <span class="form-label" style="font-size: 0.72rem; display: block; margin-bottom: 2px;">Cambio:</span>
                    <strong class="text-success text-md" id="pos-cash-change">$0.00</strong>
                  </div>
                </div>
              </div>

              <!-- Checkout Actions -->
              <div style="display: flex; gap: var(--space-2); margin-top: 10px;">
                <button type="button" class="btn btn-secondary btn-sm" id="pos-clear-cart" style="flex: 1;">Vaciar</button>
                <button type="button" class="btn btn-primary btn-sm pos-checkout-btn" id="pos-complete-checkout" style="flex: 2; ${this.isBar ? 'background:#a855f7;' : ''}">Completar Venta</button>
              </div>
            </div>
          </div>

          <!-- Right Panel: Catalog selection -->
          <div class="pos-catalog-panel">
            <!-- Search toolbar -->
            <div class="pos-catalog-toolbar">
              <div class="inv-search" style="flex: 1; margin: 0;">
                <span class="inv-search-icon">🔍</span>
                <input type="text" id="pos-catalog-search" class="input input-md" placeholder="Buscar por nombre o SKU..." />
              </div>
            </div>

            <!-- Categories Tabs -->
            <div class="pos-categories-bar" id="pos-categories-bar">
              <span class="pos-category-tab active" data-category="">Todos</span>
            </div>

            <!-- Products Grid -->
            <div class="pos-catalog-grid" id="pos-catalog-grid">
              <p class="text-xs text-secondary text-center py-5" style="grid-column: 1 / -1;">Cargando catálogo de productos...</p>
            </div>
          </div>
        </div>
      `
    });

    this.listeners = [];
    this.scanInputComponent = null;
  }

  mount() {
    const element = this.layout.mount();
    this.afterMount(element);
    this.subscribeToData(element);
    return element;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    // Apply nocturne styling dynamically to cashier panels if it's a bar
    if (this.isBar) {
      root.querySelectorAll('.pos-payment-btn').forEach(btn => {
        btn.style.setProperty('--color-accent', '#a855f7');
      });
    }

    // Initialize BarcodeInput
    const scanContainer = root.querySelector('#pos-scan-container');
    if (scanContainer) {
      this.scanInputComponent = new BarcodeInput({
        id: 'pos-barcode-scanner',
        compact: true,
        placeholder: 'Escanea códigos...',
        onScan: (code, format) => this._handleBarcodeScan(code, format)
      });
      scanContainer.appendChild(this.scanInputComponent.mount());
    }

    // Text Catalog search
    const textSearch = root.querySelector('#pos-catalog-search');
    if (textSearch) {
      textSearch.addEventListener('input', (e) => {
        this.state.searchQuery = e.target.value.toLowerCase();
        this.renderCatalog();
      });
    }

    // Category Tabs click delegation
    const categoriesBar = root.querySelector('#pos-categories-bar');
    if (categoriesBar) {
      categoriesBar.addEventListener('click', (e) => {
        const tab = e.target.closest('.pos-category-tab');
        if (tab) {
          categoriesBar.querySelectorAll('.pos-category-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          this.state.selectedCategory = tab.getAttribute('data-category');
          this.renderCatalog();
        }
      });
    }

    // Catalog items grid click delegation (Adding to cart)
    const catalogGrid = root.querySelector('#pos-catalog-grid');
    if (catalogGrid) {
      catalogGrid.addEventListener('click', (e) => {
        const itemCard = e.target.closest('.pos-catalog-item');
        if (itemCard) {
          const productId = itemCard.getAttribute('data-id');
          this.addToCart(productId);
        }
      });
    }

    // Ticket list click delegation (changing qty, removing item)
    const ticketContainer = root.querySelector('#pos-ticket-container');
    if (ticketContainer) {
      ticketContainer.addEventListener('click', (e) => {
        const qtyBtn = e.target.closest('.pos-qty-btn');
        if (qtyBtn) {
          const productId = qtyBtn.getAttribute('data-id');
          const change = Number(qtyBtn.getAttribute('data-change'));
          this.updateItemQty(productId, change);
          return;
        }

        const deleteBtn = e.target.closest('.pos-item-delete');
        if (deleteBtn) {
          const productId = deleteBtn.getAttribute('data-id');
          this.removeFromCart(productId);
        }
      });
    }

    // Payment methods buttons
    const paymentBtns = root.querySelectorAll('.pos-payment-btn');
    paymentBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        paymentBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.paymentMethod = btn.getAttribute('data-method');

        const cashDetails = root.querySelector('#pos-cash-details');
        if (cashDetails) {
          cashDetails.style.display = this.state.paymentMethod === 'EFECTIVO' ? 'block' : 'none';
        }
        this.recalculateTotals();
      });
    });

    // Cash Paid change calculator
    const cashPaidInput = root.querySelector('#pos-cash-paid');
    if (cashPaidInput) {
      cashPaidInput.addEventListener('input', (e) => {
        this.state.amountPaid = e.target.value;
        this.recalculateTotals();
      });
    }

    // Clear cart trigger
    const clearCartBtn = root.querySelector('#pos-clear-cart');
    if (clearCartBtn) {
      clearCartBtn.addEventListener('click', () => this.clearCart());
    }

    // Complete transaction checkout trigger
    const completeCheckoutBtn = root.querySelector('#pos-complete-checkout');
    if (completeCheckoutBtn) {
      completeCheckoutBtn.addEventListener('click', () => this.submitCheckout());
    }

    // Table Selector Change
    const tableSelector = root.querySelector('#pos-table-selector');
    if (tableSelector) {
      tableSelector.addEventListener('change', (e) => {
        this.state.loadedTableId = e.target.value;
        this.handleTableSelection();
      });
    }

    // Client Selector Change
    const clientSelector = root.querySelector('#pos-client-selector');
    if (clientSelector) {
      clientSelector.addEventListener('change', (e) => {
        this.state.loadedOrderId = e.target.value;
        this.handleClientSelection();
      });
    }

    // Quick Cover Sale click handler
    root.querySelector('#pos-btn-cover')?.addEventListener('click', () => {
      this.registerQuickCover();
    });
  }

  subscribeToData(element) {
    try {
      // 1. Subscribe to Products
      const prodListener = FirestoreService.listenToTenant('productos', (products) => {
        this.state.products = products || [];
        const uniqueCategories = [...new Set(this.state.products.map(p => p.category).filter(Boolean))];
        this.state.categories = uniqueCategories;
        this.renderCategoryTabs(element);
        this.renderCatalog(element);
      });
      this.listeners.push(prodListener);

      // 2. Subscribe to Tables and QR codes for order loading
      const tablesListener = FirestoreService.listenToTenant('tables', (tables) => {
        this.state.rawTables = tables || [];
        this.mergeTablesAndPopulateSelector(element);
      });
      this.listeners.push(tablesListener);

      const qrListener = FirestoreService.listenToTenant('qr_codes', (qrs) => {
        this.state.rawQRs = qrs || [];
        this.mergeTablesAndPopulateSelector(element);
      });
      this.listeners.push(qrListener);

      // 3. Subscribe to Orders
      const ordersListener = FirestoreService.listenToTenant('orders', (orders) => {
        this.state.orders = orders || [];
        this.populateTableSelector(element);
        this.renderBillRequestsPanel(element);
      });
      this.listeners.push(ordersListener);

      // 4. Subscribe to Aforo node (for Bars) — ruta tenant correcta sin prefijo companies/
      if (this.isBar) {
        const aforoListener = FirestoreService.listenToPathRaw(`${this.companyId}/aforo`, (aforo) => {
          this.state.aforo = aforo || { actual: 0, limite: 300 };
          this.updateAforoUI(element);
        });
        this.listeners.push(aforoListener);
      }

    } catch (e) {
      console.warn('[POSView] Error setting up RTDB watch:', e.message);
    }
  }

  updateAforoUI(element) {
    const root = element || this.layout.element;
    const aforoCount = root?.querySelector('#pos-aforo-count');
    const aforoBar = root?.querySelector('#pos-aforo-bar');
    if (!aforoCount || !aforoBar) return;

    const actual = this.state.aforo.actual || 0;
    const limite = this.state.aforo.limite || 300;
    const pct = Math.max(0, Math.min(100, Math.round((actual / limite) * 100)));

    aforoCount.textContent = `${actual} / ${limite}`;
    aforoBar.style.width = `${pct}%`;
  }

  async registerQuickCover() {
    try {
      const salePayload = {
        items: [{ productId: 'cover', name: 'Entrada Cover Club', price: 100, qty: 1, total: 100 }],
        subtotal: 86.95,
        tax: 13.05,
        total: 100,
        paymentMethod: 'EFECTIVO',
        sellerName: this.sellerName,
        date: Date.now(),
        createdAt: Date.now()
      };

      // 1. Save entry ticket sale
      await FirestoreService.create('ventas', salePayload);

      // 2. Increment local club capacity (ruta tenant correcta)
      const nextActual = (this.state.aforo.actual || 0) + 1;
      await FirestoreService.updatePath(`${this.companyId}/aforo`, {
        actual: nextActual,
        limite: this.state.aforo.limite || 300
      });

      NotificationService.success('Entrada de cover registrada. Aforo incrementado.');
    } catch (e) {
      console.error('[POSView] Quick cover sale error:', e);
      NotificationService.error('Error al registrar cover.');
    }
  }

  renderBillRequestsPanel(element) {
    const root = element || this.layout.element;
    const panel = root?.querySelector('#pos-bill-requests-panel');
    const list = root?.querySelector('#pos-bill-requests-list');
    const countBadge = root?.querySelector('#pos-bill-requests-count');
    if (!panel || !list) return;

    const billOrders = this.state.orders.filter(o => o.status === 'ESPERANDO_PAGO');

    if (billOrders.length === 0) {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = 'block';
    if (countBadge) countBadge.textContent = billOrders.length;

    list.innerHTML = billOrders.map(o => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(251,146,60,0.05); border:1px solid rgba(251,146,60,0.15); border-radius:6px; padding:6px 10px; font-size:0.75rem;">
        <span class="font-bold" style="color:#fb923c;">${o.tableName || `Mesa ${o.tableId}`}</span>
        <span class="text-secondary">$${Number(o.total || 0).toFixed(2)}</span>
        <button class="btn btn-xs btn-primary" style="background:#fb923c; border:none; padding:2px 8px; border-radius:4px; cursor:pointer; font-size:0.7rem;" onclick="document.querySelector('#pos-table-selector').value='${o.tableId}'; document.querySelector('#pos-table-selector').dispatchEvent(new Event('change'));">Cargar</button>
      </div>
    `).join('');
  }

  mergeTablesAndPopulateSelector(element) {
    const rawTables = this.state.rawTables || [];
    const rawQRs = this.state.rawQRs || [];

    const tableMap = new Map();
    rawTables.forEach(t => tableMap.set(t.id, t));

    rawQRs.forEach(qr => {
      const id = qr.tableId || qr.id;
      if (id && !tableMap.has(id)) {
        tableMap.set(id, {
          id,
          name: qr.label || `Mesa ${id.replace(/\D/g, '')}`,
          status: 'FREE',
          activeOrderId: null,
          type: qr.type || 'mesa'
        });
      }
    });

    this.state.tables = Array.from(tableMap.values());
    this.populateTableSelector(element);
  }

  populateTableSelector(element) {
    const root = element || this.layout.element;
    const selector = root?.querySelector('#pos-table-selector');
    if (!selector) return;

    const occupiedTables = this.state.tables.filter(t => t.status !== 'FREE');

    const previousVal = selector.value;
    selector.innerHTML = `
      <option value="">-- Venta Directa (Sin Mesa) --</option>
      ${occupiedTables.map(t => {
        const tableOrders = this.state.orders.filter(o => o.tableId === t.id && o.status !== 'COMPLETED' && o.status !== 'CANCELADA');
        const isBillRequested = tableOrders.some(o => o.status === 'ESPERANDO_PAGO');
        const label = isBillRequested ? `⚠️ ${t.name} (Pidió Cuenta)` : `● ${t.name} (En servicio)`;
        return `<option value="${t.id}">${label}</option>`;
      }).join('')}
    `;

    if (occupiedTables.some(t => t.id === previousVal)) {
      selector.value = previousVal;
    } else {
      selector.value = '';
      if (previousVal) this.clearCart();
    }
  }

  handleTableSelection() {
    const tableId = this.state.loadedTableId;
    const root = this.layout.element;
    const clientGroup = root?.querySelector('#pos-client-selector-group');
    const clientSelector = root?.querySelector('#pos-client-selector');

    if (!tableId) {
      this.state.loadedOrderId = '';
      if (clientGroup) clientGroup.style.display = 'none';
      this.clearCart();
      return;
    }

    const tableOrders = this.state.orders.filter(o => o.tableId === tableId && o.status !== 'COMPLETED' && o.status !== 'CANCELADA');

    if (tableOrders.length === 0) {
      NotificationService.info('Esta mesa no posee comandas activas.');
      this.clearCart();
      if (clientGroup) clientGroup.style.display = 'none';
      return;
    }

    const isSeparate = tableOrders.some(o => o.accountType === 'SEPARADO') || tableOrders.length > 1;

    if (isSeparate) {
      if (clientGroup) clientGroup.style.display = 'block';
      if (clientSelector) {
        clientSelector.innerHTML = `
          <option value="">-- Seleccionar Cliente --</option>
          ${tableOrders.map(o => {
            const label = o.clientName ? `${o.clientName} ($${Number(o.total || 0).toFixed(2)})` : `Comanda #${o.id.slice(-4).toUpperCase()} ($${Number(o.total || 0).toFixed(2)})`;
            return `<option value="${o.id}">${label}</option>`;
          }).join('')}
        `;
        clientSelector.value = '';
      }
      this.clearCart();
    } else {
      if (clientGroup) clientGroup.style.display = 'none';
      const singleOrder = tableOrders[0];
      this.state.loadedOrderId = singleOrder.id;
      this.state.cart = JSON.parse(JSON.stringify(singleOrder.items || []));
      this.renderTicket();
      this.recalculateTotals();
      NotificationService.success(`Comanda cargada.`);
    }
  }

  handleClientSelection() {
    const orderId = this.state.loadedOrderId;
    if (!orderId) {
      this.clearCart();
      return;
    }

    const selectedOrder = this.state.orders.find(o => o.id === orderId);
    if (selectedOrder) {
      this.state.cart = JSON.parse(JSON.stringify(selectedOrder.items || []));
      this.renderTicket();
      this.recalculateTotals();
      NotificationService.success(`Cuenta de comensal cargada.`);
    }
  }

  renderCategoryTabs(element) {
    const root = element || this.layout.element;
    const bar = root?.querySelector('#pos-categories-bar');
    if (!bar) return;

    const currentSelected = this.state.selectedCategory;
    const tabsHTML = `
      <span class="pos-category-tab ${!currentSelected ? 'active' : ''}" data-category="">Todos</span>
      ${this.state.categories.map(cat => `
        <span class="pos-category-tab ${currentSelected === cat ? 'active' : ''}" data-category="${cat}">${cat}</span>
      `).join('')}
    `;
    bar.innerHTML = tabsHTML;
  }

  renderCatalog(element) {
    const root = element || this.layout.element;
    const grid = root?.querySelector('#pos-catalog-grid');
    if (!grid) return;

    const { searchQuery, selectedCategory, products } = this.state;

    const filtered = products.filter(p => {
      const matchesSearch = !searchQuery ||
        (p.name || '').toLowerCase().includes(searchQuery) ||
        (p.sku || '').toLowerCase().includes(searchQuery) ||
        (p.barcode || '').toLowerCase().includes(searchQuery);

      const matchesCategory = !selectedCategory || p.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<p class="text-xs text-secondary text-center py-5" style="grid-column: 1 / -1;">No se encontraron artículos.</p>`;
      return;
    }

    grid.innerHTML = filtered.map(p => {
      const stock = Number(p.stock || 0);
      const isLow = stock <= Number(p.minStock || 0);
      const formattedPrice = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(p.price || 0);

      return `
        <div class="pos-catalog-item hover-lift" data-id="${p.id}" title="${p.name}">
          ${p.image
            ? `<img src="${p.image}" class="pos-catalog-item-image" onerror="this.src=''" />`
            : `<div class="pos-catalog-item-image" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem; ${this.isBar ? 'color:#a855f7;' : ''}">🍹</div>`
          }
          <div class="pos-catalog-item-info">
            <span class="pos-catalog-item-name">${p.name}</span>
            <span class="pos-catalog-item-price">${formattedPrice}</span>
            <span class="pos-catalog-item-stock ${stock === 0 ? 'text-danger font-semibold' : (isLow ? 'text-warning' : '')}">
              Stock: ${stock} ${p.unit || 'uds'}
            </span>
          </div>
        </div>
      `;
    }).join('');
  }

  // ─── CART LOGIC ────────────────────────────────────────────────────────────

  addToCart(productId, qty = 1) {
    const product = this.state.products.find(p => p.id === productId);
    if (!product) return;

    // Check stock limit
    const existing = this.state.cart.find(item => item.productId === productId);
    const targetQty = (existing ? existing.qty : 0) + qty;

    if (targetQty > Number(product.stock || 0)) {
      NotificationService.warning(`Stock insuficiente para "${product.name}". Disponible: ${product.stock}`);
      return;
    }

    if (existing) {
      existing.qty = targetQty;
      existing.total = existing.qty * existing.price;
    } else {
      this.state.cart.push({
        productId,
        name: product.name,
        sku: product.sku || product.barcode || 'N/A',
        price: product.price || 0,
        qty,
        unit: product.unit || 'uds',
        total: qty * (product.price || 0)
      });
    }

    this.renderTicket();
    this.recalculateTotals();
    NotificationService.success(`Agregado al ticket: ${product.name}`);
  }

  updateItemQty(productId, change) {
    const item = this.state.cart.find(i => i.productId === productId);
    if (!item) return;

    const product = this.state.products.find(p => p.id === productId);
    if (!product) return;

    const newQty = item.qty + change;
    if (newQty <= 0) {
      this.removeFromCart(productId);
      return;
    }

    if (newQty > Number(product.stock || 0)) {
      NotificationService.warning(`Stock máximo alcanzado para "${product.name}".`);
      return;
    }

    item.qty = newQty;
    item.total = item.qty * item.price;

    this.renderTicket();
    this.recalculateTotals();
  }

  removeFromCart(productId) {
    this.state.cart = this.state.cart.filter(item => item.productId !== productId);
    this.renderTicket();
    this.recalculateTotals();
    NotificationService.info('Artículo quitado del ticket.');
  }

  clearCart() {
    this.state.cart = [];
    this.state.amountPaid = '';
    const cashInput = this.layout.$('#pos-cash-paid');
    if (cashInput) cashInput.value = '';

    this.renderTicket();
    this.recalculateTotals();
  }

  renderTicket() {
    const container = this.layout.$('#pos-ticket-container');
    if (!container) return;

    if (this.state.cart.length === 0) {
      container.innerHTML = `
        <div class="pos-ticket-empty">
          <div class="pos-ticket-empty-icon">🛒</div>
          <h4>El ticket está vacío</h4>
          <p class="text-xs">Carga una mesa ocupada, escanea un artículo o haz clic en los productos del catálogo.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.state.cart.map(item => `
      <div class="pos-ticket-item animate-slide-up">
        <div>
          <div class="pos-item-name" title="${item.name}">${item.name}</div>
          <span class="pos-item-sku">SKU: ${item.sku}</span>
        </div>
        <div class="pos-item-qty-control">
          <button class="pos-qty-btn" data-id="${item.productId}" data-change="-1">-</button>
          <span class="pos-qty-val">${item.qty}</span>
          <button class="pos-qty-btn" data-id="${item.productId}" data-change="1">+</button>
        </div>
        <div class="pos-item-price">
          $${Number(item.price).toFixed(2)}
        </div>
        <div class="pos-item-subtotal">
          $${Number(item.total).toFixed(2)}
        </div>
        <div>
          <button class="pos-item-delete" data-id="${item.productId}" title="Eliminar fila">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  recalculateTotals() {
    const subtotal = this.state.cart.reduce((sum, item) => sum + item.total, 0);
    const tax = subtotal * 0.15; // 15% IVA default Nicaragua
    const total = subtotal + tax;

    // Update totals text
    const subtotalEl = this.layout.$('#pos-summary-subtotal');
    if (subtotalEl) {
      subtotalEl.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(subtotal);
    }

    const taxEl = this.layout.$('#pos-summary-tax');
    if (taxEl) {
      taxEl.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(tax);
    }

    const totalEl = this.layout.$('#pos-summary-total');
    if (totalEl) {
      totalEl.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(total);
    }

    // Change calculator
    const changeEl = this.layout.$('#pos-cash-change');
    if (this.state.paymentMethod === 'EFECTIVO' && this.state.amountPaid) {
      const changeVal = Number(this.state.amountPaid) - total;
      this.state.change = Math.max(0, changeVal);
      if (changeEl) {
        changeEl.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(this.state.change);
        if (changeVal < 0) {
          changeEl.className = 'text-danger text-md';
        } else {
          changeEl.className = 'text-success text-md';
        }
      }
    } else {
      this.state.change = 0;
      if (changeEl) {
        changeEl.textContent = '$0.00';
        changeEl.className = 'text-success text-md';
      }
    }
  }

  // ─── BARCODE SCAN EVENT HANDLER ────────────────────────────────────────────

  async _handleBarcodeScan(code, format) {
    if (!code) return;

    // Search for product in local catalog
    const product = this.state.products.find(p =>
      (p.sku && p.sku.toLowerCase() === code.toLowerCase()) ||
      (p.barcode && p.barcode.toLowerCase() === code.toLowerCase())
    );

    // Register code in permanent registry
    try {
      await BarcodeRegistryService.registerCode(code, {
        productId: product ? product.id : null,
        productName: product ? product.name : null,
        associatedWith: product ? 'producto' : null,
        format
      });
    } catch (e) {
      console.warn('[POSView] Failed to register code in Firebase:', e.message);
    }

    if (product) {
      this.addToCart(product.id, 1);
    } else {
      NotificationService.warning(`Código "${code}" no registrado en tu catálogo.`);
    }

    // Clear field and refocus
    setTimeout(() => {
      if (this.scanInputComponent) {
        this.scanInputComponent.setValue('');
        this.scanInputComponent.focus();
      }
    }, 600);
  }

  // ─── CHECKOUT TRANSACTION ──────────────────────────────────────────────────

  async submitCheckout() {
    if (this.state.cart.length === 0) {
      NotificationService.error('El ticket de venta está vacío.');
      return;
    }

    const subtotal = this.state.cart.reduce((sum, item) => sum + item.total, 0);
    const tax = subtotal * 0.15;
    const total = subtotal + tax;

    // Cash payment validation
    if (this.state.paymentMethod === 'EFECTIVO' && this.state.amountPaid) {
      if (Number(this.state.amountPaid) < total) {
        NotificationService.error('El efectivo recibido es menor al total a pagar.');
        return;
      }
    }

    const checkoutBtn = this.layout.$('#pos-complete-checkout');
    if (checkoutBtn) {
      checkoutBtn.disabled = true;
      checkoutBtn.textContent = 'Procesando...';
    }

    try {
      // 1. Save sale order in Firebase RTDB
      const salePayload = {
        items: this.state.cart,
        subtotal,
        tax,
        total,
        paymentMethod: this.state.paymentMethod,
        amountPaid: this.state.paymentMethod === 'EFECTIVO' ? Number(this.state.amountPaid || total) : total,
        change: this.state.change,
        sellerName: this.sellerName,
        date: Date.now(),
        createdAt: Date.now(),
        createdAtLocal: TimeService.timestamp()
      };

      await FirestoreService.create('ventas', salePayload);

      // 2. Decrement product stock levels
      for (const item of this.state.cart) {
        const prod = this.state.products.find(p => p.id === item.productId);
        if (prod) {
          const newStock = Math.max(0, Number(prod.stock || 0) - Number(item.qty));
          await FirestoreService.update('productos', item.productId, { stock: newStock });
        }
      }

      // 3. If a table order was loaded, update the order status and table node
      const loadedOrderId = this.state.loadedOrderId;
      const loadedTableId = this.state.loadedTableId;

      if (loadedOrderId && loadedTableId) {
        // Complete the order
        await FirestoreService.update('orders', loadedOrderId, { status: 'COMPLETED', completedAt: Date.now() });

        // Retrieve remaining active orders for this table
        const remaining = this.state.orders.filter(o => 
          o.tableId === loadedTableId && 
          o.id !== loadedOrderId && 
          o.status !== 'COMPLETED' && 
          o.status !== 'CANCELADA'
        );

        if (remaining.length === 0) {
          // Free table completely
          await FirestoreService.update('tables', loadedTableId, {
            status: 'FREE',
            activeOrderId: null,
            activeOrderIds: null,
            waiterName: null,
            orderTotal: null
          });
          NotificationService.success('Venta completada. Mesa liberada.');
        } else {
          // Table remains occupied with remaining orders
          const newTableTotal = remaining.reduce((sum, o) => sum + Number(o.total || 0), 0);
          const remainingIds = remaining.map(o => o.id);

          await FirestoreService.update('tables', loadedTableId, {
            activeOrderId: remainingIds[0],
            activeOrderIds: remainingIds,
            orderTotal: newTableTotal
          });
          NotificationService.success('Venta completada. Cuenta de comensal liquidada.');
        }
      } else {
        NotificationService.success('Venta directa completada exitosamente.');
      }

      // Reset loaded states
      this.state.loadedTableId = '';
      this.state.loadedOrderId = '';
      const tableSelector = this.layout.$('#pos-table-selector');
      if (tableSelector) tableSelector.value = '';
      const clientGroup = this.layout.$('#pos-client-selector-group');
      if (clientGroup) clientGroup.style.display = 'none';

      this.clearCart();
    } catch (err) {
      console.error('[POSView] Error processing checkout:', err);
      alert(`Error al registrar la venta: ${err.message}`);
    } finally {
      if (checkoutBtn) {
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = 'Completar Venta';
      }
    }
  }

  unmount() {
    if (this.scanInputComponent) {
      this.scanInputComponent.unmount();
      this.scanInputComponent = null;
    }
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.layout.unmount();
    super.unmount();
  }
}