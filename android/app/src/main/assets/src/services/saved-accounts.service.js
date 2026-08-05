/**
 * @file saved-accounts.service.js
 * @description Servicio de cuentas guardadas para cambio rápido de perfil.
 *
 * Migrado de localStorage a IndexedDB para mayor confiabilidad en APKs Android.
 */

import { LocalStorageDBService } from './local-storage-db.service.js';

const MAX_ACCOUNTS = 5;
const XOR_KEY = 'UA2025ULTRA';

function xorEncode(str) {
  return btoa(
    str.split('').map((c, i) =>
      String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length))
    ).join('')
  );
}

function xorDecode(enc) {
  try {
    const raw = atob(enc);
    return raw.split('').map((c, i) =>
      String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length))
    ).join('');
  } catch {
    return '';
  }
}

export class SavedAccountsService {
  static _cached = [];

  /**
   * Syncs internal cache with IndexedDB.
   */
  static async sync() {
    this._cached = await LocalStorageDBService.getSavedAccounts();
    this._cached.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return this._cached;
  }

  static getAll() {
    return [...this._cached].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  }

  static getByEmail(email) {
    return this._cached.find(a => a.email === email) || null;
  }

  static getPassword(email) {
    const acc = this.getByEmail(email);
    if (!acc?._enc) return null;
    return xorDecode(acc._enc);
  }

  static async save(userSession, password = null, companyName = '') {
    if (!userSession?.email) return;

    const entry = {
      uid:         userSession.uid || '',
      email:       userSession.email,
      displayName: userSession.displayName || userSession.email.split('@')[0],
      role:        userSession.role || '',
      companyName: companyName || userSession.companyName || '',
      initial:     (userSession.displayName || userSession.email)[0]?.toUpperCase() || '?',
      savedAt:     Date.now(),
    };

    if (password) entry._enc = xorEncode(password);

    await LocalStorageDBService.setSavedAccount(entry);
    await this.sync();

    // Cleanup logic for MAX_ACCOUNTS
    if (this._cached.length > MAX_ACCOUNTS) {
      const toRemove = this._cached.slice(MAX_ACCOUNTS);
      for (const old of toRemove) {
        await LocalStorageDBService.removeSavedAccount(old.email);
      }
      await this.sync();
    }
  }

  static async remove(email) {
    await LocalStorageDBService.removeSavedAccount(email);
    await this.sync();
  }
}
