/**
 * @file modules.config.js
 * @description Central Module Registry for Ultra Administrador SaaS.
 * Defines all available system modules, icons, routes, categories, and permission helpers.
 */

export const MODULE_REGISTRY = [
  // ─── GENERAL ──────────────────────────────────────────────────────────────
  {
    id: 'dashboard',
    name: 'Dashboard',
    category: 'General',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
    path: '#/manager/dashboard',
    description: 'Panel principal de métricas, ventas y resúmenes operativos.',
    defaultEnabled: true,
    allowedRoles: ['OWNER', 'MANAGER']
  },
  {
    id: 'employees',
    name: 'Empleados',
    category: 'General',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    path: '#/manager/employees',
    description: 'Administración de personal, cuentas y asignación de roles.',
    defaultEnabled: true,
    allowedRoles: ['OWNER', 'MANAGER']
  },
  {
    id: 'inventory',
    name: 'Inventario',
    category: 'General',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
    path: '#/inventory/products',
    description: 'Catálogo de productos, existencias, categorías y precios.',
    defaultEnabled: true,
    allowedRoles: ['OWNER', 'MANAGER']
  },
  {
    id: 'invoiceScanner',
    name: 'Lector de Facturas',
    category: 'General',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    path: '#/owner/invoice-ocr',
    description: 'Escáner OCR inteligente para lectura de facturas físicas y compras.',
    defaultEnabled: true,
    allowedRoles: ['OWNER', 'MANAGER']
  },
  {
    id: 'migration',
    name: 'Migración de Datos',
    category: 'General',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
    path: '#/owner/migration',
    description: 'Importación y exportación masiva en Excel, Word, PDF, JSON y CSV.',
    defaultEnabled: true,
    allowedRoles: ['OWNER']
  },
  {
    id: 'assets',
    name: 'Activos y Equipos',
    category: 'General',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="12" rx="2"/><line x1="2" y1="20" x2="22" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/></svg>`,
    path: '#/manager/assets',
    description: 'Control de mobiliario, equipos y activos fijos de la empresa.',
    defaultEnabled: false,
    allowedRoles: ['OWNER', 'MANAGER']
  },
  {
    id: 'scanHistory',
    name: 'Historial de Escaneos',
    category: 'General',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    path: '#/manager/scan-history',
    description: 'Registro de escaneos de códigos de barra e inventario físico.',
    defaultEnabled: false,
    allowedRoles: ['OWNER', 'MANAGER']
  },
  {
    id: 'qrCodes',
    name: 'Códigos QR',
    category: 'General',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/><rect x="3" y="16" width="5" height="5"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>`,
    path: '#/manager/qr-codes',
    description: 'Generador y administración de QRs para mesas o productos.',
    defaultEnabled: true,
    allowedRoles: ['OWNER', 'MANAGER']
  },
  {
    id: 'specialPrices',
    name: 'Precios Especiales',
    category: 'General',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
    path: '#/manager/pricing',
    description: 'Tarifas diferenciadas por tipo de cliente o vendedor.',
    defaultEnabled: false,
    allowedRoles: ['OWNER', 'MANAGER']
  },
  {
    id: 'publicPage',
    name: 'Página Pública',
    category: 'General',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    path: '#/manager/catalog-settings',
    description: 'Configuración del portal público y menú/catálogo online.',
    defaultEnabled: true,
    allowedRoles: ['OWNER', 'MANAGER']
  },
  {
    id: 'settings',
    name: 'Ajustes',
    category: 'General',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    path: '#/owner/settings',
    description: 'Perfil de empresa, logotipo, tema y parámetros generales.',
    defaultEnabled: true,
    allowedRoles: ['OWNER']
  },

  // ─── FINANZAS ─────────────────────────────────────────────────────────────
  {
    id: 'financialControl',
    name: 'Control Financiero',
    category: 'Finanzas',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    path: '#/owner/finance',
    description: 'Monitoreo de ingresos totales, flujo de caja y rentabilidad.',
    defaultEnabled: true,
    allowedRoles: ['OWNER']
  },
  {
    id: 'expenses',
    name: 'Gastos',
    category: 'Finanzas',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
    path: '#/owner/expenses',
    description: 'Registro y categorización de salidas de caja y costos operativos.',
    defaultEnabled: true,
    allowedRoles: ['OWNER']
  },
  {
    id: 'balance',
    name: 'Balance General',
    category: 'Finanzas',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><path d="m3 12 9-9 9 9"/><path d="M5 20a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8H5z"/></svg>`,
    path: '#/owner/balance',
    description: 'Estado financiero consolidado de activos y pasivos.',
    defaultEnabled: true,
    allowedRoles: ['OWNER']
  },
  {
    id: 'projections',
    name: 'Proyecciones',
    category: 'Finanzas',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
    path: '#/owner/projections',
    description: 'Estimaciones de crecimiento y previsión de ingresos.',
    defaultEnabled: true,
    allowedRoles: ['OWNER']
  },
  {
    id: 'recurringClients',
    name: 'Clientes Recurrentes',
    category: 'Finanzas',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    path: '#/owner/recurring-clients',
    description: 'Gestión de cartera de clientes habituales y membresías.',
    defaultEnabled: true,
    allowedRoles: ['OWNER']
  },
  {
    id: 'accountsReceivable',
    name: 'Cuentas por Cobrar',
    category: 'Finanzas',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M12 8v8m-4-4h8"/></svg>`,
    path: '#/owner/accounts-receivable',
    description: 'Control de saldos pendientes por cobrar a clientes.',
    defaultEnabled: true,
    allowedRoles: ['OWNER']
  },
  {
    id: 'creditSystem',
    name: 'Sistema de Crédito',
    category: 'Finanzas',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/><line x1="6" y1="16" x2="10" y2="16"/><line x1="14" y1="16" x2="18" y2="16"/></svg>`,
    path: '#/owner/credit-system',
    description: 'Administración de límites de fiado y financiamiento.',
    defaultEnabled: true,
    allowedRoles: ['OWNER', 'MANAGER']
  },
  {
    id: 'paymentReminders',
    name: 'Recordatorios de Pago',
    category: 'Finanzas',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><circle cx="18" cy="4" r="3" fill="var(--color-danger)"/></svg>`,
    path: '#/owner/payment-reminders',
    description: 'Notificaciones automáticas de cobro vencido a clientes.',
    defaultEnabled: true,
    allowedRoles: ['OWNER', 'MANAGER', 'CASHIER']
  },
  {
    id: 'accountsPayable',
    name: 'Cuentas por Pagar',
    category: 'Finanzas',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M12 8v8m4-8l-8 8"/></svg>`,
    path: '#/owner/accounts-payable',
    description: 'Control de deudas y compromisos financieros pendientes.',
    defaultEnabled: true,
    allowedRoles: ['OWNER']
  },
  {
    id: 'utilities',
    name: 'Servicios Básicos',
    category: 'Finanzas',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
    path: '#/owner/basic-services',
    description: 'Seguimiento de recibos de luz, agua, internet y alquiler.',
    defaultEnabled: true,
    allowedRoles: ['OWNER']
  },
  {
    id: 'supplierAlerts',
    name: 'Avisos a Proveedores',
    category: 'Finanzas',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M12 8v8m4-8l-8 8"/></svg>`,
    path: '#/owner/supplier-reminders',
    description: 'Programación de pagos y avisos de vencimiento a proveedores.',
    defaultEnabled: true,
    allowedRoles: ['OWNER', 'MANAGER']
  },

  // ─── OPERACIONES Y RUBROS ────────────────────────────────────────────────
  {
    id: 'workCalendar',
    name: 'Calendario Laboral',
    category: 'Operaciones',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h4m-4 4h8"/></svg>`,
    path: '#/calendar/work-calendar',
    description: 'Gestión de días libres, vacaciones, permisos, ausencias y eventos de empresa.',
    defaultEnabled: true,
    allowedRoles: ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN']
  },
  {
    id: 'hrRecruitment',
    name: 'Recursos Humanos (RH)',
    category: 'Operaciones',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    path: '#/hr/recruitment',
    description: 'Reclutamiento digital mediante código QR, banco de talento, expedientes y contratación.',
    defaultEnabled: true,
    allowedRoles: ['OWNER', 'MANAGER']
  },
  {
    id: 'vehicles',
    name: 'Catálogo de Vehículos',
    category: 'Operaciones',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="6" rx="1"/><path d="M5 9l1.5-4h11L19 9"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/></svg>`,
    path: '#/manager/vehicles',
    description: 'Gestión de flota vehicular para empresas de alquiler (Rent a Car).',
    defaultEnabled: false,
    allowedRoles: ['OWNER', 'MANAGER']
  },
  {
    id: 'rentals',
    name: 'Alquileres',
    category: 'Operaciones',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    path: '#/manager/rentals',
    description: 'Control de reservas y contratos de arrendamiento.',
    defaultEnabled: false,
    allowedRoles: ['OWNER', 'MANAGER']
  },
  {
    id: 'appointments',
    name: 'Citas y Reservas',
    category: 'Operaciones',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    path: '#/manager/appointments',
    description: 'Agenda de turnos para barberías, clínicas y centros de servicio.',
    defaultEnabled: false,
    allowedRoles: ['OWNER', 'MANAGER']
  },
  {
    id: 'serviceRequests',
    name: 'Solicitudes de Servicio',
    category: 'Operaciones',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
    path: '#/manager/service-requests',
    description: 'Recepción de órdenes de trabajo personalizadas.',
    defaultEnabled: false,
    allowedRoles: ['OWNER', 'MANAGER']
  },
  {
    id: 'tools',
    name: 'Herramientas',
    category: 'Operaciones',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
    path: '#/manager/tools',
    description: 'Inventario de herramientas de taller o construcción.',
    defaultEnabled: false,
    allowedRoles: ['OWNER', 'MANAGER']
  },
  {
    id: 'supplies',
    name: 'Insumos',
    category: 'Operaciones',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12M12 3v11M9 12h6M5 21h14c1 0 2-1 2-2L16 8V3H8v5L3 19c0 1 2-1 2-2z"/></svg>`,
    path: '#/manager/supplies',
    description: 'Materia prima e insumos consumibles.',
    defaultEnabled: false,
    allowedRoles: ['OWNER', 'MANAGER']
  },

  // ─── AUTOMATIZACIÓN ───────────────────────────────────────────────────────
  {
    id: 'whatsappAutomation',
    name: 'WhatsApp Automation',
    category: 'Automatización',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`,
    path: '#/owner/whatsapp',
    description: 'Envío masivo de mensajes y avisos por WhatsApp API.',
    defaultEnabled: true,
    allowedRoles: ['OWNER', 'MANAGER']
  },
  {
    id: 'telegramAutomation',
    name: 'Telegram Automation',
    category: 'Automatización',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`,
    path: '#/owner/telegram',
    description: 'Bot oficial de avisos y comandos por Telegram.',
    defaultEnabled: true,
    allowedRoles: ['OWNER', 'MANAGER']
  }
];

