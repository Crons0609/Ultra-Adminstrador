/**
 * @file notification-center.js
 * @description In-app slide-out Notification Center component displaying received notifications with badges and routing.
 */

import { PushNotificationsCenterService } from '../../services/push-notifications-center.service.js';
import { GlobalStore } from '../../core/state.js';

export class NotificationCenter {

  static isOpen = false;

  /**
   * Toggle Notification Center overlay.
   */
  static async toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      await this.open();
    }
  }

  static async open() {
    this.isOpen = true;
    let overlay = document.getElementById('notification-center-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'notification-center-overlay';
      overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.6);
        backdrop-filter: blur(4px); z-index: 99990;
        display: flex; justify-content: flex-end;
        animation: ua-fade-in 0.2s ease;
      `;
      document.body.appendChild(overlay);

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.close();
      });
    }

    const currentUser = GlobalStore.getState().currentUser;
    const notifications = await PushNotificationsCenterService.getNotifications(currentUser?.uid);

    overlay.innerHTML = `
      <div style="
        width: 100%; max-width: 400px; height: 100%;
        background: var(--color-bg-secondary, #121215);
        border-left: 1px solid var(--color-border, rgba(255,255,255,0.1));
        display: flex; flex-direction: column;
        color: var(--color-text-primary, #fff);
        box-shadow: -10px 0 40px rgba(0,0,0,0.5);
        animation: ua-slide-left 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      ">
        <!-- Header -->
        <div style="
          padding: 18px 20px; border-bottom: 1px solid var(--color-border, rgba(255,255,255,0.08));
          display: flex; align-items: center; justify-content: space-between;
        ">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 1.2rem;">🔔</span>
            <h3 style="font-size: 1rem; font-weight: 700; margin: 0;">Centro de Notificaciones</h3>
          </div>
          <button id="notif-close-btn" style="
            background: transparent; border: none; color: #aaa;
            font-size: 1.2rem; cursor: pointer; padding: 4px 8px; border-radius: 6px;
          ">&times;</button>
        </div>

        <!-- Toolbar -->
        <div style="
          padding: 10px 20px; background: rgba(0,0,0,0.15);
          display: flex; justify-content: space-between; align-items: center;
          font-size: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.05);
        ">
          <span style="color: rgba(255,255,255,0.5);">${notifications.length} notificaciones</span>
          <button id="notif-mark-all-btn" style="
            background: transparent; border: none; color: var(--color-accent, #8b5cf6);
            font-weight: 600; cursor: pointer; font-size: 0.75rem;
          ">Marcar todas como leídas</button>
        </div>

        <!-- List -->
        <div id="notif-list-container" style="flex: 1; overflow-y: auto; padding: 12px 16px;">
          ${this.renderList(notifications, currentUser?.uid)}
        </div>
      </div>

      <style>
        @keyframes ua-slide-left {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes ua-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      </style>
    `;

    document.getElementById('notif-close-btn').addEventListener('click', () => this.close());
    document.getElementById('notif-mark-all-btn').addEventListener('click', async () => {
      await PushNotificationsCenterService.markAllAsRead(currentUser?.uid);
      const updated = await PushNotificationsCenterService.getNotifications(currentUser?.uid);
      document.getElementById('notif-list-container').innerHTML = this.renderList(updated, currentUser?.uid);
    });

    this.bindItemClicks(currentUser?.uid);
  }

  static close() {
    this.isOpen = false;
    const overlay = document.getElementById('notification-center-overlay');
    if (overlay) overlay.remove();
  }

  static renderList(notifications, userId) {
    if (!notifications || notifications.length === 0) {
      return `
        <div style="text-align: center; padding: 60px 20px; color: rgba(255,255,255,0.4);">
          <div style="font-size: 40px; margin-bottom: 12px; opacity: 0.5;">🔕</div>
          <p style="font-size: 0.9rem; font-weight: 600; margin: 0 0 4px;">Sin notificaciones</p>
          <p style="font-size: 0.75rem; margin: 0;">Aquí aparecerán las alertas de tu negocio</p>
        </div>
      `;
    }

    return notifications.map(n => {
      const icon = this.getCategoryIcon(n.type);
      const bg = n.isRead ? 'transparent' : 'rgba(139,92,246,0.08)';
      const border = n.isRead ? 'rgba(255,255,255,0.06)' : 'rgba(139,92,246,0.3)';
      const timeStr = this.formatTime(n.createdAt);

      return `
        <div class="notif-item" data-id="${n.id}" data-route="${n.route || ''}" style="
          padding: 14px; margin-bottom: 10px; border-radius: 12px;
          background: ${bg}; border: 1px solid ${border};
          cursor: pointer; transition: all 0.2s ease;
          display: flex; gap: 12px; align-items: flex-start;
        ">
          <div style="font-size: 1.4rem; line-height: 1; flex-shrink: 0;">${icon}</div>
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 0.85rem; font-weight: 700; color: #fff;">${n.title || 'Notificación'}</span>
              <span style="font-size: 0.7rem; color: rgba(255,255,255,0.4);">${timeStr}</span>
            </div>
            <p style="font-size: 0.8rem; color: rgba(255,255,255,0.7); margin: 0; line-height: 1.4;">${n.body || ''}</p>
          </div>
          ${!n.isRead ? '<span style="width: 8px; height: 8px; border-radius: 50%; background: #8b5cf6; flex-shrink: 0; margin-top: 4px;"></span>' : ''}
        </div>
      `;
    }).join('');
  }

  static bindItemClicks(userId) {
    const container = document.getElementById('notif-list-container');
    if (!container) return;

    container.querySelectorAll('.notif-item').forEach(item => {
      item.addEventListener('click', async () => {
        const notifId = item.dataset.id;
        const route = item.dataset.route;

        if (notifId && userId) {
          await PushNotificationsCenterService.markAsRead(userId, notifId);
        }

        this.close();

        if (route) {
          const cleanRoute = route.trim().removePrefix('#').removePrefix('/');
          window.location.hash = '#/' + cleanRoute;
        }
      });
    });
  }

  static getCategoryIcon(type) {
    switch ((type || '').toUpperCase()) {
      case 'NEW_ORDER':
      case 'ORDER_STATUS':
      case 'PEDIDOS': return '📦';
      case 'NEW_SALE':
      case 'VENTAS': return '💰';
      case 'LOW_STOCK':
      case 'OUT_OF_STOCK':
      case 'INVENTARIO': return '⚠️';
      case 'CHAT':
      case 'MESSAGE': return '💬';
      case 'PAYMENT':
      case 'FINANZAS': return '💳';
      case 'LEAVE_REQUEST':
      case 'RRHH': return '👥';
      default: return '⚙️';
    }
  }

  static formatTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Ahora';
    if (diffMin < 60) return `Hace ${diffMin} min`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `Hace ${diffHours} h`;
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }
}
