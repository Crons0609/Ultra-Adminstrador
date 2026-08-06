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
}
