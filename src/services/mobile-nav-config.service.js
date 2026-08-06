/**
 * @file mobile-nav-config.service.js
 * @description Per-user mobile bottom navigation bar personalization service.
 *              Reads and writes the user's chosen tab order from Firebase RTDB.
 *              Path: users/{uid}/mobileNavConfig
 */

import { db } from '../config/firebase.config.js';
import { ref, get, update, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';

// ─── Master Catalog of all available nav buttons ────────────────────────────
export const NAV_TAB_CATALOG = [
  {
    id: 'home',
    label: 'Inicio',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>`,
    emoji: '🏠',
    allowedRoles: ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'SUPER_ADMIN'],
    action: 'home',
    description: 'Dashboard principal de tu rol'
  },
  {
    id: 'actions',
    label: 'Acciones',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    emoji: '⚡',
    allowedRoles: ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'SUPER_ADMIN'],
    action: 'sheet:actions',
    description: 'Accesos rápidos operacionales'
  },
  {
    id: 'create',
    label: 'Crear',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    emoji: '➕',
    allowedRoles: ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'SUPER_ADMIN'],
    action: 'sheet:create',
    description: 'Crear nuevo registro contextual'
  },
  {
    id: 'notifications',
    label: 'Avisos',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    emoji: '🔔',
    allowedRoles: ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'SUPER_ADMIN'],
    action: 'sheet:notifications',
    description: 'Centro de avisos en tiempo real'
  },
  {
    id: 'more',
    label: 'Más',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
    emoji: '☰',
    allowedRoles: ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'SUPER_ADMIN'],
    action: 'sheet:more',
    description: 'Catálogo completo de módulos'
  },
  {
    id: 'pos',
    label: 'POS',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>`,
    emoji: '💵',
    allowedRoles: ['OWNER', 'MANAGER', 'CASHIER'],
    action: 'navigate:#/cashier/pos',
    description: 'Abrir Punto de Venta directo'
  },
  {
    id: 'inventory',
    label: 'Inventario',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
    emoji: '📦',
    allowedRoles: ['OWNER', 'MANAGER'],
    action: 'navigate:#/inventory/products',
    description: 'Ir directo al inventario'
  },
  {
    id: 'scan',
    label: 'Escanear',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
    emoji: '📷',
    allowedRoles: ['OWNER', 'MANAGER'],
    action: 'navigate:#/owner/invoice-ocr',
    description: 'Escanear factura con OCR/IA'
  },
  {
    id: 'employees',
    label: 'Personal',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    emoji: '👨‍💼',
    allowedRoles: ['OWNER', 'MANAGER'],
    action: 'navigate:#/manager/employees',
    description: 'Gestión de personal'
  },
  {
    id: 'reports',
    label: 'Reportes',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    emoji: '📊',
    allowedRoles: ['OWNER', 'MANAGER'],
    action: 'navigate:#/owner/reports',
    description: 'Ver reportes y estadísticas'
  },
  {
    id: 'qr',
    label: 'Códigos QR',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/></svg>`,
    emoji: '🔳',
    allowedRoles: ['OWNER', 'MANAGER'],
    action: 'navigate:#/manager/qr-codes',
    description: 'Generar y gestionar QRs'
  },
  {
    id: 'calendar',
    label: 'Calendario',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    emoji: '📅',
    allowedRoles: ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'],
    action: 'navigate:#/calendar/work-calendar',
    description: 'Turnos, permisos y eventos'
  },
  {
    id: 'expenses',
    label: 'Gastos',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    emoji: '💰',
    allowedRoles: ['OWNER'],
    action: 'navigate:#/owner/expenses',
    description: 'Registrar salidas de caja'
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    emoji: '💬',
    allowedRoles: ['OWNER', 'MANAGER'],
    action: 'navigate:#/owner/whatsapp',
    description: 'Centro de mensajería WhatsApp'
  },
  {
    id: 'tables',
    label: 'Mesas',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 11h18M3 11V9a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2M3 11v8m18-8v8M7 19h10"/></svg>`,
    emoji: '🍽️',
    allowedRoles: ['WAITER', 'OWNER', 'MANAGER'],
    action: 'navigate:#/waiter/tables',
    description: 'Gestión de mesas y comandas'
  },
  {
    id: 'kds',
    label: 'Cocina',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2C8.5 2 6 5 6 8c0 4 2 6 6 10 4-4 6-6 6-10 0-3-2.5-6-6-6z"/><line x1="12" y1="8" x2="12" y2="12"/></svg>`,
    emoji: '👨‍🍳',
    allowedRoles: ['KITCHEN', 'OWNER', 'MANAGER'],
    action: 'navigate:#/kitchen/kds',
    description: 'Monitor de cocina (KDS)'
  }
];

export const DEFAULT_NAV_TABS = ['home', 'actions', 'create', 'notifications', 'more'];

// ─── Service Class ────────────────────────────────────────────────────────────
export class MobileNavConfigService {
  /**
   * Load the user's saved nav config from RTDB.
   * Falls back to DEFAULT_NAV_TABS if none saved.
   * @param {string} uid
   * @returns {Promise<string[]>} Array of up to 5 tab IDs
   */
  static async load(uid) {
    if (!uid || !db) return [...DEFAULT_NAV_TABS];
    try {
      const snap = await get(ref(db, `users/${uid}/mobileNavConfig`));
      if (snap.exists()) {
        const data = snap.val();
        if (Array.isArray(data.tabs) && data.tabs.length > 0) {
          return data.tabs.slice(0, 5);
        }
      }
    } catch (err) {
      console.warn('[MobileNavConfigService] Could not load nav config:', err);
    }
    return [...DEFAULT_NAV_TABS];
  }

  /**
   * Save the user's nav tab config to RTDB.
   * @param {string} uid
   * @param {string[]} tabs - Ordered array of up to 5 tab IDs
   */
  static async save(uid, tabs) {
    if (!uid || !db) return;
    const sanitized = tabs.slice(0, 5).filter(id =>
      NAV_TAB_CATALOG.some(t => t.id === id)
    );
    await update(ref(db, `users/${uid}`), {
      mobileNavConfig: {
        tabs: sanitized,
        updatedAt: serverTimestamp()
      }
    });
  }

  /**
   * Get tabs from the catalog that are available for the given role.
   * @param {string} role
   * @returns {Object[]} Filtered tab definitions
   */
  static getAvailableTabsForRole(role) {
    return NAV_TAB_CATALOG.filter(t => t.allowedRoles.includes(role));
  }

  /**
   * Get a tab definition by ID.
   * @param {string} id
   * @returns {Object|null}
   */
  static getTabById(id) {
    return NAV_TAB_CATALOG.find(t => t.id === id) || null;
  }
}
