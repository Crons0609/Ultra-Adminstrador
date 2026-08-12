/**
 * @file index.js
 * @description Catalog of supported languages for Ultra Administrador i18n system.
 */

export const SUPPORTED_LANGUAGES = [
  { code: 'es', name: 'Español', flag: '🇪🇸', nativeName: 'Español', dir: 'ltr' },
  { code: 'en', name: 'Inglés', flag: '🇺🇸', nativeName: 'English', dir: 'ltr' },
  { code: 'zh-CN', name: 'Chino Simplificado', flag: '🇨🇳', nativeName: '中文 (简体)', dir: 'ltr' },
  { code: 'de', name: 'Alemán', flag: '🇩🇪', nativeName: 'Deutsch', dir: 'ltr' },
  { code: 'ru', name: 'Ruso', flag: '🇷🇺', nativeName: 'Русский', dir: 'ltr' },
  { code: 'fr', name: 'Francés', flag: '🇫🇷', nativeName: 'Français', dir: 'ltr' },
  { code: 'pt', name: 'Portugués', flag: '🇵🇹', nativeName: 'Português', dir: 'ltr' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹', nativeName: 'Italiano', dir: 'ltr' },
  { code: 'ja', name: 'Japonés', flag: '🇯🇵', nativeName: '日本語', dir: 'ltr' },
  { code: 'ar', name: 'Árabe', flag: '🇦🇪', nativeName: 'العربية', dir: 'rtl' }
];

export const DEFAULT_LANGUAGE = 'es';
