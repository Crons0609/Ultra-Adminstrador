/**
 * @file appearance.service.js
 * @description Centralized service for applying global and company-specific visual themes
 * and CSS variables to the document.
 *
 * Architecture:
 * - 22 Predefined themes (Dark, Light, Corporate, Emerald, Ruby, Purple, Sunset, Minimal, OLED, Cyberpunk, Coffee, Oceanic, etc.)
 * - Applies CSS variables directly to document.body and document.documentElement to override stylesheet defaults.
 * - Supports tenant isolation: each company/owner can set and persist their own theme.
 * - Live preview without full page reloads.
 */

import { FirestoreService } from './firestore.service.js';
import { GlobalStore } from '../core/state.js';

// ─── 22 Predefined theme presets ──────────────────────────────────────────────
export const THEMES = {
  dark: {
    label: 'Oscuro Obsidian',
    emoji: '🌑',
    bgPrimary:      '#0a0a0b',
    bgSecondary:    '#111113',
    bgTertiary:     '#1a1a1e',
    surface:        '#16161a',
    surfaceHover:   '#1f1f24',
    border:         '#27272b',
    borderHover:    '#38383e',
    textPrimary:    '#ededef',
    textSecondary:  '#8b8c94',
    textTertiary:   '#5e5f66',
    accent:         '#7c75ff',
    accentHover:    '#968fff',
    success:        '#34d399',
    warning:        '#fbbf24',
    danger:         '#f87171',
    info:           '#60a5fa',
    sidebarBg:      '#111113',
    headerBg:       '#0a0a0b',
  },

  light: {
    label: 'Claro Fresco',
    emoji: '☀️',
    bgPrimary:      '#f8fafc',
    bgSecondary:    '#ffffff',
    bgTertiary:     '#f1f5f9',
    surface:        '#ffffff',
    surfaceHover:   '#f8fafc',
    border:         '#e2e8f0',
    borderHover:    '#cbd5e1',
    textPrimary:    '#0f172a',
    textSecondary:  '#64748b',
    textTertiary:   '#94a3b8',
    accent:         '#635bff',
    accentHover:    '#524ae5',
    success:        '#10b981',
    warning:        '#f59e0b',
    danger:         '#ef4444',
    info:           '#3b82f6',
    sidebarBg:      '#ffffff',
    headerBg:       '#f8fafc',
  },

  'corporate-blue': {
    label: 'Azul Corporativo',
    emoji: '🔷',
    bgPrimary:      '#050d1a',
    bgSecondary:    '#0a1628',
    bgTertiary:     '#0f2040',
    surface:        '#0d1b33',
    surfaceHover:   '#142444',
    border:         '#1e3557',
    borderHover:    '#2a4a78',
    textPrimary:    '#e8f0fe',
    textSecondary:  '#93b0d8',
    textTertiary:   '#5a7ea8',
    accent:         '#3b82f6',
    accentHover:    '#60a5fa',
    success:        '#34d399',
    warning:        '#fbbf24',
    danger:         '#f87171',
    info:           '#38bdf8',
    sidebarBg:      '#0a1628',
    headerBg:       '#050d1a',
  },

  green: {
    label: 'Verde Esmeralda',
    emoji: '🌿',
    bgPrimary:      '#030d07',
    bgSecondary:    '#061610',
    bgTertiary:     '#0a2218',
    surface:        '#081c13',
    surfaceHover:   '#0d2a1e',
    border:         '#1a3d2a',
    borderHover:    '#255438',
    textPrimary:    '#e0f5ec',
    textSecondary:  '#80c49e',
    textTertiary:   '#4d8f6e',
    accent:         '#10b981',
    accentHover:    '#34d399',
    success:        '#6ee7b7',
    warning:        '#fbbf24',
    danger:         '#f87171',
    info:           '#38bdf8',
    sidebarBg:      '#061610',
    headerBg:       '#030d07',
  },

  red: {
    label: 'Rojo Rubí',
    emoji: '🔴',
    bgPrimary:      '#0f0303',
    bgSecondary:    '#1a0505',
    bgTertiary:     '#280808',
    surface:        '#200606',
    surfaceHover:   '#2f0a0a',
    border:         '#4a1010',
    borderHover:    '#6a1515',
    textPrimary:    '#fde8e8',
    textSecondary:  '#c98a8a',
    textTertiary:   '#8a5555',
    accent:         '#ef4444',
    accentHover:    '#f87171',
    success:        '#34d399',
    warning:        '#fbbf24',
    danger:         '#fca5a5',
    info:           '#60a5fa',
    sidebarBg:      '#1a0505',
    headerBg:       '#0f0303',
  },

  purple: {
    label: 'Morado Real',
    emoji: '💜',
    bgPrimary:      '#090514',
    bgSecondary:    '#120a28',
    bgTertiary:     '#201344',
    surface:        '#180e33',
    surfaceHover:   '#25164d',
    border:         '#321e66',
    borderHover:    '#482b94',
    textPrimary:    '#f3e8ff',
    textSecondary:  '#b89ce0',
    textTertiary:   '#7f63aa',
    accent:         '#9333ea',
    accentHover:    '#a855f7',
    success:        '#34d399',
    warning:        '#fbbf24',
    danger:         '#f87171',
    info:           '#60a5fa',
    sidebarBg:      '#120a28',
    headerBg:       '#090514',
  },

  orange: {
    label: 'Naranja Atardecer',
    emoji: '🟠',
    bgPrimary:      '#0d0602',
    bgSecondary:    '#180d04',
    bgTertiary:     '#251507',
    surface:        '#1f1005',
    surfaceHover:   '#2e180a',
    border:         '#4a2c0a',
    borderHover:    '#6a3e10',
    textPrimary:    '#fef3e8',
    textSecondary:  '#d4a074',
    textTertiary:   '#9a6a40',
    accent:         '#f97316',
    accentHover:    '#fb923c',
    success:        '#34d399',
    warning:        '#fbbf24',
    danger:         '#f87171',
    info:           '#60a5fa',
    sidebarBg:      '#180d04',
    headerBg:       '#0d0602',
  },

  minimal: {
    label: 'Minimalista Mono',
    emoji: '⬜',
    bgPrimary:      '#fafafa',
    bgSecondary:    '#f4f4f5',
    bgTertiary:     '#e4e4e7',
    surface:        '#ffffff',
    surfaceHover:   '#f4f4f5',
    border:         '#d4d4d8',
    borderHover:    '#a1a1aa',
    textPrimary:    '#18181b',
    textSecondary:  '#71717a',
    textTertiary:   '#a1a1aa',
    accent:         '#18181b',
    accentHover:    '#3f3f46',
    success:        '#16a34a',
    warning:        '#ca8a04',
    danger:         '#dc2626',
    info:           '#2563eb',
    sidebarBg:      '#f4f4f5',
    headerBg:       '#fafafa',
  },

  'high-contrast': {
    label: 'Alto Contraste',
    emoji: '⬛',
    bgPrimary:      '#000000',
    bgSecondary:    '#0a0a0a',
    bgTertiary:     '#141414',
    surface:        '#0f0f0f',
    surfaceHover:   '#1f1f1f',
    border:         '#ffffff',
    borderHover:    '#cccccc',
    textPrimary:    '#ffffff',
    textSecondary:  '#e0e0e0',
    textTertiary:   '#b0b0b0',
    accent:         '#ffff00',
    accentHover:    '#ffee00',
    success:        '#00ff88',
    warning:        '#ffcc00',
    danger:         '#ff3333',
    info:           '#00ccff',
    sidebarBg:      '#000000',
    headerBg:       '#000000',
  },

  cyberpunk: {
    label: 'Cyberpunk Neón',
    emoji: '⚡',
    bgPrimary:      '#0b0518',
    bgSecondary:    '#13092b',
    bgTertiary:     '#251352',
    surface:        '#1b0e3b',
    surfaceHover:   '#281657',
    border:         '#3e1e82',
    borderHover:    '#5c2cb8',
    textPrimary:    '#f8f0ff',
    textSecondary:  '#c89eff',
    textTertiary:   '#8652c6',
    accent:         '#00f0ff',
    accentHover:    '#ff007f',
    success:        '#00ffaa',
    warning:        '#ffbe0b',
    danger:         '#ff0055',
    info:           '#00f0ff',
    sidebarBg:      '#13092b',
    headerBg:       '#0b0518',
  },

  oled: {
    label: 'Noche OLED',
    emoji: '🌌',
    bgPrimary:      '#000000',
    bgSecondary:    '#050505',
    bgTertiary:     '#141414',
    surface:        '#0d0d0d',
    surfaceHover:   '#171717',
    border:         '#222222',
    borderHover:    '#333333',
    textPrimary:    '#ffffff',
    textSecondary:  '#a3a3a3',
    textTertiary:   '#666666',
    accent:         '#38bdf8',
    accentHover:    '#60a5fa',
    success:        '#34d399',
    warning:        '#fbbf24',
    danger:         '#f87171',
    info:           '#38bdf8',
    sidebarBg:      '#050505',
    headerBg:       '#000000',
  },

  'warm-coffee': {
    label: 'Café & Crema',
    emoji: '☕',
    bgPrimary:      '#0f0b08',
    bgSecondary:    '#1a130e',
    bgTertiary:     '#30241b',
    surface:        '#241b14',
    surfaceHover:   '#33271d',
    border:         '#48372a',
    borderHover:    '#634c3b',
    textPrimary:    '#fdf8f5',
    textSecondary:  '#d6c2b4',
    textTertiary:   '#9e8777',
    accent:         '#d97706',
    accentHover:    '#f59e0b',
    success:        '#10b981',
    warning:        '#f59e0b',
    danger:         '#ef4444',
    info:           '#3b82f6',
    sidebarBg:      '#1a130e',
    headerBg:       '#0f0b08',
  },

  oceanic: {
    label: 'Océano Profundo',
    emoji: '🌊',
    bgPrimary:      '#030f14',
    bgSecondary:    '#061b24',
    bgTertiary:     '#0f3445',
    surface:        '#0a2733',
    surfaceHover:   '#113747',
    border:         '#174d66',
    borderHover:    '#216b8c',
    textPrimary:    '#e0f7ff',
    textSecondary:  '#7dd3fc',
    textTertiary:   '#388ea8',
    accent:         '#06b6d4',
    accentHover:    '#22d3ee',
    success:        '#34d399',
    warning:        '#fbbf24',
    danger:         '#f87171',
    info:           '#38bdf8',
    sidebarBg:      '#061b24',
    headerBg:       '#030f14',
  },

  'pastel-rose': {
    label: 'Rosa Pastel',
    emoji: '🌸',
    bgPrimary:      '#12070b',
    bgSecondary:    '#1f0d14',
    bgTertiary:     '#381925',
    surface:        '#29121b',
    surfaceHover:   '#3a1a27',
    border:         '#542538',
    borderHover:    '#75344f',
    textPrimary:    '#fff0f5',
    textSecondary:  '#f472b6',
    textTertiary:   '#b85284',
    accent:         '#ec4899',
    accentHover:    '#f472b6',
    success:        '#34d399',
    warning:        '#fbbf24',
    danger:         '#f87171',
    info:           '#60a5fa',
    sidebarBg:      '#1f0d14',
    headerBg:       '#12070b',
  },

  'gold-luxury': {
    label: 'Oro & Lujo',
    emoji: '👑',
    bgPrimary:      '#0c0a06',
    bgSecondary:    '#17140c',
    bgTertiary:     '#2e2919',
    surface:        '#211d12',
    surfaceHover:   '#302a1b',
    border:         '#473f27',
    borderHover:    '#695d3a',
    textPrimary:    '#fffdf5',
    textSecondary:  '#eab308',
    textTertiary:   '#a37d0a',
    accent:         '#eab308',
    accentHover:    '#fde047',
    success:        '#34d399',
    warning:        '#fbbf24',
    danger:         '#f87171',
    info:           '#60a5fa',
    sidebarBg:      '#17140c',
    headerBg:       '#0c0a06',
  },

  synthwave: {
    label: 'Synthwave 80s',
    emoji: '🎮',
    bgPrimary:      '#16041e',
    bgSecondary:    '#240730',
    bgTertiary:     '#420e59',
    surface:        '#310a42',
    surfaceHover:   '#440e5c',
    border:         '#641687',
    borderHover:    '#8d1fc0',
    textPrimary:    '#ffe6ff',
    textSecondary:  '#f472b6',
    textTertiary:   '#b04e84',
    accent:         '#f43f5e',
    accentHover:    '#fb7185',
    success:        '#00ffaa',
    warning:        '#fbbf24',
    danger:         '#f43f5e',
    info:           '#38bdf8',
    sidebarBg:      '#240730',
    headerBg:       '#16041e',
  },

  forest: {
    label: 'Pino Forestal',
    emoji: '🌲',
    bgPrimary:      '#060f09',
    bgSecondary:    '#0c1a10',
    bgTertiary:     '#1a3622',
    surface:        '#122618',
    surfaceHover:   '#1a3823',
    border:         '#285234',
    borderHover:    '#39754a',
    textPrimary:    '#f0fdf4',
    textSecondary:  '#86efac',
    textTertiary:   '#4ade80',
    accent:         '#22c55e',
    accentHover:    '#4ade80',
    success:        '#4ade80',
    warning:        '#fbbf24',
    danger:         '#f87171',
    info:           '#38bdf8',
    sidebarBg:      '#0c1a10',
    headerBg:       '#060f09',
  },

  slate: {
    label: 'Pizarra Grafito',
    emoji: '🗿',
    bgPrimary:      '#0f172a',
    bgSecondary:    '#1e293b',
    bgTertiary:     '#475569',
    surface:        '#334155',
    surfaceHover:   '#3e4c5e',
    border:         '#475569',
    borderHover:    '#64748b',
    textPrimary:    '#f8fafc',
    textSecondary:  '#cbd5e1',
    textTertiary:   '#94a3b8',
    accent:         '#38bdf8',
    accentHover:    '#60a5fa',
    success:        '#34d399',
    warning:        '#fbbf24',
    danger:         '#f87171',
    info:           '#38bdf8',
    sidebarBg:      '#1e293b',
    headerBg:       '#0f172a',
  },

  'electric-indigo': {
    label: 'Índigo Eléctrico',
    emoji: '🍇',
    bgPrimary:      '#06061a',
    bgSecondary:    '#0d0d2b',
    bgTertiary:     '#1d1d54',
    surface:        '#14143d',
    surfaceHover:   '#1d1d59',
    border:         '#2d2d7c',
    borderHover:    '#4040aa',
    textPrimary:    '#eef2ff',
    textSecondary:  '#a5b4fc',
    textTertiary:   '#6366f1',
    accent:         '#6366f1',
    accentHover:    '#818cf8',
    success:        '#34d399',
    warning:        '#fbbf24',
    danger:         '#f87171',
    info:           '#60a5fa',
    sidebarBg:      '#0d0d2b',
    headerBg:       '#06061a',
  },

  matcha: {
    label: 'Menta Matcha',
    emoji: '🍨',
    bgPrimary:      '#08120c',
    bgSecondary:    '#102116',
    bgTertiary:     '#22402d',
    surface:        '#182e20',
    surfaceHover:   '#22422e',
    border:         '#325c42',
    borderHover:    '#45825d',
    textPrimary:    '#f0fdf4',
    textSecondary:  '#a7f3d0',
    textTertiary:   '#6ee7b7',
    accent:         '#10b981',
    accentHover:    '#34d399',
    success:        '#34d399',
    warning:        '#fbbf24',
    danger:         '#f87171',
    info:           '#38bdf8',
    sidebarBg:      '#102116',
    headerBg:       '#08120c',
  },

  cosmic: {
    label: 'Galaxia Cósmica',
    emoji: '🌌',
    bgPrimary:      '#030712',
    bgSecondary:    '#0b1329',
    bgTertiary:     '#1a2954',
    surface:        '#111c3d',
    surfaceHover:   '#182754',
    border:         '#2b3e7a',
    borderHover:    '#3d56a6',
    textPrimary:    '#f0f6ff',
    textSecondary:  '#93c5fd',
    textTertiary:   '#60a5fa',
    accent:         '#a855f7',
    accentHover:    '#c084fc',
    success:        '#34d399',
    warning:        '#fbbf24',
    danger:         '#f87171',
    info:           '#38bdf8',
    sidebarBg:      '#0b1329',
    headerBg:       '#030712',
  },

  custom: {
    label: 'Personalizado',
    emoji: '🎨',
  }
};

