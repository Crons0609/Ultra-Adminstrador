import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';

export class TablesView extends Component {
  constructor(params = {}) {
    super(params);
    const state = GlobalStore.getState();
    const currentUser = state.currentUser || {};
    this.companyId = currentUser.companyId || '';
    this.waiterName = currentUser.displayName || 'Mesero';

    this.state = {
      tables: [],
      products: [],
      orders: [],
      activeOrder: null,
      selectedTable: null,
      cart: [],
      loading: true
    };

    this.layout = new PageLayout({
      title: 'Gestión de Mesas y Comandas',
      subtitle: 'Toma órdenes, confirma pedidos de clientes y controla el estado del servicio en tiempo real.',
      actionHTML: `
        <span class="badge animate-pulse" style="background:#34d39922; color:#34d399; border:1px solid #34d39944; padding:4px 10px;">
          ● Servidor Conectado
        </span>
      `,
      contentHTML: `
        <style>
          .waiter-tables-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
            gap: var(--space-4);
            margin-bottom: var(--space-6);
          }
          .table-card {
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            background: var(--color-bg-secondary);
            padding: var(--space-5);
            text-align: center;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
            position: relative;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 150px;
          }
          .table-card:hover {
            transform: translateY(-2px);
            box-shadow: var(--shadow-md);
          }
          .table-card.status-free { border-top: 4px solid var(--color-success); }
          .table-card.status-busy { border-top: 4px solid var(--color-danger); }
          .table-card.status-bill { border-top: 4px solid var(--color-warning); }
          
          .table-number {
            font-size: 1.8rem;
            font-weight: 700;
            margin-bottom: var(--space-1);
          }
          .table-status-badge {
            display: inline-block;
            padding: 3px 10px;
            font-size: 0.75rem;
            font-weight: 600;
            border-radius: 999px;
            margin-bottom: var(--space-2);
          }
          .status-free .table-status-badge { background: var(--color-success-light); color: var(--color-success); }
          .status-busy .table-status-badge { background: var(--color-danger-light); color: var(--color-danger); }
          .status-bill .table-status-badge { background: var(--color-warning-light); color: var(--color-warning); }

          .table-info-row {
            font-size: 0.8rem;
            color: var(--color-text-secondary);
            margin-bottom: 4px;
          }

          .pending-badge {
            font-size: 0.72rem;
            background: #ef444422;
            color: #ef4444;
            border: 1px solid #ef444444;
            padding: 2px 8px;
            border-radius: 999px;
            font-weight: 600;
            margin-top: 6px;
            animation: pulse-red 1.8s infinite;
          }

          @keyframes pulse-red {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); box-shadow: 0 0 8px #ef444433; }
            100% { transform: scale(1); }
          }
          
          /* Order Builder Modal Styles */
          .order-builder-layout {
            display: grid;
            grid-template-columns: 1.2fr 1fr;
            gap: var(--space-4);
            max-height: 70vh;
          }
          .product-item-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: var(--space-2);
            border-bottom: 1px solid var(--color-border);
            cursor: pointer;
          }
          .product-item-row:hover {
            background: var(--color-bg-tertiary);
          }
          .cart-item-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: var(--space-2) 0;
            border-bottom: 1px dotted var(--color-border);
          }

          /* Orders selection list style */
          .order-selection-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: var(--space-4);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            margin-bottom: var(--space-2);
            background: var(--color-bg-secondary);
            transition: border-color 0.2s;
          }
          .order-selection-item:hover {
            border-color: var(--color-accent);
          }
        </style>
        
        <div id="waiter-tables-container" class="waiter-tables-grid animate-fade-in">
          <p class="text-center w-full py-10 text-secondary">Cargando mesas del establecimiento...</p>
        </div>
      `
    });

    this.listeners = [];
  }

  mount() {
    const element = this.layout.mount();
    this.subscribeToData(element);
    this.bindEvents(element);
    return element;
  }

