/**
 * @file in-app.service.js
 * @description Writes in-app notifications into Firestore /users/{userId}/notifications sub-collection.
 */

const admin = require('firebase-admin');

class InAppNotificationService {

  /**
   * Create an in-app notification document for a target user.
   * @param {string} userId 
   * @param {string} companyId 
   * @param {Object} payload 
   */
  static async createForUser(userId, companyId, payload) {
    if (!userId || !companyId) return;

    try {
      const notifRef = admin.firestore().collection(`users/${userId}/notifications`).doc();
      await notifRef.set({
        id: notifRef.id,
        type: payload.type || 'SYSTEM_ALERT',
        title: payload.title || 'Notificación',
        body: payload.body || '',
        route: payload.route || '',
        documentId: payload.documentId || '',
        companyId,
        isRead: false,
        priority: payload.priority || 'normal',
        createdAt: new Date().toISOString(),
        data: payload.data || {}
      });
    } catch (err) {
      console.warn(`[InAppNotificationService] Failed to create in-app notification for ${userId}:`, err.message);
    }
  }

  /**
   * Create in-app notifications for multiple user IDs in batch.
   * @param {Array<string>} userIds 
   * @param {string} companyId 
   * @param {Object} payload 
   */
  static async createForUsers(userIds, companyId, payload) {
    if (!Array.isArray(userIds) || userIds.length === 0) return;
    await Promise.all(userIds.map(uid => this.createForUser(uid, companyId, payload)));
  }
}

module.exports = InAppNotificationService;
