import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Chart } from '../../../components/data/chart.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { TimeService } from '../../../services/time.service.js';

export class ProjectionsView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || '';
    this.listeners = [];
    this.state = { sales: [] };

    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    this.chart = new Chart({
      type: 'line',
      labels: months,
      datasets: [
        { label: 'Real ($)', data: Array(12).fill(0), color: '#34d399' },
        { label: 'Proyectado ($)', data: Array(12).fill(0), color: '#7c75ff' },
      ]
    });

    this.layout = new PageLayout({
      title: 'Proyecciones Financieras',
      subtitle: 'Análisis predictivo basado en el histórico de ventas reales y tendencias del negocio.',
      contentHTML: `
        <!-- Summary KPIs -->
        <div class="grid-stats animate-fade-in">
          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Promedio Mensual Real</span>
              <div class="kpi-icon kpi-icon-accent">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              </div>
            </div>
            <h3 class="kpi-value" id="proj-monthly-avg">$0.00</h3>
            <span class="kpi-change" style="color: var(--color-text-secondary);" id="proj-avg-label">basado en historial real</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Proyección Próximo Mes</span>
              <div class="kpi-icon kpi-icon-success">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
              </div>
            </div>
            <h3 class="kpi-value" id="proj-next-30">$0.00</h3>
            <span class="kpi-change kpi-change-up" id="proj-30-label">Con crecimiento estimado del 5%</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Meta Anual Estimada</span>
              <div class="kpi-icon kpi-icon-warning">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
            </div>
            <h3 class="kpi-value" id="proj-annual">$0.00</h3>
            <span class="kpi-change" style="color: var(--color-text-secondary);">Basado en tendencia actual real</span>
          </div>
        </div>

        <!-- Projection Chart -->
        <div class="card p-5">
          <div class="d-flex justify-content-between align-items-center mb-5">
            <div>
              <h3 class="text-lg font-semibold">Ventas Históricas vs. Proyección Anual</h3>
              <p class="text-xs text-secondary mt-1">Verde = datos reales · Morado = proyección predictiva real</p>
            </div>
          </div>
          <div id="projections-chart" style="width:100%;height:300px;"></div>
        </div>

        <!-- Insights -->
        <div class="card p-5 mt-6">
          <h3 class="text-lg font-semibold mb-4">Insights del Negocio (Estadísticas Reales)</h3>
          <div class="grid-responsive">
            <div class="col-6">
              <div class="insight-item" style="display: flex; gap: var(--space-3); align-items: center; margin-bottom: var(--space-3);">
                <div class="insight-icon" style="background: var(--color-success-light); color: var(--color-success); padding: 8px 12px; border-radius: var(--radius-md); font-weight:700;">📈</div>
                <div>
                  <p class="text-sm font-semibold" style="margin:0;">Mejor día de ventas</p>
                  <p class="text-xs text-secondary" id="insight-best-day" style="margin:0;">Calculando...</p>
                </div>
              </div>
            </div>
            <div class="col-6">
              <div class="insight-item" style="display: flex; gap: var(--space-3); align-items: center; margin-bottom: var(--space-3);">
                <div class="insight-icon" style="background: var(--color-warning-light); color: var(--color-warning); padding: 8px 12px; border-radius: var(--radius-md); font-weight:700;">⚠️</div>
                <div>
                  <p class="text-sm font-semibold" style="margin:0;">Día con menor actividad</p>
                  <p class="text-xs text-secondary" id="insight-low-day" style="margin:0;">Calculando...</p>
                </div>
              </div>
            </div>
            <div class="col-6">
              <div class="insight-item" style="display: flex; gap: var(--space-3); align-items: center; margin-bottom: var(--space-3);">
                <div class="insight-icon" style="background: var(--color-accent-light); color: var(--color-accent); padding: 8px 12px; border-radius: var(--radius-md); font-weight:700;">🎯</div>
                <div>
                  <p class="text-sm font-semibold" style="margin:0;">Crecimiento proyectado</p>
                  <p class="text-xs text-secondary" style="margin:0;">+5% mensual de factor constante</p>
                </div>
              </div>
            </div>
            <div class="col-6">
              <div class="insight-item" style="display: flex; gap: var(--space-3); align-items: center; margin-bottom: var(--space-3);">
                <div class="insight-icon" style="background: var(--color-info-light); color: var(--color-info); padding: 8px 12px; border-radius: var(--radius-md); font-weight:700;">💡</div>
                <div>
                  <p class="text-sm font-semibold" style="margin:0;">Recomendación</p>
                  <p class="text-xs text-secondary" style="margin:0;">Sigue registrando transacciones para refinar las predicciones predictivas.</p>
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
      const salesL = FirestoreService.listenToTenant('ventas', (sales) => {
        this.state.sales = sales || [];
        this.recalcProjections(element);
      });
      this.listeners.push(salesL);
    } catch(e) {
      console.warn('[ProjectionsView] Listening error:', e.message);
      this.recalcProjections(element);
    }
  }

  recalcProjections(element) {
    const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v);
    const q = s => element.querySelector(s);

    const sales = this.state.sales;
    const currentMonth = new Date().getMonth();

    // Group real sales by month of the current year
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const currentYear = new Date().getFullYear();
    const realRevenue = Array(12).fill(0);
    const projectedRevenue = Array(12).fill(0);

    sales.forEach(sale => {
      const d = new Date(sale.date || sale.createdAt);
      if (d.getFullYear() === currentYear) {
        const m = d.getMonth();
        realRevenue[m] += Number(sale.total || 0);
      }
    });

    // Calculate monthly average for months with sales
    const monthsWithSales = [];
    realRevenue.forEach((val, mIdx) => {
      // Consider months up to current month that have transactions
      if (mIdx <= currentMonth && val > 0) {
        monthsWithSales.push(val);
      }
    });

    const monthlyAvg = monthsWithSales.length > 0
      ? monthsWithSales.reduce((a, b) => a + b, 0) / monthsWithSales.length
      : 0;

    const next30 = monthlyAvg > 0 ? monthlyAvg * 1.05 : 0;
    const annual = monthlyAvg > 0 ? monthlyAvg * 12 * 1.03 : 0;

    if (q('#proj-monthly-avg')) q('#proj-monthly-avg').textContent = fmt(monthlyAvg);
    if (q('#proj-next-30')) q('#proj-next-30').textContent = fmt(next30);
    if (q('#proj-annual')) q('#proj-annual').textContent = fmt(annual);

    // Compute projections for future months
    realRevenue.forEach((val, mIdx) => {
      if (mIdx <= currentMonth) {
        // If it's a past/current month, show real value (or 0 if none)
        // Project only for future months, or if current month has no data yet
        projectedRevenue[mIdx] = 0; 
      } else {
        // Future months projection with a simple 5% compounded growth factor
        const monthDiff = mIdx - currentMonth;
        projectedRevenue[mIdx] = monthlyAvg > 0 
          ? Math.round(monthlyAvg * Math.pow(1.02, monthDiff)) 
          : 0;
      }
    });

    // Best / low day analysis
    const dayTotals = { 'Lun': 0, 'Mar': 0, 'Mié': 0, 'Jue': 0, 'Vie': 0, 'Sáb': 0, 'Dom': 0 };
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    sales.forEach(o => {
      const d = dayNames[new Date(o.date || o.createdAt).getDay()];
      dayTotals[d] = (dayTotals[d] || 0) + Number(o.total || 0);
    });

    const entries = Object.entries(dayTotals).filter(([, v]) => v > 0);
    if (entries.length > 0) {
      const best = entries.reduce((a, b) => b[1] > a[1] ? b : a);
      const low = entries.reduce((a, b) => b[1] < a[1] ? b : a);
      if (q('#insight-best-day')) q('#insight-best-day').textContent = `${best[0]} — Total: ${fmt(best[1])}`;
      if (q('#insight-low-day')) q('#insight-low-day').textContent = `${low[0]} — Total: ${fmt(low[1])}`;
    } else {
      if (q('#insight-best-day')) q('#insight-best-day').textContent = 'Sin transacciones aún';
      if (q('#insight-low-day')) q('#insight-low-day').textContent = 'Sin transacciones aún';
    }

    // Update charts dataset
    this.chart.updateData(
      months,
      [
        { label: 'Real ($)', data: realRevenue, color: '#34d399' },
        { label: 'Proyectado ($)', data: projectedRevenue, color: '#7c75ff' },
      ]
    );
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.chart.unmount();
    this.layout.unmount();
    super.unmount();
  }
}