  subscribeToData(element) {
    try {
      // 1. Subscribe to tables
      const tablesListener = FirestoreService.listenToTenant('tables', async (tables) => {
        this.state.rawTables = tables || [];
        this.mergeAndRenderTables(element);
      });
      this.listeners.push(tablesListener);

      // 2. Subscribe to qr_codes to pull all custom tables/zones created by owner
      const qrListener = FirestoreService.listenToTenant('qr_codes', (qrs) => {
        this.state.rawQRs = qrs || [];
        this.mergeAndRenderTables(element);
      });
      this.listeners.push(qrListener);

      // 3. Subscribe to products for taking orders
      const productsListener = FirestoreService.listenToTenant('productos', (products) => {
        this.state.products = products || [];
      });
      this.listeners.push(productsListener);

      // 4. Subscribe to orders to show client order notifications
      const ordersListener = FirestoreService.listenToTenant('orders', (orders) => {
        this.state.orders = orders || [];
        this.renderTables(element);
      });
      this.listeners.push(ordersListener);

    } catch (e) {
      console.error('[TablesView] DB Subscription error:', e);
    }
  }

  mergeAndRenderTables(element) {
    const rawTables = this.state.rawTables || [];
    const rawQRs = this.state.rawQRs || [];

    // Map existing tables
    const tableMap = new Map();
    rawTables.forEach(t => tableMap.set(t.id, t));

    // Merge any QRs (custom tables/zones created by owner) that aren't in tables yet
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

    let merged = Array.from(tableMap.values());

    // If still completely empty, initialize default 10 tables
    if (merged.length === 0) {
      console.log('[TablesView] No tables found, initializing default 10 tables...');
      const defaults = [];
      for (let i = 1; i <= 10; i++) {
        const tableId = `mesa-${i}`;
        const tableObj = { id: tableId, name: `Mesa ${i}`, status: 'FREE', activeOrderId: null };
        FirestoreService.create('tables', tableObj, tableId);
        defaults.push(tableObj);
      }
      merged = defaults;
    }

    // Sort numerically/alphabetically by table ID or name
    this.state.tables = merged.sort((a, b) => {
      const numA = parseInt((a.name || a.id).replace(/\D/g, '')) || 999;
      const numB = parseInt((b.name || b.id).replace(/\D/g, '')) || 999;
      if (numA !== numB) return numA - numB;
      return (a.name || a.id).localeCompare(b.name || b.id);
    });

    this.renderTables(element);
  }

  bindEvents(element) {
    const container = element.querySelector('#waiter-tables-container');
    if (container) {
      container.addEventListener('click', (e) => {
        const card = e.target.closest('.table-card');
        if (card) {
          const tableId = card.getAttribute('data-id');
          const table = this.state.tables.find(t => t.id === tableId);
          if (table) {
            this.handleTableClick(table);
          }
        }
      });
    }
  }

  renderTables(element) {
    const container = element.querySelector('#waiter-tables-container');
    if (!container) return;

    if (this.state.tables.length === 0) {
      container.innerHTML = `<p class="text-center w-full py-10 text-secondary">Cargando mesas...</p>`;
      return;
    }

    container.innerHTML = this.state.tables.map(t => {
      // Find orders belonging to this table
      const tableOrders = this.state.orders.filter(o => o.tableId === t.id && o.status !== 'COMPLETED' && o.status !== 'CANCELADA');
      const pendingCount = tableOrders.filter(o => o.status === 'PENDIENTE_VERIFICACION').length;
      const billCount = tableOrders.filter(o => o.status === 'ESPERANDO_PAGO').length;

      // Determine visual status
      let finalStatus = t.status;
      if (pendingCount > 0 && t.status === 'FREE') {
        finalStatus = 'BUSY'; // Show occupied color if there's a pending client order
      } else if (billCount > 0) {
        finalStatus = 'BILL';
      }

      const statusClass = finalStatus === 'FREE' ? 'status-free' : (finalStatus === 'BUSY' ? 'status-busy' : 'status-bill');
      const statusLabel = finalStatus === 'FREE' ? 'Disponible' : (finalStatus === 'BUSY' ? 'Ocupada' : 'Pidió Cuenta');
      
      const totalCost = tableOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

      return `
        <div class="table-card ${statusClass}" data-id="${t.id}">
          <div class="table-number">${t.name}</div>
          <span class="table-status-badge">${statusLabel}</span>
          ${t.waiterName ? `<div class="table-info-row">👤 Mesero: <strong>${t.waiterName}</strong></div>` : ''}
          ${totalCost > 0 ? `<div class="table-info-row">💰 Total: <strong>$${totalCost.toFixed(2)}</strong></div>` : ''}
          ${pendingCount > 0 ? `<div class="pending-badge">📥 ${pendingCount} Pedido Nuevo</div>` : ''}
        </div>
      `;
    }).join('');
  }

