/**
 * @file push-notifications-center.service.js
 * @description In-app notification center service managing read/unread notifications in Firestore.
 */

import { FirestoreService } from './firestore.service.js';

export class PushNotificationsCenterService {

  /**
   * Fetch all in-app notifications for user sorted by newest first.
   * @param {string} userId 
   * @returns {Promise<Array>}
   */
  static async getNotifications(userId) {
    if (!userId) return [];
    try {
      const list = await FirestoreService.queryCollection(`users/${userId}/notifications`, [
        { field: 'companyId', op: '==', value: FirestoreService.getCompanyId() }
      ]);
      return (list || []).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
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
   * Listen to unread notifications count in real-time.
   * @param {string} userId 
   * @param {Function} callback 
   * @returns {Function} Unsubscribe function
   */
  static subscribeUnreadCount(userId, callback) {
    if (!userId || typeof callback !== 'function') return () => {};

    return FirestoreService.subscribeCollection(`users/${userId}/notifications`, (docs) => {
      const unreadCount = docs.filter(d => !d.isRead).length;
      callback(unreadCount, docs);
    });
  }
}
