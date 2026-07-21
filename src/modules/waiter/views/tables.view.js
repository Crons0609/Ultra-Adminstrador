import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { WaiterAssignmentService } from '../../../services/waiter-assignment.service.js';

export class TablesView extends Component {
  constructor(params = {}) {
    super(params);
    const state = GlobalStore.getState();
    const currentUser = state.currentUser || {};
    this.companyId = currentUser.companyId || '';
    this.waiterName = currentUser.displayName || 'Mesero';
    this.currentUserId = currentUser.uid || '';

    this.state = {
      tables: [],
      rawTables: [],
      rawQRs: [],
      products: [],
      orders: [],
      activeOrder: null,
      selectedTable: null,
      cart: [],
      loading: true
    };
    
    // Live-timer interval ID for elapsed time display
    this._timerInterval = null;

    this.layout = new PageLayout({
      title: 'Mis Mesas',
      subtitle: 'Tus mesas asignadas — confirma pedidos, envía a cocina y solicita cuentas.',
      actionHTML: `
        <span class="badge animate-pulse" style="background:#34d39922; color:#34d399; border:1px solid #34d39944; padding:4px 10px;">
          ● En Servicio
        </span>
      `,
      contentHTML: `
        <style>
          /* ============================================================
             Waiter My-Tables Dashboard — Unified card-list design
             ============================================================ */
          .my-tables-list {
            display: flex;
            flex-direction: column;
            gap: var(--space-4);
          }
          .my-table-card {
            background: var(--color-bg-secondary);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            overflow: hidden;
            transition: box-shadow 0.2s;
          }
          .my-table-card:hover {
            box-shadow: var(--shadow-md);
          }
          .my-table-card.has-pending {
            border-color: #ef4444;
            box-shadow: 0 0 12px rgba(239,68,68,0.12);
          }
          .my-table-card.has-bill {
            border-color: var(--color-warning);
          }
          .my-table-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: var(--space-4) var(--space-5);
            background: var(--color-bg-tertiary);
            border-bottom: 1px solid var(--color-border);
          }
          .my-table-name {
            font-size: 1.2rem;
            font-weight: 700;
          }
          .my-table-meta {
            display: flex;
            gap: var(--space-3);
            align-items: center;
            font-size: 0.78rem;
            color: var(--color-text-secondary);
          }
          .my-table-body {
            padding: var(--space-4) var(--space-5);
          }
          .table-order-block {
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            margin-bottom: var(--space-3);
            overflow: hidden;
          }
          .table-order-block:last-child { margin-bottom: 0; }
          .table-order-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: var(--space-2) var(--space-3);
            background: var(--color-bg-tertiary);
            border-bottom: 1px solid var(--color-border);
            font-size: 0.8rem;
          }
          .order-status-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 999px;
            font-size: 0.65rem;
            font-weight: 600;
          }
          .table-order-items {
            padding: var(--space-2) var(--space-3);
            font-size: 0.82rem;
          }
          .item-row {
            display: flex;
            justify-content: space-between;
            padding: 3px 0;
            border-bottom: 1px dotted var(--color-border);
          }
          .item-row:last-child { border-bottom: none; }
          .table-order-actions {
            display: flex;
            gap: var(--space-2);
            padding: var(--space-2) var(--space-3);
            flex-wrap: wrap;
            border-top: 1px solid var(--color-border);
          }
          .table-order-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: var(--space-2) var(--space-3);
            font-size: 0.8rem;
            border-top: 1px solid var(--color-border);
            color: var(--color-text-secondary);
          }
          .order-total-amount {
            font-size: 0.9rem;
            font-weight: 700;
            color: var(--color-accent);
          }
          /* empty state */
          .no-tables-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: var(--space-10) var(--space-4);
            color: var(--color-text-secondary);
            text-align: center;
            gap: var(--space-3);
          }
          .no-tables-icon { font-size: 3rem; }
          /* Add-table button */
          .my-table-add-btn {
            width: 100%;
            padding: var(--space-3);
            border: 2px dashed var(--color-border);
            border-radius: var(--radius-lg);
            background: transparent;
            color: var(--color-text-secondary);
            cursor: pointer;
            font-size: 0.9rem;
            transition: border-color 0.2s, color 0.2s;
          }
          .my-table-add-btn:hover {
            border-color: var(--color-accent);
            color: var(--color-accent);
          }
          /* Modal order builder */
          .order-builder-layout {
            display: grid;
            grid-template-columns: 1.2fr 1fr;
            gap: var(--space-4);
            max-height: 70vh;
          }
          @media (max-width: 640px) {
            .order-builder-layout {
              grid-template-columns: 1fr;
              max-height: none;
            }
          }
          .product-item-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: var(--space-2);
            border-bottom: 1px solid var(--color-border);
            cursor: pointer;
          }
          .product-item-row:hover { background: var(--color-bg-tertiary); }
          .cart-item-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: var(--space-2) 0;
            border-bottom: 1px dotted var(--color-border);
          }
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
          .order-selection-item:hover { border-color: var(--color-accent); }
          @keyframes pulse-red {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); box-shadow: 0 0 8px #ef444433; }
            100% { transform: scale(1); }
          }
        </style>

        <div id="waiter-tables-container">
          <p class="text-center w-full py-10 text-secondary">Cargando tus mesas...</p>
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

      // 2. Subscribe to qr_codes
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

      // 4. Subscribe to orders
      const ordersListener = FirestoreService.listenToTenant('orders', async (orders) => {
        const prev = this.state.orders || [];
        this.state.orders = orders || [];

        // Round-Robin trigger: for any new PENDIENTE_VERIFICACION order on a table
        // that has no waiter assigned yet, run auto-assignment.
        const newPending = this.state.orders.filter(o =>
          o.status === 'PENDIENTE_VERIFICACION' &&
          !prev.find(p => p.id === o.id) // truly new
        );
        for (const order of newPending) {
          if (!order.tableId) continue;
          const table = (this.state.rawTables || []).find(t => t.id === order.tableId);
          if (!table?.assignedWaiterId) {
            try {
              await WaiterAssignmentService.assignTable(order.tableId, table || {});
            } catch (e) {
              console.warn('[TablesView] Round-Robin assignment failed:', e.message);
            }
          }
        }

        this.renderMyTables(element);
      });
      this.listeners.push(ordersListener);

    } catch (e) {
      console.error('[TablesView] DB Subscription error:', e);
    }
  }

  mergeAndRenderTables(element) {
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

    let merged = Array.from(tableMap.values());

    if (merged.length === 0) {
      const defaults = [];
      for (let i = 1; i <= 10; i++) {
        const tableId = `mesa-${i}`;
        const tableObj = { id: tableId, name: `Mesa ${i}`, status: 'FREE', activeOrderId: null };
        FirestoreService.create('tables', tableObj, tableId);
        defaults.push(tableObj);
      }
      merged = defaults;
    }

    this.state.tables = merged.sort((a, b) => {
      const numA = parseInt((a.name || a.id).replace(/\D/g, '')) || 999;
      const numB = parseInt((b.name || b.id).replace(/\D/g, '')) || 999;
      if (numA !== numB) return numA - numB;
      return (a.name || a.id).localeCompare(b.name || b.id);
    });

    this.renderMyTables(element);
  }

  bindEvents(element) {
    const container = element.querySelector('#waiter-tables-container');
    if (!container) return;

    // Delegate all action clicks within table cards
    container.addEventListener('click', async (e) => {
      // Add new order button
      const addBtn = e.target.closest('.btn-table-add-order');
      if (addBtn) {
        const tableId = addBtn.getAttribute('data-table');
        if (!tableId) {
          // "Tomar Orden Manual" — pick any table
          this.openTablePickerModal();
        } else {
          const table = this.state.tables.find(t => t.id === tableId);
          if (table) {
            this.state.selectedTable = table;
            this.state.cart = [];
            this.state.activeOrder = null;
            this.openTakeOrderModal();
          }
        }
        return;
      }

      // Verify (PENDIENTE_VERIFICACION) button
      const verifyBtn = e.target.closest('.btn-order-verify');
      if (verifyBtn) {
        const orderId = verifyBtn.getAttribute('data-id');
        const order = this.state.orders.find(o => o.id === orderId);
        if (order) {
          this.state.activeOrder = order;
          this.state.cart = JSON.parse(JSON.stringify(order.items || []));
          this.state.selectedTable = this.state.tables.find(t => t.id === order.tableId)
            || { id: order.tableId, name: order.tableName || `Mesa ${order.tableId}` };
          this.openManageOrderModal();
        }
        return;
      }

      // Mark as delivered
      const deliverBtn = e.target.closest('.btn-order-deliver');
      if (deliverBtn) {
        const orderId = deliverBtn.getAttribute('data-id');
        await this.updateOrderStatus(orderId, 'ENTREGADO', 'Pedido marcado como entregado.');
        return;
      }

      // Request bill
      const billBtn = e.target.closest('.btn-order-bill');
      if (billBtn) {
        const orderId = billBtn.getAttribute('data-id');
        await this.requestBillFromList(orderId);
        return;
      }

      // Manage existing order (edit)
      const manageBtn = e.target.closest('.btn-order-manage');
      if (manageBtn) {
        const orderId = manageBtn.getAttribute('data-id');
        const order = this.state.orders.find(o => o.id === orderId);
        if (order) {
          this.state.activeOrder = order;
          this.state.cart = JSON.parse(JSON.stringify(order.items || []));
          this.state.selectedTable = this.state.tables.find(t => t.id === order.tableId)
            || { id: order.tableId, name: order.tableName || `Mesa ${order.tableId}` };
          this.openManageOrderModal();
        }
        return;
      }
    });
  }

  /**
   * Render the waiter's personal table list — only tables assigned to this waiter
   * that are NOT FREE. Each table card shows all active orders with action buttons.
   */
  renderMyTables(element) {
    const container = element.querySelector('#waiter-tables-container');
    if (!container) return;

    const myId = this.currentUserId;

    // Only show tables assigned to this waiter AND with active orders (non-FREE)
    const myTables = this.state.tables.filter(t => {
      const isAssignedToMe = t.assignedWaiterId === myId;
      const hasActiveOrders = this.state.orders.some(
        o => o.tableId === t.id && o.status !== 'COMPLETED' && o.status !== 'CANCELADA'
      );
      // Also show if no waiter assigned yet but table is BUSY (fallback)
      const isOccupiedNoAssignment = !t.assignedWaiterId && t.status !== 'FREE';
      return (isAssignedToMe || isOccupiedNoAssignment) && (t.status !== 'FREE' || hasActiveOrders);
    });

    if (myTables.length === 0) {
      container.innerHTML = `
        <div class="no-tables-state">
          <div class="no-tables-icon">🍽️</div>
          <h3 class="font-bold" style="margin:0;">Sin mesas asignadas</h3>
          <p style="font-size:0.85rem; max-width:300px;">Cuando lleguen clientes, las mesas te serán asignadas automáticamente.</p>
          <button class="btn btn-primary btn-sm btn-table-add-order" data-table="">
            + Tomar Orden Manual
          </button>
        </div>
      `;
      return;
    }

    const now = Date.now();

    container.innerHTML = `
      <div class="my-tables-list">
        ${myTables.map(t => {
          const tableOrders = this.state.orders.filter(
            o => o.tableId === t.id && o.status !== 'COMPLETED' && o.status !== 'CANCELADA'
          );
          const hasPending = tableOrders.some(o => o.status === 'PENDIENTE_VERIFICACION');
          const hasBill = tableOrders.some(o => o.status === 'ESPERANDO_PAGO');
          const totalCost = tableOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
          const cardCls = hasPending ? 'has-pending' : hasBill ? 'has-bill' : '';

          // Elapsed time since first occupation
          const since = t.occupiedSince || (tableOrders[0]?.createdAt) || now;
          const elapsedMs = now - since;
          const elapsedMin = Math.floor(elapsedMs / 60000);
          const elapsedStr = elapsedMin < 60
            ? `${elapsedMin} min`
            : `${Math.floor(elapsedMin/60)}h ${elapsedMin%60}m`;

          const ordersHTML = tableOrders.map(o => {
            const isPending = o.status === 'PENDIENTE_VERIFICACION';
            const isReady = o.status === 'READY' || o.status === 'LISTO';
            const isDelivered = o.status === 'ENTREGADO';
            const isWaitingBill = o.status === 'ESPERANDO_PAGO';
            const isInKitchen = o.status === 'EN_COCINA';

            let statusStyle = 'background:var(--color-bg-tertiary); color:var(--color-text-secondary);';
            let statusLabel = o.status;
            if (isPending)     { statusStyle = 'background:#ef444422; color:#ef4444; border:1px solid #ef444444;'; statusLabel = '⚡ Nuevo Pedido'; }
            if (isInKitchen)   { statusStyle = 'background:#3b82f622; color:#3b82f6;'; statusLabel = '🍳 En Cocina'; }
            if (isReady)       { statusStyle = 'background:#10b98122; color:#10b981; border:1px solid #10b98144;'; statusLabel = '🔔 LISTO'; }
            if (isDelivered)   { statusStyle = 'background:#8b5cf622; color:#8b5cf6;'; statusLabel = '🍽️ Entregado'; }
            if (isWaitingBill) { statusStyle = 'background:#fb923c22; color:#fb923c;'; statusLabel = '💳 Esperando Pago'; }

            const clientLabel = o.clientName ? `${o.clientName} · ` : '';

            return `
              <div class="table-order-block">
                <div class="table-order-header">
                  <span style="color:var(--color-text-secondary);">${clientLabel}${o.accountType || 'CONJUNTA'}</span>
                  <span class="order-status-badge" style="${statusStyle}">${statusLabel}</span>
                </div>
                <div class="table-order-items">
                  ${(o.items || []).map(item => `
                    <div class="item-row">
                      <span>${item.qty}x ${item.name}</span>
                      <span class="text-secondary">$${Number(item.total||0).toFixed(2)}</span>
                    </div>
                  `).join('')}
                  ${o.notes ? `<div style="margin-top:4px; font-size:0.75rem; color:var(--color-text-secondary); font-style:italic;">📝 ${o.notes}</div>` : ''}
                </div>
                <div class="table-order-actions">
                  ${isPending   ? `<button class="btn btn-primary btn-xs btn-order-verify" data-id="${o.id}">📥 Verificar</button>` : ''}
                  ${isReady     ? `<button class="btn btn-success btn-xs btn-order-deliver" data-id="${o.id}">✓ Entregar</button>` : ''}
                  ${isDelivered ? `<button class="btn btn-warning btn-xs btn-order-bill" data-id="${o.id}">🧾 Pedir Cuenta</button>` : ''}
                  ${(isInKitchen || isReady || isDelivered) ? `<button class="btn btn-secondary btn-xs btn-order-manage" data-id="${o.id}">✏️ Editar</button>` : ''}
                </div>
                <div class="table-order-footer">
                  <span>${new Date(o.createdAt || Date.now()).toLocaleTimeString()}</span>
                  <span class="order-total-amount">$${Number(o.total||0).toFixed(2)}</span>
                </div>
              </div>
            `;
          }).join('');

          return `
            <div class="my-table-card ${cardCls}">
              <div class="my-table-header">
                <div>
                  <span class="my-table-name">📍 ${t.name}</span>
                  ${hasPending ? `<span style="display:inline-block; margin-left:8px; font-size:0.65rem; background:#ef444422; color:#ef4444; border:1px solid #ef444444; padding:2px 6px; border-radius:999px; font-weight:600; animation:pulse-red 1.8s infinite;">NUEVO PEDIDO</span>` : ''}
                </div>
                <div class="my-table-meta">
                  <span>⏱ ${elapsedStr}</span>
                  ${tableOrders.length > 0 ? `<span class="order-total-amount">Total: $${totalCost.toFixed(2)}</span>` : ''}
                  <button class="btn btn-primary btn-xs btn-table-add-order" data-table="${t.id}">+ Orden</button>
                </div>
              </div>
              <div class="my-table-body">
                ${ordersHTML || '<p class="text-secondary" style="font-size:0.82rem; margin:0;">Sin comandas activas.</p>'}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // Keep renderTables as an alias for backward compat (called by some legacy paths)
  renderTables(element) { this.renderMyTables(element); }
  renderActiveOrders(element) { this.renderMyTables(element); }

  openTablePickerModal() {
    const allTables = this.state.tables || [];
    if (allTables.length === 0) {
      NotificationService.error('No hay mesas registradas en el establecimiento.');
      return;
    }

    const bodyHTML = `
      <p style="font-size:0.85rem; color:var(--color-text-secondary); margin-bottom:var(--space-3);">
        Selecciona la mesa a la cual deseas asignarte y tomar pedido:
      </p>
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(110px, 1fr)); gap:var(--space-2); max-height:50vh; overflow-y:auto;">
        ${allTables.map(t => {
          const isBusy = t.status !== 'FREE';
          const badgeClass = isBusy ? 'background:#ef444422; color:#ef4444;' : 'background:#10b98122; color:#10b981;';
          const statusText = isBusy ? 'Ocupada' : 'Disponible';
          return `
            <button class="btn btn-secondary btn-pick-table-item" data-id="${t.id}" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:12px 6px;">
              <span class="font-bold" style="font-size:1.1rem;">${t.name}</span>
              <span class="badge" style="font-size:0.65rem; ${badgeClass} margin-top:4px;">${statusText}</span>
            </button>
          `;
        }).join('')}
      </div>
    `;

    const pickerModal = new Modal({
      title: 'Seleccionar Mesa para Nuevo Pedido',
      bodyHTML,
      footerHTML: `<button class="btn btn-secondary btn-sm" id="btn-picker-cancel">Cancelar</button>`,
      size: 'md'
    });

    const el = pickerModal.mount();
    document.body.appendChild(el);

    el.querySelector('#btn-picker-cancel')?.addEventListener('click', () => pickerModal.close());
    el.querySelectorAll('.btn-pick-table-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tableId = btn.getAttribute('data-id');
        const table = allTables.find(t => t.id === tableId);
        if (table) {
          pickerModal.close();
          // Assign table to current waiter if not already assigned
          if (!table.assignedWaiterId) {
            try {
              await WaiterAssignmentService.reassignTable(table.id, this.currentUserId, this.waiterName);
            } catch (e) {
              console.warn('[TablesView] Could not assign table:', e);
            }
          }
          this.state.selectedTable = table;
          this.state.cart = [];
          this.state.activeOrder = null;
          this.openTakeOrderModal();
        }
      });
    });
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
        // If no active orders remain, free the table completely and clear waiter assignment
        await FirestoreService.update('tables', table.id, {
          status: 'FREE',
          activeOrderId: null,
          activeOrderIds: null,
          waiterName: null,
          orderTotal: null
        });
        // Clear Round-Robin assignment so the table disappears from the waiter's dashboard
        try { await WaiterAssignmentService.releaseTable(table.id); } catch (_) {}
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

  renderActiveOrders(element) {
    const container = element.querySelector('#waiter-orders-list');
    if (!container) return;

    // Filter to active orders only (excluding completed/cancelled ones)
    const active = this.state.orders.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELADA');

    if (active.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: var(--space-4); color: var(--color-text-secondary);">
          <div style="font-size: 2rem; margin-bottom: 6px;">📋</div>
          <p class="font-semibold" style="font-size: 0.85rem; margin:0;">No hay comandas activas</p>
        </div>
      `;
      return;
    }

    // Sort to show pending verifications first, then by date desc
    const sorted = active.sort((a, b) => {
      if (a.status === 'PENDIENTE_VERIFICACION' && b.status !== 'PENDIENTE_VERIFICACION') return -1;
      if (a.status !== 'PENDIENTE_VERIFICACION' && b.status === 'PENDIENTE_VERIFICACION') return 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    container.innerHTML = sorted.map(o => {
      const itemsHTML = (o.items || []).map(item => `
        <div class="order-item-detail">
          <span>${item.qty}x ${item.name}</span>
          <span class="text-secondary">$${Number(item.total).toFixed(2)}</span>
        </div>
      `).join('');

      let statusBadge = '';
      let actionBtn = '';
      let cardCls = '';

      switch (o.status) {
        case 'PENDIENTE_VERIFICACION':
          cardCls = 'status-pending-verification';
          statusBadge = `<span class="badge animate-pulse" style="background:#ef444422; color:#ef4444; border:1px solid #ef444444; font-size:0.65rem;">Confirmar cliente</span>`;
          actionBtn = `<button class="btn btn-primary btn-xs w-full btn-order-verify" data-id="${o.id}" style="font-size:0.7rem; padding: 4px 8px; margin-top: 4px;">📥 Verificar</button>`;
          break;
        case 'EN_COCINA':
          statusBadge = `<span class="badge" style="background:#3b82f622; color:#3b82f6; font-size:0.65rem;">En Cocina 🍳</span>`;
          break;
        case 'READY':
        case 'LISTO':
          statusBadge = `<span class="badge animate-pulse" style="background:#10b98122; color:#10b981; border:1px solid #10b98144; font-size:0.65rem;">¡LISTO! 🔔</span>`;
          actionBtn = `<button class="btn btn-success btn-xs w-full btn-order-deliver" data-id="${o.id}" style="font-size:0.7rem; padding: 4px 8px; margin-top: 4px;">Entregar a Mesa</button>`;
          break;
        case 'ENTREGADO':
          statusBadge = `<span class="badge" style="background:#8b5cf622; color:#8b5cf6; font-size:0.65rem;">Entregado 🍽️</span>`;
          actionBtn = `<button class="btn btn-warning btn-xs w-full btn-order-bill" data-id="${o.id}" style="font-size:0.7rem; padding: 4px 8px; margin-top: 4px;">Pedir Cuenta 🧾</button>`;
          break;
        case 'ESPERANDO_PAGO':
          statusBadge = `<span class="badge" style="background:#fb923c22; color:#fb923c; font-size:0.65rem;">Esperando Pago</span>`;
          break;
        default:
          statusBadge = `<span class="badge" style="background:var(--color-bg-tertiary); color:var(--color-text-secondary); font-size:0.65rem;">${o.status}</span>`;
      }

      const clientLabel = o.clientName ? ` (${o.clientName})` : '';

      return `
        <div class="order-card ${cardCls}">
          <div class="order-header">
            <div>
              <span class="order-table-name">${o.tableName || `Mesa ${o.tableId}`}</span>
              <span style="font-size:0.7rem; color:var(--color-text-secondary); display:block;">${o.accountType || 'CONJUNTA'}${clientLabel}</span>
            </div>
            ${statusBadge}
          </div>
          <div class="order-items-list" style="margin-top: 6px; border-bottom: 1px dotted var(--color-border); padding-bottom: 4px;">
            ${itemsHTML}
          </div>
          <div class="order-footer-actions">
            ${actionBtn}
          </div>
          <div class="order-footer" style="margin-top: 6px;">
            <span>${new Date(o.createdAt || Date.now()).toLocaleTimeString()}</span>
            <span class="order-total">Total: $${Number(o.total || 0).toFixed(2)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  async updateOrderStatus(orderId, nextStatus, successMessage) {
    try {
      const updates = { status: nextStatus, updatedAt: Date.now() };
      if (nextStatus === 'READY') updates.readyAt = Date.now();
      if (nextStatus === 'COMPLETED') updates.completedAt = Date.now();
      await FirestoreService.update('orders', orderId, updates);
      NotificationService.success(successMessage);
    } catch (e) {
      console.error(e);
      NotificationService.error('Error al actualizar el estado de la comanda.');
    }
  }

  async requestBillFromList(orderId) {
    try {
      const order = this.state.orders.find(o => o.id === orderId);
      if (!order) return;

      await FirestoreService.update('orders', orderId, { status: 'ESPERANDO_PAGO', updatedAt: Date.now() });
      if (order.tableId) {
        await FirestoreService.update('tables', order.tableId, { status: 'BILL' });
      }
      NotificationService.success('Cuenta solicitada. Caja notificada.');
    } catch (e) {
      console.error(e);
      NotificationService.error('Error al solicitar la cuenta.');
    }
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.layout.unmount();
    super.unmount();
  }
}