  async handleTableClick(table) {
    this.state.selectedTable = table;
    this.state.cart = [];

    // Fetch active/pending orders for this table
    const tableOrders = this.state.orders.filter(o => o.tableId === table.id && o.status !== 'COMPLETED' && o.status !== 'CANCELADA');

    if (tableOrders.length === 0) {
      // Free table with no orders
      this.openTakeOrderModal();
    } else {
      // If there are multiple orders, or at least one pending order, show the orders selector modal
      this.openOrdersSelectorModal(tableOrders);
    }
  }

  openOrdersSelectorModal(tableOrders) {
    const table = this.state.selectedTable;

    const bodyHTML = `
      <div class="d-flex flex-column gap-3">
        <h4 class="font-semibold mb-2">Comandas activas y pendientes de la ${table.name}</h4>
        <div style="max-height: 50vh; overflow-y: auto;" id="orders-selector-list">
          ${tableOrders.map(o => {
            const isPending = o.status === 'PENDIENTE_VERIFICACION';
            const badgeCls = isPending ? 'badge-danger animate-pulse' : 'badge-warning';
            const badgeText = isPending ? '📥 Cliente por Confirmar' : `🧑‍🍳 ${o.status}`;
            const label = o.clientName ? `${o.clientName} (${o.accountType})` : `Mesa (${o.accountType})`;

            return `
              <div class="order-selection-item">
                <div>
                  <div class="font-bold text-sm" style="margin-bottom:2px;">Cliente: ${label}</div>
                  <div class="text-xs text-secondary">${(o.items || []).length} items · Total: <strong>$${Number(o.total || 0).toFixed(2)}</strong></div>
                  <span class="badge ${badgeCls} mt-2" style="font-size:0.7rem; padding:3px 8px;">${badgeText}</span>
                </div>
                <button class="btn btn-sm btn-primary btn-select-order" data-id="${o.id}">
                  ${isPending ? '📥 Verificar' : '✏️ Gestionar'}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    const selectorModal = new Modal({
      title: `Pedidos: ${table.name}`,
      bodyHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-sel-cancel">Cerrar</button>
        <button class="btn btn-primary btn-sm" id="btn-sel-new">+ Tomar Nuevo Pedido</button>
      `
    });

    document.body.appendChild(selectorModal.mount());

    selectorModal.$('#btn-sel-cancel').addEventListener('click', () => selectorModal.close());
    selectorModal.$('#btn-sel-new').addEventListener('click', () => {
      selectorModal.close();
      this.openTakeOrderModal();
    });

    selectorModal.$('#orders-selector-list').addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-select-order');
      if (btn) {
        const orderId = btn.getAttribute('data-id');
        const selectedOrder = tableOrders.find(o => o.id === orderId);
        if (selectedOrder) {
          selectorModal.close();
          this.state.activeOrder = selectedOrder;
          this.state.cart = JSON.parse(JSON.stringify(selectedOrder.items || []));
          this.openManageOrderModal();
        }
      }
    });
  }

  openTakeOrderModal() {
    const table = this.state.selectedTable;
    
    const bodyHTML = `
      <div class="order-builder-layout">
        <div>
          <h4 class="font-semibold mb-2">Seleccionar Productos</h4>
          <input type="text" id="prod-search" class="input input-sm mb-3 w-full" placeholder="Buscar producto..." />
          <div style="max-height: 40vh; overflow-y: auto;" id="prod-list">
            ${this.state.products.map(p => `
              <div class="product-item-row" data-id="${p.id}">
                <div>
                  <div class="text-sm font-semibold">${p.name}</div>
                  <span class="text-xs text-secondary">Stock: ${p.stock || 0} ${p.unit || 'uds'}</span>
                </div>
                <strong class="text-accent">$${p.price || 0}</strong>
              </div>
            `).join('')}
          </div>
        </div>
        <div style="border-left: 1px solid var(--color-border); padding-left: var(--space-4);">
          <h4 class="font-semibold mb-2">Comanda - ${table.name}</h4>
          
          <div class="form-group mb-3">
            <label class="form-label" style="font-size:0.75rem;">Modalidad de Cuenta</label>
            <select id="take-account-type" class="input input-sm">
              <option value="CONJUNTA">Cuenta Conjunta</option>
              <option value="SEPARADO">Por Separado (Individual)</option>
            </select>
          </div>
          <div class="form-group mb-3" id="take-client-name-group" style="display:none;">
            <label class="form-label" style="font-size:0.75rem;">Nombre del Cliente/Asiento</label>
            <input type="text" id="take-client-name" class="input input-sm" placeholder="Ej. Asiento 1" />
          </div>

          <div style="max-height: 30vh; overflow-y: auto;" id="cart-list">
            <p class="text-xs text-secondary py-5 text-center">No hay productos agregados.</p>
          </div>
          <div class="mt-4" style="border-top: 1px solid var(--color-border); padding-top: var(--space-3);">
            <div class="d-flex justify-content-between font-bold">
              <span>Total:</span>
              <span id="order-total-val">$0.00</span>
            </div>
          </div>
        </div>
      </div>
    `;

    this.modal = new Modal({
      title: `Iniciar Servicio: ${table.name}`,
      bodyHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-modal-cancel">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="btn-modal-save" disabled>Confirmar y Enviar a Cocina 🍳</button>
      `,
      size: 'lg'
    });

    document.body.appendChild(this.modal.mount());

    const selectAccount = this.modal.$('#take-account-type');
    const nameGroup = this.modal.$('#take-client-name-group');
    selectAccount.addEventListener('change', (e) => {
      nameGroup.style.display = e.target.value === 'SEPARADO' ? 'block' : 'none';
    });

    this.bindModalEvents();
  }

