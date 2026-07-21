import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { GlobalStore } from '../../../core/state.js';
import { getBusinessCategory } from '../../../config/business-types.config.js';

export class KDSView extends Component {
  constructor(params = {}) {
    super(params);
    this.state = {
      orders: [],
      loading: true,
      time: Date.now()
    };

    const company = GlobalStore.getState().currentCompany || {};
    this.businessCategory = getBusinessCategory(company.businessType || '');
    this.isBar = this.businessCategory === 'BAR_DISCOTECA';

    this.layout = new PageLayout({
      title: this.isBar ? 'Pantalla de Barra (BDS)' : 'Pantalla de Cocina (KDS)',
      subtitle: this.isBar 
        ? 'Control en tiempo real de bebidas, tragos y cócteles ordenados.' 
        : 'Control en tiempo real de órdenes entrantes y tiempos de preparación.',
      actionHTML: `
        <span id="kds-timer-sync" class="badge" style="background:#3b82f622; color:#3b82f6; border:1px solid #3b82f644; padding:4px 10px;">
          ⏱️ Auto-actualizando
        </span>
      `,
      contentHTML: `
        <style>
          .kds-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: var(--space-4);
          }
          .kds-card {
            background: var(--color-bg-secondary);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            padding: var(--space-4);
            display: flex;
            flex-direction: column;
            gap: var(--space-3);
            border-left: 5px solid var(--color-accent);
            position: relative;
          }
          .kds-card.warning-time {
            border-left: 5px solid var(--color-danger);
            animation: border-flash 1.5s infinite;
          }
          @keyframes border-flash {
            0%, 100% { border-left-color: var(--color-danger); }
            50% { border-left-color: transparent; }
          }
          .kds-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--color-border);
            padding-bottom: var(--space-2);
          }
          .kds-table-name {
            font-size: 1.2rem;
            font-weight: 700;
          }
          .kds-time-elapsed {
            font-size: 0.75rem;
            font-weight: 600;
            color: var(--color-text-secondary);
          }
          .kds-items-list {
            flex-grow: 1;
            font-size: 0.95rem;
            margin-bottom: var(--space-2);
          }
          .kds-item {
            padding: 6px 0;
            border-bottom: 1px dotted var(--color-border);
            display: flex;
            justify-content: space-between;
          }
          .kds-item-qty {
            font-weight: 700;
            margin-right: 8px;
            color: var(--color-accent);
          }
          .kds-btn {
            background: var(--color-success);
            color: #fff;
            border: none;
            padding: var(--space-2);
            border-radius: var(--radius-md);
            font-weight: 700;
            cursor: pointer;
            width: 100%;
            transition: opacity 0.2s;
          }
          .kds-btn:hover {
            opacity: 0.9;
          }
        </style>

        <div id="kds-container" class="kds-grid animate-fade-in">
          <p class="text-secondary text-center py-10 w-full">Cargando comandas activas...</p>
        </div>
      `
    });

    this.listeners = [];
  }

  mount() {
    const element = this.layout.mount();
    this.subscribeToKDS(element);
    this.bindEvents(element);
    
    // Start interval timer to update elapsed times every 30s
    this.timer = setInterval(() => {
      this.state.time = Date.now();
      this.renderKDS(element);
    }, 30000);

    return element;
  }

  subscribeToKDS(element) {
    try {
      const listener = FirestoreService.listenToTenant('orders', (orders) => {
        this.state.orders = orders || [];
        this.renderKDS(element);
      });
      this.listeners.push(listener);
    } catch (e) {
      console.error('[KDS] DB Subscription error:', e);
    }
  }

  bindEvents(element) {
    const grid = element.querySelector('#kds-container');
    if (grid) {
      grid.addEventListener('click', (e) => {
        const startBtn = e.target.closest('.kds-btn-start');
        const readyBtn = e.target.closest('.kds-btn-ready');

        if (startBtn) {
          const orderId = startBtn.getAttribute('data-id');
          this.updateOrderStatus(orderId, 'EN_PREPARACION', '¡Preparación iniciada!');
        } else if (readyBtn) {
          const orderId = readyBtn.getAttribute('data-id');
          this.updateOrderStatus(orderId, 'READY', this.isBar ? 'Bebida lista. Mesero notificado.' : 'Comanda LISTA. Mesero notificado.');
        }
      });
    }
  }

