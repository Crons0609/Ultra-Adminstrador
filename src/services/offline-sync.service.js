/**
 * @file offline-sync.service.js
 * @description Servicio de sincronización offline para Ultra Administrador.
 *
 * Funcionalidad:
 *  1. Escucha mensajes del Service Worker y eventos de red (online / offline)
 *  2. Encola escrituras a Firebase en IndexedDB + memoria cuando no hay internet
 *  3. Sincroniza automáticamente la cola en la nube al reconectarse
 *  4. Emite eventos de estado de red (`ua:sync-status`) para la cabecera y notificaciones UI
 */

import { db } from '../config/firebase.config.js';
import { ref, set, update, push, remove, onValue }
  from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { LocalStorageDBService } from './local-storage-db.service.js';

const pendingWrites = [];
let isOnline = navigator.onLine;
let syncInProgress = false;
const PENDING_KEY = 'ua_offline_pending_writes';

export class OfflineSyncService {

  /**
   * Inicializar el servicio. Llamar una vez desde app.js al arrancar.
   */
  static async init() {
    await OfflineSyncService._loadPendingFromStorage();
    OfflineSyncService._listenNetworkEvents();
    OfflineSyncService._listenServiceWorkerMessages();
    OfflineSyncService.notifyStatus();
    console.log('[OfflineSync] ✅ Service initialized. Pending writes:', pendingWrites.length);

    if (isOnline && pendingWrites.length > 0) {
      OfflineSyncService._syncNow();
    }
  }

  /**
   * Encolar una escritura de Firebase que se ejecutará ahora si hay internet,
   * o se guardará y reenviará automáticamente cuando se recupere la conexión.
   *
   * @param {'set'|'update'|'push'|'remove'} operation - Tipo de operación
   * @param {string} path - Ruta en RTDB (ej: 'companyId/orders/orderId')
   * @param {Object} data - Datos a escribir
   * @param {string} [description] - Descripción legible para notificaciones
   * @returns {Promise<void>}
   */
  static async write(operation, path, data, description = 'Escritura') {
    if (isOnline) {
      await OfflineSyncService._executeWrite(operation, path, data);
      return;
    }

    const entry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      operation,
      path,
      data,
      description,
      queuedAt: Date.now()
    };

