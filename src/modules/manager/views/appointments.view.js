/**
 * @file appointments.view.js
 * @description Gestión de citas y reservas para barberías, salones de belleza y similares.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';

export class AppointmentsView extends Component {
  constructor(params = {}) {
    super(params);
    this.layout = new PageLayout({ title: 'Citas y Reservas' });
    this.state = { view: 'calendar' };
  }

  render() {
    const company = GlobalStore.getState().currentCompany;
    const companyName = company?.name || 'Negocio';
    const today = new Date();
    const dateStr = today.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    return `
      <div class="d-flex flex-column gap-4">
        <!-- Header -->
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3);">
          <div>
            <h1 style="font-size: 1.5rem; font-weight: 700; color: var(--color-text-primary); margin: 0;">📅 Citas y Reservas</h1>
            <p style="font-size: 0.875rem; color: var(--color-text-secondary); margin: 4px 0 0 0;">${companyName} — ${dateStr}</p>
          </div>
          <div style="display: flex; gap: var(--space-2);">
            <button id="btn-view-calendar" class="btn btn-primary btn-sm">🗓 Calendario</button>
            <button id="btn-view-list" class="btn btn-secondary btn-sm">📋 Lista</button>
            <button id="btn-new-appointment" class="btn btn-primary btn-sm">+ Nueva Cita</button>
          </div>
        </div>

        <!-- Stats -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--space-3);">
          ${this._statCard('Hoy', '0', '📅', '#6366f1')}
          ${this._statCard('Esta Semana', '0', '📆', '#10b981')}
          ${this._statCard('Pendientes', '0', '⏳', '#f59e0b')}
          ${this._statCard('Completadas', '0', '✅', '#8b5cf6')}
        </div>

        <!-- Calendar/List View -->
        <div id="appointments-container">
          ${this._calendarPlaceholder()}
        </div>
      </div>
    `;
  }

  _statCard(label, value, icon, color) {
    return `
      <div style="background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); display: flex; align-items: center; gap: var(--space-3);">
        <span style="font-size: 1.5rem;">${icon}</span>
        <div>
          <div style="font-size: 1.4rem; font-weight: 700; color: ${color};">${value}</div>
          <div style="font-size: 0.75rem; color: var(--color-text-secondary);">${label}</div>
        </div>
      </div>
    `;
  }

  _calendarPlaceholder() {
    // Weekly time slots view
    const hours = Array.from({ length: 11 }, (_, i) => i + 8); // 8am - 6pm
    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return `
      <div style="background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden;">
        <!-- Day Headers -->
        <div style="display: grid; grid-template-columns: 60px repeat(6, 1fr); border-bottom: 1px solid var(--color-border);">
          <div style="padding: var(--space-3); font-size: 0.75rem; color: var(--color-text-secondary);"></div>
          ${days.map(d => `<div style="padding: var(--space-3); text-align: center; font-size: 0.8rem; font-weight: 600; color: var(--color-text-primary); border-left: 1px solid var(--color-border);">${d}</div>`).join('')}
        </div>
        <!-- Time slots -->
        ${hours.map(h => `
          <div style="display: grid; grid-template-columns: 60px repeat(6, 1fr); border-bottom: 1px solid var(--color-border); min-height: 48px;">
            <div style="padding: var(--space-2) var(--space-3); font-size: 0.7rem; color: var(--color-text-secondary); border-right: 1px solid var(--color-border); display: flex; align-items: flex-start;">${h}:00</div>
            ${days.map(() => `<div style="border-left: 1px solid var(--color-border); cursor: pointer; transition: background 0.15s;" onmouseenter="this.style.background='var(--color-accent-muted, rgba(99,102,241,.08))'" onmouseleave="this.style.background=''"></div>`).join('')}
          </div>
        `).join('')}
        <!-- Empty state overlay -->
        <div style="text-align: center; padding: var(--space-4); color: var(--color-text-secondary); font-size: 0.85rem;">
          Haz clic en cualquier franja horaria para agregar una cita
        </div>
      </div>
    `;
  }

  mount() {
    const layout = this.layout.mount();
    layout.querySelector('#page-content')?.insertAdjacentHTML('beforeend', this.render());
    return layout;
  }
}
