import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Chart } from '../../../components/data/chart.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';

export class ProjectionsView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || '';
    this.listeners = [];
    this.state = { orders: [], expenses: [] };

    // Demo projection data
    const demoMonths = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const demoReal   = [18000, 21000, 19500, 24000, 22000, 27000, 29000, 0, 0, 0, 0, 0];
    const demoProj   = [0, 0, 0, 0, 0, 0, 29000, 31000, 33500, 36000, 39000, 42000];

    this.chart = new Chart({
      type: 'line',
      labels: demoMonths,
      datasets: [
        { label: 'Real ($)', data: demoReal, color: '#34d399' },
        { label: 'Proyectado ($)', data: demoProj, color: '#7c75ff' },
      ]
    });

    this.layout = new PageLayout({
      title: 'Proyecciones Financieras',
      subtitle: 'Análisis predictivo basado en el histórico de ventas y tendencias del negocio.',
      contentHTML: `
        <!-- Summary KPIs -->
        <div class="grid-stats animate-fade-in">
          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Promedio Mensual</span>
              <div class="kpi-icon kpi-icon-accent">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              </div>
            </div>
            <h3 class="kpi-value" id="proj-monthly-avg">$0.00</h3>
            <span class="kpi-change" style="color: var(--color-text-secondary);" id="proj-avg-label">últimos 30 días</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Proyección 30 días</span>
              <div class="kpi-icon kpi-icon-success">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
              </div>
            </div>
            <h3 class="kpi-value" id="proj-next-30">$0.00</h3>
            <span class="kpi-change kpi-change-up" id="proj-30-label">Con crecimiento estimado del 8%</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Meta Anual Estimada</span>
              <div class="kpi-icon kpi-icon-warning">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
            </div>
            <h3 class="kpi-value" id="proj-annual">$0.00</h3>
            <span class="kpi-change" style="color: var(--color-text-secondary);">Basado en tendencia actual</span>
          </div>
        </div>

        <!-- Projection Chart -->
        <div class="card p-5">
          <div class="d-flex justify-content-between align-items-center mb-5">
            <div>
              <h3 class="text-lg font-semibold">Ventas Históricas vs. Proyección Anual</h3>
              <p class="text-xs text-secondary mt-1">Verde = datos reales · Morado = proyección predictiva</p>
            </div>
          </div>
          <div id="projections-chart" style="width:100%;height:300px;"></div>
        </div>

        <!-- Insights -->
        <div class="card p-5 mt-6">
          <h3 class="text-lg font-semibold mb-4">Insights del Negocio</h3>
          <div class="grid-responsive">
            <div class="col-6">
              <div class="insight-item">
                <div class="insight-icon" style="background: var(--color-success-light); color: var(--color-success);">📈</div>
                <div>
                  <p class="text-sm font-semibold">Mejor día de ventas</p>
                  <p class="text-xs text-secondary" id="insight-best-day">Calculando...</p>
                </div>
              </div>
            </div>
            <div class="col-6">
              <div class="insight-item">
                <div class="insight-icon" style="background: var(--color-warning-light); color: var(--color-warning);">⚠️</div>
                <div>
                  <p class="text-sm font-semibold">Día con menor actividad</p>
                  <p class="text-xs text-secondary" id="insight-low-day">Calculando...</p>
                </div>
              </div>
            </div>
            <div class="col-6">
              <div class="insight-item">
                <div class="insight-icon" style="background: var(--color-accent-light); color: var(--color-accent);">🎯</div>
                <div>
                  <p class="text-sm font-semibold">Tasa de crecimiento estimada</p>
                  <p class="text-xs text-secondary">+8% mensual basado en historial</p>
                </div>
              </div>
            </div>
            <div class="col-6">
              <div class="insight-item">
                <div class="insight-icon" style="background: var(--color-info-light); color: var(--color-info);">💡</div>
                <div>
                  <p class="text-sm font-semibold">Recomendación</p>
                  <p class="text-xs text-secondary">Registra pedidos en el sistema para afinar las proyecciones.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      `
    });
  }

  mount() {
    const element = this.layout.mount();

    const chartContainer = element.querySelector('#projections-chart');
    if (chartContainer) {
      chartContainer.appendChild(this.chart.mount());
    }

    this.subscribeData(element);
    return element;
  }

  subscribeData(element) {
    try {
      const ordersL = FirestoreService.listenToTenant('orders', (orders) => {
        this.state.orders = orders || [];
        this.recalcProjections(element);
      });
      this.listeners.push(ordersL);
    } catch(e) {
      console.warn('[ProjectionsView]', e.message);
      this.recalcProjections(element);
    }
  }

  recalcProjections(element) {
    const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v);
    const q = s => element.querySelector(s);

    const completedOrders = this.state.orders.filter(o => o.status === 'COMPLETED');
    const totalRevenue = completedOrders.reduce((s, o) => s + Number(o.total || 0), 0);

    // If no real data, show demo projections
    const monthlyAvg = completedOrders.length > 0 ? totalRevenue : 26500;
    const next30 = Math.round(monthlyAvg * 1.08);
    const annual = Math.round(monthlyAvg * 12 * 1.05);

    if (q('#proj-monthly-avg')) q('#proj-monthly-avg').textContent = fmt(monthlyAvg);
    if (q('#proj-next-30')) q('#proj-next-30').textContent = fmt(next30);
    if (q('#proj-annual')) q('#proj-annual').textContent = fmt(annual);

    // Best / low day analysis
    const dayTotals = { 'Lun': 0, 'Mar': 0, 'Mié': 0, 'Jue': 0, 'Vie': 0, 'Sáb': 0, 'Dom': 0 };
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    completedOrders.forEach(o => {
      const d = dayNames[new Date(o.createdAt || Date.now()).getDay()];
      dayTotals[d] = (dayTotals[d] || 0) + Number(o.total || 0);
    });

    const entries = Object.entries(dayTotals).filter(([, v]) => v > 0);
    if (entries.length > 0) {
      const best = entries.reduce((a, b) => b[1] > a[1] ? b : a);
      const low = entries.reduce((a, b) => b[1] < a[1] ? b : a);
      if (q('#insight-best-day')) q('#insight-best-day').textContent = `${best[0]} — ${fmt(best[1])} promedio`;
      if (q('#insight-low-day')) q('#insight-low-day').textContent = `${low[0]} — ${fmt(low[1])} promedio`;
    } else {
      if (q('#insight-best-day')) q('#insight-best-day').textContent = 'Sábados (estimado de mercado)';
      if (q('#insight-low-day')) q('#insight-low-day').textContent = 'Martes (estimado de mercado)';
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