/**
 * @file rentals.view.js
 * @description Gestión de alquileres activos y recordatorios para negocios Rent a Car.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';

export class RentalsView extends Component {
  constructor(params = {}) {
    super(params);
    this.layout = new PageLayout({ title: 'Gestión de Alquileres' });
  }

  render() {
    const company = GlobalStore.getState().currentCompany;
    const companyName = company?.name || 'Negocio';

    return `
      <div class="d-flex flex-column gap-4">
        <!-- Header -->
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3);">
          <div>
            <h1 style="font-size: 1.5rem; font-weight: 700; color: var(--color-text-primary); margin: 0;">🔑 Gestión de Alquileres</h1>
            <p style="font-size: 0.875rem; color: var(--color-text-secondary); margin: 4px 0 0 0;">${companyName} — Contratos activos, historial y recordatorios de devolución</p>
          </div>
          <button id="btn-new-rental" class="btn btn-primary btn-sm">+ Nuevo Alquiler</button>
        </div>

        <!-- Stats -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--space-3);">
          ${this._statCard('Alquileres Activos', '0', '🚘', '#6366f1')}
          ${this._statCard('Vencen Hoy', '0', '⏰', '#f59e0b')}
          ${this._statCard('Vencidos', '0', '⚠️', '#ef4444')}
          ${this._statCard('Completados', '0', '✅', '#10b981')}
        </div>

        <!-- Filter Tabs -->
        <div style="display: flex; gap: var(--space-2); border-bottom: 1px solid var(--color-border); padding-bottom: var(--space-2);">
          ${['Todos', 'Activos', 'Por Vencer', 'Completados'].map((t, i) => `
            <button class="btn btn-sm ${i === 0 ? 'btn-primary' : 'btn-secondary'}" data-tab="${t.toLowerCase()}" style="font-size: 0.8rem;">${t}</button>
          `).join('')}
        </div>

        <!-- Rentals Table -->
        <div id="rentals-table-wrapper">
          ${this._emptyState()}
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

  _emptyState() {
    return `
      <div style="text-align: center; padding: var(--space-8) var(--space-4); color: var(--color-text-secondary); background: var(--color-bg-secondary); border-radius: var(--radius-lg); border: 1px dashed var(--color-border);">
        <div style="font-size: 3rem; margin-bottom: var(--space-3);">🔑</div>
        <h3 style="font-weight: 600; margin-bottom: var(--space-2); color: var(--color-text-primary);">Sin alquileres registrados</h3>
        <p style="font-size: 0.875rem;">Registra un nuevo alquiler para comenzar a gestionar tus contratos y recordatorios.</p>
        <button id="btn-new-rental-empty" class="btn btn-primary btn-sm" style="margin-top: var(--space-4);">+ Nuevo Alquiler</button>
      </div>
    `;
  }

  mount() {
    const layout = this.layout.mount();
    layout.querySelector('#page-content')?.insertAdjacentHTML('beforeend', this.render());
    return layout;
  }
}
