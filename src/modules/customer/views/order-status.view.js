/**
 * @file order-status.view.js
 * @description Permite al cliente realizar el seguimiento de su pedido en tiempo real, solicitar la cuenta y consultar el consumo acumulado.
 */

import { Component } from '../../../core/component.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { Modal } from '../../../components/ui/modal.js';
import { getBusinessCategory } from '../../../config/business-types.config.js';

export class OrderStatusView extends Component {
  constructor(params = {}) {
    super(params);
    this.companyId = sessionStorage.getItem('ua_customer_companyId') || '';
    this.tableId = sessionStorage.getItem('ua_customer_tableId') || '';
    this.orderId = sessionStorage.getItem('ua_customer_orderId') || '';
    this.accountType = sessionStorage.getItem('ua_customer_accountType') || 'CONJUNTA';
    this.clientName = sessionStorage.getItem('ua_customer_clientName') || '';

    this.state = {
      order: null,
      orders: [],
      info: null,
      loading: true,
      requestingBill: false
    };

    this.listeners = [];
  }

  mount() {
    const root = document.createElement('div');
    root.className = 'public-catalog-root';
    this.element = root;

    if (!this.companyId || !this.orderId) {
      root.innerHTML = `
        <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px;">
          <div class="card p-8 text-center" style="max-width: 400px; border-top: 4px solid var(--color-danger);">
            <div style="font-size: 3rem; margin-bottom: 15px;">🔍</div>
            <h3 class="font-bold text-lg">Sin Pedido Activo</h3>
            <p class="text-xs text-secondary mt-2">No se encontró ningún pedido reciente registrado en este dispositivo.</p>
            <button class="btn btn-secondary btn-sm mt-4 w-full" id="btn-err-back">Volver al menú</button>
          </div>
        </div>
      `;
      root.querySelector('#btn-err-back')?.addEventListener('click', () => {
        window.location.hash = `/customer/menu/${this.companyId}/main/${this.tableId}`;
      });
      return root;
    }

    this.subscribeToData(root);
    return root;
  }

  subscribeToData(root) {
    try {
      // 1. Escuchar el perfil local del negocio para cargar la marca
      const infoUnsub = FirestoreService.listenToPathRaw(`${this.companyId}/informacion_local`, (info) => {
        this.state.info = info || {};
        this.renderStatus(root);
      });
      this.listeners.push(infoUnsub);

      // 2. Escuchar el estado de este pedido específico (ruta tenant correcta)
      const unsub = FirestoreService.listenToPathRaw(`${this.companyId}/orders/${this.orderId}`, (order) => {
        this.state.order = order;
        this.state.loading = false;
        this.renderStatus(root);
      });
      this.listeners.push(unsub);

      // 2b. Escuchar la mesa para obtener el cargo y nombre del mesero/personal asignado en tiempo real
      if (this.tableId) {
        const tableUnsub = FirestoreService.listenToPathRaw(`${this.companyId}/tables/${this.tableId}`, (table) => {
          this.state.table = table;
          this.renderStatus(root);
        });
        this.listeners.push(tableUnsub);
      }

      // 3. Escuchar todos los pedidos de esta mesa para consumo acumulado
      const ordersUnsub = FirestoreService.listenToPathRaw(`${this.companyId}/orders`, (orders) => {
        this.state.orders = orders ? Object.entries(orders).map(([id, o]) => ({ id, ...o })) : [];
        this.renderStatus(root);
      });
      this.listeners.push(ordersUnsub);

    } catch (e) {
      console.error('[OrderStatusView] Subscription failed:', e);
      this.state.loading = false;
      this.renderStatus(root);
    }
  }

