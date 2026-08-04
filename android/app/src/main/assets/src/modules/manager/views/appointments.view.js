/**
 * @file appointments.view.js
 * @description Módulo completo de Citas y Reservas para barberías, salones de belleza y servicios similares.
 * Incluye: vista de calendario semanal, lista de citas, CRUD completo con Firebase, estados visuales y filtros.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';

// Statuses with colors
const STATUS_CONFIG = {
  PENDIENTE:   { label: 'Pendiente',    color: '#f59e0b', bg: '#f59e0b22' },
  CONFIRMADA:  { label: 'Confirmada',   color: '#3b82f6', bg: '#3b82f622' },
  EN_PROCESO:  { label: 'En Proceso',   color: '#8b5cf6', bg: '#8b5cf622' },
  COMPLETADA:  { label: 'Completada',   color: '#10b981', bg: '#10b98122' },
  CANCELADA:   { label: 'Cancelada',    color: '#ef4444', bg: '#ef444422' },
};

export class AppointmentsView extends Component {
  constructor(params = {}) {
    super(params);
    const state = GlobalStore.getState();
    const currentUser = state.currentUser || {};
    this.companyId = currentUser.companyId || '';
    this.currentCompany = state.currentCompany || {};

    this.state = {
      view: 'list',      // 'list' | 'calendar'
      appointments: [],
      employees: [],
      filterStatus: '',
      filterDate: new Date().toISOString().slice(0, 10),
      weekOffset: 0,
    };

    this.layout = new PageLayout({
      title: '📅 Citas y Reservas',
      subtitle: `${this.currentCompany.name || 'Mi Barbería'} — Gestión completa de citas y servicios.`,
      actionHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-view-toggle">🗓 Vista Calendario</button>
        <button class="btn btn-primary btn-sm" id="btn-new-appointment">+ Nueva Cita</button>
      `,
      contentHTML: `
        <style>
          /* ── KPI Cards ─────────────────────────────── */
          .appt-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:var(--space-4); margin-bottom:var(--space-6); }
          .appt-kpi { background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:var(--radius-lg); padding:var(--space-4); display:flex; align-items:center; gap:var(--space-3); transition:transform .2s; }
          .appt-kpi:hover { transform:translateY(-2px); }
          .appt-kpi-icon { font-size:1.6rem; flex-shrink:0; }
          .appt-kpi-val { font-size:1.5rem; font-weight:800; }
          .appt-kpi-label { font-size:0.75rem; color:var(--color-text-secondary); margin-top:2px; }

          /* ── Filter Toolbar ─────────────────────────── */
          .appt-toolbar { display:flex; flex-wrap:wrap; gap:var(--space-3); align-items:center; margin-bottom:var(--space-4); }
          .appt-status-filter { display:flex; gap:var(--space-2); flex-wrap:wrap; }
          .appt-status-chip { padding:4px 12px; border-radius:999px; border:1px solid var(--color-border); font-size:0.78rem; font-weight:600; cursor:pointer; transition:all 0.2s; }
          .appt-status-chip.active { box-shadow:0 0 0 2px var(--color-accent); }

          /* ── Appointment List ───────────────────────── */
          .appt-list { display:flex; flex-direction:column; gap:var(--space-3); }
          .appt-card {
            display:grid; grid-template-columns:80px 1fr auto;
            align-items:center; gap:var(--space-4);
            background:var(--color-bg-secondary); border:1px solid var(--color-border);
            border-radius:var(--radius-lg); padding:var(--space-4);
            transition:transform .2s, box-shadow .2s;
          }
          .appt-card:hover { transform:translateX(4px); box-shadow:var(--shadow-md); }
          .appt-time-block { text-align:center; }
          .appt-time-val { font-size:1.1rem; font-weight:800; color:var(--color-accent); }
          .appt-time-date { font-size:0.7rem; color:var(--color-text-secondary); margin-top:2px; }
          .appt-details-name { font-weight:700; font-size:0.95rem; }
          .appt-details-service { font-size:0.8rem; color:var(--color-text-secondary); margin-top:3px; }
          .appt-details-meta { font-size:0.75rem; color:var(--color-text-secondary); margin-top:5px; display:flex; gap:var(--space-3); flex-wrap:wrap; }
          .appt-actions { display:flex; flex-direction:column; gap:var(--space-2); min-width:110px; }

          /* ── Calendar View ──────────────────────────── */
          .appt-calendar-nav { display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-4); }
          .appt-calendar-grid { display:grid; grid-template-columns:60px repeat(6,1fr); border:1px solid var(--color-border); border-radius:var(--radius-lg); overflow:hidden; }
          .appt-cal-header { background:var(--color-bg-tertiary); text-align:center; padding:var(--space-3); font-size:0.8rem; font-weight:700; border-bottom:1px solid var(--color-border); border-right:1px solid var(--color-border); }
          .appt-cal-time { padding:var(--space-2); font-size:0.7rem; color:var(--color-text-secondary); text-align:right; border-right:1px solid var(--color-border); border-bottom:1px solid var(--color-border); }
          .appt-cal-cell { border-right:1px solid var(--color-border); border-bottom:1px solid var(--color-border); min-height:52px; padding:4px; position:relative; }
          .appt-cal-event { background:var(--color-accent); color:#fff; border-radius:var(--radius-sm); padding:3px 6px; font-size:0.7rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:2px; cursor:pointer; }

          .appt-status-badge { display:inline-block; padding:3px 10px; border-radius:999px; font-size:0.75rem; font-weight:600; }
        </style>

        <!-- KPIs -->
        <div class="appt-kpis animate-fade-in">
          <div class="appt-kpi" style="border-top:4px solid #f59e0b;">
            <div class="appt-kpi-icon">⏳</div>
            <div><div class="appt-kpi-val text-warning" id="kpi-pending">0</div><div class="appt-kpi-label">Pendientes Hoy</div></div>
          </div>
          <div class="appt-kpi" style="border-top:4px solid #3b82f6;">
            <div class="appt-kpi-icon">✅</div>
            <div><div class="appt-kpi-val" style="color:#3b82f6;" id="kpi-confirmed">0</div><div class="appt-kpi-label">Confirmadas Hoy</div></div>
          </div>
          <div class="appt-kpi" style="border-top:4px solid #10b981;">
            <div class="appt-kpi-icon">🎉</div>
            <div><div class="appt-kpi-val text-success" id="kpi-completed">0</div><div class="appt-kpi-label">Completadas Hoy</div></div>
          </div>
          <div class="appt-kpi" style="border-top:4px solid var(--color-accent);">
            <div class="appt-kpi-icon">📆</div>
            <div><div class="appt-kpi-val" style="color:var(--color-accent);" id="kpi-week">0</div><div class="appt-kpi-label">Esta Semana</div></div>
          </div>
        </div>

        <!-- Toolbar -->
        <div class="appt-toolbar card p-4">
          <div class="appt-status-filter" id="appt-status-chips">
            <span class="appt-status-chip active" data-status="">Todas</span>
            <span class="appt-status-chip" data-status="PENDIENTE" style="color:#f59e0b; border-color:#f59e0b33;">Pendiente</span>
            <span class="appt-status-chip" data-status="CONFIRMADA" style="color:#3b82f6; border-color:#3b82f633;">Confirmada</span>
            <span class="appt-status-chip" data-status="EN_PROCESO" style="color:#8b5cf6; border-color:#8b5cf633;">En Proceso</span>
            <span class="appt-status-chip" data-status="COMPLETADA" style="color:#10b981; border-color:#10b98133;">Completada</span>
            <span class="appt-status-chip" data-status="CANCELADA" style="color:#ef4444; border-color:#ef444433;">Cancelada</span>
          </div>
          <div style="display:flex; gap:var(--space-2); margin-left:auto; align-items:center;">
            <label class="text-xs text-secondary">Fecha:</label>
            <input type="date" id="appt-date-filter" class="input input-sm" value="${new Date().toISOString().slice(0, 10)}" />
          </div>
        </div>

        <!-- Main View Container -->
        <div id="appt-view-container" class="mt-4">
          <p class="text-center py-10 text-secondary">Cargando citas...</p>
        </div>
      `
    });

    this.listeners = [];
  }

  mount() {
    const element = this.layout.mount();
    this.bindEvents(element);
    this.subscribeToData(element);
    return element;
  }

  subscribeToData(element) {
    try {
      const apptListener = FirestoreService.listenToTenant('citas', (citas) => {
        this.state.appointments = citas || [];
        this.updateKPIs(element);
        this.renderView(element);
      });
      this.listeners.push(apptListener);

      const empListener = FirestoreService.listenToTenant('employees', (employees) => {
        this.state.employees = employees || [];
      });
      this.listeners.push(empListener);
    } catch (e) {
      console.error('[AppointmentsView] Subscription error:', e);
    }
  }

  bindEvents(element) {
    // Toggle view button
    element.querySelector('#btn-view-toggle')?.addEventListener('click', () => {
      this.state.view = this.state.view === 'list' ? 'calendar' : 'list';
      const btn = element.querySelector('#btn-view-toggle');
      if (btn) btn.textContent = this.state.view === 'list' ? '🗓 Vista Calendario' : '📋 Vista Lista';
      this.renderView(element);
    });

    // New appointment
    element.querySelector('#btn-new-appointment')?.addEventListener('click', () => this.openCreateModal());

    // Status chips filter
    element.querySelector('#appt-status-chips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.appt-status-chip');
      if (!chip) return;
      element.querySelectorAll('.appt-status-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      this.state.filterStatus = chip.getAttribute('data-status');
      this.renderView(element);
    });

    // Date filter
    element.querySelector('#appt-date-filter')?.addEventListener('change', (e) => {
      this.state.filterDate = e.target.value;
      this.renderView(element);
    });

    // Event delegation on main view (status change and delete buttons)
    element.querySelector('#appt-view-container')?.addEventListener('click', (e) => {
      const changeBtn = e.target.closest('.btn-appt-status');
      if (changeBtn) {
        const id = changeBtn.getAttribute('data-id');
        const newStatus = changeBtn.getAttribute('data-status');
        this.changeStatus(id, newStatus);
        return;
      }
      const deleteBtn = e.target.closest('.btn-appt-delete');
      if (deleteBtn) {
        const id = deleteBtn.getAttribute('data-id');
        const name = deleteBtn.getAttribute('data-name');
        if (confirm(`¿Cancelar la cita de "${name}"?`)) {
          this.changeStatus(id, 'CANCELADA');
        }
      }
    });
  }

  updateKPIs(element) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayAppts = this.state.appointments.filter(a => (a.date || '').slice(0, 10) === todayStr);
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekAppts = this.state.appointments.filter(a => {
      if (!a.date) return false;
      const d = new Date(a.date);
      return d >= weekStart;
    });

    const q = sel => element.querySelector(sel);
    if (q('#kpi-pending')) q('#kpi-pending').textContent = todayAppts.filter(a => a.status === 'PENDIENTE').length;
    if (q('#kpi-confirmed')) q('#kpi-confirmed').textContent = todayAppts.filter(a => a.status === 'CONFIRMADA').length;
    if (q('#kpi-completed')) q('#kpi-completed').textContent = todayAppts.filter(a => a.status === 'COMPLETADA').length;
    if (q('#kpi-week')) q('#kpi-week').textContent = weekAppts.length;
  }

  renderView(element) {
    const container = element.querySelector('#appt-view-container');
    if (!container) return;

    if (this.state.view === 'calendar') {
      this.renderCalendar(container);
    } else {
      this.renderList(container);
    }
  }

  renderList(container) {
    const { appointments, filterStatus, filterDate } = this.state;

    let filtered = appointments;
    if (filterStatus) filtered = filtered.filter(a => a.status === filterStatus);
    if (filterDate) filtered = filtered.filter(a => (a.date || '').slice(0, 10) === filterDate);

    filtered = filtered.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="card p-10 text-center text-secondary">
          <div style="font-size:3rem; margin-bottom:12px;">📅</div>
          <h4 class="font-bold">Sin citas para este filtro</h4>
          <p class="text-xs mt-1">Ajusta el filtro de estado o la fecha, o crea una nueva cita con el botón "+" superior.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `<div class="appt-list animate-fade-in">${filtered.map(a => this.renderAppointmentCard(a)).join('')}</div>`;
  }

  renderAppointmentCard(appt) {
    const cfg = STATUS_CONFIG[appt.status] || STATUS_CONFIG.PENDIENTE;
    const dateFormatted = appt.date ? new Date(appt.date + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '—';

    // Next-step status transition buttons
    const transitions = {
      PENDIENTE:  ['CONFIRMADA', 'CANCELADA'],
      CONFIRMADA: ['EN_PROCESO', 'CANCELADA'],
      EN_PROCESO: ['COMPLETADA', 'CANCELADA'],
      COMPLETADA: [],
      CANCELADA:  ['PENDIENTE'],
    };
    const nextStatuses = (transitions[appt.status] || []);
    const actionBtns = nextStatuses.map(s => {
      const c = STATUS_CONFIG[s];
      return `<button class="btn btn-xs btn-appt-status" data-id="${appt.id}" data-status="${s}"
        style="background:${c.bg}; color:${c.color}; border:1px solid ${c.color}44; font-size:0.72rem; padding:4px 8px; border-radius:var(--radius-sm); cursor:pointer; font-weight:600;">
        ${c.label}
      </button>`;
    }).join('');

    return `
      <div class="appt-card">
        <div class="appt-time-block">
          <div class="appt-time-val">${appt.time || '—'}</div>
          <div class="appt-time-date">${dateFormatted}</div>
        </div>
        <div>
          <div class="appt-details-name">✂️ ${appt.clientName || 'Cliente'}</div>
          <div class="appt-details-service">${appt.service || 'Servicio no especificado'}</div>
          <div class="appt-details-meta">
            <span>👤 ${appt.employeeName || 'Sin asignar'}</span>
            <span>⏱ ${appt.duration || 30} min</span>
            ${appt.phone ? `<span>📱 ${appt.phone}</span>` : ''}
          </div>
          <div class="mt-2">
            <span class="appt-status-badge" style="background:${cfg.bg}; color:${cfg.color};">${cfg.label}</span>
          </div>
        </div>
        <div class="appt-actions">
          ${actionBtns}
          <button class="btn btn-xs btn-appt-delete" data-id="${appt.id}" data-name="${appt.clientName || 'cliente'}"
            style="background:none; border:1px solid var(--color-border); border-radius:var(--radius-sm); padding:4px 8px; font-size:0.72rem; cursor:pointer; color:var(--color-text-secondary);">
            🗑 Cancelar
          </button>
        </div>
      </div>
    `;
  }

  renderCalendar(container) {
    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const hours = Array.from({ length: 12 }, (_, i) => i + 8); // 8 AM - 7 PM

    // Compute current week dates
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = now.getDay() || 7;
    startOfWeek.setDate(now.getDate() - day + 1 + this.state.weekOffset * 7);

    const weekDates = days.map((_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return d;
    });

    const weekLabel = `${weekDates[0].toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} — ${weekDates[5].toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}`;

    const headerRow = days.map((d, i) => {
      const wd = weekDates[i];
      const isToday = wd.toDateString() === now.toDateString();
      return `<div class="appt-cal-header" ${isToday ? 'style="background:color-mix(in srgb, var(--color-accent) 12%, var(--color-bg-tertiary));"' : ''}>${d}<br><small style="font-weight:400;">${wd.getDate()}</small></div>`;
    }).join('');

    const bodyRows = hours.map(h => {
      const cells = weekDates.map(wd => {
        const dayKey = wd.toISOString().slice(0, 10);
        const slotAppts = this.state.appointments.filter(a => {
          const apptHour = parseInt((a.time || '0:0').split(':')[0]);
          return (a.date || '').slice(0, 10) === dayKey && apptHour === h;
        });
        const events = slotAppts.map(a => {
          const c = STATUS_CONFIG[a.status] || STATUS_CONFIG.PENDIENTE;
          return `<div class="appt-cal-event" style="background:${c.color};" title="${a.clientName} — ${a.service}">${a.clientName || 'Cita'}</div>`;
        }).join('');
        return `<div class="appt-cal-cell">${events}</div>`;
      }).join('');

      return `
        <div class="appt-cal-time">${h}:00</div>
        ${cells}
      `;
    }).join('');

    container.innerHTML = `
      <div class="appt-calendar-nav">
        <button class="btn btn-secondary btn-sm" id="btn-week-prev">← Anterior</button>
        <strong class="text-sm">${weekLabel}</strong>
        <button class="btn btn-secondary btn-sm" id="btn-week-next">Siguiente →</button>
      </div>
      <div class="appt-calendar-grid animate-fade-in">
        <div class="appt-cal-header"></div>
        ${headerRow}
        ${bodyRows}
      </div>
    `;

    container.querySelector('#btn-week-prev')?.addEventListener('click', () => {
      this.state.weekOffset--;
      this.renderCalendar(container);
    });
    container.querySelector('#btn-week-next')?.addEventListener('click', () => {
      this.state.weekOffset++;
      this.renderCalendar(container);
    });
  }

  openCreateModal() {
    const servicesList = ['Corte de Cabello', 'Barba', 'Corte + Barba', 'Tinte', 'Arreglo de Cejas', 'Tratamiento Capilar'];

    const bodyHTML = `
      <div class="d-flex flex-column gap-4">
        <div class="form-group">
          <label class="form-label" for="appt-client-name">Nombre del Cliente *</label>
          <input type="text" id="appt-client-name" class="input input-md" placeholder="Ej. Juan García" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="appt-phone">Teléfono (opcional)</label>
          <input type="tel" id="appt-phone" class="input input-md" placeholder="+52 55 1234 5678" />
        </div>
        <div class="form-group">
          <label class="form-label" for="appt-service">Servicio *</label>
          <select id="appt-service" class="input input-md">
            ${servicesList.map(s => `<option value="${s}">${s}</option>`).join('')}
          </select>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-4);">
          <div class="form-group">
            <label class="form-label" for="appt-date">Fecha *</label>
            <input type="date" id="appt-date" class="input input-md" value="${new Date().toISOString().slice(0, 10)}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="appt-time">Hora *</label>
            <input type="time" id="appt-time" class="input input-md" value="09:00" required />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="appt-duration">Duración (minutos)</label>
          <select id="appt-duration" class="input input-md">
            <option value="15">15 min</option>
            <option value="30" selected>30 min</option>
            <option value="45">45 min</option>
            <option value="60">60 min</option>
            <option value="90">90 min</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="appt-employee">Empleado Asignado</label>
          <select id="appt-employee" class="input input-md">
            <option value="">Sin asignar</option>
            ${this.state.employees.map(e => `<option value="${e.displayName || e.email}">${e.displayName || e.email} (${e.customRole || e.role})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="appt-notes">Notas adicionales</label>
          <textarea id="appt-notes" class="input input-md" rows="2" placeholder="Instrucciones especiales, alergias, preferencias..."></textarea>
        </div>
      </div>
    `;

    const modal = new Modal({
      title: '+ Nueva Cita',
      bodyHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-appt-cancel">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="btn-appt-save">Guardar Cita</button>
      `
    });

    document.body.appendChild(modal.mount());

    modal.$('#btn-appt-cancel')?.addEventListener('click', () => modal.close());
    modal.$('#btn-appt-save')?.addEventListener('click', async () => {
      const clientName = modal.$('#appt-client-name')?.value?.trim();
      const service = modal.$('#appt-service')?.value;
      const date = modal.$('#appt-date')?.value;
      const time = modal.$('#appt-time')?.value;

      if (!clientName || !date || !time) {
        NotificationService.error('Por favor completa: Nombre, Fecha y Hora.');
        return;
      }

      const payload = {
        clientName,
        phone: modal.$('#appt-phone')?.value || '',
        service,
        date,
        time,
        duration: Number(modal.$('#appt-duration')?.value || 30),
        employeeName: modal.$('#appt-employee')?.value || '',
        notes: modal.$('#appt-notes')?.value || '',
        status: 'PENDIENTE',
        createdAt: Date.now()
      };

      try {
        await FirestoreService.create('citas', payload);
        NotificationService.success(`Cita creada para ${clientName} a las ${time}.`);
        modal.close();
      } catch (e) {
        console.error('[AppointmentsView] Error saving appointment:', e);
        NotificationService.error('Error al guardar la cita.');
      }
    });
  }

  async changeStatus(id, newStatus) {
    try {
      await FirestoreService.update('citas', id, { status: newStatus });
      const label = STATUS_CONFIG[newStatus]?.label || newStatus;
      NotificationService.success(`Estado actualizado a: ${label}`);
    } catch (e) {
      console.error('[AppointmentsView] Status update failed:', e);
      NotificationService.error('Error al actualizar el estado.');
    }
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.layout.unmount();
    super.unmount();
  }
}
