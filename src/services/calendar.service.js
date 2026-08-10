/**
 * @file calendar.service.js
 * @description Work Calendar Service for Ultra Administrador SaaS.
 * Handles employee absence requests, conflict detection against maxAbsentPerDay rules,
 * country-specific national holidays, approval workflows, and multi-channel notifications.
 */

import { FirestoreService } from './firestore.service.js';
import { GlobalStore } from '../core/state.js';
import { NotificationService } from './notification.service.js';
import { WhatsAppService } from './whatsapp.service.js';
import { TelegramService } from './telegram.service.js';

export const EVENT_TYPES = {
  DIA_LIBRE: { label: 'Día Libre', color: '#3b82f6', category: 'ABSENCE', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>` },
  VACACIONES: { label: 'Vacaciones', color: '#10b981', category: 'ABSENCE', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.7 5.2c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z"/></svg>` },
  PERMISO: { label: 'Permiso Personal', color: '#f97316', category: 'ABSENCE', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>` },
  INCAPACIDAD: { label: 'Incapacidad Médica', color: '#ef4444', category: 'ABSENCE', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>` },
  CAPACITACION: { label: 'Capacitación', color: '#8b5cf6', category: 'WORK', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>` },
  REUNION: { label: 'Reunión Interna', color: '#eab308', category: 'WORK', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>` },
  TURNO_ESPECIAL: { label: 'Turno Especial', color: '#06b6d4', category: 'WORK', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>` },
  HORAS_EXTRA: { label: 'Horas Extra', color: '#ec4899', category: 'WORK', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>` },
  EVENTO_INTERNO: { label: 'Evento Interno', color: '#6366f1', category: 'COMPANY', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>` },
  FERIADO_NACIONAL: { label: 'Feriado Nacional', color: '#6b7280', category: 'HOLIDAY', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"/></svg>` },
  FERIADO_PERSONALIZADO: { label: 'Feriado Personalizado', color: '#4b5563', category: 'HOLIDAY', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>` },
  OTRO: { label: 'Otro', color: '#64748b', category: 'GENERAL', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>` }
};

export const ABSENCE_TYPES = ['DIA_LIBRE', 'VACACIONES', 'PERMISO', 'INCAPACIDAD'];

export class CalendarService {

  // ─── CONFIGURATION & RULES ──────────────────────────────────────────────────

  /**
   * Fetches calendar configuration for a given company.
   * @param {string} companyId
   * @returns {Promise<Object>}
   */
  static async getConfig(companyId) {
    if (!companyId) return this.getDefaultConfig();
    try {
      const config = await FirestoreService.readPath(`${companyId}/config/calendarConfig`)
        || await FirestoreService.readPath(`calendarConfig/${companyId}`)
        || {};
      return {
        ...this.getDefaultConfig(),
        ...config
      };
    } catch (err) {
      console.warn('[CalendarService] Error loading config:', err);
      return this.getDefaultConfig();
    }
  }

  /**
   * Default calendar configuration.
   * @returns {Object}
   */
  static getDefaultConfig() {
    return {
      maxAbsentPerDay: 2, // 0 = sin límite
      requireApproval: true,
      customHolidays: [],
      eventColors: Object.fromEntries(Object.entries(EVENT_TYPES).map(([k, v]) => [k, v.color]))
    };
  }

  /**
   * Updates calendar configuration for a company.
   * @param {string} companyId
   * @param {Object} newConfig
   */
  static async updateConfig(companyId, newConfig) {
    if (!companyId) return;
    const current = await this.getConfig(companyId);
    const updated = { ...current, ...newConfig, updatedAt: new Date().toISOString() };
    await FirestoreService.writePath(`${companyId}/config/calendarConfig`, updated);
    return updated;
  }

  // ─── CONFLICT DETECTION ENGINE ─────────────────────────────────────────────