// ─── Mapping keys to CSS Variables ──────────────────────────────────────────
const CSS_VARS_MAP = {
  bgPrimary:     '--color-bg-primary',
  bgSecondary:   '--color-bg-secondary',
  bgTertiary:    '--color-bg-tertiary',
  surface:       '--color-surface',
  surfaceHover:  '--color-surface-hover',
  border:        '--color-border',
  borderHover:   '--color-border-hover',
  textPrimary:   '--color-text-primary',
  textSecondary: '--color-text-secondary',
  textTertiary:  '--color-text-tertiary',
  accent:        '--color-accent',
  accentHover:   '--color-accent-hover',
  success:       '--color-success',
  warning:       '--color-warning',
  danger:        '--color-danger',
  info:          '--color-info',
};

export class AppearanceService {
  static _lastConfig = null;

  /**
   * Loads the active appearance config for the target company or global SaaS.
   * If companyId is passed, fetches company config, falling back to global SaaS config.
   *
   * @param {string|null} [companyId]
   */
  static async loadAndApply(companyId = null) {
    try {
      let targetCompanyId = companyId;
      if (!targetCompanyId) {
        const { currentUser } = GlobalStore.getState();
        targetCompanyId = currentUser?.companyId || 'global';
      }

      let config = await FirestoreService.getCompanyConfig(targetCompanyId);
      
      // Fallback to global SaaS config if tenant hasn't set custom appearance
      if (!config && targetCompanyId !== 'global') {
        config = await FirestoreService.getCompanyConfig('global');
      }

      if (config) {
        AppearanceService.applyConfig(config);
        console.log(`[AppearanceService] ✅ Appearance applied for tenant [${targetCompanyId}].`);
      } else {
        AppearanceService.applyThemePreset('dark');
        console.log('[AppearanceService] ℹ️ No saved config found — applying default dark theme.');
      }
    } catch (err) {
      console.warn('[AppearanceService] Could not load config:', err.message);
      AppearanceService.applyThemePreset('dark');
    }
  }

