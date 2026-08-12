/**
 * @file i18n.service.js
 * @description Internationalization Service for Ultra Administrador.
 * Manages per-user language preferences, dynamic translation lookup, and instant reactive UI updates.
 */

import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '../i18n/languages/index.js';
import { es } from '../i18n/languages/es.js';
import { en } from '../i18n/languages/en.js';
import { zhCN } from '../i18n/languages/zh-CN.js';
import { GlobalStore } from '../core/state.js';

const dictionaries = {
  es,
  en,
  'zh-CN': zhCN
};

class I18nServiceClass {
  constructor() {
    this.storageKey = 'app_language';
    this.listeners = new Set();
    this.currentLanguage = this.loadInitialLanguage();
    this.applyDocumentDirection();
  }

  /**
   * Retrieves current active language code.
   */
  getLanguage() {
    return this.currentLanguage || DEFAULT_LANGUAGE;
  }

  /**
   * Returns metadata of currently selected language.
   */
  getCurrentLanguageInfo() {
    return (
      SUPPORTED_LANGUAGES.find(l => l.code === this.currentLanguage) ||
      SUPPORTED_LANGUAGES.find(l => l.code === DEFAULT_LANGUAGE)
    );
  }

  /**
   * Returns full list of supported languages.
   */
  getSupportedLanguages() {
    return SUPPORTED_LANGUAGES;
  }

  /**
   * Loads initial language from localStorage (per-user or global) or default.
   */
  loadInitialLanguage() {
    try {
      const currentUser = GlobalStore.getState()?.currentUser;
      const uid = currentUser?.uid || currentUser?.id;
      if (uid) {
        const userLang = localStorage.getItem(`${this.storageKey}_${uid}`);
        if (userLang && SUPPORTED_LANGUAGES.some(l => l.code === userLang)) {
          return userLang;
        }
        if (currentUser.preferredLanguage && SUPPORTED_LANGUAGES.some(l => l.code === currentUser.preferredLanguage)) {
          return currentUser.preferredLanguage;
        }
      }

      const saved = localStorage.getItem(this.storageKey);
      if (saved && SUPPORTED_LANGUAGES.some(l => l.code === saved)) {
        return saved;
      }
    } catch (_) {}
    return DEFAULT_LANGUAGE;
  }

  /**
   * Initializes language for a logged-in user profile.
   * Called during login or session restore.
   * @param {Object} userProfile
   */
  initUserLanguage(userProfile) {
    if (!userProfile) return;
    const uid = userProfile.uid || userProfile.id;
    const preferred = userProfile.preferredLanguage || 
                      (uid ? localStorage.getItem(`${this.storageKey}_${uid}`) : null);

    if (preferred && SUPPORTED_LANGUAGES.some(l => l.code === preferred)) {
      if (preferred !== this.currentLanguage) {
        this.setLanguage(preferred, false);
      }
    }
  }

  /**
   * Sets current system language, persists it globally & per-user, and triggers UI refresh.
   * @param {string} langCode
   * @param {boolean} [shouldReload=true] - Whether to reload app for full clean re-render
   */
  setLanguage(langCode, shouldReload = true) {
    if (!SUPPORTED_LANGUAGES.some(l => l.code === langCode)) {
      console.warn(`[I18nService] Unsupported language code: ${langCode}`);
      return false;
    }

    this.currentLanguage = langCode;

    // 1. Save globally
    localStorage.setItem(this.storageKey, langCode);
    
    // 2. Save per-user if logged in
    const currentUser = GlobalStore.getState()?.currentUser;
    const uid = currentUser?.uid || currentUser?.id;
    if (uid) {
      localStorage.setItem(`${this.storageKey}_${uid}`, langCode);
      currentUser.preferredLanguage = langCode;

      // Async sync to Firestore user document
      import('./firestore.service.js').then(({ FirestoreService }) => {
        FirestoreService.updatePath(`users/${uid}`, { preferredLanguage: langCode }).catch(() => {});
      }).catch(() => {});
    }

    // 3. Update GlobalStore
    GlobalStore.set({ currentLanguage: langCode });

    this.applyDocumentDirection();
    this.notifyListeners(langCode);
    this.translateDOM();

    // 4. Force clean application refresh if requested
    if (shouldReload && typeof window !== 'undefined') {
      setTimeout(() => {
        window.location.reload();
      }, 100);
    }

    return true;
  }

  /**
   * Sets HTML dir attribute for RTL support (e.g. Arabic).
   */
  applyDocumentDirection() {
    const langInfo = this.getCurrentLanguageInfo();
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = langInfo.code;
      document.documentElement.dir = langInfo.dir || 'ltr';
    }
  }

  /**
   * Main translation function.
   * @param {string} key - Translation key name
   * @param {Object} [params] - Replacement variables (e.g. { name: 'John' })
   */
  t(key, params = {}) {
    if (!key) return typeof params === 'string' ? params : '';
    
    const activeDict = dictionaries[this.currentLanguage] || dictionaries['en'] || dictionaries[DEFAULT_LANGUAGE];
    const fallbackDict = dictionaries[DEFAULT_LANGUAGE];
    const englishDict = dictionaries['en'];

    let text = activeDict ? activeDict[key] : undefined;

    // If missing in active language dictionary:
    if (text === undefined || text === null) {
      if (this.currentLanguage === DEFAULT_LANGUAGE) {
        text = fallbackDict[key];
      } else if (typeof params === 'string') {
        text = params;
      } else {
        text = englishDict?.[key] ?? fallbackDict?.[key];
      }
    }

    if (text === undefined || text === null) {
      return typeof params === 'string' ? params : '';
    }

    if (params && typeof params === 'object') {
      Object.keys(params).forEach(p => {
        text = text.replace(new RegExp(`{${p}}`, 'g'), params[p]);
      });
    }

    return text;
  }

  /**
   * Automatically translates elements marked with data-i18n attribute in root DOM node.
   * @param {HTMLElement} [rootElement]
   */
  translateDOM(rootElement = document) {
    if (!rootElement || !rootElement.querySelectorAll) return;

    const elements = rootElement.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.dataset.i18n;
      if (key) {
        el.textContent = this.t(key);
      }
    });

    const placeholders = rootElement.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach(el => {
      const key = el.dataset.i18nPlaceholder;
      if (key) {
        el.placeholder = this.t(key);
      }
    });
  }

  /**
   * Subscribe to language change events.
   * @param {Function} listener
   */
  subscribe(listener) {
    if (typeof listener === 'function') {
      this.listeners.add(listener);
    }
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all registered listeners.
   */
  notifyListeners(langCode) {
    this.listeners.forEach(fn => {
      try {
        fn(langCode);
      } catch (err) {
        console.error('[I18nService] Listener error:', err);
      }
    });
  }
}

export const I18nService = new I18nServiceClass();
