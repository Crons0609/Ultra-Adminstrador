import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';

export class WaiterNotificationsView extends Component {
  constructor(params = {}) {
    super(params);
    this.state = { orders: [] };

    this.layout = new PageLayout({
      title: 'Notificaciones del Servicio',
      subtitle: 'Alertas en tiempo real: pedidos listos, cambios de estado y solicitudes de mesa.',
      actionHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-mark-all-read">✓ Marcar todo como visto</button>
      `,
      contentHTML: `
        <style>
          .notif-list { display: flex; flex-direction: column; gap: var(--space-3); }
          .notif-item {
            display: flex; align-items: flex-start; gap: var(--space-3);
            background: var(--color-bg-secondary); border: 1px solid var(--color-border);
            border-radius: var(--radius-lg); padding: var(--space-4);
            transition: transform 0.2s;
          }
          .notif-item.unread { border-left: 4px solid var(--color-accent); background: color-mix(in srgb, var(--color-accent) 5%, var(--color-bg-secondary)); }
          .notif-item.ready { border-left: 4px solid var(--color-success); background: color-mix(in srgb, var(--color-success) 6%, var(--color-bg-secondary)); }
          .notif-icon { font-size: 1.8rem; flex-shrink: 0; }
          .notif-body { flex-grow: 1; }
          .notif-title { font-weight: 700; font-size: 0.9rem; margin-bottom: 4px; }
          .notif-desc { font-size: 0.8rem; color: var(--color-text-secondary); }
          .notif-time { font-size: 0.72rem; color: var(--color-text-secondary); margin-top: 4px; }
        </style>
        <div id="notif-container" class="notif-list animate-fade-in">
          <p class="text-secondary text-center py-10">Cargando notificaciones...</p>
        </div>
      `
    });
    this.listeners = [];
  }

  mount() {
    const element = this.layout.mount();
    this.subscribeToOrders(element);
    element.querySelector('#btn-mark-all-read')?.addEventListener('click', () => {
      NotificationService.success('Notificaciones marcadas como leídas.');
    });
    return element;
  }

  subscribeToOrders(element) {
    try {
      const listener = FirestoreService.listenToTenant('orders', (orders) => {
        this.state.orders = orders || [];
        this.renderNotifications(element);
      });
      this.listeners.push(listener);
    } catch (e) { console.error(e); }
  }

  renderNotifications(element) {
    const container = element.querySelector('#notif-container');
    if (!container) return;

    const now = Date.now();

    // Build notification events from orders
    const notifications = [];

    this.state.orders.forEach(o => {
      const ago = Math.floor((now - (o.updatedAt || o.createdAt || now)) / 60000);
      const agoText = ago <= 0 ? 'Hace un momento' : `Hace ${ago} min`;

      if (o.status === 'READY' || o.status === 'LISTO') {
        notifications.push({
          icon: '🔔',
          type: 'ready',
          title: `¡Comanda Lista! — ${o.tableName || `Mesa ${o.tableId}`}`,
          desc: `${(o.items || []).length} artículos listos para ser entregados al cliente.`,
          time: agoText,
          order: o
        });
      } else if (o.status === 'ESPERANDO_PAGO') {
        notifications.push({
          icon: '🧾',
          type: 'unread',
          title: `Cuenta Solicitada — ${o.tableName || `Mesa ${o.tableId}`}`,
          desc: `El cliente solicitó la cuenta. Total: $${o.total}`,
          time: agoText,
          order: o
        });
      }
    });

    if (notifications.length === 0) {
      container.innerHTML = `
        <div class="card p-10 text-center text-secondary">
          <div style="font-size:3rem; margin-bottom:10px;">🔕</div>
          <h4 class="font-bold">Sin notificaciones pendientes</h4>
          <p class="text-xs mt-1">Todo está al día. Las alertas de cocina y clientes aparecerán aquí.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = notifications.map(n => `
      <div class="notif-item ${n.type}">
        <div class="notif-icon">${n.icon}</div>
        <div class="notif-body">
          <div class="notif-title">${n.title}</div>
          <div class="notif-desc">${n.desc}</div>
          <div class="notif-time">${n.time}</div>
        </div>
      </div>
    `).join('');
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.layout.unmount();
    super.unmount();
  }
}