  /**
   * Apply a full configuration object to BOTH document.documentElement AND document.body.
   *
   * @param {Object} config — Saved appearance config object
   */
  static applyConfig(config) {
    if (!config) return;
    AppearanceService._lastConfig = config;

    const themeName = config.theme || 'dark';

    if (themeName === 'custom') {
      AppearanceService._applyCustomColors(config);
    } else {
      AppearanceService.applyThemePreset(themeName);
    }

    // Toggle body theme class (.theme-dark / .theme-light)
    AppearanceService._applyBodyClass(themeName);

    // Apply typography settings
    if (config.fontFamily) {
      const fontVal = `'${config.fontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
      document.documentElement.style.setProperty('--font-sans', fontVal);
      document.body.style.setProperty('--font-sans', fontVal);
    }
    if (config.fontSize) {
      document.documentElement.style.setProperty('--font-size-base', config.fontSize);
      document.documentElement.style.fontSize = config.fontSize;
      document.body.style.fontSize = config.fontSize;
    }
    if (config.borderRadius !== undefined) {
      const r = Number(config.borderRadius) || 8;
      const setRadii = (target) => {
        target.style.setProperty('--radius-md', `${r}px`);
        target.style.setProperty('--radius-sm', `${Math.max(2, r - 4)}px`);
        target.style.setProperty('--radius-lg', `${r + 4}px`);
        target.style.setProperty('--radius-xl', `${r + 8}px`);
      };
      setRadii(document.documentElement);
      setRadii(document.body);
    }

    // Explicit sidebar/header color overrides if passed
    if (config.sidebarColor) {
      document.documentElement.style.setProperty('--color-bg-secondary', config.sidebarColor);
      document.body.style.setProperty('--color-bg-secondary', config.sidebarColor);
    }
  }

  /**
   * Apply a named preset theme to CSS variables on BOTH html and body.
   * @param {string} themeName
   */
  static applyThemePreset(themeName) {
    const preset = THEMES[themeName];
    if (!preset || themeName === 'custom') return;

    const root = document.documentElement;
    const body = document.body;

    const setVar = (varName, val) => {
      root.style.setProperty(varName, val);
      body.style.setProperty(varName, val);
    };

    // Apply main mapped vars
    Object.entries(CSS_VARS_MAP).forEach(([key, cssVar]) => {
      if (preset[key]) {
        setVar(cssVar, preset[key]);
      }
    });

    // Derived values
    if (preset.accent) {
      setVar('--color-accent-light', AppearanceService._hexToRgba(preset.accent, 0.15));
    }
    if (preset.success) {
      setVar('--color-success-light', AppearanceService._hexToRgba(preset.success, 0.15));
    }
    if (preset.warning) {
      setVar('--color-warning-light', AppearanceService._hexToRgba(preset.warning, 0.15));
    }
    if (preset.danger) {
      setVar('--color-danger-light', AppearanceService._hexToRgba(preset.danger, 0.15));
    }
    if (preset.info) {
      setVar('--color-info-light', AppearanceService._hexToRgba(preset.info, 0.15));
    }

    // Glass and elevation
    if (preset.bgPrimary) {
      setVar('--glass-bg', AppearanceService._hexToRgba(preset.surface || preset.bgPrimary, 0.75));
      setVar('--glass-border', AppearanceService._hexToRgba(preset.border || '#333', 0.6));
      setVar('--color-bg-elevated', preset.surfaceHover || preset.surface || preset.bgPrimary);
    }

    // Sidebar and Header
    if (preset.sidebarBg) {
      setVar('--color-bg-secondary', preset.sidebarBg);
    }
    if (preset.headerBg) {
      setVar('--color-bg-primary', preset.headerBg);
    }
  }

  /**
   * Apply individual custom colors from config object.
   * @param {Object} config
   */
  static _applyCustomColors(config) {
    const root = document.documentElement;
    const body = document.body;

    const setVar = (varName, val) => {
      root.style.setProperty(varName, val);
      body.style.setProperty(varName, val);
    };

    const map = {
      primaryColor:   '--color-accent',
      linkColor:      '--color-accent',
      bgColor:        '--color-bg-primary',
      cardColor:      '--color-surface',
      sidebarColor:   '--color-bg-secondary',
      warningColor:   '--color-warning',
      successColor:   '--color-success',
      errorColor:     '--color-danger',
      textColor:      '--color-text-primary',
      textSecColor:   '--color-text-secondary',
    };

    Object.entries(map).forEach(([cfgKey, cssVar]) => {
      if (config[cfgKey]) {
        setVar(cssVar, config[cfgKey]);
      }
    });

    if (config.primaryColor) {
      setVar('--color-accent-hover', AppearanceService._lighten(config.primaryColor, 15));
      setVar('--color-accent-light', AppearanceService._hexToRgba(config.primaryColor, 0.15));
      setVar('--color-info', config.primaryColor);
      setVar('--color-info-light', AppearanceService._hexToRgba(config.primaryColor, 0.12));
    }
    if (config.successColor) {
      setVar('--color-success-light', AppearanceService._hexToRgba(config.successColor, 0.15));
    }
    if (config.warningColor) {
      setVar('--color-warning-light', AppearanceService._hexToRgba(config.warningColor, 0.15));
    }
    if (config.errorColor) {
      setVar('--color-danger-light', AppearanceService._hexToRgba(config.errorColor, 0.15));
    }

    if (config.bgColor) {
      setVar('--color-bg-tertiary', AppearanceService._lighten(config.bgColor, 8));
      setVar('--color-bg-primary', config.bgColor);
    }
    if (config.cardColor) {
      setVar('--color-surface', config.cardColor);
      setVar('--color-surface-hover', AppearanceService._lighten(config.cardColor, 5));
    }
  }

  /**
   * Toggle body theme class (theme-dark / theme-light) based on theme preset.
   * @param {string} themeName
   */
  static _applyBodyClass(themeName) {
    const body = document.body;
    [...body.classList].filter(c => c.startsWith('theme-')).forEach(c => body.classList.remove(c));

    const lightThemes = ['light', 'minimal'];
    if (lightThemes.includes(themeName)) {
      body.classList.add('theme-light');
    } else {
      body.classList.add('theme-dark');
    }
  }

  static _hexToRgba(hex, alpha = 1) {
    if (!hex || typeof hex !== 'string') return `rgba(0,0,0,${alpha})`;
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return hex;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  static _lighten(hex, amount) {
    if (!hex || typeof hex !== 'string') return hex;
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    if (isNaN(num)) return hex;
    const r = Math.min(255, (num >> 16) + Math.round(amount * 2.55));
    const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(amount * 2.55));
    const b = Math.min(255, (num & 0xff) + Math.round(amount * 2.55));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /**
   * Apply an appearance config to a customer-facing public catalog/menu container.
   * Sets --pub-* CSS custom properties on the target element (or document.body).
   *
   * @param {HTMLElement} element - The .public-catalog-root container element
   * @param {Object} config - The saved company appearance config
   */
  static applyToPublicCatalog(element, config) {
    if (!element || !config) return;

    const themeName = config.theme || 'dark';
    let preset = THEMES[themeName];

    if (themeName === 'custom' || !preset) {
      preset = {
        bgPrimary:      config.bgColor || '#0a0a0b',
        bgSecondary:    config.sidebarColor || '#111113',
        surface:        config.cardColor || '#16161a',
        border:         '#27272b',
        textPrimary:    config.textColor || '#ededef',
        textSecondary:  config.textSecColor || '#8b8c94',
        accent:         config.primaryColor || '#7c75ff',
      };
    }

    const setPubVar = (varName, val) => {
      if (val) element.style.setProperty(varName, val);
    };

    setPubVar('--pub-primary', config.primaryColor || preset.accent);
    setPubVar('--pub-secondary', preset.sidebarBg || preset.bgSecondary || '#111113');
    setPubVar('--pub-bg', config.bgColor || preset.bgPrimary || '#0a0a0b');
    setPubVar('--pub-surface', config.cardColor || preset.surface || '#16161a');
    setPubVar('--pub-border', preset.border || '#27272b');
    setPubVar('--pub-text', config.textColor || preset.textPrimary || '#ededef');
    setPubVar('--pub-text-sec', config.textSecColor || preset.textSecondary || '#8b8c94');

    if (config.borderRadius !== undefined) {
      setPubVar('--pub-radius', `${config.borderRadius}px`);
    }

    if (config.fontFamily) {
      element.style.fontFamily = `'${config.fontFamily}', -apple-system, BlinkMacSystemFont, sans-serif`;
    }

    // Toggle light-mode class on public root container
    const lightThemes = ['light', 'minimal'];
    if (lightThemes.includes(themeName)) {
      element.classList.add('light-mode');
    } else {
      element.classList.remove('light-mode');
    }
  }

  static getThemeDefaults(themeName) {
    return THEMES[themeName] || THEMES.dark;
  }
}