  /**
   * Checks if an absence request conflicts with maxAbsentPerDay limit.
   * @param {string} companyId
   * @param {Object} params - { startDate, endDate, excludeEventId, type }
   * @returns {Promise<{ hasConflict: boolean, conflictDetails: Array, maxAbsent: number }>}
   */
  static async checkAbsenceConflict(companyId, { startDate, endDate, excludeEventId = null, type = 'DIA_LIBRE' }) {
    if (!ABSENCE_TYPES.includes(type)) {
      return { hasConflict: false, conflictDetails: [], maxAbsent: 0 };
    }

    const config = await this.getConfig(companyId);
    const maxAbsent = Number(config.maxAbsentPerDay || 0);

    // If limit is 0 (unlimited), no conflict can occur
    if (maxAbsent <= 0) {
      return { hasConflict: false, conflictDetails: [], maxAbsent: 0 };
    }

    // Read all events for company
    const rawEvents = await FirestoreService.readPath(`${companyId}/calendar_events`) || {};
    const events = Object.entries(rawEvents).map(([id, val]) => ({ id, ...val }));

    // Filter active absence events (APROBADO or PENDIENTE)
    const absenceEvents = events.filter(e =>
      e.id !== excludeEventId &&
      ['APROBADO', 'PENDIENTE'].includes(e.status) &&
      ABSENCE_TYPES.includes(e.type)
    );

    // Build array of dates in request range
    const datesInRange = this._getDatesInRange(startDate, endDate);
    const conflictDetails = [];
    let hasConflict = false;

    for (const dateStr of datesInRange) {
      // Find all employees absent on dateStr
      const absentOnDate = absenceEvents.filter(e => dateStr >= e.startDate && dateStr <= e.endDate);
      const uniqueEmployees = [...new Set(absentOnDate.map(e => e.employeeName || e.employeeId || 'Empleado'))];

      if (uniqueEmployees.length >= maxAbsent) {
        hasConflict = true;
        conflictDetails.push({
          date: dateStr,
          count: uniqueEmployees.length,
          maxAllowed: maxAbsent,
          absentEmployees: uniqueEmployees
        });
      }
    }

    return { hasConflict, conflictDetails, maxAbsent };
  }

