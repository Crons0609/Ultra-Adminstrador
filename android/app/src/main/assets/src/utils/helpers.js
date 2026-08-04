/**
 * @file helpers.js
 * @description Common utility helpers like deep cloning, random ID generation,
 * cryptographically secure QR token generation, and browser feature checks.
 */

/**
 * Generate a unique ID (cryptographically secure if browser supports it, otherwise fallback).
 * @returns {string}
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a cryptographically secure, URL-safe QR token (UUID v4).
 * The token contains no predictable information about the table, making
 * it impossible for clients to guess or enumerate other table URLs.
 * @returns {string} A UUID v4 string, e.g. "6fd0c91f-a1d5-4d76-91dc-b0c6f0ab27d8"
 */
export function generateQRToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers (still cryptographically reasonable)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Perform a deep copy of an object or array.
 * @param {any} obj 
 * @returns {any}
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item));
  }
  
  const cloned = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * Check if the browser currently supports PWA features like Service Worker.
 * @returns {boolean}
 */
export function isPwaSupported() {
  return 'serviceWorker' in navigator;
}

/**
 * Safely parse JSON strings with a default fallback.
 * @param {string} str 
 * @param {any} fallback 
 */
export function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}