    pendingWrites.push(entry);
    await OfflineSyncService._savePendingToStorage(entry);

    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'QUEUE_WRITE',
        payload: entry
      });
    }

    console.log(`[OfflineSync] 📥 Queued offline write: ${description} @ ${path}`);
    OfflineSyncService._showOfflineToast(description);
    OfflineSyncService.notifyStatus();
  }

  /**
   * Retorna cuántas escrituras están pendientes de sincronizar.
   */
  static getPendingCount() {
    return pendingWrites.length;
  }

  /**
   * Retorna true si el sistema está offline.
   */
  static isOffline() {
    return !isOnline;
  }

  /**
   * Emite un evento global para actualizar la cabecera e indicadores visuales.
   */
  static notifyStatus() {
    window.dispatchEvent(new CustomEvent('ua:sync-status', {
      detail: {
        isOnline,
        pendingCount: pendingWrites.length,
        syncInProgress
      }
    }));
  }

  // ─── Privados ──────────────────────────────────────────────────────────────

  static _listenNetworkEvents() {
    const handleOnline = () => {
      isOnline = true;
      console.log('[OfflineSync] 🌐 Online — starting sync...');
      OfflineSyncService.notifyStatus();
      OfflineSyncService._syncNow();
    };

    const handleOffline = () => {
      isOnline = false;
      console.log('[OfflineSync] 📴 Offline — writes will be queued.');
      OfflineSyncService.notifyStatus();
      OfflineSyncService._showOfflineBanner(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen to Firebase RTDB internal connection status node
    if (db) {
      try {
        const connectedRef = ref(db, '.info/connected');
        onValue(connectedRef, (snap) => {
          const connected = snap.val() === true;
          console.log(`[OfflineSync] 📶 RTDB .info/connected: ${connected}`);
          if (connected) {
            isOnline = true;
            OfflineSyncService.notifyStatus();
            if (pendingWrites.length > 0) {
              OfflineSyncService._syncNow();
            }
          } else if (!navigator.onLine) {
            isOnline = false;
            OfflineSyncService.notifyStatus();
          }
        });
      } catch (err) {
        console.warn('[OfflineSync] Could not attach .info/connected listener:', err.message);
      }
    }
  }

  static _listenServiceWorkerMessages() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, payload, count, synced, total } = event.data || {};

      switch (type) {
        case 'OFFLINE_SYNC_START':
          console.log(`[OfflineSync] 🔄 SW is replaying ${count} write(s)...`);
          break;

        case 'REPLAY_WRITE':
          if (payload?.path && payload?.operation) {
            OfflineSyncService._executeWrite(payload.operation, payload.path, payload.data)
              .then(() => console.log(`[OfflineSync] ✅ Replayed: ${payload.description}`))
              .catch(err => console.warn('[OfflineSync] ❌ Replay failed:', err.message));
          }
          break;

        case 'OFFLINE_SYNC_DONE':
          console.log(`[OfflineSync] ✅ SW sync done: ${synced}/${total}`);
          OfflineSyncService._showSyncDoneToast(synced);
          OfflineSyncService.notifyStatus();
          break;
      }
    });
  }

  static async _syncNow() {
    if (syncInProgress || pendingWrites.length === 0) return;
    syncInProgress = true;
    OfflineSyncService.notifyStatus();

    const total  = pendingWrites.length;
    let synced   = 0;
    let failures = 0;

    console.log(`[OfflineSync] 🔄 Syncing ${total} pending write(s)...`);

    while (pendingWrites.length > 0) {
      const entry = pendingWrites[0];

      try {
        await OfflineSyncService._executeWrite(entry.operation, entry.path, entry.data);
        pendingWrites.shift();
        synced++;
        await LocalStorageDBService.removeFromQueue(entry.id);
        OfflineSyncService._savePendingToStorage();
        OfflineSyncService.notifyStatus();
      } catch (err) {
        failures++;
        console.warn(`[OfflineSync] ❌ Failed to sync "${entry.description}":`, err.message);

        if (!isOnline) break;
        pendingWrites.shift();
        await LocalStorageDBService.removeFromQueue(entry.id);
      }
    }

    syncInProgress = false;

    if (synced > 0) {
      OfflineSyncService._showSyncDoneToast(synced);
    }
    if (failures === 0) {
      OfflineSyncService._showOfflineBanner(false);
    }

    OfflineSyncService.notifyStatus();
    console.log(`[OfflineSync] ✅ Sync complete: ${synced} synced, ${failures} failed.`);
  }

  static async _executeWrite(operation, path, data) {
    if (!db) throw new Error('Firebase DB not initialized');
    const dbRef = ref(db, path);

    switch (operation) {
      case 'set':    return set(dbRef, data);
      case 'update': return update(dbRef, data);
      case 'push':   return push(dbRef, data);
      case 'remove': return remove(dbRef);
      default:       throw new Error(`Unknown operation: ${operation}`);
    }
  }

  static async _loadPendingFromStorage() {
    try {
      const idbQueue = await LocalStorageDBService.getQueue();
      if (idbQueue && idbQueue.length > 0) {
        pendingWrites.push(...idbQueue);
      } else {
        const raw = localStorage.getItem(PENDING_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) pendingWrites.push(...parsed);
        }
      }
    } catch {
      localStorage.removeItem(PENDING_KEY);
    }
  }

  static async _savePendingToStorage(newEntry = null) {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(pendingWrites));
      if (newEntry) {
        await LocalStorageDBService.queueWrite(newEntry);
      }
    } catch {}
  }

  // ─── UI helpers ───────────────────────────────────────────────────────────

  static _showOfflineToast(description) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; bottom: 88px; left: 50%; transform: translateX(-50%);
      background: rgba(245,158,11,0.95); color: #000;
      padding: 10px 18px; border-radius: 24px; font-size: 13px;
      font-weight: 600; z-index: 99999; pointer-events: none;
      backdrop-filter: blur(8px); white-space: nowrap;
      animation: ua-slide-up 0.3s ease;
    `;
    toast.textContent = `📥 Guardado offline: ${description}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  static _showSyncDoneToast(count) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; bottom: 88px; left: 50%; transform: translateX(-50%);
      background: rgba(16,185,129,0.95); color: #fff;
      padding: 10px 18px; border-radius: 24px; font-size: 13px;
      font-weight: 600; z-index: 99999; pointer-events: none;
      backdrop-filter: blur(8px); white-space: nowrap;
      animation: ua-slide-up 0.3s ease;
    `;
    toast.textContent = `✅ ${count} dato(s) sincronizado(s) con la nube`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  static _showOfflineBanner(show) {
    const BANNER_ID = 'ua-offline-banner';
    let banner = document.getElementById(BANNER_ID);

    if (show) {
      if (banner) return;
      banner = document.createElement('div');
      banner.id = BANNER_ID;
      banner.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0;
        background: rgba(245,158,11,0.97); color: #000;
        text-align: center; padding: 8px 16px; font-size: 13px;
        font-weight: 700; z-index: 99998;
        display: flex; align-items: center; justify-content: center; gap: 8px;
      `;
      banner.innerHTML = `
        <span>📴</span>
        <span>Sin conexión — los datos se guardan localmente y se sincronizarán al reconectarse</span>
      `;
      document.body.prepend(banner);
    } else {
      if (banner) {
        banner.style.transition = 'opacity 0.4s ease';
        banner.style.opacity = '0';
        setTimeout(() => banner?.remove(), 450);
      }
    }
  }
}