  /**
   * Returns array of 'YYYY-MM-DD' strings between start and end dates inclusive.
   * @private
   */
  static _getDatesInRange(startStr, endStr) {
    const dates = [];
    const curr = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00');
    while (curr <= end) {
      dates.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  }

  // ─── NATIONAL HOLIDAYS ENGINE ────────────────────────────────────────────────

  /**
   * Returns official national holidays for a given country and year.
   * @param {string} country
   * @param {number} year
   * @returns {Array<Object>} List of holiday events
   */
  static getNationalHolidays(country = 'Nicaragua', year = new Date().getFullYear()) {
    const c = (country || 'Nicaragua').trim().toLowerCase();

    const holidayDb = {
      nicaragua: [
        { date: `${year}-01-01`, title: 'Año Nuevo' },
        { date: `${year}-04-06`, title: 'Jueves Santo' },
        { date: `${year}-04-07`, title: 'Viernes Santo' },
        { date: `${year}-05-01`, title: 'Día del Trabajo' },
        { date: `${year}-07-19`, title: 'Día de la Revolución' },
        { date: `${year}-08-01`, title: 'Santo Domingo de Guzmán (Managua)' },
        { date: `${year}-08-10`, title: 'Santo Domingo de Guzmán (Bajada)' },
        { date: `${year}-09-14`, title: 'Batalla de San Jacinto' },
        { date: `${year}-09-15`, title: 'Día de la Independencia' },
        { date: `${year}-12-08`, title: 'Inmaculada Concepción (La Gritería)' },
        { date: `${year}-12-25`, title: 'Navidad' }
      ],
      mexico: [
        { date: `${year}-01-01`, title: 'Año Nuevo' },
        { date: `${year}-02-05`, title: 'Día de la Constitución' },
        { date: `${year}-03-21`, title: 'Natalicio de Benito Juárez' },
        { date: `${year}-05-01`, title: 'Día del Trabajo' },
        { date: `${year}-09-16`, title: 'Día de la Independencia' },
        { date: `${year}-11-20`, title: 'Revolución Mexicana' },
        { date: `${year}-12-25`, title: 'Navidad' }
      ],
      'costa rica': [
        { date: `${year}-01-01`, title: 'Año Nuevo' },
        { date: `${year}-04-11`, title: 'Día de Juan Santamaría' },
        { date: `${year}-05-01`, title: 'Día del Trabajo' },
        { date: `${year}-07-25`, title: 'Anexión de Nicoya' },
        { date: `${year}-08-02`, title: 'Día de la Virgen de los Ángeles' },
        { date: `${year}-08-15`, title: 'Día de la Madre' },
        { date: `${year}-09-15`, title: 'Día de la Independencia' },
        { date: `${year}-12-01`, title: 'Abolición del Ejército' },
        { date: `${year}-12-25`, title: 'Navidad' }
      ],
      guatemala: [
        { date: `${year}-01-01`, title: 'Año Nuevo' },
        { date: `${year}-05-01`, title: 'Día del Trabajo' },
        { date: `${year}-06-30`, title: 'Día del Ejército' },
        { date: `${year}-09-15`, title: 'Día de la Independencia' },
        { date: `${year}-10-20`, title: 'Día de la Revolución' },
        { date: `${year}-11-01`, title: 'Día de Todos los Santos' },
        { date: `${year}-12-25`, title: 'Navidad' }
      ],
      colombia: [
        { date: `${year}-01-01`, title: 'Año Nuevo' },
        { date: `${year}-01-06`, title: 'Día de los Reyes Magos' },
        { date: `${year}-03-19`, title: 'Día de San José' },
        { date: `${year}-05-01`, title: 'Día del Trabajo' },
        { date: `${year}-07-20`, title: 'Día de la Independencia' },
        { date: `${year}-08-07`, title: 'Batalla de Boyacá' },
        { date: `${year}-12-08`, title: 'Día de la Inmaculada Concepción' },
        { date: `${year}-12-25`, title: 'Navidad' }
      ],
      españa: [
        { date: `${year}-01-01`, title: 'Año Nuevo' },
        { date: `${year}-01-06`, title: 'Epifanía del Señor' },
        { date: `${year}-05-01`, title: 'Fiesta del Trabajo' },
        { date: `${year}-08-15`, title: 'Asunción de la Virgen' },
        { date: `${year}-10-12`, title: 'Fiesta Nacional de España' },
        { date: `${year}-11-01`, title: 'Día de Todos los Santos' },
        { date: `${year}-12-06`, title: 'Día de la Constitución Española' },
        { date: `${year}-12-08`, title: 'Inmaculada Concepción' },
        { date: `${year}-12-25`, title: 'Natividad del Señor' }
      ]
    };

    const list = holidayDb[c] || holidayDb['nicaragua'];
    return list.map(h => ({
      id: `nat-holiday-${h.date}`,
      type: 'FERIADO_NACIONAL',
      title: h.title,
      startDate: h.date,
      endDate: h.date,
      status: 'APROBADO',
      isSystemHoliday: true
    }));
  }

  // ─── CRUD OPERATIONS ───────────────────────────────────────────────────────

  /**
   * Fetches all events for a company, merging national holidays and custom holidays.
   * @param {string} companyId
   * @param {Object} [filters] - { branchId, employeeId, type, status, year }
   * @returns {Promise<Array<Object>>}
   */
  static async getEvents(companyId, filters = {}) {
    if (!companyId) return [];

    const raw = await FirestoreService.readPath(`${companyId}/calendar_events`) || {};
    let events = Object.entries(raw).map(([id, val]) => ({ id, ...val }));

    // Load company country for auto holidays
    const { currentCompany } = GlobalStore.getState();
    const country = currentCompany?.country || 'Nicaragua';
    const year = filters.year || new Date().getFullYear();

    const nationalHolidays = this.getNationalHolidays(country, year);

    // Load custom holidays from config
    const config = await this.getConfig(companyId);
    const customHolidays = (config.customHolidays || []).map(ch => ({
      id: ch.id || `custom-holiday-${ch.date}`,
      type: 'FERIADO_PERSONALIZADO',
      title: `🎈 ${ch.title || ch.name || 'Feriado Personalizado'}`,
      startDate: ch.date,
      endDate: ch.date,
      branchId: ch.branchId || 'all',
      status: 'APROBADO',
      isCustomHoliday: true
    }));

    // Combine all
    events = [...events, ...nationalHolidays, ...customHolidays];

    // Apply filters
    if (filters.branchId && filters.branchId !== 'all') {
      events = events.filter(e => !e.branchId || e.branchId === 'all' || e.branchId === filters.branchId);
    }
    if (filters.employeeId) {
      events = events.filter(e => e.isSystemHoliday || e.isCustomHoliday || e.employeeId === filters.employeeId);
    }
    if (filters.type) {
      events = events.filter(e => e.type === filters.type);
    }
    if (filters.status) {
      events = events.filter(e => e.status === filters.status);
    }

    return events;
  }

  /**
   * Creates a new event or absence request.
   * @param {string} companyId
   * @param {Object} eventData
   * @param {Object} currentUser
   * @returns {Promise<Object>} Created event with ID
   */
  static async createEvent(companyId, eventData, currentUser) {
    if (!companyId) throw new Error('Empresa requerida');

    const config = await this.getConfig(companyId);
    const isOwnerOrManager = ['OWNER', 'SUPER_ADMIN', 'MANAGER'].includes(currentUser?.role);

    // Evaluate conflict
    const conflictRes = await this.checkAbsenceConflict(companyId, {
      startDate: eventData.startDate,
      endDate: eventData.endDate,
      type: eventData.type
    });

    // Auto-approve if created by owner/manager AND no conflict, or if non-absence type
    let initialStatus = 'PENDIENTE';
    if (!ABSENCE_TYPES.includes(eventData.type)) {
      initialStatus = 'APROBADO';
    } else if (isOwnerOrManager && !conflictRes.hasConflict && !config.requireApproval) {
      initialStatus = 'APROBADO';
    }

    const newEvent = {
      companyId,
      branchId: eventData.branchId || 'all',
      employeeId: eventData.employeeId || currentUser?.uid || '',
      employeeName: eventData.employeeName || currentUser?.displayName || 'Empleado',
      employeeRole: eventData.employeeRole || currentUser?.role || 'STAFF',
      type: eventData.type || 'DIA_LIBRE',
      title: eventData.title || EVENT_TYPES[eventData.type]?.label || 'Evento',
      startDate: eventData.startDate,
      endDate: eventData.endDate || eventData.startDate,
      startTime: eventData.startTime || '',
      endTime: eventData.endTime || '',
      status: initialStatus,
      comments: eventData.comments || '',
      hasConflict: conflictRes.hasConflict,
      conflictDetails: conflictRes.conflictDetails,
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.uid || '',
      createdByName: currentUser?.displayName || 'Sistema',
      history: [
        {
          timestamp: new Date().toISOString(),
          userId: currentUser?.uid || '',
          userName: currentUser?.displayName || 'Usuario',
          action: 'CREADO',
          note: conflictRes.hasConflict ? 'Solicitud creada con alerta de conflicto de sobrecupo.' : 'Solicitud creada correctamente.'
        }
      ]
    };

    const eventId = await FirestoreService.writePath(`${companyId}/calendar_events`, newEvent);
    newEvent.id = eventId;

    // Trigger In-App, WhatsApp & Telegram Notifications
    this._dispatchNotifications(companyId, newEvent, 'CREATED');

    return newEvent;
  }

  /**
   * Updates event status (Aprobar, Rechazar, Cancelar).
   * @param {string} companyId
   * @param {string} eventId
   * @param {'APROBADO'|'RECHAZADO'|'CANCELADO'} newStatus
   * @param {Object} reviewerUser
   * @param {string} [reason]
   */
  static async updateEventStatus(companyId, eventId, newStatus, reviewerUser, reason = '') {
    if (!companyId || !eventId) return;

    const raw = await FirestoreService.readPath(`${companyId}/calendar_events/${eventId}`);
    if (!raw) throw new Error('Evento no encontrado');

    const history = raw.history || [];
    history.push({
      timestamp: new Date().toISOString(),
      userId: reviewerUser?.uid || '',
      userName: reviewerUser?.displayName || 'Administrador',
      action: newStatus,
      note: reason ? `Motivo: ${reason}` : `Estado actualizado a ${newStatus}`
    });

    const updates = {
      status: newStatus,
      reviewedBy: reviewerUser?.uid || '',
      reviewedByName: reviewerUser?.displayName || 'Administrador',
      reviewedAt: new Date().toISOString(),
      rejectionReason: reason || null,
      history
    };

    await FirestoreService.updatePath(`${companyId}/calendar_events/${eventId}`, updates);

    const updatedEvent = { ...raw, id: eventId, ...updates };

    // Dispatch Notification to Employee
    this._dispatchNotifications(companyId, updatedEvent, newStatus);

    return updatedEvent;
  }

  /**
   * Deletes an event.
   * @param {string} companyId
   * @param {string} eventId
   */
  static async deleteEvent(companyId, eventId) {
    if (!companyId || !eventId) return;
    await FirestoreService.removePath(`${companyId}/calendar_events/${eventId}`);
  }

  // ─── NOTIFICATION DISPATCHER ─────────────────────────────────────────────────

  /**
   * Dispatches notifications to in-app store, WhatsApp, and Telegram.
   * @private
   */
  static async _dispatchNotifications(companyId, event, actionType) {
    try {
      const typeLabel = EVENT_TYPES[event.type]?.label || event.type;
      let msg = '';

      if (actionType === 'CREATED') {
        if (event.hasConflict) {
          msg = `⚠️ ALERTA DE CONFLICTO: ${event.employeeName} ha solicitado ${typeLabel} (${event.startDate}). Se ha alcanzado el límite máximo de personal ausente.`;
        } else {
          msg = `🗓️ NUEVA SOLICITUD: ${event.employeeName} solicitó ${typeLabel} del ${event.startDate} al ${event.endDate}.`;
        }
        NotificationService.info(msg);
      } else if (actionType === 'APROBADO') {
        msg = `✅ SOLICITUD APROBADA: Su solicitud de ${typeLabel} (${event.startDate}) ha sido APROBADA.`;
        NotificationService.success(msg);
      } else if (actionType === 'RECHAZADO') {
        msg = `❌ SOLICITUD RECHAZADA: Su solicitud de ${typeLabel} (${event.startDate}) fue rechazada.`;
        NotificationService.error(msg);
      }

      // Check WhatsApp Automation Hub
      const { currentCompany } = GlobalStore.getState();
      if (currentCompany?.config?.enableWhatsApp !== false) {
        WhatsAppService.sendMessage(companyId, {
          recipient: 'OWNER',
          message: msg
        }).catch(() => {});
      }

      // Check Telegram Automation Hub
      if (currentCompany?.config?.enableTelegram !== false) {
        TelegramService.sendAlert(companyId, msg).catch(() => {});
      }

    } catch (e) {
      console.warn('[CalendarService] Notification dispatch non-fatal error:', e);
    }
  }
}
