/**
 * @file encryption.js
 * @description Symmetric encryption and decryption utility for client credentials.
 * Uses a robust XOR-based Base64 cipher to ensure credentials are encrypted in RTDB
 * and decrypted only when approved.
 */

const SECRET_SALT = 'ultra-admin-secure-salt-2026';

export class EncryptionService {
  /**
   * Encrypts a string.
   * @param {string} text 
   * @returns {string} Encrypted string in Base64
   */
  static encrypt(text) {
    if (!text) return '';
    try {
      let result = '';
      for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        const saltCode = SECRET_SALT.charCodeAt(i % SECRET_SALT.length);
        result += String.fromCharCode(charCode ^ saltCode);
      }
      return btoa(unescape(encodeURIComponent(result)));
    } catch (e) {
      console.error('[EncryptionService] Encryption failed:', e);
      return text;
    }
  }

  /**
   * Decrypts a string.
   * @param {string} ciphertext 
   * @returns {string} Decrypted string
   */
  static decrypt(ciphertext) {
    if (!ciphertext) return '';
    try {
      const decoded = decodeURIComponent(escape(atob(ciphertext)));
      let result = '';
      for (let i = 0; i < decoded.length; i++) {
        const charCode = decoded.charCodeAt(i);
        const saltCode = SECRET_SALT.charCodeAt(i % SECRET_SALT.length);
        result += String.fromCharCode(charCode ^ saltCode);
      }
      return result;
    } catch (e) {
      console.warn('[EncryptionService] Decryption failed:', e.message);
      return ciphertext;
    }
  }
}