/**
 * Returns a default modules configuration object with boolean states.
 * @param {Object} [overrides] 
 * @returns {Object} Map of moduleId -> boolean
 */
export function getDefaultModuleConfig(overrides = {}) {
  const config = {};
  MODULE_REGISTRY.forEach(m => {
    config[m.id] = overrides[m.id] !== undefined ? Boolean(overrides[m.id]) : m.defaultEnabled;
  });
  return config;
}

/**
 * Find a module definition by ID
 * @param {string} moduleId 
 * @returns {Object|null}
 */
export function getModuleById(moduleId) {
  return MODULE_REGISTRY.find(m => m.id === moduleId) || null;
}

/**
 * Find a module definition by route path
 * @param {string} path 
 * @returns {Object|null}
 */
export function getModuleByPath(path) {
  if (!path) return null;
  const cleanPath = path.startsWith('#') ? path : `#${path}`;
  return MODULE_REGISTRY.find(m => m.path === cleanPath || cleanPath.startsWith(m.path + '/')) || null;
}

/**
 * Checks if a specific module is enabled for a company object
 * @param {Object} company - Company object from GlobalStore
 * @param {string} moduleId 
 * @returns {boolean}
 */
export function isModuleEnabled(company, moduleId) {
  if (!company) return true; // Fallback if company not loaded yet
  
  // Extract modules map from company root, config, or informacion_local
  const modules = company.modules || company.config?.modules || company.informacion_local?.modules || {};

  // 1. If explicitly defined as boolean in company modules object, return that
  if (modules && typeof modules === 'object' && modules[moduleId] !== undefined) {
    return Boolean(modules[moduleId]);
  }

  // 2. Backwards compatibility legacy key mappings
  const legacyKeys = {
    inventory: 'showInventory',
    invoiceScanner: 'showInventory',
    assets: 'showAssets',
    vehicles: 'enableVehiclesCatalog',
    tools: 'showTools',
    supplies: 'showSupplies',
    scanHistory: 'showScanHistory',
    qrCodes: 'enableQR',
    serviceRequests: 'enableServiceRequests',
    rentals: 'enableRentals',
    appointments: 'enableAppointments',
    specialPrices: 'enableEmployeePricing',
    whatsappAutomation: 'enableWhatsApp',
    telegramAutomation: 'enableTelegram'
  };

  const legacyKey = legacyKeys[moduleId];
  if (legacyKey && company.config && company.config[legacyKey] !== undefined) {
    return Boolean(company.config[legacyKey]);
  }

  // 3. Fallback to defaultEnabled defined in MODULE_REGISTRY
  const moduleDef = getModuleById(moduleId);
  return moduleDef ? moduleDef.defaultEnabled : true;
}
