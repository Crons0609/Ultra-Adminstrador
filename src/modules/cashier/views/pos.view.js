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
import { WhatsAppService } from '../../../services/whatsapp.service.js';
import { TelegramService } from '../../../services/telegram.service.js';

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
        <style>
          .pos-grid {
            display: grid;
            grid-template-columns: minmax(350px, 420px) 1fr;
            gap: 12px;
            align-items: start;
          }
          @media (max-width: 1024px) {
            .pos-grid { grid-template-columns: 1fr; }
          }
          .pos-billing-panel {
            background: var(--color-bg-secondary);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            padding: 12px;
            box-shadow: var(--shadow-sm);
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .pos-bill-request-card {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: rgba(251, 146, 60, 0.08);
            border: 1px solid rgba(251, 146, 60, 0.25);
            border-radius: 6px;
            padding: 6px 10px;
            gap: 6px;
          }
          .pos-ticket-header {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            padding: 6px 10px;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .pos-ticket-container {
            min-height: 90px;
            max-height: 140px;
            overflow-y: auto;
            border: 1px solid var(--color-border);
            border-radius: 6px;
            background: rgba(0,0,0,0.18);
            padding: 4px;
          }
          .pos-ticket-item {
            display: grid;
            grid-template-columns: 1fr auto auto auto;
            align-items: center;
            gap: 8px;
            padding: 4px 6px;
            border-bottom: 1px dotted var(--color-border);
            font-size: 0.78rem;
          }
          .pos-ticket-item:last-child { border-bottom: none; }
          .pos-qty-btn {
            width: 20px; height: 20px; border-radius: 4px;
            border: 1px solid var(--color-border);
            background: rgba(255,255,255,0.06);
            color: var(--color-text-primary);
            font-weight: bold; cursor: pointer; display: inline-flex;
            align-items: center; justify-content: center;
            font-size: 0.75rem;
          }
          .pos-qty-btn:hover { background: rgba(255,255,255,0.15); }
          .pos-item-delete {
            background: none; border: none; color: var(--color-danger);
            cursor: pointer; padding: 2px 4px; border-radius: 4px; opacity: 0.8; font-size: 0.75rem;
          }
          .pos-item-delete:hover { opacity: 1; background: rgba(239,68,68,0.1); }
          
          /* Quick Cash Buttons */
          .quick-cash-row {
            display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;
          }
          .quick-cash-btn {
            background: rgba(255,255,255,0.05);
            border: 1px solid var(--color-border);
            border-radius: 4px; padding: 2px 8px;
            font-size: 0.7rem; font-weight: 700;
            color: var(--color-text-primary);
            cursor: pointer; transition: all 0.15s;
          }
          .quick-cash-btn:hover {
            background: var(--color-accent); color: #fff; border-color: var(--color-accent);
          }
          .pos-catalog-panel {
            background: var(--color-bg-secondary);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            padding: 12px;
            box-shadow: var(--shadow-sm);
            max-height: calc(100vh - 120px);
            display: flex;
            flex-direction: column;
          }
          .pos-catalog-grid {
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: calc(100vh - 200px);
            overflow-y: auto;
            padding-right: 4px;
          }
          .pos-catalog-item {
            background: rgba(255,255,255,0.03);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            padding: 8px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            transition: all 0.15s ease;
            user-select: none;
            min-height: 44px;
            flex-shrink: 0;
            width: 100%;
            box-sizing: border-box;
          }
          .pos-catalog-item:hover {
            border-color: var(--color-accent);
            background: rgba(255,255,255,0.07);
          }
          .pos-catalog-item-main {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1 1 auto;
            min-width: 0;
          }
          .pos-catalog-item-title {
            font-size: 0.85rem;
            font-weight: 700;
            color: #ffffff;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            display: block;
            min-width: 0;
            flex: 1;
          }
          .pos-catalog-item-side {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-shrink: 0;
          }
          .pos-catalog-item-add {
            background: rgba(16, 185, 129, 0.12);
            color: #10b981;
            border: 1px solid rgba(16, 185, 129, 0.25);
            border-radius: 4px;
            padding: 3px 10px;
            font-size: 0.75rem;
            font-weight: 800;
            transition: all 0.15s;
          }
          .pos-catalog-item:hover .pos-catalog-item-add {
            background: #10b981;
            color: #000;
          }
          .pos-categories-bar {
            display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px; margin-bottom: 8px;
            scrollbar-width: thin;
          }
          .pos-category-tab {
            white-space: nowrap; padding: 4px 10px; border-radius: 14px;
            background: rgba(255,255,255,0.04); border: 1px solid var(--color-border);
            font-size: 0.72rem; font-weight: 600; color: var(--color-text-secondary);
            cursor: pointer; transition: all 0.15s;
          }
          .pos-category-tab:hover { background: rgba(255,255,255,0.08); color: var(--color-text-primary); }
          .pos-category-tab.active {
            background: var(--color-accent); color: #fff; border-color: var(--color-accent);
          }
        </style>

        <div class="pos-grid animate-fade-in">
          <!-- Left Panel: Ticket & Checkout -->
          <div class="pos-billing-panel">
            
            <!-- Cover & Capacity Tracker (Only for Bars/Clubs) -->
            <div id="pos-aforo-panel" style="display:${this.isBar ? 'block' : 'none'}; background: rgba(168, 85, 247, 0.08); border: 1px solid rgba(168, 85, 247, 0.2); border-radius: 6px; padding: 6px 10px; margin-bottom: 4px;">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="text-xs font-bold" style="color:#a855f7;">🕺 Aforo: <strong id="pos-aforo-count">0 / 300</strong></span>
                <button class="btn btn-xs btn-primary font-semibold" id="pos-btn-cover" style="background:#a855f7; border:none; padding:2px 8px; border-radius:4px; cursor:pointer;">+ Cover ($100)</button>
              </div>
              <div class="kpi-progress-bar" style="background:rgba(255,255,255,0.06); height:4px;">
                <div id="pos-aforo-bar" class="kpi-progress-fill" style="width: 0%; background:#a855f7; transition:width 0.4s;"></div>
              </div>
            </div>

            <!-- Panel de Solicitudes de Cuenta Pendientes -->
            <div id="pos-bill-requests-panel" style="display:none; background: rgba(251,146,60,0.08); border: 1px solid rgba(251,146,60,0.3); border-radius: 6px; padding: 8px; margin-bottom: 4px;">
              <div class="d-flex align-items-center gap-2 mb-1">
                <span style="font-size:0.9rem;">🧾</span>
                <span class="font-bold" style="font-size:0.78rem; color:#fb923c;">Solicitudes de Cuenta</span>
                <span id="pos-bill-requests-count" class="badge animate-pulse" style="background:#fb923c; color:#000; font-weight:800; font-size:0.65rem; margin-left:auto; padding:1px 6px;">0</span>
              </div>
              <div id="pos-bill-requests-list" style="display:flex; flex-direction:column; gap:4px;"></div>
            </div>

            <!-- Selector de Mesa / Comanda Activa -->
            <div style="display:flex; flex-direction:column; gap: 4px;">
              <div>
                <label class="form-label font-semibold" style="font-size: 0.75rem; margin-bottom: 2px; display: block;">📥 Cargar ${this.isBar ? 'VIP / Área / Barra' : 'Mesa / Pedido Activo'}</label>
                <select id="pos-table-selector" class="input input-sm w-full" style="height:32px; font-size:0.8rem; font-weight:600;">
                  <option value="">-- Venta Directa (Sin Mesa) --</option>
                </select>
              </div>

              <!-- Client Selector for Separated Bills -->
              <div id="pos-client-selector-group" style="display:none; background:rgba(124,117,255,0.06); border:1px solid rgba(124,117,255,0.2); border-radius:6px; padding:6px 8px;">
                <label class="form-label font-semibold" style="font-size:0.72rem; margin-bottom: 2px; display: block; color:var(--color-accent);">👤 Cliente (Cuenta Separada):</label>
                <select id="pos-client-selector" class="input input-sm w-full" style="height:30px; font-size:0.78rem; font-weight:700;">
                  <option value="">-- Seleccionar Cliente --</option>
                </select>
              </div>

              <!-- Barcode scanner input -->
              <div>
                <label class="form-label font-semibold" style="font-size: 0.72rem; display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
                  <span>⚡</span> Código de Barras
                </label>
                <div id="pos-scan-container"></div>
              </div>
            </div>

            <!-- Header Informativo del Ticket Activo -->
            <div class="pos-ticket-header" id="pos-ticket-header">
              <span class="font-bold text-xs" style="color:var(--color-text-secondary);" id="pos-ticket-title">🛒 Venta Directa</span>
              <span class="text-xs text-secondary" id="pos-ticket-items-count">0 ítems</span>
            </div>

            <!-- Cart Items List -->
            <div class="pos-ticket-container" id="pos-ticket-container">
              <div class="pos-ticket-empty" style="text-align:center; padding:12px 0;">
                <div class="pos-ticket-empty-icon" style="font-size:1.6rem; margin-bottom:2px;">🛒</div>
                <h4 class="font-semibold text-xs">El ticket está vacío</h4>
                <p class="text-xs text-secondary mt-1" style="font-size:0.7rem;">Carga una mesa, escanea o haz clic en el catálogo.</p>
              </div>
            </div>

            <!-- Summary & Payment -->
            <div class="pos-billing-summary" style="background:rgba(0,0,0,0.15); border:1px solid var(--color-border); border-radius:6px; padding:8px 10px;">
              <div class="pos-calc-row" style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:2px;">
                <span class="text-secondary">Subtotal: <span id="pos-summary-subtotal" class="font-semibold" style="color:var(--color-text-primary);">$0.00</span></span>
                <span class="text-secondary">IVA (15%): <span id="pos-summary-tax" class="font-semibold" style="color:var(--color-text-primary);">$0.00</span></span>
              </div>
              <div class="pos-calc-row" style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--color-border); padding-top:4px; margin-bottom:6px;">
                <span class="font-bold text-xs">Total a Pagar:</span>
                <span class="pos-calc-total" id="pos-summary-total" style="font-size:1.2rem; font-weight:800; color:#10b981;">$0.00</span>
              </div>

              <!-- Payment Method Selection -->
              <div>
                <span class="form-label font-semibold" style="font-size: 0.7rem;">Método de Pago:</span>
                <div class="pos-payment-selector" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:4px; margin-top:2px;">
                  <button type="button" class="pos-payment-btn active" data-method="EFECTIVO" style="padding:4px; font-size:0.72rem; font-weight:700; border-radius:4px;">💵 Efectivo</button>
                  <button type="button" class="pos-payment-btn" data-method="TARJETA" style="padding:4px; font-size:0.72rem; font-weight:700; border-radius:4px;">💳 Tarjeta</button>
                  <button type="button" class="pos-payment-btn" data-method="TRANSFERENCIA" style="padding:4px; font-size:0.72rem; font-weight:700; border-radius:4px;">🏦 Transf.</button>
                </div>
              </div>

              <!-- Cash payment input & change calculator -->
              <div id="pos-cash-details" class="form-group" style="margin-top:6px; background:rgba(255,255,255,0.02); border:1px solid var(--color-border); border-radius:6px; padding:6px;">
                <div style="display: flex; gap: var(--space-2); align-items: center;">
                  <div style="flex: 1;">
                    <label class="form-label font-semibold" style="font-size: 0.68rem; margin-bottom: 1px; display:block;" for="pos-cash-paid">Efectivo Recibido ($):</label>
                    <input type="number" id="pos-cash-paid" class="input input-sm" placeholder="0.00" min="0" step="any" style="width:100%; height:28px; font-weight:800; font-size:0.85rem; color:#10b981; padding:2px 6px;" />
                  </div>
                  <div style="flex: 1; text-align: right;">
                    <span class="form-label font-semibold" style="font-size: 0.68rem; display: block; margin-bottom: 1px;">Cambio / Vuelto:</span>
                    <strong class="text-success" id="pos-cash-change" style="font-size:1rem; font-weight:800;">$0.00</strong>
                  </div>
                </div>

                <!-- Billetes Rápidos -->
                <div class="quick-cash-row" id="pos-quick-cash-row">
                  <button type="button" class="quick-cash-btn" data-val="exact">Exacto</button>
                  <button type="button" class="quick-cash-btn" data-val="50">+$50</button>
                  <button type="button" class="quick-cash-btn" data-val="100">+$100</button>
                  <button type="button" class="quick-cash-btn" data-val="200">+$200</button>
                  <button type="button" class="quick-cash-btn" data-val="500">+$500</button>
                </div>
              </div>

              <!-- Checkout Actions -->
              <div style="display: flex; gap: 6px; margin-top: 6px;">
                <button type="button" class="btn btn-secondary btn-sm" id="pos-clear-cart" style="flex: 1; height:36px; font-weight:600; font-size:0.75rem;">Vaciar</button>
                <button type="button" class="btn btn-primary btn-sm pos-checkout-btn" id="pos-complete-checkout" style="flex: 2; height:36px; font-weight:800; font-size:0.85rem; background:#10b981; border:none; ${this.isBar ? 'background:#a855f7;' : ''}">
                  💳 Completar y Cobrar
                </button>
              </div>
            </div>
          </div>

          <!-- Right Panel: Catalog selection -->
          <div class="pos-catalog-panel">
            <!-- Search toolbar -->
            <div class="pos-catalog-toolbar" style="margin-bottom:6px;">
              <div class="inv-search" style="margin: 0;">
                <input type="text" id="pos-catalog-search" class="input input-md" placeholder="🔍 Buscar producto..." style="height:34px; font-size:0.8rem;" />
              </div>
            </div>

            <!-- Categories Tabs -->
            <div class="pos-categories-bar" id="pos-categories-bar">
              <span class="pos-category-tab active" data-category="">Todos</span>
            </div>

            <!-- Products Grid -->
            <div class="pos-catalog-grid" id="pos-catalog-grid">
              <p class="text-xs text-secondary text-center py-5" style="grid-column: 1 / -1;">Cargando catálogo...</p>
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

    // Billetes rápidos handler
    const quickCashRow = root.querySelector('#pos-quick-cash-row');
    if (quickCashRow) {
      quickCashRow.addEventListener('click', (e) => {
        const btn = e.target.closest('.quick-cash-btn');
        if (!btn) return;
        const val = btn.getAttribute('data-val');
        const cashInput = root.querySelector('#pos-cash-paid');
        const subtotal = this.state.cart.reduce((sum, item) => sum + item.total, 0);
        const total = subtotal * 1.15;

        if (val === 'exact') {
          this.state.amountPaid = total > 0 ? total.toFixed(2) : '0';
        } else {
          const num = Number(val);
          const current = Number(this.state.amountPaid || 0);
          this.state.amountPaid = (current + num).toFixed(2);
        }

        if (cashInput) cashInput.value = this.state.amountPaid;
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

    list.innerHTML = billOrders.map(o => {
      const tableName = o.tableName || `Mesa ${o.tableId.replace(/^mesa-/i, '')}`;
      const clientInfo = o.clientName ? ` · ${o.clientName}` : (o.accountType === 'SEPARADO' ? ` · Comensal` : '');
      const orderLabel = `${tableName}${clientInfo}`;

      return `
        <div class="pos-bill-request-card">
          <div style="display:flex; flex-direction:column;">
            <span class="font-bold" style="color:#fb923c; font-size:0.82rem;">${orderLabel}</span>
            <span class="text-xs text-secondary">${o.items ? o.items.length : 0} artículos</span>
          </div>
          <span class="font-bold text-sm" style="color:#10b981;">$${Number(o.total || 0).toFixed(2)}</span>
          <button class="btn btn-xs btn-primary pos-btn-load-bill" 
                  data-table-id="${o.tableId}" 
                  data-order-id="${o.id}"
                  style="background:#fb923c; color:#000; border:none; padding:4px 12px; border-radius:6px; cursor:pointer; font-weight:800; font-size:0.75rem;">
            Cargar 📥
          </button>
        </div>
      `;
    }).join('');

    // Listener para cargar directamente la comanda/cliente seleccionado
    list.querySelectorAll('.pos-btn-load-bill').forEach(btn => {
      btn.addEventListener('click', () => {
        const tableId = btn.getAttribute('data-table-id');
        const orderId = btn.getAttribute('data-order-id');
        this.loadSpecificOrder(tableId, orderId);
      });
    });
  }

  loadSpecificOrder(tableId, orderId) {
    const root = this.layout.element;
    const tableSelector = root?.querySelector('#pos-table-selector');
    const clientSelector = root?.querySelector('#pos-client-selector');
    const clientGroup = root?.querySelector('#pos-client-selector-group');

    this.state.loadedTableId = tableId;
    if (tableSelector) tableSelector.value = tableId;

    const targetOrder = this.state.orders.find(o => o.id === orderId);
    if (!targetOrder) return;

    this.state.loadedOrderId = orderId;
    this.state.cart = JSON.parse(JSON.stringify(targetOrder.items || []));

    // Configurar selector de cliente si existen múltiples comandas
    const tableOrders = this.state.orders.filter(o => o.tableId === tableId && o.status !== 'COMPLETED' && o.status !== 'CANCELADA');
    if (tableOrders.length > 1 || targetOrder.accountType === 'SEPARADO') {
      if (clientGroup) clientGroup.style.display = 'block';
      if (clientSelector) {
        clientSelector.innerHTML = `
          <option value="">-- Seleccionar Cliente --</option>
          ${tableOrders.map(o => {
            const label = o.clientName ? `${o.clientName} ($${Number(o.total || 0).toFixed(2)})` : `Comanda #${o.id.slice(-4).toUpperCase()} ($${Number(o.total || 0).toFixed(2)})`;
            return `<option value="${o.id}" ${o.id === orderId ? 'selected' : ''}>${label}</option>`;
          }).join('')}
        `;
        clientSelector.value = orderId;
      }
    } else {
      if (clientGroup) clientGroup.style.display = 'none';
    }

    this.renderTicket();
    this.recalculateTotals();
    const nameInfo = targetOrder.clientName ? `${targetOrder.tableName || `Mesa ${tableId}`} (${targetOrder.clientName})` : (targetOrder.tableName || `Mesa ${tableId}`);
    NotificationService.success(`Cuenta de ${nameInfo} cargada.`);
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

    const isBar = this.isBar;
    grid.innerHTML = filtered.map(p => {
      const stock = Number(p.stock || 0);
      const isLow = stock <= Number(p.minStock || 0);
      const formattedPrice = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(p.price || 0);
      const stockColor = stock === 0 ? '#ef4444' : (isLow ? '#f59e0b' : '#94a3b8');
      const emoji = isBar ? '🍹' : '🍽️';
      const productName = p.name || p.nombre || p.title || 'Producto';

      const iconHtml = p.image
        ? `<img src="${p.image}" style="width:26px;height:26px;object-fit:cover;border-radius:4px;flex-shrink:0;" onerror="this.onerror=null;this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🍽️</text></svg>';" />`
        : `<span style="font-size:1.1rem;line-height:1;flex-shrink:0;">${emoji}</span>`;

      return `
        <div class="pos-catalog-item" data-id="${p.id}" title="Agregar ${productName}">
          <div class="pos-catalog-item-main">
            ${iconHtml}
            <span class="pos-catalog-item-title">${productName}</span>
          </div>
          <div class="pos-catalog-item-side">
            <span style="font-size:0.72rem;font-weight:600;color:${stockColor};">${stock}&nbsp;${p.unit || 'uds'}</span>
            <span style="font-size:0.85rem;font-weight:800;color:#10b981;">${formattedPrice}</span>
            <span class="pos-catalog-item-add">+ Agregar</span>
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
    const root = this.layout.element;
    const container = root?.querySelector('#pos-ticket-container');
    const titleEl = root?.querySelector('#pos-ticket-title');
    const countEl = root?.querySelector('#pos-ticket-items-count');

    const totalQty = this.state.cart.reduce((sum, i) => sum + (i.qty || 1), 0);
    if (countEl) countEl.textContent = `${totalQty} artículos`;

    // Actualizar encabezado del ticket
    if (titleEl) {
      if (this.state.loadedOrderId) {
        const order = this.state.orders.find(o => o.id === this.state.loadedOrderId);
        const tableName = order?.tableName || `Mesa ${this.state.loadedTableId.replace(/^mesa-/i, '')}`;
        const client = order?.clientName ? ` · Cliente: ${order.clientName}` : '';
        titleEl.innerHTML = `<span style="color:#fb923c; font-weight:800;">🧾 ${tableName}${client}</span>`;
      } else if (this.state.loadedTableId) {
        const table = this.state.tables.find(t => t.id === this.state.loadedTableId);
        titleEl.innerHTML = `<span style="color:#a855f7; font-weight:800;">📌 ${table?.name || `Mesa ${this.state.loadedTableId}`}</span>`;
      } else {
        titleEl.innerHTML = `<span class="font-bold">🛒 Venta Directa (Mostrador)</span>`;
      }
    }

    if (!container) return;

    if (this.state.cart.length === 0) {
      container.innerHTML = `
        <div class="pos-ticket-empty" style="text-center py-6">
          <div class="pos-ticket-empty-icon" style="font-size:2.2rem; margin-bottom:6px;">🛒</div>
          <h4 class="font-semibold text-sm">El ticket está vacío</h4>
          <p class="text-xs text-secondary mt-1">Carga una mesa ocupada, escanea un artículo o haz clic en los productos del catálogo.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.state.cart.map(item => `
      <div class="pos-ticket-item animate-slide-up">
        <div>
          <div class="pos-item-name font-bold" title="${item.name}">${item.name}</div>
          <span class="text-xs text-secondary" style="font-size:0.7rem;">$${Number(item.price).toFixed(2)} c/u</span>
        </div>
        <div class="d-flex align-items-center gap-1">
          <button class="pos-qty-btn" data-id="${item.productId}" data-change="-1">-</button>
          <span class="font-bold text-xs" style="min-width:18px; text-align:center;">${item.qty}</span>
          <button class="pos-qty-btn" data-id="${item.productId}" data-change="1">+</button>
        </div>
        <div class="font-bold text-xs text-right" style="min-width:55px; color:#10b981;">
          $${Number(item.total).toFixed(2)}
        </div>
        <div>
          <button class="pos-item-delete" data-id="${item.productId}" title="Quitar artículo">🗑️</button>
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

      // 2. Decrement product stock levels + check low stock alerts
      for (const item of this.state.cart) {
        const prod = this.state.products.find(p => p.id === item.productId);
        if (prod) {
          const newStock = Math.max(0, Number(prod.stock || 0) - Number(item.qty));
          await FirestoreService.update('productos', item.productId, { stock: newStock });

          // 🔔 WhatsApp: alert if stock drops below threshold after sale
          const threshold = Number(prod.lowStockThreshold || prod.minStock || 5);
          if (newStock <= threshold && this.companyId) {
            WhatsAppService.sendLowStockAlert(this.companyId, prod.name, newStock, threshold).catch(() => {});
            TelegramService.sendLowStockAlert(this.companyId, prod.name, newStock, threshold).catch(() => {});
          }
        }
      }

      // 🔔 WhatsApp: send order confirmation to client if phone is on record
      const clientPhone = this.state.selectedClientPhone || null;
      if (clientPhone && this.companyId) {
        WhatsAppService.sendOrderConfirmation(this.companyId, clientPhone, {
          clientName: this.state.selectedClientName || 'Cliente',
          total,
          paymentMethod: this.state.paymentMethod
        }).catch(() => {});
      }

      // 🔔 Telegram: send order confirmation if client has telegramChatId on record
      const clientChatId = this.state.selectedClientTelegramChatId || null;
      if (clientChatId && this.companyId) {
        TelegramService.sendOrderConfirmation(this.companyId, clientChatId, {
          clientName: this.state.selectedClientName || 'Cliente',
          total,
          paymentMethod: this.state.paymentMethod
        }).catch(() => {});
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