  openManageOrderModal() {
    const table = this.state.selectedTable;
    const order = this.state.activeOrder;
    const isPending = order.status === 'PENDIENTE_VERIFICACION';
    
    const bodyHTML = `
      <div class="order-builder-layout">
        <div>
          <h4 class="font-semibold mb-2">Agregar Productos</h4>
          <input type="text" id="prod-search" class="input input-sm mb-3 w-full" placeholder="Buscar producto..." />
          <div style="max-height: 40vh; overflow-y: auto;" id="prod-list">
            ${this.state.products.map(p => `
              <div class="product-item-row" data-id="${p.id}">
                <div>
                  <div class="text-sm font-semibold">${p.name}</div>
                  <span class="text-xs text-secondary">Stock: ${p.stock || 0}</span>
                </div>
                <strong class="text-accent">$${p.price || 0}</strong>
              </div>
            `).join('')}
          </div>
        </div>
        <div style="border-left: 1px solid var(--color-border); padding-left: var(--space-4);">
          <h4 class="font-semibold mb-2">Gestionar Comanda - ${table.name}</h4>
          <div class="table-info-row">Cliente: <strong>${order.clientName || 'Mesa'} (${order.accountType})</strong></div>
          <div class="table-info-row">Estado: <span class="badge" style="background:#fb923c22; color:#fb923c;">${order.status}</span></div>
          ${order.notes ? `<div class="table-info-row mt-1" style="background:rgba(255,255,255,0.02); padding:6px; border-radius:4px; font-size:0.75rem; border:1px solid var(--color-border);">📝 Nota cliente: <em>"${order.notes}"</em></div>` : ''}
          
          <div style="max-height: 30vh; overflow-y: auto; margin-top:10px;" id="cart-list">
            <!-- Loaded -->
          </div>
          <div class="mt-4" style="border-top: 1px solid var(--color-border); padding-top: var(--space-3);">
            <div class="d-flex justify-content-between font-bold">
              <span>Total:</span>
              <span id="order-total-val">$0.00</span>
            </div>
          </div>
        </div>
      </div>
    `;

    this.modal = new Modal({
      title: isPending ? `Confirmar Pedido de Cliente: ${table.name}` : `Gestionar Servicio: ${table.name}`,
      bodyHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-modal-cancel">Cerrar</button>
        ${!isPending ? `<button class="btn btn-warning btn-sm" id="btn-modal-bill">Pedir Cuenta 🧾</button>` : ''}
        ${!isPending ? `<button class="btn btn-success btn-sm" id="btn-modal-free">Cobrar y Liberar Mesa 🔑</button>` : ''}
        <button class="btn btn-primary btn-sm" id="btn-modal-save">
          ${isPending ? 'Aceptar y Enviar a Cocina 🍳' : 'Actualizar Comanda 🍳'}
        </button>
      `,
      size: 'lg'
    });

    document.body.appendChild(this.modal.mount());
    this.bindModalEvents(true);
    this.updateCartUI();
  }

  bindModalEvents(isManage = false) {
    const m = this.modal;
    m.$('#btn-modal-cancel')?.addEventListener('click', () => m.close());

    // Search filter inside modal
    m.$('#prod-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      m.$$('.product-item-row').forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(q) ? 'flex' : 'none';
      });
    });

    // Add to cart click handler
    m.$('#prod-list')?.addEventListener('click', (e) => {
      const row = e.target.closest('.product-item-row');
      if (row) {
        const prodId = row.getAttribute('data-id');
        this.addToCart(prodId);
      }
    });

    // Cart event delegation (remove/quantity)
    m.$('#cart-list')?.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.btn-cart-remove');
      if (deleteBtn) {
        const idx = Number(deleteBtn.getAttribute('data-idx'));
        this.state.cart.splice(idx, 1);
        this.updateCartUI();
      }
    });

    // Actions buttons
    m.$('#btn-modal-save')?.addEventListener('click', () => this.saveActiveOrder());
    m.$('#btn-modal-bill')?.addEventListener('click', () => this.requestTableBill());
    m.$('#btn-modal-free')?.addEventListener('click', () => this.freeTable());
  }

  addToCart(prodId) {
    const prod = this.state.products.find(p => p.id === prodId);
    if (!prod) return;

    const existing = this.state.cart.find(item => item.productId === prodId);
    if (existing) {
      existing.qty++;
      existing.total = existing.qty * existing.price;
    } else {
      this.state.cart.push({
        productId: prodId,
        name: prod.name,
        price: prod.price,
        qty: 1,
        total: prod.price
      });
    }
    this.updateCartUI();
    NotificationService.success(`Agregado: ${prod.name}`);
  }

  updateCartUI() {
    const cartList = this.modal.$('#cart-list');
    const saveBtn = this.modal.$('#btn-modal-save');
    const totalVal = this.modal.$('#order-total-val');
    if (!cartList) return;

    if (this.state.cart.length === 0) {
      cartList.innerHTML = `<p class="text-xs text-secondary py-5 text-center">No hay productos agregados.</p>`;
      if (saveBtn && !this.state.activeOrder) saveBtn.disabled = true;
      if (totalVal) totalVal.textContent = '$0.00';
      return;
    }

    if (saveBtn) saveBtn.disabled = false;

    cartList.innerHTML = this.state.cart.map((item, idx) => `
      <div class="cart-item-row animate-slide-up">
        <div>
          <span class="text-xs font-semibold">${item.qty}x</span>
          <span class="text-xs">${item.name}</span>
        </div>
        <div class="d-flex align-items-center gap-2">
          <strong class="text-xs">$${item.total.toFixed(2)}</strong>
          <button class="btn btn-link btn-xs text-danger btn-cart-remove" data-idx="${idx}" style="padding:0; margin-left:8px;">✕</button>
        </div>
      </div>
    `).join('');

    const total = this.state.cart.reduce((sum, item) => sum + item.total, 0);
    if (totalVal) totalVal.textContent = `$${total.toFixed(2)}`;
  }

  async saveActiveOrder() {
    const table = this.state.selectedTable;
    const cart = this.state.cart;
    if (cart.length === 0) {
      NotificationService.error('Debes agregar al menos un producto a la comanda.');
      return;
    }

    const total = cart.reduce((sum, item) => sum + item.total, 0);

    try {
      if (this.state.activeOrder) {
        // Update existing order (or confirm client order)
        const orderId = this.state.activeOrder.id;
        const oldTotal = Number(this.state.activeOrder.total || 0);

        await FirestoreService.update('orders', orderId, {
          items: cart,
          total,
          status: 'EN_COCINA',
          waiterName: this.waiterName,
          updatedAt: Date.now()
        });

        // Recalculate table total
        const diff = total - oldTotal;
        const currentTable = this.state.tables.find(t => t.id === table.id) || {};
        const newTableTotal = (currentTable.orderTotal || 0) + diff;

        await FirestoreService.update('tables', table.id, {
          status: 'BUSY',
          waiterName: this.waiterName,
          orderTotal: newTableTotal
        });

        NotificationService.success('Pedido verificado y enviado a Cocina.');
      } else {
        // Create new order physically by waiter
        const type = this.modal.$('#take-account-type')?.value || 'CONJUNTA';
        const clientName = this.modal.$('#take-client-name')?.value?.trim() || '';

        const orderPayload = {
          tableName: table.name,
          tableId: table.id,
          waiterName: this.waiterName,
          accountType: type,
          clientName: type === 'SEPARADO' ? clientName : '',
          items: cart,
          total,
          status: 'EN_COCINA',
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        
        const orderId = await FirestoreService.create('orders', orderPayload);
        
        // Fetch current table node
        const currentTable = this.state.tables.find(t => t.id === table.id) || {};
        let activeOrderIds = currentTable.activeOrderIds || [];
        if (typeof activeOrderIds === 'string') activeOrderIds = [activeOrderIds];
        if (!activeOrderIds.includes(orderId)) activeOrderIds.push(orderId);

        const newTableTotal = (currentTable.orderTotal || 0) + total;

        await FirestoreService.update('tables', table.id, {
          status: 'BUSY',
          activeOrderId: orderId, // Fallback
          activeOrderIds,
          waiterName: this.waiterName,
          orderTotal: newTableTotal
        });

        NotificationService.success('Mesa abierta y comanda enviada a Cocina.');
      }
      this.modal.close();
    } catch (e) {
      console.error('[TablesView] Failed to save order:', e);
      NotificationService.error('Error al guardar la comanda.');
    }
  }

  async requestTableBill() {
    const table = this.state.selectedTable;
    const order = this.state.activeOrder;
    if (!order) return;

    try {
      await FirestoreService.update('orders', order.id, { status: 'ESPERANDO_PAGO' });
      await FirestoreService.update('tables', table.id, { status: 'BILL' });
      NotificationService.success('Cuenta solicitada. Caja ha sido notificada.');
      this.modal.close();
    } catch (e) {
      console.error(e);
      NotificationService.error('Error al solicitar la cuenta.');
    }
  }

  async freeTable() {
    const table = this.state.selectedTable;
    const order = this.state.activeOrder;

    if (!confirm(`¿Confirmas el cobro y liberación de la cuenta para ${order?.clientName || table.name}?`)) return;

    try {
      if (order) {
        // Move to ventas/completed sales
        const salePayload = {
          items: order.items,
          total: order.total,
          subtotal: order.total * 0.85,
          tax: order.total * 0.15,
          paymentMethod: 'EFECTIVO',
          sellerName: order.waiterName || this.waiterName,
          date: Date.now()
        };
        await FirestoreService.create('ventas', salePayload);
        await FirestoreService.update('orders', order.id, { status: 'COMPLETED', completedAt: Date.now() });

        // Decrement stock for each item sold
        if (Array.isArray(order.items)) {
          for (const item of order.items) {
            if (!item.productId) continue;
            const product = this.state.products.find(p => p.id === item.productId);
            if (product && typeof product.stock === 'number') {
              const newStock = Math.max(0, product.stock - (item.qty || 1));
              try {
                await FirestoreService.update('productos', item.productId, { stock: newStock });
              } catch (stockErr) {
                console.warn('[TablesView] Could not update stock for product', item.productId, stockErr);
              }
            }
          }
        }
      }

      // Check if there are other uncompleted orders for this table
      const remainingOrders = this.state.orders.filter(o => 
        o.tableId === table.id && 
        o.id !== order?.id && 
        o.status !== 'COMPLETED' && 
        o.status !== 'CANCELADA'
      );

      if (remainingOrders.length === 0) {
        // If no active orders remain, free the table completely
        await FirestoreService.update('tables', table.id, {
          status: 'FREE',
          activeOrderId: null,
          activeOrderIds: null,
          waiterName: null,
          orderTotal: null
        });
        NotificationService.success(`${table.name} liberada exitosamente.`);
      } else {
        // Update table node totals without the freed order
        const newTotal = remainingOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
        const remainingIds = remainingOrders.map(o => o.id);
        
        await FirestoreService.update('tables', table.id, {
          activeOrderId: remainingIds[0],
          activeOrderIds: remainingIds,
          orderTotal: newTotal
        });
        NotificationService.success(`Cuenta de comensal liquidada. La mesa continúa ocupada.`);
      }

      this.modal.close();
    } catch (e) {
      console.error(e);
      NotificationService.error('Error al liberar la comanda/mesa.');
    }
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.layout.unmount();
    super.unmount();
  }
}