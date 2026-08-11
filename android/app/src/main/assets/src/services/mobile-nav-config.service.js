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
  // ── Core Navigation ────────────────────────────────────────────────────────
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

  // ── Plataforma Programador (Super Admin) ──────────────────────────────────
  {
    id: 'companies',
    label: 'Empresas',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>`,
    emoji: '🏢',
    allowedRoles: ['SUPER_ADMIN'],
    action: 'navigate:#/super-admin/companies',
    description: 'Gestión global de empresas inscritas'
  },
  {
    id: 'users',
    label: 'Usuarios',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>`,
    emoji: '👥',
    allowedRoles: ['SUPER_ADMIN'],
    action: 'navigate:#/super-admin/users',
    description: 'Directorio de usuarios registrados'
  },
  {
    id: 'monitoring',
    label: 'Monitoreo',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    emoji: '📈',
    allowedRoles: ['SUPER_ADMIN'],
    action: 'navigate:#/super-admin/monitoring',
    description: 'Monitoreo técnico de servidor y salud'
  },
  {
    id: 'plans',
    label: 'Planes SaaS',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>`,
    emoji: '💎',
    allowedRoles: ['SUPER_ADMIN'],
    action: 'navigate:#/super-admin/plans',
    description: 'Gestión de suscripciones y membresías'
  },
  {
    id: 'billing',
    label: 'Facturación SaaS',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>`,
    emoji: '🧾',
    allowedRoles: ['SUPER_ADMIN'],
    action: 'navigate:#/super-admin/billing',
    description: 'Cobros y facturación de la plataforma'
  },
  {
    id: 'support',
    label: 'Soporte',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
    emoji: '🎧',
    allowedRoles: ['SUPER_ADMIN'],
    action: 'navigate:#/super-admin/support',
    description: 'Atención de tickets de ayuda'
  },
  {
    id: 'landing_edit',
    label: 'Landing Page',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    emoji: '🌐',
    allowedRoles: ['SUPER_ADMIN'],
    action: 'navigate:#/super-admin/landing',
    description: 'Modificar contenido de la landing page'
  },
  {
    id: 'logs',
    label: 'Logs',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    emoji: '📜',
    allowedRoles: ['SUPER_ADMIN'],
    action: 'navigate:#/super-admin/logs',
    description: 'Auditoría de eventos del sistema'
  },

  // ── General & Operaciones ──────────────────────────────────────────────────
  {
    id: 'pos',
    label: 'POS / Venta',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>`,
    emoji: '💵',
    allowedRoles: ['OWNER', 'MANAGER', 'CASHIER', 'SUPER_ADMIN'],
    action: 'navigate:#/cashier/pos',
    description: 'Abrir Punto de Venta directo'
  },
  {
    id: 'inventory',
    label: 'Inventario',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
    emoji: '📦',
    allowedRoles: ['OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/inventory/products',
    description: 'Catálogo de productos y stock'
  },
  {
    id: 'scan',
    label: 'Escanear',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
    emoji: '📷',
    allowedRoles: ['OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/owner/invoice-ocr',
    description: 'Escanear factura con OCR/IA'
  },
  {
    id: 'employees',
    label: 'Personal',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`,
    emoji: '👨‍💼',
    allowedRoles: ['OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/manager/employees',
    description: 'Administración de empleados'
  },
  {
    id: 'reports',
    label: 'Reportes',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    emoji: '📊',
    allowedRoles: ['OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/owner/reports',
    description: 'Reportes y estadísticas'
  },
  {
    id: 'qr',
    label: 'Códigos QR',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
    emoji: '🔳',
    allowedRoles: ['OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/manager/qr-codes',
    description: 'Generar y gestionar QRs'
  },
  {
    id: 'calendar',
    label: 'Calendario',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    emoji: '📅',
    allowedRoles: ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'SUPER_ADMIN'],
    action: 'navigate:#/calendar/work-calendar',
    description: 'Turnos, vacaciones y permisos'
  },
  {
    id: 'assets',
    label: 'Activos',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="4" width="20" height="12" rx="2"/><line x1="2" y1="20" x2="22" y2="20"/></svg>`,
    emoji: '🖥️',
    allowedRoles: ['OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/manager/assets',
    description: 'Mobiliario y equipos de la empresa'
  },
  {
    id: 'scanHistory',
    label: 'Hist. Escaneo',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    emoji: '🔍',
    allowedRoles: ['OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/manager/scan-history',
    description: 'Auditoría de lecturas de código'
  },
  {
    id: 'publicPage',
    label: 'Catálogo Web',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg>`,
    emoji: '🌐',
    allowedRoles: ['OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/manager/catalog-settings',
    description: 'Portal público y menú online'
  },
  {
    id: 'pricing',
    label: 'Tarifas',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/></svg>`,
    emoji: '🏷️',
    allowedRoles: ['OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/manager/pricing',
    description: 'Precios especiales diferenciados'
  },
  {
    id: 'hr',
    label: 'Recursos H.',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`,
    emoji: '👔',
    allowedRoles: ['OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/hr/recruitment',
    description: 'Reclutamiento y bolsas de empleo'
  },
  {
    id: 'vehicles',
    label: 'Vehículos',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="6" rx="1"/></svg>`,
    emoji: '🚗',
    allowedRoles: ['OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/manager/vehicles',
    description: 'Flota vehicular para Rent a Car'
  },
  {
    id: 'rentals',
    label: 'Alquileres',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2"/></svg>`,
    emoji: '🔑',
    allowedRoles: ['OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/manager/rentals',
    description: 'Contratos y reservas de alquiler'
  },
  {
    id: 'appointments',
    label: 'Citas',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2"/></svg>`,
    emoji: '📆',
    allowedRoles: ['OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/manager/appointments',
    description: 'Agenda de turnos y citas'
  },
  {
    id: 'serviceRequests',
    label: 'Solicitudes',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/></svg>`,
    emoji: '📋',
    allowedRoles: ['OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/manager/service-requests',
    description: 'Órdenes de servicio personalizadas'
  },
  {
    id: 'tools',
    label: 'Herramientas',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
    emoji: '🛠️',
    allowedRoles: ['OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/manager/tools',
    description: 'Control de herramientas de taller'
  },
  {
    id: 'supplies',
    label: 'Insumos',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 3h12M12 3v11M9 12h6M5 21h14c1 0 2-1 2-2L16 8V3H8v5L3 19c0 1 2-1 2-2z"/></svg>`,
    emoji: '🧪',
    allowedRoles: ['OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/manager/supplies',
    description: 'Materia prima y consumibles'
  },

  // ── Finanzas ──────────────────────────────────────────────────────────────
  {
    id: 'finance',
    label: 'Finanzas',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    emoji: '💰',
    allowedRoles: ['OWNER', 'SUPER_ADMIN'],
    action: 'navigate:#/owner/finance',
    description: 'Control de ingresos y caja general'
  },
  {
    id: 'expenses',
    label: 'Gastos',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>`,
    emoji: '💸',
    allowedRoles: ['OWNER', 'SUPER_ADMIN'],
    action: 'navigate:#/owner/expenses',
    description: 'Registro de egresos y costos'
  },
  {
    id: 'balance',
    label: 'Balance',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="3" y1="6" x2="21" y2="6"/><path d="m3 12 9-9 9 9"/></svg>`,
    emoji: '⚖️',
    allowedRoles: ['OWNER', 'SUPER_ADMIN'],
    action: 'navigate:#/owner/balance',
    description: 'Balance de activos y pasivos'
  },
  {
    id: 'projections',
    label: 'Proyecciones',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>`,
    emoji: '🔮',
    allowedRoles: ['OWNER', 'SUPER_ADMIN'],
    action: 'navigate:#/owner/projections',
    description: 'Previsión de crecimiento e ingresos'
  },
  {
    id: 'recurringClients',
    label: 'Clientes Rec.',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/></svg>`,
    emoji: '🔄',
    allowedRoles: ['OWNER', 'SUPER_ADMIN'],
    action: 'navigate:#/owner/recurring-clients',
    description: 'Cartera de clientes y suscripciones'
  },
  {
    id: 'accountsReceivable',
    label: 'Por Cobrar',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M12 8v8m-4-4h8"/></svg>`,
    emoji: '📑',
    allowedRoles: ['OWNER', 'SUPER_ADMIN'],
    action: 'navigate:#/owner/accounts-receivable',
    description: 'Cobros pendientes a clientes'
  },
  {
    id: 'creditSystem',
    label: 'Créditos',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
    emoji: '💳',
    allowedRoles: ['OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/owner/credit-system',
    description: 'Límites de crédito y fiado'
  },
  {
    id: 'paymentReminders',
    label: 'Avisos Cobro',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg>`,
    emoji: '⏰',
    allowedRoles: ['OWNER', 'MANAGER', 'CASHIER', 'SUPER_ADMIN'],
    action: 'navigate:#/owner/payment-reminders',
    description: 'Recordatorios de cuotas pendientes'
  },
  {
    id: 'accountsPayable',
    label: 'Por Pagar',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M12 8v8m4-8l-8 8"/></svg>`,
    emoji: '🧾',
    allowedRoles: ['OWNER', 'SUPER_ADMIN'],
    action: 'navigate:#/owner/accounts-payable',
    description: 'Cuentas y compromisos a pagar'
  },
  {
    id: 'utilities',
    label: 'Serv. Básicos',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
    emoji: '⚡',
    allowedRoles: ['OWNER', 'SUPER_ADMIN'],
    action: 'navigate:#/owner/basic-services',
    description: 'Recibos de luz, agua, internet'
  },
  {
    id: 'supplierAlerts',
    label: 'Proveedores',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="4" width="20" height="16" rx="2"/></svg>`,
    emoji: '🚛',
    allowedRoles: ['OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/owner/supplier-reminders',
    description: 'Avisos y programación a proveedores'
  },
  {
    id: 'migration',
    label: 'Migración',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/></svg>`,
    emoji: '📤',
    allowedRoles: ['OWNER', 'SUPER_ADMIN'],
    action: 'navigate:#/owner/migration',
    description: 'Importar / exportar datos en Excel'
  },

  // ── Automatización & Mensajería ────────────────────────────────────────────
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`,
    emoji: '💬',
    allowedRoles: ['OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/owner/whatsapp',
    description: 'Envío masivo y bots de WhatsApp'
  },
  {
    id: 'telegram',
    label: 'Telegram',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`,
    emoji: '✈️',
    allowedRoles: ['OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/owner/telegram',
    description: 'Bot oficial de avisos en Telegram'
  },

  // ── Restaurante / Servicio ────────────────────────────────────────────────
  {
    id: 'tables',
    label: 'Mesas',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 11h18M3 11V9a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2M3 11v8m18-8v8M7 19h10"/></svg>`,
    emoji: '🍽️',
    allowedRoles: ['WAITER', 'OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/waiter/tables',
    description: 'Mesas y comandas en tiempo real'
  },
  {
    id: 'kds',
    label: 'Cocina',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2C8.5 2 6 5 6 8c0 4 2 6 6 10 4-4 6-6 6-10 0-3-2.5-6-6-6z"/><line x1="12" y1="8" x2="12" y2="12"/></svg>`,
    emoji: '👨‍🍳',
    allowedRoles: ['KITCHEN', 'OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/kitchen/kds',
    description: 'Monitor de comanda en cocina'
  },
  {
    id: 'cashRegister',
    label: 'Caja Chica',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/></svg>`,
    emoji: '🪙',
    allowedRoles: ['CASHIER', 'OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/cashier/cash-register',
    description: 'Movimientos diarios de caja chica'
  },
  {
    id: 'arqueo',
    label: 'Arqueo Caja',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>`,
    emoji: '📋',
    allowedRoles: ['CASHIER', 'OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/cashier/arqueo',
    description: 'Cierre y cuadre de caja'
  },
  {
    id: 'promotions',
    label: 'Promociones',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/></svg>`,
    emoji: '🏷️',
    allowedRoles: ['CASHIER', 'OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/cashier/promotions',
    description: 'Descuentos y cupones de venta'
  },
  {
    id: 'invoices',
    label: 'Facturación',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>`,
    emoji: '🧾',
    allowedRoles: ['CASHIER', 'OWNER', 'MANAGER', 'SUPER_ADMIN'],
    action: 'navigate:#/cashier/invoices',
    description: 'Emisión de comprobantes y facturas'
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
   * Programmers / SuperAdmins get ALL available tabs in the catalog.
   * @param {string} role
   * @returns {Object[]} Filtered tab definitions
   */
  static getAvailableTabsForRole(role) {
    if (!role) return NAV_TAB_CATALOG;
    const r = String(role).toUpperCase();
    if (r === 'SUPER_ADMIN' || r === 'PROGRAMMER' || r === 'PROGRAMADOR' || r === 'DEV') {
      return NAV_TAB_CATALOG;
    }
    return NAV_TAB_CATALOG.filter(t => t.allowedRoles.includes(r));
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