  renderStatus(root) {
    const order = this.state.order;
    const info = this.state.info || {};

    if (this.state.loading) {
      root.innerHTML = `
        <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center;">
          <p class="text-secondary text-sm">Cargando estado del pedido...</p>
        </div>
      `;
      return;
    }

    if (!order) {
      root.innerHTML = `
        <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px;">
          <div class="card p-8 text-center" style="max-width: 400px; border-top: 4px solid var(--color-danger);">
            <div style="font-size: 3rem; margin-bottom: 15px;">❌</div>
            <h3 class="font-bold text-lg">Pedido No Encontrado</h3>
            <p class="text-xs text-secondary mt-2">El pedido puede haber sido completado o cancelado.</p>
            <button class="btn btn-secondary btn-sm mt-4 w-full" id="btn-not-found-back">Ir al Menú</button>
          </div>
        </div>
      `;
      root.querySelector('#btn-not-found-back')?.addEventListener('click', () => {
        window.location.hash = `/customer/menu/${this.companyId}/main/${this.tableId}`;
      });
      return;
    }

    // Business category styling (Bar/Discoteca nocturne theme)
    const category = getBusinessCategory(info.businessType || '');
    const isBar = category === 'BAR_DISCOTECA';

    if (isBar) {
      root.style.setProperty('--pub-primary', '#a855f7'); // Neon Purple
      root.style.setProperty('--pub-bg', '#09090b'); // Dark Vibe
      root.style.setProperty('--pub-surface', '#121217'); // Dark Card
      root.style.setProperty('--pub-border', '#221e2f');
      root.style.setProperty('--pub-text', '#fafafa');
      root.style.setProperty('--pub-text-sec', '#9ca3af');
    }

    const status = order.status || 'PENDIENTE_VERIFICACION';
    const table = this.state.table || {};
    const waiterRoleName = table.assignedWaiterRole || order.assignedWaiterRole || (isBar ? 'Bartender' : 'Mesero');
    
    const steps = [
      { key: 'PENDIENTE_VERIFICACION', label: isBar ? 'Cola de Barra' : 'Verificación', desc: `El ${waiterRoleName.toLowerCase()} está corroborando tu orden`, icon: '📥' },
      { key: 'EN_COCINA', label: isBar ? 'En Barra' : 'En Cocina', desc: isBar ? 'El bartender recibió tu pedido' : 'Cocina recibió la comanda', icon: isBar ? '🍹' : '🍳' },
      { key: 'EN_PREPARACION', label: isBar ? 'Preparando' : 'En Preparación', desc: isBar ? 'El bartender está preparando tus bebidas' : 'Tu comida está siendo preparada', icon: '🔥' },
      { key: 'READY', label: '¡Listo!', desc: '¡Tu pedido está listo para servirse!', icon: '🔔' },
      { key: 'ENTREGADO', label: 'Entregado', desc: '¡Que disfrutes tu servicio!', icon: '🍽️' },
      { key: 'ESPERANDO_PAGO', label: 'Cerrando cuenta', desc: 'El personal se acerca a cobrar', icon: '🧾' },
      { key: 'COMPLETED', label: 'Completado', desc: '¡Gracias por visitarnos!', icon: '🎉' }
    ];

    const currentIdx = steps.findIndex(s => s.key === status);
    const progressPercent = Math.max(0, Math.min(100, (currentIdx / (steps.length - 1)) * 100));

    // Calculate accumulated consumption
    const activeConsumption = this.state.orders.filter(o => 
      o.tableId === this.tableId && 
      (this.accountType === 'SEPARADO' ? o.clientName === this.clientName : true) &&
      o.status !== 'COMPLETED' && 
      o.status !== 'CANCELADA'
    );
    const accumulatedTotal = activeConsumption.reduce((sum, o) => sum + Number(o.total || 0), 0);

    root.innerHTML = `
      <style>
        .status-container {
          max-width: 500px;
          margin: 0 auto;
          padding: var(--space-5) var(--space-4);
          display: flex;
          flex-direction: column;
          gap: var(--space-5);
        }
        .progress-track {
          position: relative;
          height: 8px;
          background: rgba(255,255,255,0.06);
          border-radius: 4px;
          margin: 20px 0;
        }
        .progress-fill {
          height: 100%;
          background: var(--pub-primary);
          border-radius: 4px;
          transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .step-item {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          padding: 12px;
          border-radius: 10px;
          border: 1px solid transparent;
          background: transparent;
          transition: all 0.25s;
        }
        .step-item.active {
          background: rgba(124, 117, 255, 0.06);
          border-color: rgba(124, 117, 255, 0.15);
        }
        .step-item.completed {
          opacity: 0.6;
        }
        .step-icon-wrap {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--pub-border);
          transition: all 0.25s;
        }
        .step-item.active .step-icon-wrap {
          background: var(--pub-primary);
          color: #fff;
          border-color: var(--pub-primary);
          box-shadow: 0 0 10px rgba(124, 117, 255, 0.3);
        }
        .step-item.completed .step-icon-wrap {
          background: rgba(16, 185, 129, 0.1);
          color: #10b981;
          border-color: rgba(16, 185, 129, 0.2);
        }
        .step-title {
          font-weight: 700;
          font-size: 0.88rem;
          color: var(--pub-text);
        }
        .step-desc {
          font-size: 0.72rem;
          color: var(--pub-text-sec);
          margin-top: 1px;
        }
        .order-summary-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.8rem;
          padding: 6px 0;
          border-bottom: 1px dotted var(--pub-border);
        }
      </style>

      <div class="status-container animate-fade-in">
        <!-- Header -->
        <div class="text-center py-4">
          <span style="font-size: 2.5rem;">${isBar ? '🍹' : '🔥'}</span>
          <h2 class="font-bold mt-2" style="font-size: 1.3rem; color: var(--pub-text);">${isBar ? 'Estado de tu Bebida' : 'Estado de tu Pedido'}</h2>
          <p class="text-xs text-secondary mt-1">Código: #${this.orderId.slice(-6).toUpperCase()} · Mesa: ${this.tableId.replace('mesa-', '')}</p>
        </div>

        <!-- Progress Bar -->
        <div class="card p-5" style="background:var(--pub-surface); border-color:var(--pub-border);">
          <div class="progress-track">
            <div class="progress-fill" style="width: ${progressPercent}%;"></div>
          </div>
          <div class="d-flex flex-column gap-2 mt-4">
            ${steps.map((s, idx) => {
              const isActive = s.key === status;
              const isCompleted = idx < currentIdx;
              const cls = isActive ? 'active' : (isCompleted ? 'completed' : '');
              return `
                <div class="step-item ${cls}">
                  <div class="step-icon-wrap">${isCompleted ? '✓' : s.icon}</div>
                  <div>
                    <div class="step-title">${s.label}</div>
                    <div class="step-desc">${s.desc}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Order details -->
        <div class="card p-5" style="background:var(--pub-surface); border-color:var(--pub-border);">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h3 class="font-bold text-sm" style="color:var(--pub-text); margin:0;">Detalle de este Pedido</h3>
            ${accumulatedTotal > 0 ? `
              <button class="btn btn-secondary btn-xs" id="btn-status-cons" style="font-size:0.7rem; border-radius:6px; font-weight:700; border-color:var(--pub-border);">
                🧾 Consumo Total
              </button>
            ` : ''}
          </div>
          <div class="d-flex flex-column">
            ${(order.items || []).map(item => `
              <div class="order-summary-row">
                <span style="color:var(--pub-text);">${item.qty}x ${item.name}</span>
                <strong style="color:var(--pub-primary);">$${item.total.toFixed(2)}</strong>
              </div>
            `).join('')}
            <div class="d-flex justify-content-between mt-4 font-bold" style="font-size: 0.95rem;">
              <span style="color:var(--pub-text);">Total Pedido:</span>
              <strong style="color:var(--pub-primary); font-size:1.15rem;">$${Number(order.total || 0).toFixed(2)}</strong>
            </div>
            ${accumulatedTotal > 0 && activeConsumption.length > 1 ? `
              <div class="d-flex justify-content-between mt-2 font-bold" style="font-size: 0.85rem; color:var(--pub-text-sec); border-top:1px solid var(--pub-border); padding-top:6px;">
                <span>Total Acumulado (Mesa):</span>
                <strong>$${accumulatedTotal.toFixed(2)}</strong>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Call to Action -->
        <div class="d-flex gap-3">
          <button class="btn btn-secondary w-full py-3 font-semibold" id="btn-order-more" style="border-radius:10px; font-size:0.88rem; height:46px;">
            Pedir algo más ➕
          </button>
          
          ${(status === 'ENTREGADO' || status === 'READY') ? `
            <button class="btn btn-primary w-full py-3 font-semibold" id="btn-ask-bill" style="background:#fb923c; border:none; border-radius:10px; font-size:0.88rem; height:46px;" ${this.state.requestingBill ? 'disabled' : ''}>
              ${this.state.requestingBill ? 'Solicitando... ⏳' : 'Pedir Cuenta 🧾'}
            </button>
          ` : ''}
        </div>
      </div>
    `;

    this.bindEvents(root);
  }

  bindEvents(root) {
    root.querySelector('#btn-order-more')?.addEventListener('click', () => {
      window.location.hash = `/customer/menu/${this.companyId}/main/${this.tableId}`;
    });

    root.querySelector('#btn-ask-bill')?.addEventListener('click', () => this.askForBill());
    root.querySelector('#btn-status-cons')?.addEventListener('click', () => this.openConsumptionModal());
  }

  openConsumptionModal() {
    const activeOrders = this.state.orders.filter(o => 
      o.tableId === this.tableId && 
      (this.accountType === 'SEPARADO' ? o.clientName === this.clientName : true) &&
      o.status !== 'COMPLETED' && 
      o.status !== 'CANCELADA'
    );

    const total = activeOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

    const bodyHTML = `
      <div class="d-flex flex-column gap-3" style="max-height: 60vh; overflow-y: auto; color: var(--pub-text);">
        <h4 class="font-bold text-sm mb-2" style="border-bottom:1px solid var(--pub-border); padding-bottom:8px;">Consumo Total Acumulado</h4>
        
        ${activeOrders.map(o => {
          const itemsHTML = (o.items || []).map(i => `
            <div class="d-flex justify-content-between text-xs py-1" style="color:var(--pub-text-sec);">
              <span>${i.qty}x ${i.name}</span>
              <span>$${Number(i.total || 0).toFixed(2)}</span>
            </div>
          `).join('');

          return `
            <div class="p-3 mb-2" style="background: rgba(255,255,255,0.01); border: 1px solid var(--pub-border); border-radius:8px;">
              <div class="d-flex justify-content-between font-bold text-xs mb-2">
                <span>Pedido #${o.id.slice(-6).toUpperCase()}</span>
                <span class="badge" style="background:#fb923c22; color:#fb923c; font-size:0.65rem;">${o.status}</span>
              </div>
              ${itemsHTML}
              <div class="d-flex justify-content-between text-xs font-bold mt-2" style="border-top: 1px dotted var(--pub-border); padding-top:4px;">
                <span>Subtotal Pedido</span>
                <span style="color:var(--pub-primary);">$${Number(o.total || 0).toFixed(2)}</span>
              </div>
            </div>
          `;
        }).join('')}

        <div class="d-flex justify-content-between font-bold text-md mt-3" style="border-top: 1px solid var(--pub-border); padding-top:10px; font-size:1.1rem;">
          <span>Consumo Total Parcial:</span>
          <span style="color:var(--pub-primary); font-size:1.25rem;">$${total.toFixed(2)}</span>
        </div>
      </div>
    `;

    const consumptionModal = new Modal({
      title: '🧾 Mi Consumo Acumulado',
      bodyHTML,
      footerHTML: `<button class="btn btn-secondary btn-sm" id="btn-cons-close">Cerrar</button>`
    });

    document.body.appendChild(consumptionModal.mount());
    consumptionModal.$('#btn-cons-close').addEventListener('click', () => consumptionModal.close());
  }

  async askForBill() {
    this.state.requestingBill = true;
    this.renderStatus(this.element);

    try {
      const companyId = this.companyId;
      const orderId = this.orderId;

      // 1. Actualizar el pedido a ESPERANDO_PAGO usando la ruta tenant correcta
      await FirestoreService.updatePath(`${companyId}/orders/${orderId}`, {
        status: 'ESPERANDO_PAGO',
        updatedAt: Date.now()
      });

      // 2. Marcar la mesa como BILL para que la cajera la detecte
      await FirestoreService.updatePath(`${companyId}/tables/${this.tableId}`, {
        status: 'BILL',
        updatedAt: Date.now()
      });

      const table = this.state.table || {};
      const waiterRoleName = table.assignedWaiterRole || 'Mesero';
      NotificationService.success(`La cuenta ha sido solicitada. El ${waiterRoleName.toLowerCase()} se acercará pronto.`);
    } catch (e) {
      console.error('[OrderStatusView] Bill request failed:', e);
      NotificationService.error('Error al solicitar la cuenta.');
    } finally {
      this.state.requestingBill = false;
      this.renderStatus(this.element);
    }
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    super.unmount();
  }
}