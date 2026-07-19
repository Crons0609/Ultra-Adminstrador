import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Chart } from '../../../components/data/chart.js';
import { FirestoreService } from '../../../services/firestore.service.js';

export class KitchenStatsView extends Component {
  constructor(params = {}) {
    super(params);
    this.state = { orders: [] };

    this.chart = new Chart({
      type: 'bar',
      labels: [],
      datasets: [{ label: 'Platos preparados', data: [], color: '#fb923c' }]
    });

    this.layout = new PageLayout({
      title: 'Estadísticas de Cocina',
      subtitle: 'Rendimiento del área, tiempo promedio de preparación y platos más demandados.',
      contentHTML: `
        <style>
          .kitchen-kpis { display: grid; grid-template-columns: repeat(auto-fit,minmax(200px,1fr)); gap:var(--space-4); margin-bottom:var(--space-6); }
          .kitchen-kpi { background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:var(--radius-lg); padding:var(--space-5); border-top:4px solid #fb923c; }
          .kitchen-kpi-val { font-size:1.8rem; font-weight:800; color:#fb923c; }
          .kitchen-kpi-label { font-size:0.8rem; color:var(--color-text-secondary); margin-top:4px; }
        </style>

        <div class="kitchen-kpis animate-fade-in">
          <div class="kitchen-kpi">
            <div class="kitchen-kpi-val" id="ks-total-orders">0</div>
            <div class="kitchen-kpi-label">Comandas Completadas Hoy</div>
          </div>
          <div class="kitchen-kpi" style="border-top-color:var(--color-accent);">
            <div class="kitchen-kpi-val" style="color:var(--color-accent);" id="ks-avg-time">—</div>
            <div class="kitchen-kpi-label">Tiempo Promedio de Preparación</div>
          </div>
          <div class="kitchen-kpi" style="border-top-color:var(--color-success);">
            <div class="kitchen-kpi-val" style="color:var(--color-success);" id="ks-efficiency">0%</div>
            <div class="kitchen-kpi-label">Comandas en tiempo (&lt; 15 min)</div>
          </div>
          <div class="kitchen-kpi" style="border-top-color:var(--color-warning);">
            <div class="kitchen-kpi-val" style="color:var(--color-warning);" id="ks-pending">0</div>
            <div class="kitchen-kpi-label">En Preparación Ahora</div>
          </div>
        </div>

        <div class="grid-responsive">
          <div class="col-8">
            <div class="card p-5">
              <h3 class="text-lg font-semibold mb-4">Platos Más Pedidos (Hoy)</h3>
              <div id="kitchen-chart-container" style="width:100%;height:260px;"></div>
            </div>
          </div>
          <div class="col-4">
            <div class="card p-5">
              <h3 class="text-lg font-semibold mb-4">Top 5 Platos</h3>
              <div id="kitchen-top-list" class="d-flex flex-column gap-2">
                <p class="text-xs text-secondary py-4 text-center">Sin datos disponibles aún.</p>
              </div>
            </div>
          </div>
        </div>
      `
    });
    this.listeners = [];
  }

  mount() {
    const element = this.layout.mount();
    const chartContainer = element.querySelector('#kitchen-chart-container');
    if (chartContainer) chartContainer.appendChild(this.chart.mount());

    try {
      const listener = FirestoreService.listenToTenant('orders', (orders) => {
        this.state.orders = orders || [];
        this.updateStats(element);
      });
      this.listeners.push(listener);
    } catch (e) { console.error(e); }

    return element;
  }

  updateStats(element) {
    const q = sel => element.querySelector(sel);
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const ts = todayStart.getTime();

    const allToday = this.state.orders.filter(o => (o.createdAt || 0) >= ts);
    const completed = allToday.filter(o => o.status === 'COMPLETED' || o.status === 'READY');
    const pending = allToday.filter(o => o.status === 'EN_COCINA' || o.status === 'PENDIENTE');

    // Compute average time (completed orders)
    let avgMins = '—';
    const withTimes = completed.filter(o => o.readyAt && o.createdAt);
    if (withTimes.length > 0) {
      const totalMs = withTimes.reduce((sum, o) => sum + (o.readyAt - o.createdAt), 0);
      avgMins = `${Math.round(totalMs / withTimes.length / 60000)} min`;
    }

    // Efficiency (under 15 min)
    const onTime = withTimes.filter(o => (o.readyAt - o.createdAt) < 15 * 60 * 1000).length;
    const eff = withTimes.length > 0 ? Math.round((onTime / withTimes.length) * 100) : 0;

    // Top dishes
    const freq = {};
    allToday.forEach(o => {
      (o.items || []).forEach(item => {
        freq[item.name] = (freq[item.name] || 0) + (item.qty || 1);
      });
    });
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (q('#ks-total-orders')) q('#ks-total-orders').textContent = completed.length;
    if (q('#ks-avg-time')) q('#ks-avg-time').textContent = avgMins;
    if (q('#ks-efficiency')) q('#ks-efficiency').textContent = `${eff}%`;
    if (q('#ks-pending')) q('#ks-pending').textContent = pending.length;

    // Update chart
    if (sorted.length > 0) {
      this.chart.updateData(
        sorted.map(([name]) => name),
        [{ label: 'Platos preparados', data: sorted.map(([, c]) => c), color: '#fb923c' }]
      );

      const topList = q('#kitchen-top-list');
      if (topList) {
        const colors = ['#fb923c', '#f59e0b', '#34d399', '#60a5fa', '#a78bfa'];
        topList.innerHTML = sorted.map(([name, count], i) => `
          <div class="d-flex justify-content-between align-items-center py-2" style="border-bottom:1px solid var(--color-border);">
            <span class="text-sm">
              <span style="width:18px;height:18px;border-radius:50%;background:${colors[i]};display:inline-block;margin-right:8px;vertical-align:middle;"></span>
              ${name}
            </span>
            <strong style="color:${colors[i]};">${count}</strong>
          </div>
        `).join('');
      }
    }
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.chart.unmount();
    this.layout.unmount();
    super.unmount();
  }
}