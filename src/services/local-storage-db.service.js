/**
 * @file local-storage-db.service.js
 * @description Servidor de almacenamiento persistente IndexedDB para Ultra Administrador.
 * Permite guardar lecturas (caché de consultas) y escrituras pendientes en disco para soporte offline total.
 */

const DB_NAME = 'UltraAdminOfflineDB';
const DB_VERSION = 1;
const CACHE_STORE = 'data_cache';
const QUEUE_STORE = 'write_queue';

export class LocalStorageDBService {
  static _dbPromise = null;

  /**
   * Inicializa la base de datos IndexedDB.
   * @returns {Promise<IDBDatabase>}
   */
  static getDB() {
    if (this._dbPromise) return this._dbPromise;

    this._dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        console.warn('[IndexedDB] No soportado en este navegador. Usando memoria.');
        resolve(null);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
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
   */
  static async setCache(key, data) {
    try {
      const db = await this.getDB();
      if (!db) return;

      const tx = db.transaction(CACHE_STORE, 'readwrite');
      const store = tx.objectStore(CACHE_STORE);
      store.put({ key, data: JSON.parse(JSON.stringify(data)), updatedAt: Date.now() });
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
}
