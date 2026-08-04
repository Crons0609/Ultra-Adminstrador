/**
 * @file cache.service.js
 * @description Local cache layer storing Firestore documents in memory/localStorage to optimize pricing.
 */

export class CacheService {
  static cache = {};

  /**
   * Set key-value pair in local cache.
   * @param {string} key 
   * @param {any} value 
   * @param {number} ttl - Time to live in milliseconds (default: 5 minutes)
   */
  static set(key, value, ttl = 300000) {
    const expiry = Date.now() + ttl;
    this.cache[key] = {
      value,
      expiry
    };
    
    // Optional persistence
    try {
      localStorage.setItem(`cache_${key}`, JSON.stringify({ value, expiry }));
    } catch (e) {
      console.warn('[CacheService] LocalStorage space exceeded or blocked');
    }
  }

  /**
   * Get value from cache if it hasn't expired yet.
   * @param {string} key 
   * @returns {any|null}
   */
  static get(key) {
    const memoryItem = this.cache[key];
    
    // Check in-memory first
    if (memoryItem && memoryItem.expiry > Date.now()) {
      return memoryItem.value;
    }

    // Try localStorage fallback
    try {
      const persisted = localStorage.getItem(`cache_${key}`);
      if (persisted) {
        const { value, expiry } = JSON.parse(persisted);
        if (expiry > Date.now()) {
          // Sync back to memory
          this.cache[key] = { value, expiry };
          return value;
        }
        // Remove expired key
        localStorage.removeItem(`cache_${key}`);
      }
    } catch (e) {
      // Ignore
    }

    return null;
  }

  /**
   * Invalidate specific key or clear entire cache store.
   * @param {string} [key] 
   */
  static invalidate(key = null) {
    if (key) {
      delete this.cache[key];
      try {
        localStorage.removeItem(`cache_${key}`);
      } catch (e) {}
    } else {
      this.cache = {};
      try {
        Object.keys(localStorage)
          .filter(k => k.startsWith('cache_'))
          .forEach(k => localStorage.removeItem(k));
      } catch (e) {}
    }
  }
}
