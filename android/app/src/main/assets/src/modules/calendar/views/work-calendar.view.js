/**
 * @file work-calendar.view.js
 * @description Work Calendar View for Ultra Administrador SaaS.
 * Provides a responsive calendar dashboard with Month, Week, Day, Agenda, and Timeline views,
 * conflict warnings, holiday markers, and approval workflows.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { NotificationService } from '../../../services/notification.service.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { CalendarService, EVENT_TYPES, ABSENCE_TYPES } from '../../../services/calendar.service.js';
import { isModuleEnabled } from '../../../config/modules.config.js';
import { I18nService } from '../../../services/i18n.service.js';

export class WorkCalendarView extends Component {
  constructor(params = {}) {
    super(params);

    const { currentUser, currentCompany } = GlobalStore.getState();
    this.companyId = currentCompany?.id || currentUser?.companyId || '';
    this.currentUser = currentUser || {};
    this.currentCompany = currentCompany || {};

    const today = new Date();
    this.state = {
      currentView: 'MONTH', // 'MONTH' | 'WEEK' | 'DAY' | 'AGENDA' | 'TIMELINE'
      currentYear: today.getFullYear(),
      currentMonth: today.getMonth(), // 0-indexed
      currentDay: today.getDate(),
      events: [],
      config: CalendarService.getDefaultConfig(),
      employees: [],
      branches: [],
      filters: {
        employeeId: '',
        branchId: 'all',
        type: '',
        status: ''
      },
      loading: true
    };

    this.layout = new PageLayout({
      title: `📅 ${I18nService.t('shared_work_calendar') || 'Calendario Laboral Compartido'}`,
      subtitle: I18nService.t('cal_subtitle') || 'Gestión inteligente de días libres, vacaciones, licencias y disponibilidad de personal.',
      contentHTML: this.buildContentHTML()
    });
  }

  buildContentHTML() {
    const isOwnerOrManager = ['OWNER', 'SUPER_ADMIN', 'MANAGER'].includes(this.currentUser?.role);

    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    const currentPeriodLabel = `${monthNames[this.state.currentMonth]} ${this.state.currentYear}`;

    return `
      <style>
        .cal-header-bar { display:flex; flex-direction:column; gap:12px; background:var(--color-bg-secondary); padding:16px; border-radius:var(--radius-lg); border:1px solid var(--color-border); }
        .cal-header-top { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
        .cal-nav-group { display:flex; align-items:center; gap:12px; }
        .cal-period-title { font-size:1.1rem; font-weight:800; color:var(--color-text-primary); margin:0; letter-spacing:-0.01em; }
        
        .cal-view-tabs { display:flex; background:var(--color-bg-tertiary); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:3px; overflow-x:auto; -webkit-overflow-scrolling:touch; scrollbar-width:none; gap:2px; }
        .cal-view-tabs::-webkit-scrollbar { display:none; }
        .cal-view-btn { padding:6px 12px; font-size:0.78rem; font-weight:600; border:none; background:transparent; color:var(--color-text-secondary); cursor:pointer; border-radius:var(--radius-sm); transition:all 0.2s; white-space:nowrap; min-height:34px; display:inline-flex; align-items:center; gap:6px; }
        .cal-view-btn.active { background:var(--color-accent); color:#fff; }

        .cal-filter-bar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; background:var(--color-bg-tertiary); padding:12px 14px; border-radius:var(--radius-md); border:1px solid var(--color-border); }
        .cal-filter-bar select { min-height:36px; background:var(--color-bg-secondary); border-color:var(--color-border); color:var(--color-text-primary); font-size:0.8rem; }

        .cal-month-grid { display:grid; grid-template-columns: repeat(7, 1fr); width:100%; gap:1px; background:var(--color-border); border-radius:var(--radius-lg); overflow:hidden; border:1px solid var(--color-border); box-sizing:border-box; }
        .cal-day-cell { background:var(--color-bg-secondary); min-height:105px; padding:6px; display:flex; flex-direction:column; gap:4px; cursor:pointer; transition:background 0.15s; overflow:hidden; }
        .cal-day-cell:hover { background:var(--color-bg-tertiary); }
        .cal-day-cell.today { background:rgba(99, 102, 241, 0.08); border:1px solid var(--color-accent); }
        .cal-day-number { font-size:0.78rem; font-weight:700; color:var(--color-text-secondary); }
        .cal-event-badge { font-size:0.70rem; padding:3px 6px; border-radius:4px; color:#fff; font-weight:600; cursor:pointer; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; display:flex; align-items:center; gap:4px; box-shadow:0 1px 3px rgba(0,0,0,0.2); }

        @media (max-width: 640px) {
          .cal-header-top { flex-direction:column; align-items:stretch; gap:10px; }
          .cal-nav-group { justify-content:space-between; width:100%; }
          .cal-filter-bar { flex-direction:column; align-items:stretch; }
          .cal-filter-bar select { width:100% !important; max-width:100% !important; }
          .cal-day-cell { min-height:56px; padding:3px 2px; gap:2px; }
          .cal-day-number { font-size:0.70rem; }
          .cal-event-badge { font-size:0.60rem; padding:1px 3px; gap:2px; border-radius:3px; }
          .cal-event-badge svg { width:10px; height:10px; flex-shrink:0; }
        }
      </style>

      <div class="calendar-module" style="display:flex; flex-direction:column; gap:var(--space-4);">

        <!-- HEADER & TOOLBAR -->
        <div class="cal-header-bar">
          
          <!-- Top Row: Date Navigation & Action Buttons -->
          <div class="cal-header-top">
            <div class="cal-nav-group">
              <div style="display:flex; border:1px solid var(--color-border); border-radius:var(--radius-md); overflow:hidden;">
                <button class="btn btn-secondary btn-sm" id="cal-nav-prev" style="border:none; border-right:1px solid var(--color-border); border-radius:0; min-height:36px; min-width:36px; padding:0 10px;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <button class="btn btn-secondary btn-sm" id="cal-nav-today" style="border:none; border-right:1px solid var(--color-border); border-radius:0; min-height:36px; font-weight:600; padding:0 12px;">Hoy</button>
                <button class="btn btn-secondary btn-sm" id="cal-nav-next" style="border:none; border-radius:0; min-height:36px; min-width:36px; padding:0 10px;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
              <h3 id="cal-period-label" class="cal-period-title">${currentPeriodLabel}</h3>
            </div>

            <!-- Action Buttons -->
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              ${isOwnerOrManager && isModuleEnabled(this.currentCompany, 'hrRecruitment') ? `
                <a href="#/hr/recruitment" class="btn btn-secondary btn-sm" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;font-weight:600;min-height:36px;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  RH
                </a>
              ` : ''}
              ${isOwnerOrManager ? `
                <button class="btn btn-secondary btn-sm" id="btn-cal-settings" title="Configurar límite de ausencias y festivos" style="display:inline-flex;align-items:center;gap:6px;min-height:36px;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                  Reglas
                </button>
              ` : ''}
              <button class="btn btn-primary btn-sm" id="btn-cal-new-event" style="display:inline-flex;align-items:center;gap:6px;min-height:36px;font-weight:600;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                + Solicitar Día / Evento
              </button>
            </div>
          </div>

          <!-- Bottom Row: Scrollable View Switcher Tabs -->
          <div class="cal-view-tabs">
            <button class="cal-view-btn ${this.state.currentView === 'MONTH' ? 'active' : ''}" data-view="MONTH">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Mes
            </button>
            <button class="cal-view-btn ${this.state.currentView === 'WEEK' ? 'active' : ''}" data-view="WEEK">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8" y2="18"/></svg>
              Semana
            </button>
            <button class="cal-view-btn ${this.state.currentView === 'DAY' ? 'active' : ''}" data-view="DAY">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="15" r="2"/></svg>
              Día
            </button>
            <button class="cal-view-btn ${this.state.currentView === 'AGENDA' ? 'active' : ''}" data-view="AGENDA">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Agenda
            </button>
            <button class="cal-view-btn ${this.state.currentView === 'TIMELINE' ? 'active' : ''}" data-view="TIMELINE">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              Timeline
            </button>
          </div>
        </div>

        <!-- FILTERS BAR -->
        <div class="cal-filter-bar">
          <div style="font-size:0.8rem; font-weight:700; color:var(--color-text-secondary); display:flex; align-items:center; gap:6px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            Filtrar:
          </div>
          <select id="flt-employee" class="input input-sm" style="flex:1; max-width:200px;">
            <option value="">Todos los empleados</option>
          </select>
          <select id="flt-type" class="input input-sm" style="flex:1; max-width:200px;">
            <option value="">Todos los tipos</option>
            ${Object.entries(EVENT_TYPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
          </select>
          <select id="flt-status" class="input input-sm" style="flex:1; max-width:160px;">
            <option value="">Status (Todos)</option>
            <option value="APROBADO">Aprobados</option>
            <option value="PENDIENTE">Pendientes</option>
            <option value="RECHAZADO">Rechazados</option>
          </select>
          <div id="cal-limit-badge" style="margin-left:auto; font-size:0.75rem; background:rgba(99, 102, 241, 0.15); border:1px solid var(--color-accent); color:var(--color-accent); padding:4px 10px; border-radius:20px; font-weight:600; display:none;">
          </div>
        </div>

        <!-- MAIN CALENDAR CONTAINER -->
        <div id="calendar-body-container" style="width:100%; border-radius:var(--radius-lg);">
          <div style="text-align:center; padding:40px; color:var(--color-text-secondary);">Cargando calendario laboral...</div>
        </div>

      </div>
    `;
  }

  mount() {
    this.element = this.layout.mount();
    this.afterMount();
    return this.element;
  }

  afterMount() {
    this.bindEvents();
    this.loadData();
  }

  unmount() {
    if (this.layout && typeof this.layout.unmount === 'function') {
      this.layout.unmount();
    }
    super.unmount();
  }

  async loadData() {
    const { currentCompany, currentUser } = GlobalStore.getState();
    const companyId = currentCompany?.id || currentUser?.companyId || this.companyId;

    if (!companyId) {
      console.warn('[WorkCalendarView] No companyId available');
      return;
    }

    try {
      const [events, config, employees, branchesRaw] = await Promise.all([
        CalendarService.getEvents(companyId, { year: this.state.currentYear }),
        CalendarService.getConfig(companyId),
        FirestoreService.getCompanyEmployees(companyId).catch(() => []),
        FirestoreService.readPath(`${companyId}/branches`).catch(() => ({}))
      ]);

      const branches = Object.entries(branchesRaw || {}).map(([id, val]) => ({ id, ...val }));

      this.state.events = events || [];
      this.state.config = config || CalendarService.getDefaultConfig();
      this.state.employees = employees || [];
      this.state.branches = branches || [];
      this.state.loading = false;

      this.populateEmployeeFilter();
      this.updateCalendarBodyUI();
    } catch (err) {
      console.error('[WorkCalendarView] Error loading calendar data:', err);
      NotificationService.error('Error al cargar datos del calendario laboral.');
      const body = this.element?.querySelector('#calendar-body-container');
      if (body) {
        body.innerHTML = `<div style="text-align:center; padding:40px; color:var(--color-danger);">Error al conectar con la base de datos. Por favor recarga la página.</div>`;
      }
    }
  }

  populateEmployeeFilter() {
    const fltEmp = this.element?.querySelector('#flt-employee');
    if (!fltEmp) return;
    fltEmp.innerHTML = `
      <option value="">Todos los empleados</option>
      ${this.state.employees.map(e => `<option value="${e.uid || e.id}" ${this.state.filters.employeeId === (e.uid || e.id) ? 'selected' : ''}>${e.displayName || e.email}</option>`).join('')}
    `;

    const limitBadge = this.element?.querySelector('#cal-limit-badge');
    if (limitBadge) {
      if (this.state.config.maxAbsentPerDay > 0) {
        limitBadge.textContent = `Límite Ausentes: Max ${this.state.config.maxAbsentPerDay}/día`;
        limitBadge.style.display = 'inline-block';
      } else {
        limitBadge.style.display = 'none';
      }
    }
  }

  updateCalendarBodyUI() {
    const root = this.element;
    if (!root) return;

    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    const labelEl = root.querySelector('#cal-period-label');
    if (labelEl) {
      labelEl.textContent = this.state.currentView === 'DAY'
        ? `${this.state.currentDay} de ${monthNames[this.state.currentMonth]} ${this.state.currentYear}`
        : `${monthNames[this.state.currentMonth]} ${this.state.currentYear}`;
    }

    const container = root.querySelector('#calendar-body-container');
    if (container) {
      container.innerHTML = this.renderCalendarBody();
    }

    // Re-bind interactive cell and badge clicks inside calendar body
    root.querySelectorAll('.cal-event-badge').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.dataset.eventId;
        const ev = this.getFilteredEvents().find(x => x.id === id);
        if (ev) this.openEventDetailModal(ev);
      });
    });

    root.querySelectorAll('.cal-day-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const dateStr = cell.dataset.date;
        if (dateStr) this.openNewEventModal(dateStr);
      });
    });
  }

  bindEvents() {
    const root = this.element;
    if (!root) return;

    // View switcher buttons
    root.querySelectorAll('.cal-view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.currentTarget.dataset.view;
        this.state.currentView = view;
        root.querySelectorAll('.cal-view-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.updateCalendarBodyUI();
      });
    });

    // Navigation
    const prev = root.querySelector('#cal-nav-prev');
    const next = root.querySelector('#cal-nav-next');
    const today = root.querySelector('#cal-nav-today');

    if (prev) prev.addEventListener('click', () => this.navigatePeriod(-1));
    if (next) next.addEventListener('click', () => this.navigatePeriod(1));
    if (today) today.addEventListener('click', () => {
      const now = new Date();
      this.state.currentYear = now.getFullYear();
      this.state.currentMonth = now.getMonth();
      this.state.currentDay = now.getDate();
      this.updateCalendarBodyUI();
    });

    // Filters
    const fltEmp = root.querySelector('#flt-employee');
    const fltType = root.querySelector('#flt-type');
    const fltStatus = root.querySelector('#flt-status');

    if (fltEmp) fltEmp.addEventListener('change', (e) => {
      this.state.filters.employeeId = e.target.value;
      this.updateCalendarBodyUI();
    });
    if (fltType) fltType.addEventListener('change', (e) => {
      this.state.filters.type = e.target.value;
      this.updateCalendarBodyUI();
    });
    if (fltStatus) fltStatus.addEventListener('change', (e) => {
      this.state.filters.status = e.target.value;
      this.updateCalendarBodyUI();
    });

    // New Event / Settings
    const newBtn = root.querySelector('#btn-cal-new-event');
    const setBtn = root.querySelector('#btn-cal-settings');

    if (newBtn) newBtn.addEventListener('click', () => this.openNewEventModal());
    if (setBtn) setBtn.addEventListener('click', () => this.openSettingsModal());
  }

  navigatePeriod(delta) {
    if (this.state.currentView === 'MONTH' || this.state.currentView === 'TIMELINE' || this.state.currentView === 'AGENDA') {
      let m = this.state.currentMonth + delta;
      let y = this.state.currentYear;
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      this.state.currentMonth = m;
      this.state.currentYear = y;
    } else {
      let d = new Date(this.state.currentYear, this.state.currentMonth, this.state.currentDay + (delta * (this.state.currentView === 'WEEK' ? 7 : 1)));
      this.state.currentYear = d.getFullYear();
      this.state.currentMonth = d.getMonth();
      this.state.currentDay = d.getDate();
    }
    this.updateCalendarBodyUI();
  }

  getFilteredEvents() {
    let list = this.state.events;
    const { employeeId, type, status } = this.state.filters;
    if (employeeId) list = list.filter(e => e.isSystemHoliday || e.isCustomHoliday || e.employeeId === employeeId);
    if (type) list = list.filter(e => e.type === type);
    if (status) list = list.filter(e => e.status === status);
    return list;
  }

  // ─── RENDER CALENDAR BODIES ──────────────────────────────────────────────────

  renderCalendarBody() {
    switch (this.state.currentView) {
      case 'WEEK': return this.renderWeekView();
      case 'DAY': return this.renderDayView();
      case 'AGENDA': return this.renderAgendaView();
      case 'TIMELINE': return this.renderTimelineView();
      case 'MONTH':
      default: return this.renderMonthView();
    }
  }

  renderMonthView() {
    const year = this.state.currentYear;
    const month = this.state.currentMonth;

    const firstDay = new Date(year, month, 1).getDay(); // 0 = Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const events = this.getFilteredEvents();
    const dayHeaders = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

    let html = `
      <div class="cal-month-grid">
        ${dayHeaders.map(d => `<div style="background:var(--color-bg-tertiary); padding:8px 4px; text-align:center; font-size:0.72rem; font-weight:700; color:var(--color-text-secondary); text-transform:uppercase;">${d}</div>`).join('')}
    `;

    // Padding cells before day 1
    for (let i = 0; i < firstDay; i++) {
      html += `<div class="cal-day-cell" style="opacity:0.3; background:var(--color-bg-primary); pointer-events:none;"></div>`;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;

      const dayEvents = events.filter(e => dateStr >= e.startDate && dateStr <= (e.endDate || e.startDate));

      html += `
        <div class="cal-day-cell ${isToday ? 'today' : ''}" data-date="${dateStr}">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="cal-day-number">${day}</span>
            ${dayEvents.length > 0 ? `<span style="font-size:0.65rem; color:var(--color-text-secondary); font-weight:700; background:rgba(255,255,255,0.06); padding:1px 5px; border-radius:10px;">${dayEvents.length}</span>` : ''}
          </div>
          <div style="display:flex; flex-direction:column; gap:2px; flex:1; overflow-y:auto;">
            ${dayEvents.slice(0, 3).map(e => {
              const typeDef = EVENT_TYPES[e.type] || EVENT_TYPES.OTRO;
              const color = typeDef.color;
              const title = e.title || typeDef.label;
              const isPending = e.status === 'PENDIENTE';
              return `
                <div class="cal-event-badge" data-event-id="${e.id}" style="background:${color}; ${isPending ? 'border:1px dashed #fff; opacity:0.85;' : ''}" title="${title} - ${e.employeeName || ''}">
                  <span style="display:inline-flex; align-items:center;">${typeDef.icon}</span>
                  <span style="flex:1; overflow:hidden; text-overflow:ellipsis;">${e.employeeName ? `${e.employeeName.split(' ')[0]}: ` : ''}${title}</span>
                </div>
              `;
            }).join('')}
            ${dayEvents.length > 3 ? `<div style="font-size:0.65rem; color:var(--color-accent); font-weight:700;">+${dayEvents.length - 3} más</div>` : ''}
          </div>
        </div>
      `;
    }

    html += `</div>`;
    return html;
  }

  renderWeekView() {
    const events = this.getFilteredEvents();
    return `
      <div style="background:var(--color-bg-secondary); padding:var(--space-4); border-radius:var(--radius-lg); border:1px solid var(--color-border);">
        <h4 style="font-size:0.9rem; font-weight:700; color:var(--color-text-primary); margin-bottom:var(--space-3);">Vista Semanal de Ausencias y Eventos</h4>
        <div style="display:flex; flex-direction:column; gap:var(--space-2);">
          ${events.length === 0 ? '<p style="color:var(--color-text-secondary); font-size:0.85rem;">No hay eventos registrados para este periodo.</p>' : ''}
          ${events.map(e => this.renderEventCard(e)).join('')}
        </div>
      </div>
    `;
  }

  renderDayView() {
    const events = this.getFilteredEvents();
    return `
      <div style="background:var(--color-bg-secondary); padding:var(--space-4); border-radius:var(--radius-lg); border:1px solid var(--color-border);">
        <h4 style="font-size:0.9rem; font-weight:700; color:var(--color-text-primary); margin-bottom:var(--space-3);">Personal Ausente / Eventos del Día</h4>
        <div style="display:flex; flex-direction:column; gap:var(--space-2);">
          ${events.length === 0 ? '<p style="color:var(--color-text-secondary); font-size:0.85rem;">No hay ausencias ni eventos programados para este día.</p>' : ''}
          ${events.map(e => this.renderEventCard(e)).join('')}
        </div>
      </div>
    `;
  }

  renderAgendaView() {
    const events = this.getFilteredEvents().sort((a,b) => (a.startDate || '').localeCompare(b.startDate || ''));
    return `
      <div style="background:var(--color-bg-secondary); padding:var(--space-4); border-radius:var(--radius-lg); border:1px solid var(--color-border);">
        <h4 style="font-size:0.9rem; font-weight:700; color:var(--color-text-primary); margin-bottom:var(--space-3);">Próximos Eventos y Ausencias</h4>
        <div style="display:flex; flex-direction:column; gap:var(--space-3);">
          ${events.length === 0 ? '<p style="color:var(--color-text-secondary); font-size:0.85rem;">No hay eventos ni solicitudes registradas.</p>' : ''}
          ${events.map(e => this.renderEventCard(e)).join('')}
        </div>
      </div>
    `;
  }

  renderTimelineView() {
    const events = this.getFilteredEvents();

    return `
      <div style="background:var(--color-bg-secondary); padding:var(--space-4); border-radius:var(--radius-lg); border:1px solid var(--color-border); overflow-x:auto;">
        <h4 style="font-size:0.9rem; font-weight:700; color:var(--color-text-primary); margin-bottom:var(--space-3);">Matriz de Disponibilidad (Timeline por Empleado)</h4>
        <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
          <thead>
            <tr style="background:var(--color-bg-tertiary); border-bottom:1px solid var(--color-border);">
              <th style="padding:8px; text-align:left;">Empleado</th>
              <th style="padding:8px; text-align:left;">Tipo Ausencia / Evento</th>
              <th style="padding:8px; text-align:left;">Fechas</th>
              <th style="padding:8px; text-align:center;">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${events.length === 0 ? `<tr><td colspan="4" style="padding:16px; text-align:center; color:var(--color-text-secondary);">No hay registros.</td></tr>` : ''}
            ${events.map(e => `
              <tr style="border-bottom:1px solid var(--color-border);">
                <td style="padding:8px; font-weight:600; color:var(--color-text-primary);">${e.employeeName || 'General / Festivo'}</td>
                <td style="padding:8px;"><span style="color:${EVENT_TYPES[e.type]?.color || '#fff'}; display:inline-flex; align-items:center; gap:6px;">${EVENT_TYPES[e.type]?.icon || ''} ${e.title}</span></td>
                <td style="padding:8px; color:var(--color-text-secondary);">${e.startDate} ${e.endDate && e.endDate !== e.startDate ? `a ${e.endDate}` : ''}</td>
                <td style="padding:8px; text-align:center;">
                  <span class="badge" style="font-size:0.7rem; padding:2px 8px; border-radius:10px; background:${e.status === 'APROBADO' ? 'rgba(16,185,129,0.15)' : e.status === 'PENDIENTE' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'}; color:${e.status === 'APROBADO' ? '#10b981' : e.status === 'PENDIENTE' ? '#f59e0b' : '#ef4444'};">
                    ${e.status}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderEventCard(e) {
    const typeDef = EVENT_TYPES[e.type] || EVENT_TYPES.OTRO;
    return `
      <div class="cal-event-badge" data-event-id="${e.id}" style="display:flex; align-items:center; justify-content:space-between; padding:10px var(--space-3); background:var(--color-bg-tertiary); border:1px solid var(--color-border); border-left:4px solid ${typeDef.color}; border-radius:var(--radius-md); cursor:pointer;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="display:inline-flex; align-items:center;">${typeDef.icon}</span>
          <div>
            <div style="font-weight:700; font-size:0.85rem; color:var(--color-text-primary);">${e.title}</div>
            <div style="font-size:0.75rem; color:var(--color-text-secondary);">Empleado: ${e.employeeName || 'General'} | Fechas: ${e.startDate} ${e.endDate && e.endDate !== e.startDate ? `al ${e.endDate}` : ''}</div>
          </div>
        </div>
        <span class="badge" style="font-size:0.72rem; padding:3px 10px; border-radius:12px; background:${e.status === 'APROBADO' ? 'rgba(16,185,129,0.2)' : e.status === 'PENDIENTE' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'}; color:${e.status === 'APROBADO' ? '#10b981' : e.status === 'PENDIENTE' ? '#f59e0b' : '#ef4444'};">
          ${e.status}
        </span>
      </div>
    `;
  }

  // ─── MODALS ─────────────────────────────────────────────────────────────────

  async openNewEventModal(preselectedDate = '') {
    const { currentUser, currentCompany } = GlobalStore.getState();
    const isOwnerOrManager = ['OWNER', 'SUPER_ADMIN', 'MANAGER'].includes(currentUser?.role);

    const todayStr = preselectedDate || new Date().toISOString().split('T')[0];

    const typeOptionsHTML = Object.entries(EVENT_TYPES).map(([k, v]) => `
      <option value="${k}">${v.label}</option>
    `).join('');

    const empOptionsHTML = this.state.employees.map(e => `
      <option value="${e.uid || e.id}" data-name="${e.displayName || e.email}" ${e.uid === currentUser?.uid || e.id === currentUser?.uid ? 'selected' : ''}>${e.displayName || e.email}</option>
    `).join('');

    const formHTML = `
      <form id="form-cal-event" style="display:flex; flex-direction:column; gap:var(--space-3);">
        <div id="conflict-warning-box" style="display:none; background:rgba(239,68,68,0.12); border:1px solid var(--color-danger); border-radius:var(--radius-md); padding:var(--space-3); color:var(--color-danger); font-size:0.8rem;">
          <strong>Alerta de Límite de Ausencias:</strong> En las fechas seleccionadas ya se alcanza el límite máximo de personal libre. La solicitud quedará como PENDIENTE para aprobación del dueño.
        </div>

        <div class="form-group">
          <label class="form-label">Tipo de Ausencia / Evento</label>
          <select id="evt-type" class="input input-md" style="background:var(--color-bg-secondary); border-color:var(--color-border); color:var(--color-text-primary);" required>
            ${typeOptionsHTML}
          </select>
        </div>

        ${isOwnerOrManager ? `
          <div class="form-group">
            <label class="form-label">Empleado</label>
            <select id="evt-employee" class="input input-md" style="background:var(--color-bg-secondary); border-color:var(--color-border); color:var(--color-text-primary);">
              ${empOptionsHTML}
            </select>
          </div>
        ` : ''}

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">
          <div class="form-group">
            <label class="form-label">Fecha Inicio</label>
            <input type="date" id="evt-start-date" class="input input-md" value="${todayStr}" required style="background:var(--color-bg-secondary); border-color:var(--color-border); color:var(--color-text-primary);" />
          </div>
          <div class="form-group">
            <label class="form-label">Fecha Fin</label>
            <input type="date" id="evt-end-date" class="input input-md" value="${todayStr}" required style="background:var(--color-bg-secondary); border-color:var(--color-border); color:var(--color-text-primary);" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Título / Asunto</label>
          <input type="text" id="evt-title" class="input input-md" placeholder="Ej. Vacaciones de verano / Permiso personal" style="background:var(--color-bg-secondary); border-color:var(--color-border); color:var(--color-text-primary);" />
        </div>

        <div class="form-group">
          <label class="form-label">Comentarios / Observaciones</label>
          <textarea id="evt-comments" class="input input-md" rows="3" placeholder="Añade detalles adicionales..." style="background:var(--color-bg-secondary); border-color:var(--color-border); color:var(--color-text-primary);"></textarea>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-evt-cancel">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-evt-save">Enviar Solicitud / Guardar</button>
    `;

    const modal = new Modal({
      title: 'Solicitar Día Libre / Crear Evento',
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'md'
    });

    document.body.appendChild(modal.mount());

    const cancelBtn = modal.$('#modal-evt-cancel');
    const saveBtn = modal.$('#modal-evt-save');
    const startInput = modal.$('#evt-start-date');
    const endInput = modal.$('#evt-end-date');
    const typeInput = modal.$('#evt-type');
    const warningBox = modal.$('#conflict-warning-box');

    if (cancelBtn) cancelBtn.addEventListener('click', () => modal.close());

    // Live conflict check
    const checkConflictLive = async () => {
      const s = startInput.value;
      const e = endInput.value || s;
      const t = typeInput.value;
      const companyId = currentCompany?.id || currentUser?.companyId || this.companyId;
      if (s && companyId) {
        const res = await CalendarService.checkAbsenceConflict(companyId, { startDate: s, endDate: e, type: t });
        if (warningBox) warningBox.style.display = res.hasConflict ? 'block' : 'none';
      }
    };

    if (startInput) startInput.addEventListener('change', checkConflictLive);
    if (endInput) endInput.addEventListener('change', checkConflictLive);
    if (typeInput) typeInput.addEventListener('change', checkConflictLive);
    checkConflictLive();

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const form = modal.$('#form-cal-event');
        if (!form.reportValidity()) return;

        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';

        try {
          const type = typeInput.value;
          const startDate = startInput.value;
          const endDate = endInput.value || startDate;
          const title = modal.$('#evt-title').value.trim() || EVENT_TYPES[type]?.label || 'Evento';
          const comments = modal.$('#evt-comments').value.trim();

          const empSelect = modal.$('#evt-employee');
          const employeeId = empSelect ? empSelect.value : (currentUser?.uid || '');
          const selectedOpt = empSelect && empSelect.selectedIndex >= 0 ? empSelect.options[empSelect.selectedIndex] : null;
          const employeeName = selectedOpt ? selectedOpt.dataset.name : (currentUser?.displayName || 'Empleado');
          const companyId = currentCompany?.id || currentUser?.companyId || this.companyId;

          await CalendarService.createEvent(companyId, {
            type,
            startDate,
            endDate,
            title,
            comments,
            employeeId,
            employeeName
          }, currentUser);

          NotificationService.success('Evento / Solicitud registrada exitosamente.');
          modal.close();
          this.loadData();
        } catch (err) {
          console.error(err);
          NotificationService.error(`Error: ${err.message || err}`);
          saveBtn.disabled = false;
          saveBtn.textContent = 'Enviar Solicitud / Guardar';
        }
      });
    }
  }

  openEventDetailModal(ev) {
    const { currentUser, currentCompany } = GlobalStore.getState();
    const isOwnerOrManager = ['OWNER', 'SUPER_ADMIN', 'MANAGER'].includes(currentUser?.role);
    const typeDef = EVENT_TYPES[ev.type] || EVENT_TYPES.OTRO;
    const companyId = currentCompany?.id || currentUser?.companyId || this.companyId;

    const historyHTML = (ev.history || []).map(h => `
      <div style="font-size:0.75rem; border-left:2px solid var(--color-accent); padding-left:8px; margin-bottom:6px;">
        <div style="font-weight:600; color:var(--color-text-primary);">${h.action} - por ${h.userName}</div>
        <div style="color:var(--color-text-secondary);">${new Date(h.timestamp).toLocaleString()} | ${h.note || ''}</div>
      </div>
    `).join('');

    const bodyHTML = `
      <div style="display:flex; flex-direction:column; gap:var(--space-3);">
        <div style="display:flex; align-items:center; gap:12px; background:var(--color-bg-tertiary); padding:var(--space-3); border-radius:var(--radius-md); border:1px solid var(--color-border);">
          <span style="display:inline-flex; align-items:center;">${typeDef.icon}</span>
          <div>
            <h4 style="font-size:1rem; font-weight:700; color:var(--color-text-primary); margin:0;">${ev.title}</h4>
            <div style="font-size:0.78rem; color:var(--color-text-secondary); margin-top:2px;">
              Empleado: <strong>${ev.employeeName || 'General'}</strong> | Status: <span class="badge" style="font-size:0.7rem; padding:1px 6px;">${ev.status}</span>
            </div>
          </div>
        </div>

        ${ev.hasConflict ? `
          <div style="background:rgba(239,68,68,0.12); border:1px solid var(--color-danger); border-radius:var(--radius-md); padding:var(--space-3); color:var(--color-danger); font-size:0.8rem;">
            <strong>Conflicto Detectado:</strong> En las fechas seleccionadas se alcanza el límite máximo de personal ausente simultáneo.
          </div>
        ` : ''}

        <div style="font-size:0.82rem; color:var(--color-text-primary);">
          Fechas: ${ev.startDate} ${ev.endDate && ev.endDate !== ev.startDate ? `al ${ev.endDate}` : ''}
        </div>

        ${ev.comments ? `
          <div style="font-size:0.8rem; background:var(--color-bg-secondary); padding:var(--space-3); border-radius:var(--radius-md); border:1px solid var(--color-border);">
            Comentarios: ${ev.comments}
          </div>
        ` : ''}

        <div style="border-top:1px solid var(--color-border); padding-top:var(--space-3);">
          <h5 style="font-size:0.8rem; font-weight:700; color:var(--color-text-secondary); margin-bottom:8px;">Historial de Auditoría:</h5>
          ${historyHTML || '<p style="font-size:0.75rem; color:var(--color-text-secondary);">Sin registro de cambios.</p>'}
        </div>
      </div>
    `;

    let footerHTML = `<button class="btn btn-secondary btn-sm" id="modal-dtl-close">Cerrar</button>`;

    if (isOwnerOrManager && ev.status === 'PENDIENTE') {
      footerHTML += `
        <button class="btn btn-danger btn-sm" id="modal-dtl-reject">Rechazar</button>
        <button class="btn btn-primary btn-sm" id="modal-dtl-approve">Aprobar Solicitud</button>
      `;
    } else if (isOwnerOrManager && !ev.isSystemHoliday) {
      footerHTML += `<button class="btn btn-danger btn-sm" id="modal-dtl-delete">Eliminar</button>`;
    } else if (ev.employeeId === currentUser?.uid && ev.status === 'PENDIENTE') {
      footerHTML += `<button class="btn btn-warning btn-sm" id="modal-dtl-cancel-req">Cancelar Solicitud</button>`;
    }

    const modal = new Modal({
      title: 'Detalle de Solicitud / Evento',
      bodyHTML,
      footerHTML,
      size: 'md'
    });

    document.body.appendChild(modal.mount());

    const closeBtn = modal.$('#modal-dtl-close');
    const approveBtn = modal.$('#modal-dtl-approve');
    const rejectBtn = modal.$('#modal-dtl-reject');
    const deleteBtn = modal.$('#modal-dtl-delete');
    const cancelReqBtn = modal.$('#modal-dtl-cancel-req');

    if (closeBtn) closeBtn.addEventListener('click', () => modal.close());

    if (approveBtn) {
      approveBtn.addEventListener('click', async () => {
        await CalendarService.updateEventStatus(companyId, ev.id, 'APROBADO', currentUser);
        NotificationService.success('Solicitud aprobada correctamente.');
        modal.close();
        this.loadData();
      });
    }

    if (rejectBtn) {
      rejectBtn.addEventListener('click', async () => {
        const reason = prompt('Motivo del rechazo (opcional):', '');
        if (reason === null) return;
        await CalendarService.updateEventStatus(companyId, ev.id, 'RECHAZADO', currentUser, reason);
        NotificationService.info('Solicitud rechazada.');
        modal.close();
        this.loadData();
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este evento del calendario?')) return;
        await CalendarService.deleteEvent(companyId, ev.id);
        NotificationService.success('Evento eliminado.');
        modal.close();
        this.loadData();
      });
    }

    if (cancelReqBtn) {
      cancelReqBtn.addEventListener('click', async () => {
        if (!confirm('¿Cancelar tu solicitud de día libre?')) return;
        await CalendarService.updateEventStatus(companyId, ev.id, 'CANCELADO', currentUser, 'Cancelado por el empleado');
        NotificationService.info('Solicitud cancelada.');
        modal.close();
        this.loadData();
      });
    }
  }

  async openSettingsModal() {
    const { currentUser, currentCompany } = GlobalStore.getState();
    const config = this.state.config;
    const companyId = currentCompany?.id || currentUser?.companyId || this.companyId;

    const bodyHTML = `
      <form id="form-cal-settings" style="display:flex; flex-direction:column; gap:var(--space-4);">
        <div style="background:var(--color-bg-tertiary); padding:var(--space-3); border-radius:var(--radius-md); border:1px solid var(--color-border);">
          <label class="form-label" style="font-weight:700;">Límite Máximo de Empleados Ausentes el Mismo Día</label>
          <p style="font-size:0.75rem; color:var(--color-text-secondary); margin-bottom:8px;">Define cuántos empleados pueden estar libres/vacaciones/permiso simultáneamente. Si se alcanza este número, las solicitudes siguientes generarán una alerta de conflicto para aprobación del dueño.</p>
          <input type="number" id="cfg-max-absent" class="input input-md" min="0" value="${config.maxAbsentPerDay ?? 2}" style="max-width:150px; background:var(--color-bg-secondary); border-color:var(--color-border); color:var(--color-text-primary);" />
          <small style="font-size:0.7rem; color:var(--color-text-secondary); display:block; margin-top:4px;">(Usa 0 para permitir ausencias sin límite)</small>
        </div>

        <div style="border-top:1px solid var(--color-border); padding-top:var(--space-3);">
          <h4 style="font-size:0.85rem; font-weight:700; color:var(--color-text-primary); margin-bottom:6px;">Feriados Personalizados de la Empresa</h4>
          <p style="font-size:0.75rem; color:var(--color-text-secondary); margin-bottom:8px;">Agrega aniversarios de la empresa, patronales o días libres decretados.</p>
          <div style="display:flex; gap:8px; margin-bottom:8px;">
            <input type="text" id="cfg-holiday-title" class="input input-sm" placeholder="Nombre del feriado" style="flex:1; background:var(--color-bg-secondary); border-color:var(--color-border); color:var(--color-text-primary);" />
            <input type="date" id="cfg-holiday-date" class="input input-sm" style="background:var(--color-bg-secondary); border-color:var(--color-border); color:var(--color-text-primary);" />
            <button type="button" class="btn btn-secondary btn-sm" id="btn-add-custom-holiday">+ Agregar</button>
          </div>

          <div id="custom-holidays-list" style="display:flex; flex-direction:column; gap:4px;">
            ${(config.customHolidays || []).map((ch, idx) => `
              <div style="display:flex; align-items:center; justify-content:space-between; background:var(--color-bg-tertiary); padding:4px 10px; border-radius:4px; font-size:0.78rem;">
                <span>${ch.title} (${ch.date})</span>
                <button type="button" class="btn-remove-holiday" data-index="${idx}" style="background:none; border:none; color:var(--color-danger); cursor:pointer;">✕</button>
              </div>
            `).join('')}
          </div>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cfg-cancel">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-cfg-save">Guardar Configuración</button>
    `;

    const modal = new Modal({
      title: 'Configuración del Calendario Laboral',
      bodyHTML,
      footerHTML,
      size: 'md'
    });

    document.body.appendChild(modal.mount());

    let tempHolidays = [...(config.customHolidays || [])];

    const renderTempHolidays = () => {
      const listContainer = modal.$('#custom-holidays-list');
      if (!listContainer) return;
      listContainer.innerHTML = tempHolidays.map((ch, idx) => `
        <div style="display:flex; align-items:center; justify-content:space-between; background:var(--color-bg-tertiary); padding:4px 10px; border-radius:4px; font-size:0.78rem;">
          <span>${ch.title} (${ch.date})</span>
          <button type="button" class="btn-remove-holiday" data-index="${idx}" style="background:none; border:none; color:var(--color-danger); cursor:pointer;">✕</button>
        </div>
      `).join('');

      listContainer.querySelectorAll('.btn-remove-holiday').forEach(b => {
        b.addEventListener('click', (e) => {
          const idx = Number(e.target.dataset.index);
          tempHolidays.splice(idx, 1);
          renderTempHolidays();
        });
      });
    };

    const addBtn = modal.$('#btn-add-custom-holiday');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const titleInput = modal.$('#cfg-holiday-title');
        const dateInput = modal.$('#cfg-holiday-date');
        if (titleInput && dateInput && titleInput.value.trim() && dateInput.value) {
          tempHolidays.push({
            id: `custom-${Date.now()}`,
            title: titleInput.value.trim(),
            date: dateInput.value
          });
          titleInput.value = '';
          dateInput.value = '';
          renderTempHolidays();
        }
      });
    }

    const cancelBtn = modal.$('#modal-cfg-cancel');
    const saveBtn = modal.$('#modal-cfg-save');

    if (cancelBtn) cancelBtn.addEventListener('click', () => modal.close());

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const maxAbsent = Number(modal.$('#cfg-max-absent').value ?? 2);
        await CalendarService.updateConfig(companyId, {
          maxAbsentPerDay: maxAbsent,
          customHolidays: tempHolidays
        });
        NotificationService.success('Configuración del calendario guardada.');
        modal.close();
        this.loadData();
      });
    }
  }
}
