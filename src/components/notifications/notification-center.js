/**
 * @file notification-center.js
 * @description In-app slide-out Notification Center panel with correct APK/WebView support.
 *
 * Fixes applied:
 *  - Keyframes injected into <head> once (not inside innerHTML) to survive WebView
 *  - overlay.innerHTML reset never re-adds the outer click listener (no duplicate listeners)
 *  - Removed String.removePrefix() which is not a native JS method
 *  - Panel container rebuilt cleanly each open() to avoid stale DOM state
 *  - OWNER_REQUEST notifications render inline Accept/Reject buttons
 */

import { PushNotificationsCenterService } from '../../services/push-notifications-center.service.js';
import { GlobalStore } from '../../core/state.js';

export class NotificationCenter {

  static isOpen = false;

  /** Inject keyframe animations into <head> once */
  static _injectKeyframes() {
    if (document.getElementById('notif-center-keyframes')) return;
    const style = document.createElement('style');
    style.id = 'notif-center-keyframes';
    style.textContent = `
      @keyframes ua-notif-slide-in {
        from { transform: translateX(100%); opacity: 0; }
        to   { transform: translateX(0);    opacity: 1; }
      }
      @keyframes ua-notif-fade-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  static async toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      await this.open();
    }
  }

  static async open() {
    this.isOpen = true;
    this._injectKeyframes();

    // Always remove stale overlay before creating fresh one
    const old = document.getElementById('notification-center-overlay');
    if (old) old.remove();

    // ── Overlay backdrop ──────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.id = 'notification-center-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.6);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 99990;
      display: flex;
      justify-content: flex-end;
      animation: ua-notif-fade-in 0.2s ease both;
    `;
    document.body.appendChild(overlay);

    // Close when tapping outside the panel
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    // ── Slide-in panel ────────────────────────────────────────────────────────
    const panel = document.createElement('div');
    panel.style.cssText = `
      width: 100%; max-width: 400px; height: 100%;
      background: #121215;
      border-left: 1px solid rgba(255,255,255,0.1);
      display: flex; flex-direction: column;
      color: #ffffff;
      box-shadow: -10px 0 40px rgba(0,0,0,0.5);
      animation: ua-notif-slide-in 0.28s cubic-bezier(0.16, 1, 0.3, 1) both;
      overflow: hidden;
    `;
    overlay.appendChild(panel);

    // ── Header ────────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 18px 20px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      display: flex; align-items: center; justify-content: space-between;
      flex-shrink: 0;
    `;
    header.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:1.2rem;">🔔</span>
        <h3 style="font-size:1rem;font-weight:700;margin:0;color:#fff;">Centro de Notificaciones</h3>
      </div>
      <button id="notif-close-btn" style="
        background:transparent;border:none;color:#aaa;
        font-size:1.4rem;cursor:pointer;padding:4px 10px;border-radius:6px;
        line-height:1;
      ">&times;</button>
    `;
    panel.appendChild(header);

    // ── Load notifications ────────────────────────────────────────────────────
    const currentUser = GlobalStore.getState().currentUser;
    let notifications = [];
    try {
      notifications = await PushNotificationsCenterService.getNotifications(currentUser?.uid) || [];
    } catch (e) {
      console.warn('[NotifCenter] Could not load notifications:', e.message);
    }

    // ── Toolbar ───────────────────────────────────────────────────────────────
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
      padding: 10px 20px;
      background: rgba(0,0,0,0.15);
      display: flex; justify-content: space-between; align-items: center;
      font-size: 0.75rem;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      flex-shrink: 0;
    `;
    toolbar.innerHTML = `
      <span style="color:rgba(255,255,255,0.5);">${notifications.length} notificaciones</span>
      <button id="notif-mark-all-btn" style="
        background:transparent;border:none;color:#8b5cf6;
        font-weight:600;cursor:pointer;font-size:0.75rem;
      ">Marcar todas como leídas</button>
    `;
    panel.appendChild(toolbar);

    // ── List container ────────────────────────────────────────────────────────
    const listContainer = document.createElement('div');
    listContainer.id = 'notif-list-container';
    listContainer.style.cssText = `flex:1;overflow-y:auto;padding:12px 16px;`;
    listContainer.innerHTML = this.renderList(notifications, currentUser?.uid);
    panel.appendChild(listContainer);

    // ── Bind buttons ──────────────────────────────────────────────────────────
    panel.querySelector('#notif-close-btn').addEventListener('click', () => this.close());

    panel.querySelector('#notif-mark-all-btn').addEventListener('click', async () => {
      try {
        await PushNotificationsCenterService.markAllAsRead(currentUser?.uid);
        const updated = await PushNotificationsCenterService.getNotifications(currentUser?.uid) || [];
        listContainer.innerHTML = this.renderList(updated, currentUser?.uid);
        toolbar.querySelector('span').textContent = `${updated.length} notificaciones`;
        this.bindItemClicks(currentUser?.uid, listContainer);
      } catch (e) {
        console.warn('[NotifCenter] markAllAsRead error:', e.message);
      }
    });

    this.bindItemClicks(currentUser?.uid, listContainer);
  }

  static close() {
    this.isOpen = false;
    const overlay = document.getElementById('notification-center-overlay');
    if (overlay) overlay.remove();
  }

  static renderList(notifications, _userId) {
    if (!notifications || notifications.length === 0) {
      return `
        <div style="text-align:center;padding:60px 20px;color:rgba(255,255,255,0.4);">
          <div style="font-size:40px;margin-bottom:12px;opacity:0.5;">🔕</div>
          <p style="font-size:0.9rem;font-weight:600;margin:0 0 4px;color:rgba(255,255,255,0.6);">Sin notificaciones</p>
          <p style="font-size:0.75rem;margin:0;color:rgba(255,255,255,0.35);">Aquí aparecerán las alertas de tu negocio</p>
        </div>
      `;
    }

    return notifications.map(n => {
      // ── Special: Owner Registration Requests ─────────────────────────────
      if ((n.type || '').toUpperCase() === 'OWNER_REQUEST') {
        const bg     = n.isRead ? 'transparent' : 'rgba(139,92,246,0.08)';
        const border = n.isRead ? 'rgba(255,255,255,0.06)' : 'rgba(139,92,246,0.35)';
        const timeStr = this.formatTime(n.createdAt);
        const reqId   = n.requestId || '';
        const meta    = n.meta || {};
        return `
          <div class="notif-item notif-owner-request" data-id="${n.id}" data-request-id="${reqId}" style="
            padding:14px;margin-bottom:10px;border-radius:12px;
            background:${bg};border:1px solid ${border};
            cursor:default;
          ">
            <div style="display:flex;gap:10px;align-items:flex-start;">
              <div style="font-size:1.4rem;line-height:1;flex-shrink:0;">📩</div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
                  <span style="font-size:0.85rem;font-weight:700;color:#fff;">${n.title || 'Solicitud de Registro'}</span>
                  <span style="font-size:0.7rem;color:rgba(255,255,255,0.4);white-space:nowrap;margin-left:8px;">${timeStr}</span>
                </div>
                <p style="font-size:0.8rem;color:rgba(255,255,255,0.7);margin:0 0 10px;line-height:1.4;">${n.body || ''}</p>
                ${meta.ownerName ? `<div style="font-size:0.75rem;color:rgba(255,255,255,0.5);margin-bottom:8px;">👤 ${meta.ownerName} &nbsp;·&nbsp; 📧 ${meta.email || ''}</div>` : ''}
                <div style="display:flex;gap:8px;">
                  <button class="notif-owner-approve" data-request-id="${reqId}" data-notif-id="${n.id}" style="
                    flex:1;padding:7px 12px;border-radius:8px;border:none;cursor:pointer;
                    background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;
                    font-size:0.78rem;font-weight:700;letter-spacing:0.02em;
                    transition:opacity 0.15s;
                  " onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">✓ Aceptar</button>
                  <button class="notif-owner-reject" data-request-id="${reqId}" data-notif-id="${n.id}" style="
                    flex:1;padding:7px 12px;border-radius:8px;border:none;cursor:pointer;
                    background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;
                    font-size:0.78rem;font-weight:700;letter-spacing:0.02em;
                    transition:opacity 0.15s;
                  " onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">✕ Declinar</button>
                </div>
              </div>
              ${!n.isRead ? '<span style="width:8px;height:8px;border-radius:50%;background:#8b5cf6;flex-shrink:0;margin-top:4px;"></span>' : ''}
            </div>
          </div>
        `;
      }

      // ── Default notification item ─────────────────────────────────────────
      const icon    = this.getCategoryIcon(n.type);
      const bg      = n.isRead ? 'transparent' : 'rgba(139,92,246,0.08)';
      const border  = n.isRead ? 'rgba(255,255,255,0.06)' : 'rgba(139,92,246,0.3)';
      const timeStr = this.formatTime(n.createdAt);

      return `
        <div class="notif-item" data-id="${n.id}" data-route="${n.route || ''}" style="
          padding:14px;margin-bottom:10px;border-radius:12px;
          background:${bg};border:1px solid ${border};
          cursor:pointer;transition:background 0.2s ease;
          display:flex;gap:12px;align-items:flex-start;
        ">
          <div style="font-size:1.4rem;line-height:1;flex-shrink:0;">${icon}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span style="font-size:0.85rem;font-weight:700;color:#fff;">${n.title || 'Notificación'}</span>
              <span style="font-size:0.7rem;color:rgba(255,255,255,0.4);white-space:nowrap;margin-left:8px;">${timeStr}</span>
            </div>
            <p style="font-size:0.8rem;color:rgba(255,255,255,0.7);margin:0;line-height:1.4;">${n.body || ''}</p>
          </div>
          ${!n.isRead ? '<span style="width:8px;height:8px;border-radius:50%;background:#8b5cf6;flex-shrink:0;margin-top:4px;"></span>' : ''}
        </div>
      `;
    }).join('');
  }

  /**
   * @param {string} userId
   * @param {HTMLElement} [container] - defaults to #notif-list-container
   */
  static bindItemClicks(userId, container) {
    const el = container || document.getElementById('notif-list-container');
    if (!el) return;

    // ── Owner Request: Approve ───────────────────────────────────────────────
    el.querySelectorAll('.notif-owner-approve').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const requestId = btn.dataset.requestId;
        const notifId   = btn.dataset.notifId;
        if (!requestId) return;

        const card = btn.closest('.notif-owner-request');
        const owner = card?.querySelector('.notif-owner-approve')?.closest('.notif-owner-request');

        const { FirestoreService } = await import('../../services/firestore.service.js');
        const { AuthService }      = await import('../../services/auth.service.js');
        const { NotificationService } = await import('../../services/notification.service.js');

        // Get all pending requests & find this one
        const allReqs    = await FirestoreService.listPendingOwnerRequests();
        const req        = allReqs.find(r => r.id === requestId);
        if (!req) { NotificationService.error('Solicitud no encontrada.'); return; }

        if (!confirm(`¿Confirmas la aprobación de "${req.companyName}" para ${req.ownerName}?`)) return;

        btn.disabled = true;
        btn.textContent = '⏳...';
        const rejectBtn = card?.querySelector('.notif-owner-reject');
        if (rejectBtn) rejectBtn.disabled = true;

        try {
          const companyName  = req.companyName.trim();
          const newCompanyId = FirestoreService.sanitiseKey(companyName);

          await FirestoreService.createCompanyBranch(newCompanyId, {
            name: companyName,
            businessType: req.businessType || 'Restaurante',
            plan: 'PREMIUM',
            status: 'ACTIVO',
            ownerEmail: req.email,
            ownerPassword: req.password,
            country: req.country || 'Nicaragua',
            city: req.city || ''
          }, {});

          const ownerUid = await AuthService.createUser(req.email, req.password, {
            displayName: req.ownerName || `Dueño - ${companyName}`,
            role: 'OWNER',
            companyId: newCompanyId,
            branchId: 'main'
          });

          await FirestoreService.updateCompanyInfo(newCompanyId, { ownerId: ownerUid });
          await FirestoreService.updatePendingOwnerRequestStatus(requestId, 'APROBADO', {
            approvedAt: Date.now(),
            approvedCompanyId: newCompanyId
          });

          if (notifId && userId) {
            await PushNotificationsCenterService.markAsRead(userId, notifId);
          }

          NotificationService.success(`✅ Empresa "${companyName}" aprobada y registrada.`);

          // Remove card from panel
          if (card) card.remove();

        } catch (err) {
          console.error('[NotifCenter] Error aprobando solicitud:', err);
          NotificationService.error(`Error: ${err.message || err}`);
          btn.disabled = false;
          btn.textContent = '✓ Aceptar';
          if (rejectBtn) rejectBtn.disabled = false;
        }
      });
    });

    // ── Owner Request: Reject ────────────────────────────────────────────────
    el.querySelectorAll('.notif-owner-reject').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const requestId = btn.dataset.requestId;
        const notifId   = btn.dataset.notifId;
        if (!requestId) return;

        const card = btn.closest('.notif-owner-request');

        const { FirestoreService }    = await import('../../services/firestore.service.js');
        const { NotificationService } = await import('../../services/notification.service.js');

        const allReqs = await FirestoreService.listPendingOwnerRequests();
        const req     = allReqs.find(r => r.id === requestId);
        if (!req) { NotificationService.error('Solicitud no encontrada.'); return; }

        if (!confirm(`¿Rechazar la solicitud de "${req.companyName}" (${req.ownerName})?`)) return;

        btn.disabled = true;
        btn.textContent = '⏳...';
        const approveBtn = card?.querySelector('.notif-owner-approve');
        if (approveBtn) approveBtn.disabled = true;

        try {
          await FirestoreService.updatePendingOwnerRequestStatus(requestId, 'RECHAZADO', {
            rejectedAt: Date.now()
          });

          if (notifId && userId) {
            await PushNotificationsCenterService.markAsRead(userId, notifId);
          }

          NotificationService.info(`Solicitud de "${req.companyName}" rechazada.`);
          if (card) card.remove();

        } catch (err) {
          console.error('[NotifCenter] Error rechazando solicitud:', err);
          NotificationService.error(`Error: ${err.message || err}`);
          btn.disabled = false;
          btn.textContent = '✕ Declinar';
          if (approveBtn) approveBtn.disabled = false;
        }
      });
    });

    // ── Standard notification items ──────────────────────────────────────────
    el.querySelectorAll('.notif-item:not(.notif-owner-request)').forEach(item => {
      item.addEventListener('click', async () => {
        const notifId = item.dataset.id;
        const rawRoute = item.dataset.route || '';

        if (notifId && userId) {
          try {
            await PushNotificationsCenterService.markAsRead(userId, notifId);
          } catch (e) {
            console.warn('[NotifCenter] markAsRead error:', e.message);
          }
        }

        this.close();

        if (rawRoute) {
          // Fix: removePrefix is not native — use replace instead
          const cleanRoute = rawRoute.trim().replace(/^[#/]+/, '');
          window.location.hash = '#/' + cleanRoute;
        }
      });
    });
  }

  static getCategoryIcon(type) {
    switch ((type || '').toUpperCase()) {
      case 'OWNER_REQUEST': return '📩';
      case 'NEW_ORDER':
      case 'ORDER_STATUS':
      case 'PEDIDOS':    return '📦';
      case 'NEW_SALE':
      case 'VENTAS':     return '💰';
      case 'LOW_STOCK':
      case 'OUT_OF_STOCK':
      case 'INVENTARIO': return '⚠️';
      case 'CHAT':
      case 'MESSAGE':    return '💬';
      case 'PAYMENT':
      case 'FINANZAS':   return '💳';
      case 'LEAVE_REQUEST':
      case 'RRHH':       return '👥';
      default:           return '⚙️';
    }
  }

  static formatTime(isoString) {
    if (!isoString) return '';
    try {
      const date    = new Date(isoString);
      const diffMs  = Date.now() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1)  return 'Ahora';
      if (diffMin < 60) return `Hace ${diffMin} min`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `Hace ${diffHours} h`;
      return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  }
}