  renderKDS(element) {
    const grid = element.querySelector('#kds-container');
    if (!grid) return;

    // Cocina/Barra muestra: EN_COCINA (nuevo) y EN_PREPARACION (en proceso)
    const activeOrders = this.state.orders.filter(o =>
      o.status === 'EN_COCINA' || o.status === 'EN_PREPARACION' || o.status === 'PENDIENTE'
    );

    if (activeOrders.length === 0) {
      grid.innerHTML = `
        <div class="card p-10 text-center w-full text-secondary" style="grid-column: 1 / -1; display:flex; flex-direction:column; align-items:center;">
          <span style="font-size:3.5rem;">${this.isBar ? '🍹' : '🍳'}</span>
          <h4 class="font-bold mt-2">${this.isBar ? '¡Barra Despejada!' : '¡Cocina Limpia!'}</h4>
          <p class="text-xs text-secondary mt-1">${this.isBar ? 'No hay bebidas en cola de preparación en este momento.' : 'No hay comandas pendientes de preparación.'}</p>
        </div>
      `;
      return;
    }

    // Primero las que están EN_COCINA (nuevas), luego EN_PREPARACION
    const sorted = activeOrders.sort((a, b) => {
      const priority = { 'EN_COCINA': 0, 'PENDIENTE': 0, 'EN_PREPARACION': 1 };
      return (priority[a.status] ?? 2) - (priority[b.status] ?? 2);
    });

    grid.innerHTML = sorted.map(o => {
      const created = o.createdAt || Date.now();
      const elapsedMs = this.state.time - created;
      const elapsedMins = Math.floor(elapsedMs / (1000 * 60));

      const limitMinutes = this.isBar ? 8 : 15;
      const warningClass = elapsedMins >= limitMinutes ? 'warning-time' : '';
      const timeText = elapsedMins === 0 ? 'Hace un momento' : `Hace ${elapsedMins} min`;

      const isPreparing = o.status === 'EN_PREPARACION';
      const accentColor = this.isBar ? '#a855f7' : (isPreparing ? '#f59e0b' : 'var(--color-accent)');

      const statusBadge = isPreparing
        ? `<span style="font-size:0.7rem; background:#f59e0b22; color:#f59e0b; border:1px solid #f59e0b44; border-radius:4px; padding:2px 7px; font-weight:700;">🔥 En Preparación</span>`
        : `<span style="font-size:0.7rem; background:#ef444422; color:#ef4444; border:1px solid #ef444444; border-radius:4px; padding:2px 7px; font-weight:700;">🆕 Nueva</span>`;

      const itemsHTML = (o.items || []).map(item => `
        <div class="kds-item">
          <div>
            <span class="kds-item-qty">${item.qty}x</span>
            <span>${item.name}</span>
            ${item.notes ? `<span style="font-size:0.72rem; color:var(--color-text-secondary); display:block; margin-left:20px;">📝 ${item.notes}</span>` : ''}
          </div>
        </div>
      `).join('');

      const label = o.clientName ? ` · ${o.clientName}` : '';
      const notesBlock = o.notes ? `<div style="font-size:0.75rem; color:var(--color-text-secondary); background:rgba(255,255,255,0.03); border:1px solid var(--color-border); border-radius:4px; padding:6px 8px;">📝 ${o.notes}</div>` : '';

      const actionBtn = isPreparing
        ? `<button class="kds-btn kds-btn-ready" data-id="${o.id}" style="background:var(--color-success);">${this.isBar ? '🍹 Bebida Lista ✓' : '✅ Listo para Entregar'}</button>`
        : `<button class="kds-btn kds-btn-start" data-id="${o.id}" style="background:#f59e0b;">${this.isBar ? '🍹 Preparar Bebida' : '🔥 Iniciar Preparación'}</button>`;

      return `
        <div class="kds-card ${warningClass}" style="border-left-color:${accentColor};">
          <div class="kds-header">
            <div>
              <span class="kds-table-name">${o.tableName || `Mesa ${o.tableId}`}</span>
              <span class="text-xs text-secondary d-block" style="margin-top:2px;">${o.accountType || ''}${label}</span>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
              ${statusBadge}
              <span class="kds-time-elapsed">${timeText}</span>
            </div>
          </div>
          <div class="kds-items-list">
            ${itemsHTML}
          </div>
          ${notesBlock}
          ${actionBtn}
        </div>
      `;
    }).join('');
  }

  async updateOrderStatus(orderId, newStatus, successMsg) {
    try {
      const updates = { status: newStatus, updatedAt: Date.now() };
      if (newStatus === 'EN_PREPARACION') updates.startedAt = Date.now();
      if (newStatus === 'READY') updates.readyAt = Date.now();
      await FirestoreService.update('orders', orderId, updates);
      NotificationService.success(successMsg);
    } catch (e) {
      console.error('[KDS] Error al actualizar estado:', e);
      NotificationService.error('Error al actualizar el estado de la comanda.');
    }
  }

  unmount() {
    if (this.timer) clearInterval(this.timer);
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.layout.unmount();
    super.unmount();
  }
}