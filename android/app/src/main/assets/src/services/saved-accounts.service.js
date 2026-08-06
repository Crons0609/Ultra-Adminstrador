/**
 * @file saved-accounts.service.js
 * @description Servicio de cuentas guardadas para cambio rápido de perfil.
 *
 * Almacena en localStorage una lista de cuentas previamente iniciadas sesión.
 * Los datos guardados NO incluyen contraseñas en texto plano; solo email, nombre,
 * inicial y companyId para mostrar el perfil. La contraseña se puede guardar de
 * forma OPCIONAL y cifrada (XOR simple) para el inicio rápido en la APK.
 *
 * Estructura de cada cuenta guardada:
 * {
 *   uid:          string,
 *   email:        string,
 *   displayName:  string,
 *   role:         string,
 *   companyName:  string,
 *   initial:      string,
 *   savedAt:      number,
 *   _enc?:        string   // contraseña cifrada (solo APK, opcional)
 * }
 */

const STORAGE_KEY = 'ua_saved_accounts';
const MAX_ACCOUNTS = 5;

// Cifrado XOR trivial — solo ofusca, no es seguridad real.
// Suficiente para que la contraseña no sea texto plano en localStorage.
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

  // ─── Read ────────────────────────────────────────────────────────────────

  /** Returns all saved accounts sorted by most recently used. */
  static getAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
        : [];
    } catch {
      return [];
    }
  }

  /** Returns the saved account for a given email, or null. */
  static getByEmail(email) {
    return SavedAccountsService.getAll().find(a => a.email === email) || null;
  }

  /** Returns the decoded password for an account (APK quick-login only). */
  static getPassword(email) {
    const acc = SavedAccountsService.getByEmail(email);
    if (!acc?._enc) return null;
    return xorDecode(acc._enc);
  }

  // ─── Write ───────────────────────────────────────────────────────────────

  /**
   * Save or update an account entry.
   * @param {Object} userSession  - From GlobalStore / AuthService
   * @param {string} [password]   - Plain password (will be encoded). Optional.
   * @param {string} [companyName]- Company display name.
   */
  static save(userSession, password = null, companyName = '') {
    if (!userSession?.email) return;

    const accounts = SavedAccountsService.getAll().filter(a => a.email !== userSession.email);

    const entry = {
      uid:         userSession.uid || '',
      email:       userSession.email,
      displayName: userSession.displayName || userSession.email.split('@')[0],
      role:        userSession.role || '',
      companyName: companyName || userSession.companyName || '',
      initial:     (userSession.displayName || userSession.email)[0]?.toUpperCase() || '?',
      savedAt:     Date.now(),
    };

    if (password) {
      entry._enc = xorEncode(password);
    }

    // Put the new/updated entry first
    accounts.unshift(entry);

    // Keep only MAX_ACCOUNTS
    const trimmed = accounts.slice(0, MAX_ACCOUNTS);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      /* storage full */
    }
  }

  /**
   * Update the savedAt timestamp (touch) for an email — marks it as most recent.
   */
  static touch(email) {
    const accounts = SavedAccountsService.getAll();
    const idx = accounts.findIndex(a => a.email === email);
    if (idx !== -1) {
      accounts[idx].savedAt = Date.now();
      accounts.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts)); } catch {}
    }
  }

  /** Remove a single saved account by email. */
  static remove(email) {
    const filtered = SavedAccountsService.getAll().filter(a => a.email !== email);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered)); } catch {}
  }

  /** Remove ALL saved accounts. */
  static clearAll() {
    localStorage.removeItem(STORAGE_KEY);
  }
}
