/**
 * @file push-notifications.service.js
 * @description Manages FCM token registration, multi-device tracking, and Android runtime notification permissions.
 */

import { FirestoreService } from './firestore.service.js';
import { MessagingService } from './messaging.service.js';

export class PushNotificationsService {

  static _initialized = false;
  static _activeUserId = null;
  static _activeCompanyId = null;

  /**
   * Initialize push notification device registration for active logged-in user.
   * @param {Object} userSession 
   */
  static async init(userSession) {
    if (!userSession || !userSession.uid) return;

    this._activeUserId = userSession.uid;
    this._activeCompanyId = userSession.companyId || 'global';

    console.log('[PushNotificationsService] 🔔 Initializing for user:', userSession.uid);

    // Register callback for Android bridge token updates
    window.__onFcmTokenReceived = (token) => {
      if (token && this._activeUserId) {
        this.registerDevice(token, userSession);
      }
    };

    window.__onNotificationPermissionResult = (granted) => {
      console.log('[PushNotificationsService] Notification permission result:', granted);
      if (granted) {
        this.syncToken(userSession);
      }
    };

    // 1. Check if on native Android app
    if (window.AndroidApp?.isAndroidApp()) {
      const hasPerm = window.AndroidApp.hasNotificationPermission?.();
      if (hasPerm) {
        this.syncToken(userSession);
      } else {
        // Show educational prompt before requesting permission (Android 13+)
        this.showPermissionEducationalPrompt(userSession);
      }
    } else {
      // 2. Web browser FCM
      const token = await MessagingService.requestNotificationPermission();
      if (token) {
        this.registerDevice(token, userSession);
      }
    }

    this._initialized = true;
  }

  /**
   * Sync FCM token from Android bridge.
   * @param {Object} userSession 
   */
  static async syncToken(userSession) {
    if (window.AndroidApp?.getFcmToken) {
      const token = window.AndroidApp.getFcmToken();
      if (token) {
        await this.registerDevice(token, userSession);
      }
    }
  }

  /**
   * Register or update device record in Firestore: users/{userId}/devices/{deviceId}
   * @param {string} token 
   * @param {Object} userSession 
   */
  static async registerDevice(token, userSession) {
    if (!token || !userSession?.uid) return;

    // Skip cloud registration if offline to avoid useless errors
    if (!navigator.onLine) {
      console.log('[PushNotificationsService] 📴 Offline: skipping cloud token registration.');
      return;
    }
    const isAndroid = !!window.AndroidApp?.isAndroidApp();
    const appVersion = window.AndroidApp?.getAppVersion?.() || '1.0.0';

    const deviceData = {
      deviceId,
      fcmToken: token,
      platform: isAndroid ? 'android' : 'web',
      model: navigator.userAgent.includes('Android') ? 'Dispositivo Android' : 'Navegador Web',
      osVersion: navigator.userAgent,
      appVersion,
      userId: userSession.uid,
      companyId: userSession.companyId || 'global',
      branchId: userSession.branchId || 'main',
      registeredAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      isActive: true
    };

    try {
      await FirestoreService.writePath(`users/${userSession.uid}/devices/${deviceId}`, deviceData);
      console.log('[PushNotificationsService] ✅ FCM device registered in Firestore:', deviceId);
    } catch (err) {
      console.warn('[PushNotificationsService] Could not save FCM token in Firestore:', err.message);
    }
  }

  /**
   * Unregister device token on logout so user stops receiving private push alerts.
   * @param {string} userId 
   */
  static async unregisterDevice(userId) {
    if (!userId) return;
    const deviceId = this.getOrCreateDeviceId();
    try {
      await FirestoreService.updatePath(`users/${userId}/devices/${deviceId}`, {
        isActive: false,
        unregisteredAt: new Date().toISOString()
      });
      console.log('[PushNotificationsService] 🚪 Unregistered FCM device on logout:', deviceId);
    } catch (err) {
      console.warn('[PushNotificationsService] Error unregistering FCM device:', err.message);
    }
  }

  /**
   * Get or generate a persistent local device ID.
   * @returns {string}
   */
  static getOrCreateDeviceId() {
    let deviceId = localStorage.getItem('ua_device_id');
    if (!deviceId) {
      deviceId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
      localStorage.setItem('ua_device_id', deviceId);
    }
    return deviceId;
  }

  /**
   * Educational modal before requesting POST_NOTIFICATIONS permission on Android 13+.
   * @param {Object} userSession 
   */
  static showPermissionEducationalPrompt(userSession) {
    if (localStorage.getItem('ua_notif_prompt_dismissed') === 'true') return;

    const modal = document.createElement('div');
    modal.id = 'ua-notif-prompt-modal';
    modal.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.75);
      backdrop-filter: blur(8px); display: flex; align-items: center;
      justify-content: center; z-index: 99999; padding: 20px;
    `;
    modal.innerHTML = `
      <div style="
        background: var(--color-bg-secondary, #121215);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 20px; padding: 24px; max-width: 380px; width: 100%;
        text-align: center; color: #fff; box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      ">
        <div style="font-size: 48px; margin-bottom: 12px;">🔔</div>
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 8px;">Activa las notificaciones nativas</h3>
        <p style="font-size: 0.85rem; color: rgba(255,255,255,0.7); line-height: 1.5; margin-bottom: 20px;">
          Recibe alertas en tiempo real sobre nuevos pedidos, ventas, alertas de inventario bajo y comunicaciones importantes en tu teléfono.
        </p>
        <div style="display: flex; gap: 10px;">
          <button id="notif-prompt-cancel" style="
            flex: 1; padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.15);
            background: transparent; color: #ccc; font-weight: 600; font-size: 0.85rem; cursor: pointer;
          ">Ahora no</button>
          <button id="notif-prompt-allow" style="
            flex: 1; padding: 12px; border-radius: 12px; border: none;
            background: var(--color-accent, #7c3aed); color: #fff; font-weight: 700; font-size: 0.85rem; cursor: pointer;
          ">Activar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('notif-prompt-cancel').addEventListener('click', () => {
      localStorage.setItem('ua_notif_prompt_dismissed', 'true');
      modal.remove();
    });

    document.getElementById('notif-prompt-allow').addEventListener('click', () => {
      modal.remove();
      if (window.AndroidApp?.requestNotificationPermission) {
        window.AndroidApp.requestNotificationPermission();
      }
    });
  }
}
