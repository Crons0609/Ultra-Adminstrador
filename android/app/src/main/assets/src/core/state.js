/**
 * @file state.js
 * @description Pub/Sub reactive State Manager for managing global and contextual module states.
 */

export class Store {
  constructor(initialState = {}) {
    this.state = new Proxy(initialState, {
      set: (target, key, value) => {
        target[key] = value;
        this.notify(key, value);
        return true;
      }
    });
    this.listeners = {};
  }

  /**
   * Subscribe a callback to property state modifications.
   * @param {string} key - State key, or '*' for all changes.
   * @param {Function} callback 
   * @returns {Function} Unsubscribe method
   */
  subscribe(key, callback) {
    if (!this.listeners[key]) {
      this.listeners[key] = [];
    }
    this.listeners[key].push(callback);

    // Return unsubscription hook
    return () => {
      this.listeners[key] = this.listeners[key].filter(cb => cb !== callback);
    };
  }

  /**
   * Broadcast changes to all subscribed listeners.
   * @param {string} key 
   * @param {any} value 
   */
  notify(key, value) {
    // Specific key observers
    if (this.listeners[key]) {
      this.listeners[key].forEach(callback => callback(value, this.state));
    }
    // Global observers
    if (this.listeners['*']) {
      this.listeners['*'].forEach(callback => callback(key, value, this.state));
    }
  }

  /**
   * Safe getter for current state values.
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Set multiple values inside state in a single execution.
   * @param {Object} data 
   */
  set(data) {
    Object.keys(data).forEach(key => {
      this.state[key] = data[key];
    });
  }
}

// Global Application Store Instance
export const GlobalStore = new Store({
  currentUser: null,
  currentCompany: null,
  currentBranch: null,
  activeRole: null,
  isAuthenticated: false,
  networkStatus: 'online'
});
