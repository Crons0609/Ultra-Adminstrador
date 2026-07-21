/**
 * @file cart.view.js
 * @description Vista del carrito de compras para el cliente.
 * Muestra el resumen de productos elegidos y permite enviar el pedido a confirmación del mesero.
 */

import { Component } from '../../../core/component.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';

export class CartView extends Component {
  constructor(params = {}) {
    super(params);
    this.companyId = sessionStorage.getItem('ua_customer_companyId') || '';
    this.branchId = sessionStorage.getItem('ua_customer_branchId') || 'main';
    this.tableId = sessionStorage.getItem('ua_customer_tableId') || '';
    this.accountType = sessionStorage.getItem('ua_customer_accountType') || 'CONJUNTA';
    this.clientName = sessionStorage.getItem('ua_customer_clientName') || '';
    
    this.state = {
      cart: JSON.parse(sessionStorage.getItem('ua_customer_cart') || '[]'),
      notes: '',
      sending: false
    };
  }

  mount() {
    const root = document.createElement('div');
    root.className = 'public-catalog-root';
    this.element = root;

    if (!this.companyId || !this.tableId) {
      root.innerHTML = `
        <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px;">
          <div class="card p-8 text-center" style="max-width: 400px; border-top: 4px solid var(--color-danger);">
            <div style="font-size: 3rem; margin-bottom: 15px;">⚠️</div>
            <h3 class="font-bold text-lg">Error de Acceso</h3>
            <p class="text-xs text-secondary mt-2">No se encontró una sesión activa de mesa. Por favor escanea el código QR de tu mesa nuevamente.</p>
          </div>
        </div>
      `;
      return root;
    }

    this.renderCart(root);
    return root;
  }

  renderCart(root) {
    const total = this.state.cart.reduce((sum, item) => sum + item.total, 0);

    root.innerHTML = `
      <style>
        .cart-container {
          max-width: 600px;
          margin: 0 auto;
          padding: var(--space-5) var(--space-4);
          display: flex;
          flex-direction: column;
          gap: var(--space-5);
        }
        .cart-header {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          border-bottom: 1px solid var(--pub-border);
          padding-bottom: var(--space-4);
        }
        .btn-back-menu {
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--pub-border);
          border-radius: 8px;
          padding: 8px 14px;
          font-size: 0.8rem;
          color: var(--pub-text);
          cursor: pointer;
          font-weight: 600;
          transition: all 0.2s;
        }
        .btn-back-menu:hover { background: rgba(255,255,255,0.08); }
        .cart-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-4) 0;
          border-bottom: 1px solid var(--pub-border);
        }
        .qty-control {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--pub-border);
          border-radius: 8px;
          padding: 4px 8px;
        }
        .qty-btn {
          background: none; border: none; color: var(--pub-text);
          font-size: 1.1rem; font-weight: 700; cursor: pointer;
          width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
          border-radius: 4px; transition: background 0.2s;
        }
        .qty-btn:hover { background: rgba(255,255,255,0.08); }
      </style>

      <div class="cart-container animate-fade-in">
        <!-- Header -->
        <div class="cart-header">
          <button class="btn-back-menu" id="btn-back">← Menú</button>
          <div>
            <h2 class="font-bold" style="font-size: 1.25rem; color: var(--pub-text);">Tu Pedido</h2>
            <p class="text-xs text-secondary">Mesa ${this.tableId.replace('mesa-', '')} · ${this.accountType === 'CONJUNTA' ? 'Cuenta Conjunta' : `Cuenta Separada (${this.clientName})`}</p>
          </div>
        </div>

        <!-- Cart List -->
        <div class="card p-5" style="background:var(--pub-surface); border-color:var(--pub-border);">
          ${this.state.cart.length === 0 ? `
            <div class="text-center py-10 text-secondary">
              <span style="font-size: 3rem; display:block; margin-bottom:10px;">🛒</span>
              <p class="font-semibold">Tu carrito está vacío</p>
              <p class="text-xs text-secondary mt-1">Regresa al menú para agregar platillos y bebidas.</p>
            </div>
          ` : `
            <div class="d-flex flex-column">
              ${this.state.cart.map((item, idx) => `
                <div class="cart-item">
                  <div>
                    <h4 class="font-bold text-sm" style="color:var(--pub-text);">${item.name}</h4>
                    <span class="text-xs text-secondary">$${item.price.toFixed(2)} c/u</span>
                  </div>
                  <div class="d-flex align-items-center gap-4">
                    <div class="qty-control">
                      <button class="qty-btn btn-qty-dec" data-idx="${idx}">-</button>
                      <strong style="font-size:0.9rem; min-width:14px; text-align:center;">${item.qty}</strong>
                      <button class="qty-btn btn-qty-inc" data-idx="${idx}">+</button>
                    </div>
                    <strong class="text-sm" style="color:var(--pub-primary); min-width: 60px; text-align: right;">$${item.total.toFixed(2)}</strong>
                  </div>
                </div>
              `).join('')}

              <div class="d-flex justify-content-between align-items-center mt-5" style="border-top:1px solid var(--pub-border); padding-top:var(--space-4);">
                <strong class="text-md" style="color:var(--pub-text);">Total a pagar:</strong>
                <strong class="text-lg" style="color:var(--pub-primary); font-size:1.4rem;">$${total.toFixed(2)}</strong>
              </div>
            </div>
          `}
        </div>

        <!-- Special Notes (Only show if cart has items) -->
        ${this.state.cart.length > 0 ? `
          <div class="form-group">
            <label class="form-label" for="order-notes" style="font-size: 0.82rem; font-weight:600; color:var(--pub-text);">Instrucciones / Notas Especiales</label>
            <textarea id="order-notes" class="input input-md" placeholder="Ej. Sin cebolla, aderezo aparte, bien cocido..." rows="2" style="background:var(--pub-surface); color:var(--pub-text); border-color:var(--pub-border); font-size:0.85rem;">${this.state.notes}</textarea>
          </div>

          <button class="btn btn-primary w-full py-3 font-semibold" id="btn-send-order" style="background:var(--pub-primary); border:none; border-radius:10px; font-size:0.95rem; height:48px;" ${this.state.sending ? 'disabled' : ''}>
            ${this.state.sending ? 'Enviando Pedido... ⏳' : 'Confirmar y Enviar Pedido 🍳'}
          </button>
        ` : ''}
      </div>
    `;

    this.bindCartEvents(root);
  }

