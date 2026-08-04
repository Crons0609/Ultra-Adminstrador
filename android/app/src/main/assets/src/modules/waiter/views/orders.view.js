import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';

export class OrdersView extends Component {
  constructor(params = {}) {
    super(params);
    const state = GlobalStore.getState();
    const currentUser = state.currentUser || {};
    this.companyId = currentUser.companyId || '';
    this.waiterName = currentUser.displayName || 'Mesero';

    this.state = {
      orders: [],
      products: [],
      loading: true
    };

    this.layout = new PageLayout({
      title: 'Mis Pedidos (Comandas)',
      subtitle: 'Gestiona comandas, verifica pedidos móviles de clientes y controla las entregas.',
      actionHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-refresh-orders">🔄 Recargar Lista</button>
      `,
      contentHTML: `
        <style>
          .waiter-orders-container {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: var(--space-4);
          }
          .order-card {
            background: var(--color-bg-secondary);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            padding: var(--space-4);
            display: flex;
            flex-direction: column;
            gap: var(--space-3);
            transition: transform 0.2s, border-color 0.2s;
            position: relative;
          }
          .order-card:hover {
            transform: translateY(-2px);
          }
          .order-card.status-pending-verification {
            border-color: #ef4444;
            box-shadow: 0 0 10px rgba(239, 68, 68, 0.1);
          }
          .order-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--color-border);
            padding-bottom: var(--space-2);
          }
          .order-table-name {
            font-size: 1.1rem;
            font-weight: 700;
          }
          .order-items-list {
            flex-grow: 1;
            font-size: 0.85rem;
            color: var(--color-text-primary);
            max-height: 150px;
            overflow-y: auto;
          }
          .order-item-detail {
            display: flex;
            justify-content: space-between;
            padding: 4px 0;
          }
          .order-footer {
            border-top: 1px solid var(--color-border);
            padding-top: var(--space-2);
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .order-total {
            font-weight: 700;
            font-size: 1rem;
          }
          .order-builder-layout {
            display: grid;
            grid-template-columns: 1.2fr 1fr;
            gap: var(--space-4);
            max-height: 60vh;
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
        </style>
        
        <div id="waiter-orders-list" class="waiter-orders-container animate-fade-in">
          <p class="text-secondary text-center py-10 w-full">Esperando pedidos...</p>
        </div>
      `
    });

    this.listeners = [];
  }

  mount() {
    const element = this.layout.mount();
    this.subscribeToOrders(element);
    this.bindEvents(element);
    return element;
  }

  subscribeToOrders(element) {
    try {
      const listener = FirestoreService.listenToTenant('orders', (orders) => {
        this.state.orders = orders || [];
        this.renderOrders(element);
      });
      this.listeners.push(listener);

      const productsListener = FirestoreService.listenToTenant('productos', (products) => {
        this.state.products = products || [];
      });
      this.listeners.push(productsListener);
    } catch (e) {
      console.error(e);
    }
  }

  bindEvents(element) {
    const list = element.querySelector('#waiter-orders-list');
    if (list) {
      list.addEventListener('click', (e) => {
        const deliverBtn = e.target.closest('.btn-order-deliver');
        const verifyBtn = e.target.closest('.btn-order-verify');
        const billBtn = e.target.closest('.btn-order-bill');

        if (deliverBtn) {
          const orderId = deliverBtn.getAttribute('data-id');
          this.updateOrderStatus(orderId, 'ENTREGADO', 'Pedido marcado como entregado en mesa.');
        } else if (verifyBtn) {
          const orderId = verifyBtn.getAttribute('data-id');
          this.openVerificationModal(orderId);
        } else if (billBtn) {
          const orderId = billBtn.getAttribute('data-id');
          this.requestBill(orderId);
        }
      });
    }

    element.querySelector('#btn-refresh-orders')?.addEventListener('click', () => {
      this.renderOrders(element);
      NotificationService.success('Lista de comandas actualizada.');
    });
  }

  renderOrders(element) {
    const container = element.querySelector('#waiter-orders-list');
    if (!container) return;

    // Filter to active orders only (excluding completed/cancelled ones)
    const active = this.state.orders.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELADA');

    if (active.length === 0) {
      container.innerHTML = `
        <div class="card p-8 text-center w-full text-secondary" style="grid-column: 1 / -1;">
          <div style="font-size: 3rem; margin-bottom: 10px;">📋</div>
          <h4 class="font-bold">No tienes comandas activas</h4>
          <p class="text-xs mt-1">Las comandas tomadas físicamente o enviadas por clientes aparecerán aquí.</p>
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
          statusBadge = `<span class="badge animate-pulse" style="background:#ef444422; color:#ef4444; border:1px solid #ef444444;">📥 Confirmar cliente</span>`;
          actionBtn = `<button class="btn btn-primary btn-xs w-full btn-order-verify" data-id="${o.id}">📥 Verificar y Enviar a Cocina</button>`;
          break;
        case 'EN_COCINA':
          statusBadge = `<span class="badge" style="background:#3b82f622; color:#3b82f6;">En Cocina 🍳</span>`;
          break;
        case 'READY':
        case 'LISTO':
          statusBadge = `<span class="badge animate-pulse" style="background:#10b98122; color:#10b981; border:1px solid #10b98144;">¡LISTO! 🔔</span>`;
          actionBtn = `<button class="btn btn-success btn-xs w-full btn-order-deliver" data-id="${o.id}">Marcar como Entregado</button>`;
          break;
        case 'ENTREGADO':
          statusBadge = `<span class="badge" style="background:#8b5cf622; color:#8b5cf6;">Entregado 🍽️</span>`;
          actionBtn = `<button class="btn btn-warning btn-xs w-full btn-order-bill" data-id="${o.id}">Pedir Cuenta 🧾</button>`;
          break;
        case 'ESPERANDO_PAGO':
          statusBadge = `<span class="badge" style="background:#fb923c22; color:#fb923c;">Esperando Pago</span>`;
          break;
        default:
          statusBadge = `<span class="badge" style="background:var(--color-bg-tertiary); color:var(--color-text-secondary);">${o.status}</span>`;
      }

      const clientLabel = o.clientName ? ` (${o.clientName})` : '';

      return `
        <div class="order-card ${cardCls}">
          <div class="order-header">
            <div>
              <span class="order-table-name">${o.tableName || `Mesa ${o.tableId}`}</span>
              <span class="text-xs text-secondary d-block">Tipo: ${o.accountType || 'CONJUNTA'}${clientLabel}</span>
            </div>
            ${statusBadge}
          </div>
          <div class="order-items-list">
            ${itemsHTML}
          </div>
          <div class="order-footer-actions">
            ${actionBtn}
          </div>
          <div class="order-footer">
            <span class="text-xs text-secondary">${new Date(o.createdAt || Date.now()).toLocaleTimeString()}</span>
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

  async requestBill(orderId) {
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

  openVerificationModal(orderId) {
    const order = this.state.orders.find(o => o.id === orderId);
    if (!order) return;

    this.state.cart = JSON.parse(JSON.stringify(order.items || []));

    const bodyHTML = `
      <div class="order-builder-layout">
        <div>
          <h4 class="font-semibold mb-2">Agregar más Productos</h4>
          <input type="text" id="prod-search" class="input input-sm mb-3 w-full" placeholder="Buscar producto..." />
          <div style="max-height: 35vh; overflow-y: auto;" id="prod-list">
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
          <h4 class="font-semibold mb-2">Verificar comanda de cliente</h4>
          <div class="text-xs text-secondary mb-2">Mesa: ${order.tableName || `Mesa ${order.tableId}`} · Modalidad: ${order.accountType} ${order.clientName ? `· Cliente: ${order.clientName}` : ''}</div>
          ${order.notes ? `<div class="p-2 mb-3" style="background:rgba(255,255,255,0.02); border:1px solid var(--color-border); border-radius:4px; font-size:0.75rem;">📝 Notas cliente: <em>"${order.notes}"</em></div>` : ''}

          <div style="max-height: 25vh; overflow-y: auto;" id="cart-list">
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

    const verificationModal = new Modal({
      title: `Verificar Comanda: ${order.tableName || `Mesa ${order.tableId}`}`,
      bodyHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-ver-cancel">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="btn-ver-confirm">Confirmar y Enviar a Cocina 🍳</button>
      `,
      size: 'lg'
    });

    document.body.appendChild(verificationModal.mount());

    // Search filter
    verificationModal.$('#prod-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      verificationModal.$$('.product-item-row').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
      });
    });

    // Add product to cart
    verificationModal.$('#prod-list')?.addEventListener('click', (e) => {
      const row = e.target.closest('.product-item-row');
      if (row) {
        const prodId = row.getAttribute('data-id');
        this.addToCart(prodId, verificationModal);
      }
    });

    // Remove item from cart
    verificationModal.$('#cart-list')?.addEventListener('click', (e) => {
      const delBtn = e.target.closest('.btn-cart-remove');
      if (delBtn) {
        const idx = Number(delBtn.getAttribute('data-idx'));
        this.state.cart.splice(idx, 1);
        this.updateCartUI(verificationModal);
      }
    });

    // Cancel / Save
    verificationModal.$('#btn-ver-cancel').addEventListener('click', () => verificationModal.close());
    verificationModal.$('#btn-ver-confirm').addEventListener('click', async () => {
      const total = this.state.cart.reduce((sum, item) => sum + item.total, 0);
      try {
        await FirestoreService.update('orders', orderId, {
          items: this.state.cart,
          total,
          status: 'EN_COCINA',
          waiterName: this.waiterName,
          updatedAt: Date.now()
        });

        // Leer la mesa directamente con readPath (retorna el valor, no un listener ID)
        const currentTable = await FirestoreService.readPath(`${this.companyId}/tables/${order.tableId}`);

        let activeOrderIds = currentTable?.activeOrderIds || [];
        if (typeof activeOrderIds === 'string') activeOrderIds = [activeOrderIds];
        if (!activeOrderIds.includes(orderId)) activeOrderIds.push(orderId);

        const tableTotal = (currentTable?.orderTotal || 0) + (total - Number(order.total || 0));

        await FirestoreService.update('tables', order.tableId, {
          status: 'BUSY',
          activeOrderId: orderId,
          activeOrderIds,
          waiterName: this.waiterName,
          orderTotal: tableTotal
        });

        NotificationService.success('Comanda verificada y enviada a cocina.');
        verificationModal.close();
      } catch (err) {
        console.error(err);
        NotificationService.error('Error al confirmar el pedido.');
      }
    });

    this.updateCartUI(verificationModal);
  }

  addToCart(prodId, modal) {
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
    this.updateCartUI(modal);
    NotificationService.success(`Agregado: ${prod.name}`);
  }

  updateCartUI(modal) {
    const cartList = modal.$('#cart-list');
    const totalVal = modal.$('#order-total-val');
    const confirmBtn = modal.$('#btn-ver-confirm');
    if (!cartList) return;

    if (this.state.cart.length === 0) {
      cartList.innerHTML = `<p class="text-xs text-secondary py-5 text-center">No hay productos agregados.</p>`;
      if (confirmBtn) confirmBtn.disabled = true;
      if (totalVal) totalVal.textContent = '$0.00';
      return;
    }

    if (confirmBtn) confirmBtn.disabled = false;

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

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.layout.unmount();
    super.unmount();
  }
}