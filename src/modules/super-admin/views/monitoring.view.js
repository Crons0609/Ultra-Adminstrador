import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Chart } from '../../../components/data/chart.js';

export class MonitoringView extends Component {
  constructor(params = {}) {
    super(params);
    this.layout = new PageLayout({
      title: 'Monitoreo de Infraestructura',
      subtitle: 'Estado y telemetría en tiempo real de los servidores, base de datos y servicios en la nube.',
      contentHTML: `
        <div class="grid-stats">
          <div class="card p-4">
            <span class="text-sm text-secondary">Uso de CPU Servidores</span>
            <h3 class="text-2xl font-bold mt-1 text-primary">14.2%</h3>
            <span class="text-xs text-success font-semibold">● Estado Saludable</span>
          </div>
          <div class="card p-4">
            <span class="text-sm text-secondary">Latencia Firestore</span>
            <h3 class="text-2xl font-bold mt-1 text-primary">42 ms</h3>
            <span class="text-xs text-success font-semibold">● Tiempo óptimo</span>
          </div>
          <div class="card p-4">
            <span class="text-sm text-secondary">Peticiones Cloud Functions</span>
            <h3 class="text-2xl font-bold mt-1 text-primary">8.2k / min</h3>
            <span class="text-xs text-secondary">Pico máximo hoy: 12.4k</span>
          </div>
        </div>

        <div class="grid-responsive mt-6">
          <div class="col-8 card p-5">
            <h3 class="text-lg font-semibold mb-4">Carga de Servidores Express</h3>
            <div id="monitoring-chart-container" style="width: 100%; height: 280px;"></div>
          </div>
          <div class="col-4 card p-5">
            <h3 class="text-lg font-semibold mb-4">Servicios Activos</h3>
            <ul style="list-style: none; padding: 0;" class="d-flex flex-column gap-3 text-sm">
              <li class="d-flex justify-content-between"><span>Firebase Auth</span> <span class="text-success">Activo</span></li>
              <li class="d-flex justify-content-between"><span>Cloud Firestore</span> <span class="text-success">Activo</span></li>
              <li class="d-flex justify-content-between"><span>Cloud Storage</span> <span class="text-success">Activo</span></li>
              <li class="d-flex justify-content-between"><span>Service Worker Cache</span> <span class="text-success">Online</span></li>
            </ul>
          </div>
        </div>
      `
    });

    this.chart = new Chart({
      type: 'line',
      labels: ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00'],
      datasets: [
        { label: 'Carga (%)', data: [8, 12, 15, 22, 19, 14, 10], color: '#34d399' }
      ]
    });
  }

  mount() {
    const el = this.layout.mount();
    const chartContainer = el.querySelector('#monitoring-chart-container');
    if (chartContainer) {
      chartContainer.appendChild(this.chart.mount());
    }
    return el;
  }

  unmount() {
    this.chart.unmount();
    this.layout.unmount();
    super.unmount();
  }
}