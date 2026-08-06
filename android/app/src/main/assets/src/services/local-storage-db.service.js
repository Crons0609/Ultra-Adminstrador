/**
 * @file local-storage-db.service.js
 * @description Servidor de almacenamiento persistente IndexedDB para Ultra Administrador.
 * Permite guardar lecturas (caché de consultas), escrituras pendientes, metadatos de sync e imágenes en disco para soporte offline total.
 */

const DB_NAME = 'UltraAdminOfflineDB';
const DB_VERSION = 3;
const CACHE_STORE = 'data_cache';
const QUEUE_STORE = 'write_queue';
const METADATA_STORE = 'sync_metadata';
const IMAGES_STORE = 'images_cache';
const SESSIONS_STORE = 'user_sessions';

export class LocalStorageDBService {
  static _dbPromise = null;

  /**
   * Inicializa la base de datos IndexedDB.
   * @returns {Promise<IDBDatabase>}
   */
  static getDB() {
    if (this._dbPromise) return this._dbPromise;

    this._dbPromise = new Promise((resolve) => {
      if (!('indexedDB' in window)) {
        console.warn('[IndexedDB] No soportado en este navegador. Usando memoria.');
        resolve(null);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Data Cache Store
        let cacheStore;
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          cacheStore = db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
        } else {
          cacheStore = e.target.transaction.objectStore(CACHE_STORE);
        }
        if (cacheStore && !cacheStore.indexNames.contains('companyId')) {
          cacheStore.createIndex('companyId', 'companyId', { unique: false });
        }

        // Write Queue Store
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        }

        // Sync Metadata Store
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          db.createObjectStore(METADATA_STORE, { keyPath: 'path' });
        }

        // Images Cache Store
        if (!db.objectStoreNames.contains(IMAGES_STORE)) {
          db.createObjectStore(IMAGES_STORE, { keyPath: 'id' });
        }

        // User Sessions Store for Offline Session Persistence
        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          const sessStore = db.createObjectStore(SESSIONS_STORE, { keyPath: 'uid' });
          sessStore.createIndex('email', 'email', { unique: false });
        }
      };

      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => {
        console.error('[IndexedDB] Error al abrir la BD:', e.target.error);
        resolve(null);
      };
    });

    return this._dbPromise;
  }

  /**
   * Guarda una entrada en la caché de datos de lectura.
   * @param {string} key - Clave única (ej. "PizzaExpress/orders" o "global/users")
   * @param {any} data - Objeto o arreglo a cachear
   * @param {string|null} [companyId=null] - ID de empresa para aislamiento multi-tenant
   */
  static async setCache(key, data, companyId = null) {
    try {
      const db = await this.getDB();
      if (!db) return;

      let extractedCompanyId = companyId;
      if (!extractedCompanyId && typeof key === 'string' && key.includes('/')) {
        const parts = key.split('/');
        if (parts[0] !== 'users' && parts[0] !== 'global') {
          extractedCompanyId = parts[0];
        }
      }

      const tx = db.transaction(CACHE_STORE, 'readwrite');
      const store = tx.objectStore(CACHE_STORE);
      store.put({
        key,
        data: JSON.parse(JSON.stringify(data)),
        companyId: extractedCompanyId || 'global',
        updatedAt: Date.now()
      });
    } catch (err) {
      console.warn('[IndexedDB] Fallo al guardar en caché:', err.message);
    }
  }

  /**
   * Obtiene datos cacheados por clave.
   * @param {string} key
   * @returns {Promise<any|null>}
   */
  static async getCache(key) {
    try {
      const db = await this.getDB();
      if (!db) return null;

      return new Promise((resolve) => {
        const tx = db.transaction(CACHE_STORE, 'readonly');
        const store = tx.objectStore(CACHE_STORE);
        const req = store.get(key);

        req.onsuccess = () => resolve(req.result ? req.result.data : null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Comprueba si se han reunido suficientes datos cacheados para trabajar offline.
   * @param {string} [companyId]
   * @returns {Promise<boolean>}
   */
  static async hasSufficientCache(companyId) {
    if (!companyId) return false;
    try {
      const db = await this.getDB();
      if (!db) return false;

      const lastSync = await this.getCache(`${companyId}/full_prefetch`);
      if (lastSync) return true;

      return new Promise((resolve) => {
        const tx = db.transaction(CACHE_STORE, 'readonly');
        const store = tx.objectStore(CACHE_STORE);
        const req = store.openCursor();
        let count = 0;
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const key = cursor.key;
            if (typeof key === 'string' && (key.startsWith(`${companyId}/`) || cursor.value?.companyId === companyId)) {
              count++;
            }
            if (count >= 2) {
              resolve(true);
              return;
            }
            cursor.continue();
          } else {
            resolve(count >= 2);
          }
        };
        req.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }

  /**
   * Limpia toda la caché de datos de una empresa específica.
   * @param {string} companyId
   */
  static async clearCompanyData(companyId) {
    if (!companyId) return;
    try {
      const db = await this.getDB();
      if (!db) return;

      const tx = db.transaction(CACHE_STORE, 'readwrite');
      const store = tx.objectStore(CACHE_STORE);

      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const key = cursor.key;
          if (typeof key === 'string' && (key.startsWith(`${companyId}/`) || cursor.value.companyId === companyId)) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
    } catch (err) {
      console.warn(`[IndexedDB] Error al limpiar datos de empresa ${companyId}:`, err.message);
    }
  }

  /**
   * Limpia toda la caché de datos.
   */
  static async clearCache() {
    try {
      const db = await this.getDB();
      if (!db) return;
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      tx.objectStore(CACHE_STORE).clear();
    } catch (_) {}
  }

  /**
   * Guarda un elemento en la cola de escrituras pendientes.
   * @param {Object} item
   */
  static async queueWrite(item) {
    try {
      const db = await this.getDB();
      if (!db) return;
      const tx = db.transaction(QUEUE_STORE, 'readwrite');
      tx.objectStore(QUEUE_STORE).put(item);
    } catch (err) {
      console.warn('[IndexedDB] Fallo al encolar escritura:', err.message);
    }
  }

  /**
   * Obtiene todas las escrituras pendientes.
   * @returns {Promise<Array<Object>>}
   */
  static async getQueue() {
    try {
      const db = await this.getDB();
      if (!db) return [];
      return new Promise((resolve) => {
        const tx = db.transaction(QUEUE_STORE, 'readonly');
        const store = tx.objectStore(QUEUE_STORE);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  /**
   * Elimina un elemento de la cola de escrituras por ID.
   * @param {string} id
   */
  static async removeFromQueue(id) {
    try {
      const db = await this.getDB();
      if (!db) return;
      const tx = db.transaction(QUEUE_STORE, 'readwrite');
      tx.objectStore(QUEUE_STORE).delete(id);
    } catch (_) {}
  }

  /**
   * Metadatos de sincronización: obtener timestamp de última sync.
   * @param {string} path
   * @returns {Promise<number>}
   */
  static async getLastSyncTime(path) {
    try {
      const db = await this.getDB();
      if (!db) return 0;
      return new Promise((resolve) => {
        const tx = db.transaction(METADATA_STORE, 'readonly');
        const req = tx.objectStore(METADATA_STORE).get(path);
        req.onsuccess = () => resolve(req.result ? req.result.lastSyncAt : 0);
        req.onerror = () => resolve(0);
      });
    } catch {
      return 0;
    }
  }

  /**
   * Metadatos de sincronización: guardar timestamp de última sync.
   * @param {string} path
   * @param {number} [timestamp=Date.now()]
   */
  static async setLastSyncTime(path, timestamp = Date.now()) {
    try {
      const db = await this.getDB();
      if (!db) return;
      const tx = db.transaction(METADATA_STORE, 'readwrite');
      tx.objectStore(METADATA_STORE).put({ path, lastSyncAt: timestamp });
    } catch (_) {}
  }

  /**
   * Caché de imágenes (Base64/Blob).
   */
  static async setImageCache(id, blobOrDataUrl, companyId = null) {
    try {
      const db = await this.getDB();
      if (!db) return;
      const tx = db.transaction(IMAGES_STORE, 'readwrite');
      tx.objectStore(IMAGES_STORE).put({ id, data: blobOrDataUrl, companyId, updatedAt: Date.now() });
    } catch (err) {
      console.warn('[IndexedDB] Fallo al guardar imagen:', err.message);
    }
  }

  static async getImageCache(id) {
    try {
      const db = await this.getDB();
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction(IMAGES_STORE, 'readonly');
        const req = tx.objectStore(IMAGES_STORE).get(id);
        req.onsuccess = () => resolve(req.result ? req.result.data : null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Guardar la sesión de usuario activa para acceso offline.
   * @param {Object} userSession
   */
  static async setUserSession(userSession) {
    if (!userSession?.uid) return;
    try {
      const db = await this.getDB();
      if (!db) return;
      const tx = db.transaction(SESSIONS_STORE, 'readwrite');
      tx.objectStore(SESSIONS_STORE).put({
        ...userSession,
        updatedAt: Date.now()
      });
    } catch (err) {
      console.warn('[IndexedDB] Error al guardar sesión de usuario:', err.message);
    }
  }

  /**
   * Obtener sesión de usuario por UID o por Email.
   * @param {string} uidOrEmail
   * @returns {Promise<Object|null>}
   */
  static async getUserSession(uidOrEmail) {
    if (!uidOrEmail) return null;
    try {
      const db = await this.getDB();
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction(SESSIONS_STORE, 'readonly');
        const store = tx.objectStore(SESSIONS_STORE);
        const req = store.get(uidOrEmail);
        req.onsuccess = () => {
          if (req.result) {
            resolve(req.result);
          } else {
            // Intentar por índice de email
            const index = store.index('email');
            const emailReq = index.get(uidOrEmail.toLowerCase().trim());
            emailReq.onsuccess = () => resolve(emailReq.result || null);
            emailReq.onerror = () => resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Obtener la sesión activa más reciente guardada offline.
   * @returns {Promise<Object|null>}
   */
  static async getLastUserSession() {
    try {
      const db = await this.getDB();
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction(SESSIONS_STORE, 'readonly');
        const store = tx.objectStore(SESSIONS_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
          const sessions = req.result || [];
          if (sessions.length === 0) return resolve(null);
          sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          resolve(sessions[0]);
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Eliminar sesión de usuario por UID.
   * @param {string} uid
   */
  static async removeUserSession(uid) {
    if (!uid) return;
    try {
      const db = await this.getDB();
      if (!db) return;
      const tx = db.transaction(SESSIONS_STORE, 'readwrite');
      tx.objectStore(SESSIONS_STORE).delete(uid);
    } catch (_) {}
  }
}

