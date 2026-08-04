/**
 * @file indexed-db.utils.js
 * @description IndexedDB wrapper for local image Blob caching in Ultra Administrador SaaS.
 * Stores reconstructed WebP Blobs locally to achieve instant, zero-latency image loads
 * without repeating Firestore reads.
 */

const DB_NAME = 'UltraImageCacheDB';
const DB_VERSION = 1;
const STORE_NAME = 'image_blobs';

export class IndexedDBUtils {
  static _dbPromise = null;

  /**
   * Initializes or returns the open IndexedDB instance.
   * @private
   * @returns {Promise<IDBDatabase>}
   */
  static _getDB() {
    if (this._dbPromise) return this._dbPromise;

    this._dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.warn('[IndexedDBUtils] IndexedDB is not supported in this browser.');
        return resolve(null);
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // Primary key: imageId
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'imageId' });
          store.createIndex('checksum', 'checksum', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        console.error('[IndexedDBUtils] Database open error:', event.target.error);
        resolve(null); // Fallback gracefully if DB fail
      };
    });

    return this._dbPromise;
  }

  /**
   * Retrieves a cached image Blob by imageId.
   * Checks checksum if provided to ensure freshness.
   * @param {string} imageId
   * @param {string} [expectedChecksum]
   * @returns {Promise<Blob|null>}
   */
  static async getImageBlob(imageId, expectedChecksum = null) {
    const db = await this._getDB();
    if (!db || !imageId) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(imageId);

        req.onsuccess = () => {
          const record = req.result;
          if (!record || !record.blob) return resolve(null);

          // If checksum provided and doesn't match, cache is stale
          if (expectedChecksum && record.checksum && record.checksum !== expectedChecksum) {
            console.log(`[IndexedDBUtils] Cache stale for image ${imageId}. Invalidating.`);
            this.deleteImageBlob(imageId);
            return resolve(null);
          }

          resolve(record.blob);
        };

        req.onerror = () => resolve(null);
      } catch (err) {
        console.warn('[IndexedDBUtils] getImageBlob error:', err);
        resolve(null);
      }
    });
  }

  /**
   * Saves a WebP Blob into IndexedDB.
   * @param {string} imageId
   * @param {Blob} blob
   * @param {string} [checksum]
   * @returns {Promise<boolean>}
   */
  static async saveImageBlob(imageId, blob, checksum = '') {
    const db = await this._getDB();
    if (!db || !imageId || !blob) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const record = {
          imageId,
          blob,
          checksum: checksum || '',
          updatedAt: Date.now()
        };
        const req = store.put(record);

        req.onsuccess = () => resolve(true);
        req.onerror = (err) => {
          console.warn('[IndexedDBUtils] saveImageBlob error:', err);
          resolve(false);
        };
      } catch (err) {
        console.warn('[IndexedDBUtils] saveImageBlob exception:', err);
        resolve(false);
      }
    });
  }

  /**
   * Removes a single image Blob from IndexedDB.
   * @param {string} imageId
   * @returns {Promise<boolean>}
   */
  static async deleteImageBlob(imageId) {
    const db = await this._getDB();
    if (!db || !imageId) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(imageId);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (err) {
        resolve(false);
      }
    });
  }

  /**
   * Clears all cached images from IndexedDB.
   * @returns {Promise<boolean>}
   */
  static async clearAllCache() {
    const db = await this._getDB();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (err) {
        resolve(false);
      }
    });
  }
}