  bindCartEvents(root) {
    root.querySelector('#btn-back')?.addEventListener('click', () => {
      window.location.hash = `/customer/menu/${this.companyId}/${this.branchId}/${this.tableId}`;
    });

    const notesArea = root.querySelector('#order-notes');
    if (notesArea) {
      notesArea.addEventListener('input', (e) => {
        this.state.notes = e.target.value;
      });
    }

    // Inc/Dec buttons delegation
    root.querySelector('.card')?.addEventListener('click', (e) => {
      const incBtn = e.target.closest('.btn-qty-inc');
      const decBtn = e.target.closest('.btn-qty-dec');
      
      if (incBtn) {
        const idx = Number(incBtn.getAttribute('data-idx'));
        this.state.cart[idx].qty++;
        this.state.cart[idx].total = this.state.cart[idx].qty * this.state.cart[idx].price;
        this.saveAndRender();
      } else if (decBtn) {
        const idx = Number(decBtn.getAttribute('data-idx'));
        if (this.state.cart[idx].qty > 1) {
          this.state.cart[idx].qty--;
          this.state.cart[idx].total = this.state.cart[idx].qty * this.state.cart[idx].price;
        } else {
          this.state.cart.splice(idx, 1);
        }
        this.saveAndRender();
      }
    });

    root.querySelector('#btn-send-order')?.addEventListener('click', () => this.sendOrder());
  }

  saveAndRender() {
    sessionStorage.setItem('ua_customer_cart', JSON.stringify(this.state.cart));
    this.renderCart(this.element);
  }

  async sendOrder() {
    if (this.state.cart.length === 0) return;
    this.state.sending = true;
    this.renderCart(this.element);

    const total = this.state.cart.reduce((sum, item) => sum + item.total, 0);
    const companyId = this.companyId;

    // Generar un ID único para el pedido
    const orderId = `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const orderPayload = {
      id: orderId,
      tableId: this.tableId,
      tableName: `Mesa ${this.tableId.replace('mesa-', '')}`,
      branchId: this.branchId,
      accountType: this.accountType,
      clientName: this.clientName,
      items: this.state.cart,
      total,
      notes: this.state.notes || '',
      status: 'PENDIENTE_VERIFICACION',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    try {
      // 1. Escribir el pedido en la ruta correcta del tenant: {companyId}/orders/{orderId}
      await FirestoreService.writePath(`${companyId}/orders/${orderId}`, orderPayload);
      console.log(`[CartView] ✅ Pedido creado: ${companyId}/orders/${orderId}`);

      // 2. Leer el estado actual de la mesa usando readPath (retorna el valor directamente)
      const currentTable = await FirestoreService.readPath(`${companyId}/tables/${this.tableId}`);

      // Agregar el nuevo orderId a la lista de órdenes activas de la mesa
      let activeOrderIds = currentTable?.activeOrderIds || [];
      if (typeof activeOrderIds === 'string') activeOrderIds = [activeOrderIds];
      if (!activeOrderIds.includes(orderId)) activeOrderIds.push(orderId);

      const tableTotal = (currentTable?.orderTotal || 0) + total;

      // 3. Actualizar el estado de la mesa con updatePath
      await FirestoreService.updatePath(`${companyId}/tables/${this.tableId}`, {
        status: 'BUSY',
        activeOrderId: orderId,
        activeOrderIds,
        orderTotal: tableTotal,
        updatedAt: Date.now()
      });
      console.log(`[CartView] ✅ Mesa actualizada: ${companyId}/tables/${this.tableId}`);

      // 4. Guardar orderId en sesión, limpiar carrito y redirigir al estado del pedido
      sessionStorage.setItem('ua_customer_orderId', orderId);
      sessionStorage.removeItem('ua_customer_cart');
      NotificationService.success('¡Pedido enviado al mesero con éxito!');
      window.location.hash = '/customer/order-status';
    } catch (e) {
      console.error('[CartView] Failed to send order:', e);
      NotificationService.error('Error al enviar el pedido. Por favor intenta de nuevo.');
      this.state.sending = false;
      this.renderCart(this.element);
    }
  }
}