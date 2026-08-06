/**
 * @file push-notifications-center.service.js
 * @description In-app notification center service managing read/unread notifications in Firebase RTDB.
 */

import { FirestoreService } from './firestore.service.js';
import { GlobalStore } from '../core/state.js';

export class PushNotificationsCenterService {

  /**
   * Fetch all in-app notifications for user sorted by newest first.
   * Reads from: users/{userId}/notifications
   * @param {string} userId
   * @returns {Promise<Array>}
   */
  static async getNotifications(userId) {
    if (!userId) return [];
    try {
      const data = await FirestoreService.readPath(`users/${userId}/notifications`);
      if (!data || typeof data !== 'object') return [];

      const { currentUser } = GlobalStore.getState();
      const companyId = currentUser?.companyId || '';

      // Convert RTDB object to array and optionally filter by companyId
      const list = Object.entries(data)
        .map(([id, val]) => (typeof val === 'object' && val !== null ? { id, ...val } : null))
        .filter(Boolean)
        .filter(n => !companyId || !n.companyId || n.companyId === companyId);

      return list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    } catch (err) {
      console.warn('[PushNotificationsCenter] Error loading notifications:', err.message);
      return [];
    }
  }

  /**
   * Mark single notification as read.
   * @param {string} userId
   * @param {string} notificationId
   */
  static async markAsRead(userId, notificationId) {
    if (!userId || !notificationId) return;
    try {
      await FirestoreService.updatePath(`users/${userId}/notifications/${notificationId}`, {
        isRead: true,
        readAt: new Date().toISOString()
      });
    } catch (err) {
      console.warn('[PushNotificationsCenter] Error marking as read:', err.message);
    }
  }

  /**
   * Mark all unread notifications as read for user.
   * @param {string} userId
   */
  static async markAllAsRead(userId) {
    if (!userId) return;
    try {
      const notifications = await this.getNotifications(userId);
      const unread = notifications.filter(n => !n.isRead);
      await Promise.all(unread.map(n => this.markAsRead(userId, n.id)));
    } catch (err) {
      console.warn('[PushNotificationsCenter] Error marking all as read:', err.message);
    }
  }

  /**
   * Listen to real-time notifications and report unread count via callback.
   * Uses FirestoreService.listenToPath which wraps Firebase RTDB onValue.
   * @param {string} userId
   * @param {Function} callback - Called with (unreadCount: number, docs: Array)
   * @returns {string} listenerId — pass to FirestoreService.unsubscribe() to clean up
   */
  static subscribeUnreadCount(userId, callback) {
    if (!userId || typeof callback !== 'function') return null;

    const listenerId = FirestoreService.listenToPath(`users/${userId}/notifications`, (docs) => {
      const list = Array.isArray(docs) ? docs : [];
      const { currentUser } = GlobalStore.getState();
      const companyId = currentUser?.companyId || '';

      const filtered = companyId
        ? list.filter(n => !n.companyId || n.companyId === companyId)
        : list;

      const unreadCount = filtered.filter(d => !d.isRead).length;
      callback(unreadCount, filtered);
    });

    return listenerId;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROGRAMMER MESSAGING & APK DISTRIBUTION SERVICE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Send a direct notification or APK update message to a specific user.
   * @param {string} userId
   * @param {Object} payload - { title, body, type, version, apkUrl, actionLabel, senderName, companyId }
   */
  static async sendNotificationToUser(userId, payload = {}) {
    if (!userId) throw new Error('ID de usuario requerido.');

    const notifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const fullPath = `users/${userId}/notifications/${notifId}`;

    const data = {
      id: notifId,
      type: payload.type || 'DIRECT_MESSAGE',
      title: payload.title || 'Mensaje del Programador',
      body: payload.body || '',
      version: payload.version || '',
      apkUrl: payload.apkUrl || '',
      actionLabel: payload.actionLabel || '📥 Descargar APK',
      senderName: payload.senderName || 'Programador SaaS',
      companyId: payload.companyId || '',
      isRead: false,
      createdAt: new Date().toISOString()
    };

    await FirestoreService.writePath(fullPath, data);
    return notifId;
  }

  /**
   * Broadcast a notification / APK update to all business owners (OWNER) or a specific company.
   * @param {Object} payload - { title, body, type, version, apkUrl, actionLabel, targetScope, companyId }
   * @returns {Promise<{ success: boolean, count: number }>}
   */
  static async broadcastToOwners(payload = {}) {
    const { currentUser } = GlobalStore.getState();
    const senderEmail = currentUser?.email || 'Programador';

    const targetScope = payload.targetScope || 'ALL_OWNERS'; // 'ALL_OWNERS' | 'SPECIFIC_COMPANY' | 'ALL_USERS'
    const targetCompanyId = payload.companyId || '';

    // Fetch all users from /users
    const allUsersData = await FirestoreService.readPath('users');
    if (!allUsersData || typeof allUsersData !== 'object') {
      throw new Error('No se pudieron obtener los usuarios desde Firebase.');
    }

    const usersList = Object.entries(allUsersData).map(([uid, u]) => ({
      uid,
      ...(typeof u === 'object' && u !== null ? u : {})
    }));

    // Filter recipients based on scope
    let recipients = [];
    if (targetScope === 'SPECIFIC_COMPANY' && targetCompanyId) {
      recipients = usersList.filter(u => u.companyId === targetCompanyId && (u.role === 'OWNER' || u.role === 'MANAGER'));
    } else if (targetScope === 'ALL_USERS') {
      recipients = usersList;
    } else {
      // Default: ALL_OWNERS
      recipients = usersList.filter(u => u.role === 'OWNER' || u.role === 'SUPER_ADMIN' || !u.role);
    }

    if (recipients.length === 0) {
      return { success: false, count: 0, message: 'No se encontraron destinatarios con el criterio seleccionado.' };
    }

    // Send in parallel
    const promises = recipients.map(user => this.sendNotificationToUser(user.uid, {
      ...payload,
      companyId: user.companyId || ''
    }));

    await Promise.all(promises);

    // Record in global broadcast history log
    const broadcastId = `bcast_${Date.now()}`;
    const logData = {
      id: broadcastId,
      title: payload.title || '',
      body: payload.body || '',
      type: payload.type || 'ANNOUNCEMENT',
      version: payload.version || '',
      apkUrl: payload.apkUrl || '',
      actionLabel: payload.actionLabel || '',
      targetScope,
      targetCompanyId,
      recipientsCount: recipients.length,
      sentAt: new Date().toISOString(),
      sentBy: senderEmail
    };

    try {
      await FirestoreService.writePath(`global/broadcast_history/${broadcastId}`, logData);
    } catch (e) {
      console.warn('[PushNotificationsCenter] Could not write broadcast history log:', e.message);
    }

    return { success: true, count: recipients.length };
  }

  /**
   * Read the global broadcast history log.
   * Path: global/broadcast_history
   * @returns {Promise<Array>}
   */
  static async getBroadcastHistory() {
    try {
      const data = await FirestoreService.readPath('global/broadcast_history');
      if (!data || typeof data !== 'object') return [];

      return Object.values(data)
        .filter(Boolean)
        .sort((a, b) => new Date(b.sentAt || 0) - new Date(a.sentAt || 0));
    } catch (e) {
      console.warn('[PushNotificationsCenter] Error reading broadcast history:', e.message);
      return [];
    }
  }
}

