/**
 * @file event-bus.js
 * @description Decoupled communication system (Event Bus) using pub/sub namespaces.
 */

export class EventBus {
  constructor() {
    this.events = {};
  }

  /**
   * Register a listener for an event type.
   * @param {string} eventName 
   * @param {Function} callback 
   * @returns {Function} Unsubscribe function
   */
  on(eventName, callback) {
    if (!this.events[eventName]) {
      this.events[eventName] = [];
    }
    this.events[eventName].push(callback);

    return () => this.off(eventName, callback);
  }

  /**
   * Remove a listener for an event type.
   * @param {string} eventName 
   * @param {Function} callback 
   */
  off(eventName, callback) {
    if (!this.events[eventName]) return;
    this.events[eventName] = this.events[eventName].filter(cb => cb !== callback);
  }

  /**
   * Emit an event triggering all registered listener callbacks.
   * @param {string} eventName 
   * @param {any} data 
   */
  emit(eventName, data) {
    if (!this.events[eventName]) return;
    this.events[eventName].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for ${eventName}:`, error);
      }
    });
  }
}

export const GlobalEventBus = new EventBus();
