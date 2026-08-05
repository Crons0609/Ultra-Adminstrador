/**
 * @file offline-sync.service.js
 * @description Servicio de sincronización offline robusto para Ultra Administrador.
 *
 * Funcionalidad:
 *  1. Escucha mensajes del Service Worker y eventos de red (online / offline / RTDB connection)
 *  2. Encola escrituras con identificadores únicos e idempotencia (_idempotencyKey)
 *  3. Resuelve conflictos al reconectarse usando ConflictResolverService (Append para finanzas, Last-Write-Wins para catálogo)
 *  4. Reintenta escrituras fallidas con backoff exponencial
 *  5. Notifica eventos de estado de red (`ua:sync-status`) para la interfaz de usuario
 */

import { db } from '../config/firebase.config.js';
import { ref, set, update, push, remove, onValue }
  from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { LocalStorageDBService } from './local-storage-db.service.js';
import { ConflictResolverService } from './conflict-resolver.service.js';
import { NotificationService } from './notification.service.js';

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
    } else if (!isOnline) {
      OfflineSyncService.checkOfflineDataSufficiency();
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
    const idempotencyKey = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Prepare payload with idempotency and sync timestamp
    let enrichedData = data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      enrichedData = {
        ...data,
        _idempotencyKey: data._idempotencyKey || idempotencyKey,
        _syncVersion: data._syncVersion || Date.now()
      };
    }

    if (isOnline) {
      try {
        await OfflineSyncService._executeWrite(operation, path, enrichedData);
        return;
      } catch (err) {
        console.warn(`[OfflineSync] ⚠️ Direct online write failed for "${description}". Queuing offline write fallback:`, err.message);
      }
    }

    const entry = {
      id: idempotencyKey,
      operation,
      path,
      data: enrichedData,
      description,
      queuedAt: Date.now(),
      retryCount: 0,
      maxRetries: 5,
      status: 'pending'
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

  /**
   * Verifica si hay suficientes datos cacheados para trabajar offline.
   * Si no los hay, dispara una notificación advirtiendo que necesita conexión a internet.
   */
  static async checkOfflineDataSufficiency() {
    if (isOnline) return true;
    try {
      const { GlobalStore } = await import('../core/state.js');
      const { currentUser } = GlobalStore.getState();
      const companyId = currentUser?.companyId;
      if (!companyId || companyId === 'global') return true;
      const hasEnough = await LocalStorageDBService.hasSufficientCache(companyId);
      // No mostrar notificación — el punto rojo en el header es suficiente indicador
      return hasEnough;
    } catch {
      return true;
    }
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
      OfflineSyncService.checkOfflineDataSufficiency();
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

    const total = pendingWrites.length;
    let synced = 0;
    let failures = 0;

    console.log(`[OfflineSync] 🔄 Syncing ${total} pending write(s)...`);

    while (pendingWrites.length > 0) {
      const entry = pendingWrites[0];
      entry.status = 'syncing';

      try {
        await OfflineSyncService._executeWrite(entry.operation, entry.path, entry.data);
        pendingWrites.shift();
        synced++;
        await LocalStorageDBService.removeFromQueue(entry.id);
        await OfflineSyncService._savePendingToStorage();
        OfflineSyncService.notifyStatus();
      } catch (err) {
        entry.retryCount = (entry.retryCount || 0) + 1;
        failures++;
        console.warn(`[OfflineSync] ❌ Failed to sync "${entry.description}" (Attempt ${entry.retryCount}/${entry.maxRetries || 5}):`, err.message);

        if (!isOnline) {
          entry.status = 'pending';
          break;
        }

        if (entry.retryCount >= (entry.maxRetries || 5)) {
          console.error(`[OfflineSync] 🛑 Dropping item "${entry.description}" after ${entry.retryCount} failed retries.`);
          pendingWrites.shift();
          await LocalStorageDBService.removeFromQueue(entry.id);
          await OfflineSyncService._savePendingToStorage();
        } else {
          // Move item to back of queue to unblock remaining items
          const failedItem = pendingWrites.shift();
          failedItem.status = 'pending';
          pendingWrites.push(failedItem);
          await OfflineSyncService._savePendingToStorage();
          // Exponential delay
          await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, entry.retryCount), 10000)));
        }
      }
    }

    syncInProgress = false;

    if (synced > 0) {
      OfflineSyncService._showSyncDoneToast(synced);
    }
    // Header badge is updated via notifyStatus(); no banner to hide.

    OfflineSyncService.notifyStatus();
    console.log(`[OfflineSync] ✅ Sync round finished: ${synced} synced, ${failures} failed, ${pendingWrites.length} remaining.`);
  }

  static async _executeWrite(operation, path, data) {
    if (!db) throw new Error('Firebase DB not initialized');

    // Perform conflict resolution & idempotency check
    const resolution = await ConflictResolverService.resolve(path, data, operation);
    if (resolution.action === 'skip') {
      console.log(`[OfflineSync] ⏭️ Skipping write @ ${path} (Idempotent match)`);
      return;
    }

    const targetPath = resolution.path || path;
    const targetData = resolution.resolvedData || data;
    const dbRef = ref(db, targetPath);

    switch (operation) {
      case 'set':    return set(dbRef, targetData);
      case 'update': return update(dbRef, targetData);
      case 'push':   return push(dbRef, targetData);
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

  /** Breve toast verde cuando se sincronizan datos al reconectarse. */
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

  /** Elimina el banner offline si existiera de sesiones previas. */
  static _showOfflineBanner(_show) {
    const banner = document.getElementById('ua-offline-banner');
    if (banner) banner.remove();
  }
}
