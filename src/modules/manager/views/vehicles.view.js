/**
 * @file vehicles.view.js
 * @description Catálogo de vehículos para negocios de Rent a Car.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';

export class VehiclesView extends Component {
  constructor(params = {}) {
    super(params);
    this.layout = new PageLayout({ title: 'Catálogo de Vehículos' });
  }

  render() {
    const company = GlobalStore.getState().currentCompany;
    const companyName = company?.name || 'Negocio';

    return `
      <div class="d-flex flex-column gap-4">
        <!-- Header -->
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3);">
          <div>
            <h1 style="font-size: 1.5rem; font-weight: 700; color: var(--color-text-primary); margin: 0;">🚗 Catálogo de Vehículos</h1>
            <p style="font-size: 0.875rem; color: var(--color-text-secondary); margin: 4px 0 0 0;">${companyName} — Gestión de flota de vehículos disponibles para alquiler</p>
          </div>
          <button id="btn-add-vehicle" class="btn btn-primary btn-sm">
            + Agregar Vehículo
          </button>
        </div>

        <!-- Stats Bar -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--space-3);">
          ${this._statCard('Total Vehículos', '0', '🚘', '#6366f1')}
          ${this._statCard('Disponibles', '0', '✅', '#10b981')}
          ${this._statCard('En Alquiler', '0', '🔑', '#f59e0b')}
          ${this._statCard('En Mantenimiento', '0', '🔧', '#ef4444')}
        </div>

        <!-- Vehicle Grid Placeholder -->
        <div id="vehicles-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--space-4);">
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
      <div style="grid-column: 1 / -1; text-align: center; padding: var(--space-8) var(--space-4); color: var(--color-text-secondary);">
        <div style="font-size: 3rem; margin-bottom: var(--space-3);">🚗</div>
        <h3 style="font-weight: 600; margin-bottom: var(--space-2); color: var(--color-text-primary);">Sin vehículos registrados</h3>
        <p style="font-size: 0.875rem;">Agrega vehículos a tu flota para comenzar a gestionarlos y alquilarlos.</p>
        <button id="btn-add-vehicle-empty" class="btn btn-primary btn-sm" style="margin-top: var(--space-4);">
          + Agregar primer vehículo
        </button>
      </div>
    `;
  }

  mount() {
    const layout = this.layout.mount();
    layout.querySelector('#page-content')?.insertAdjacentHTML('beforeend', this.render());
    return layout;
  }
}
