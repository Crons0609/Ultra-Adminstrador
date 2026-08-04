/**
 * @file fcm.service.js
 * @description Cloud Functions FCM Multicast service with multi-tenant company isolation, user role targeting, and stale token auto-cleanup.
 */

const admin = require('firebase-admin');
const { NOTIFICATION_TYPES } = require('./notification-templates');
const InAppNotificationService = require('./in-app.service');

class FCMService {

  /**
   * Send notification to all active devices of users with targeted roles in a specific company.
   *
   * @param {string} companyId - Multi-tenant company ID (validated from Firestore event path)
   * @param {string} type - Notification type (e.g. 'NEW_ORDER', 'LOW_STOCK')
   * @param {Object} data - Dynamic event data (orderId, total, productName, quantity, etc.)
   */
  static async sendToRoles(companyId, type, data = {}) {
    if (!companyId) return;

    const template = NOTIFICATION_TYPES[type];
    if (!template) {
      console.warn(`[FCMService] Unknown notification type: ${type}`);
      return;
    }

    const title = typeof template.title === 'function' ? template.title(data) : template.title;
    const body = typeof template.body === 'function' ? template.body(data) : template.body;
    const route = typeof template.route === 'function' ? template.route(data) : (template.route || '');
    const channelId = template.channel || 'channel_system';
    const targetRoles = template.roles || ['MANAGER', 'OWNER'];
    const category = template.category || 'SISTEMA';

    console.log(`[FCMService] 🔔 Processing "${type}" for company ${companyId} targeting roles: ${targetRoles.join(', ')}`);

    try {
      // 1. Query users belonging to companyId with targeted roles
      const db = admin.firestore();
      const usersSnap = await db.collection('users')
        .where('companyId', '==', companyId)
        .get();

      if (usersSnap.empty) {
        console.log(`[FCMService] No users found for company ${companyId}`);
        return;
      }

      const matchingUserIds = [];
      usersSnap.forEach(doc => {
        const u = doc.data();
        if (targetRoles.includes(u.role) || u.role === 'SUPER_ADMIN' || u.role === 'OWNER') {
          matchingUserIds.push(doc.id);
        }
      });

      if (matchingUserIds.length === 0) {
        console.log(`[FCMService] No matching users with target roles for company ${companyId}`);
        return;
      }

      // 2. Create in-app notifications for matching users
      await InAppNotificationService.createForUsers(matchingUserIds, companyId, {
        type,
        title,
        body,
        route,
        documentId: data.documentId || data.orderId || '',
        data
      });

      // 3. Collect active FCM tokens for matching users
      const tokensToDevices = []; // Array of { token, deviceRef }

      for (const uid of matchingUserIds) {
        // Check user category preferences first
        const prefSnap = await db.doc(`users/${uid}/preferences/notifications`).get();
        if (prefSnap.exists) {
          const prefs = prefSnap.data();
          if (prefs[category] === false) {
            console.log(`[FCMService] User ${uid} has disabled category "${category}" notifications`);
            continue; // Skip push for this user
          }
        }

        // Fetch active devices
        const devicesSnap = await db.collection(`users/${uid}/devices`)
          .where('isActive', '==', true)
          .get();

        devicesSnap.forEach(devDoc => {
          const dev = devDoc.data();
          if (dev.fcmToken) {
            tokensToDevices.push({
              token: dev.fcmToken,
              ref: devDoc.ref
            });
          }
        });
      }

      if (tokensToDevices.length === 0) {
        console.log(`[FCMService] No active FCM tokens found for target users in company ${companyId}`);
        return;
      }

      const tokens = tokensToDevices.map(t => t.token);
      console.log(`[FCMService] 🚀 Sending FCM multicast to ${tokens.length} device(s)`);

      // 4. Construct FCM Multicast payload
      const messagePayload = {
        tokens,
        notification: {
          title,
          body
        },
        data: {
          title,
          body,
          type,
          channel: channelId,
          route,
          documentId: String(data.documentId || data.orderId || ''),
          companyId: String(companyId),
          timestamp: String(Date.now())
        },
        android: {
          priority: 'high',
          notification: {
            icon: 'ic_notification',
            color: '#7c3aed',
            channelId: channelId,
            sound: 'default'
          }
        }
      };

      // 5. Send via Firebase Admin Messaging
      const response = await admin.messaging().sendEachForMulticast(messagePayload);
      console.log(`[FCMService] ✅ Sent: ${response.successCount} succeeded, ${response.failureCount} failed.`);

      // 6. Automatically clean up stale/invalid tokens
      if (response.failureCount > 0) {
        const cleanupPromises = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errCode = resp.error?.code;
            if (
              errCode === 'messaging/invalid-registration-token' ||
              errCode === 'messaging/registration-token-not-registered'
            ) {
              console.log(`[FCMService] 🧹 Deactivating invalid token at index ${idx}`);
              cleanupPromises.push(
                tokensToDevices[idx].ref.update({ isActive: false, deactivatedAt: new Date().toISOString() })
              );
            }
          }
        });
        await Promise.all(cleanupPromises);
      }

    } catch (err) {
      console.error(`[FCMService] ❌ Failed to send push notifications for ${type}:`, err.message);
    }
  }
}

module.exports = FCMService;
