/**
 * @file dashboard.view.js
 * @description Manager Dashboard view. Demonstrates the responsive PageLayout, Sidebar, Header and custom Chart.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Chart } from '../../../components/data/chart.js';

export class ManagerDashboardView extends Component {
  constructor(params = {}) {
    super(params);
    
    // Instantiate PageLayout passing the dashboard content
    this.layout = new PageLayout({
      title: 'Dashboard de Gestión',
      subtitle: 'Vista general del rendimiento del restaurante en tiempo real.',
      contentHTML: `
        <!-- Quick stats responsive grid -->
        <div class="grid-stats">
          <div class="card p-4 hover-lift">
            <div class="d-flex justify-content-between align-items-start">
              <span class="text-sm text-secondary">Ventas de Hoy</span>
              <span style="font-size: 1.25rem;">💰</span>
            </div>
            <h3 class="text-2xl font-bold mt-1 text-primary">$18,450.00</h3>
            <span class="text-xs text-success font-semibold">↑ +12.5% respecto a ayer</span>
          </div>

          <div class="card p-4 hover-lift">
            <div class="d-flex justify-content-between align-items-start">
              <span class="text-sm text-secondary">Pedidos Activos</span>
              <span style="font-size: 1.25rem;">📝</span>
            </div>
            <h3 class="text-2xl font-bold mt-1 text-primary">24</h3>
            <span class="text-xs text-secondary">18 en preparación, 6 listos</span>
          </div>

          <div class="card p-4 hover-lift">
            <div class="d-flex justify-content-between align-items-start">
              <span class="text-sm text-secondary">Ocupación de Mesas</span>
              <span style="font-size: 1.25rem;">🍽️</span>
            </div>
            <h3 class="text-2xl font-bold mt-1 text-primary">78%</h3>
            <span class="text-xs text-secondary">14 de 18 mesas ocupadas</span>
          </div>
        </div>

        <!-- Sales Analytics Chart and info grid -->
        <div class="grid-responsive mt-6">
          <div class="col-8 card p-5">
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h3 class="text-lg font-semibold">Tendencia de Ventas (Semanal)</h3>
              <span class="text-xs text-secondary">Actualizado hace 1 min</span>
            </div>
            <!-- Container where we will mount the native Canvas Chart -->
            <div id="dashboard-sales-chart" style="width: 100%; height: 280px;"></div>
          </div>

          <div class="col-4 card p-5 justify-content-between">
            <h3 class="text-lg font-semibold mb-4">Productos más vendidos</h3>
            <div class="d-flex flex-column gap-3">
              <div class="d-flex justify-content-between align-items-center">
                <span class="text-sm">🍔 Hamburguesa Especial</span>
                <span class="font-semibold">48 ord.</span>
              </div>
              <div class="d-flex justify-content-between align-items-center">
                <span class="text-sm">🍕 Pizza Pepperoni</span>
                <span class="font-semibold">36 ord.</span>
              </div>
              <div class="d-flex justify-content-between align-items-center">
                <span class="text-sm">🌮 Tacos de Pastor</span>
                <span class="font-semibold">32 ord.</span>
              </div>
              <div class="d-flex justify-content-between align-items-center">
                <span class="text-sm">🍺 Cerveza Nacional</span>
                <span class="font-semibold">28 ord.</span>
              </div>
            </div>
            <div style="border-top: 1px solid var(--color-border); margin-top: var(--space-4); padding-top: var(--space-4);">
              <p class="text-xs text-secondary">
                Los datos reales y el inventario inteligente se vincularán en las siguientes fases del desarrollo.
              </p>
            </div>
          </div>
        </div>
      `
    });

    // Create the native Canvas Chart instance
    this.chart = new Chart({
      type: 'line',
      labels: ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'],
      datasets: [
        { label: 'Ventas ($)', data: [12000, 15000, 14000, 18500, 22000, 29000, 24000], color: '#7c75ff' }
      ]
    });
  }

  mount() {
    // 1. Mount PageLayout structure (it returns the main wrapper with Sidebar and Header)
    const element = this.layout.mount();

    // 2. Injected native canvas chart in the dashboard view
    const chartContainer = element.querySelector('#dashboard-sales-chart');
    if (chartContainer) {
      chartContainer.appendChild(this.chart.mount());
    }

    return element;
  }

  unmount() {
    this.chart.unmount();
    this.layout.unmount();
    super.unmount();
  }
}