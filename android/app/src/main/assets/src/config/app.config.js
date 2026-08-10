/**
 * @file app.config.js
 * @description Global application-level constants and environment settings.
 */

export const APP_CONFIG = {
  /** Application display name */
  name: 'Ultra Administrador',

  /** Short name for PWA manifest */
  shortName: 'UltraAdmin',

  /** Software development company / Owner */
  company: 'ProLine System',

  /** System official logo URL */
  logo: '/assets/logo_ultra_administrador.png',

  /** Copyright notice */
  copyright: '© 2026 Ultra Administrador by ProLine System. Todos los derechos reservados.',

  /** Application version — bump on each release */
  version: '1.3.8',

  /** Default theme class on HTML body. Options: 'theme-dark' | 'theme-light' */
  defaultTheme: 'theme-dark',

  /** Supported locales */
  locale: 'es-NI',

  /** Official business timezone for all SaaS modules */
  timezone: 'America/Managua',

  /** Default currency code */
  currency: 'NIO',

  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTTL: 300000,

  /** Debounce delay for search inputs (ms) */
  searchDebounceMs: 300,

  /** Maximum file upload size in bytes (5 MB) */
  maxUploadSize: 5 * 1024 * 1024,

  /** Accepted image types for uploads */
  acceptedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],

  /** Items per page in data tables */
  defaultPageSize: 25
};
