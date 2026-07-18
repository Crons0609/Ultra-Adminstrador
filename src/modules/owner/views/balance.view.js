import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { TimeService } from '../../../services/time.service.js';

export class BalanceView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || '';
    this.listeners = [];
    this.state = { orders: [], expenses: [] };

    this.layout = new PageLayout({
      title: 'Balance General',
      subtitle: 'Estado financiero integral del negocio — ingresos, egresos y posición neta.',
      actionHTML: `
        <span class="header-status-chip">
          <span class="status-dot status-dot-success"></span>
          Tiempo Real
        </span>
      `,
      contentHTML: `
        <!-- Summary Row -->
        <div class="grid-stats animate-fade-in">
          <div class="kpi-card hover-lift" style="border-top: 3px solid var(--color-success);">
            <div class="kpi-card-header">
              <span class="kpi-label">Total Ingresos</span>
              <div class="kpi-icon kpi-icon-success">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              </div>
            </div>
            <h3 class="kpi-value" id="bal-total-income">$0.00</h3>
            <span class="kpi-change kpi-change-up" id="bal-income-count">0 ventas completadas</span>
          </div>

          <div class="kpi-card hover-lift" style="border-top: 3px solid var(--color-danger);">
            <div class="kpi-card-header">
              <span class="kpi-label">Total Egresos</span>
              <div class="kpi-icon kpi-icon-danger">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
              </div>
            </div>
            <h3 class="kpi-value" id="bal-total-expenses">$0.00</h3>
            <span class="kpi-change kpi-change-down" id="bal-expense-count">0 salidas registradas</span>
          </div>

          <div class="kpi-card hover-lift" id="bal-net-card">
            <div class="kpi-card-header">
              <span class="kpi-label">Posición Neta</span>
              <div class="kpi-icon kpi-icon-accent" id="bal-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </div>
            </div>
            <h3 class="kpi-value" id="bal-net">$0.00</h3>
            <span class="kpi-change" id="bal-margin">Margen neto: 0%</span>
          </div>
        </div>

        <!-- Breakdown Tables Side by Side -->
        <div class="grid-responsive">
          <div class="col-6">
            <div class="card p-5">
              <h3 class="text-lg font-semibold mb-4" style="color: var(--color-success);">📈 Ingresos por Día</h3>
              <div id="income-breakdown" class="d-flex flex-column gap-2">
                <p class="text-xs text-secondary text-center py-4">Cargando datos...</p>
              </div>
            </div>
          </div>
          <div class="col-6">
            <div class="card p-5">
              <h3 class="text-lg font-semibold mb-4" style="color: var(--color-danger);">📉 Egresos por Categoría</h3>
              <div id="expense-breakdown" class="d-flex flex-column gap-2">
                <p class="text-xs text-secondary text-center py-4">Cargando datos...</p>
              </div>
            </div>
          </div>
        </div>
      `
    });
  }

  mount() {
    const element = this.layout.mount();
    this.subscribeData(element);
    return element;
  }

  subscribeData(element) {
    try {
      const ordersL = FirestoreService.listenToTenant('orders', (orders) => {
        this.state.orders = orders || [];
        this.recalc(element);
      });
      this.listeners.push(ordersL);

      const expL = FirestoreService.listenToTenant('expenses', (expenses) => {
        this.state.expenses = expenses || [];
        this.recalc(element);
      });
      this.listeners.push(expL);
    } catch(e) {
      console.warn('[BalanceView]', e.message);
    }
  }

  recalc(element) {
    const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v);
    const q = s => element.querySelector(s);

    const completedOrders = this.state.orders.filter(o => o.status === 'COMPLETED');
    const totalIncome = completedOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const totalExpenses = this.state.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const net = totalIncome - totalExpenses;
    const margin = totalIncome > 0 ? Math.round((net / totalIncome) * 100) : 0;

    if (q('#bal-total-income')) q('#bal-total-income').textContent = fmt(totalIncome);
    if (q('#bal-income-count')) q('#bal-income-count').textContent = `${completedOrders.length} venta${completedOrders.length !== 1 ? 's' : ''} completada${completedOrders.length !== 1 ? 's' : ''}`;
    if (q('#bal-total-expenses')) q('#bal-total-expenses').textContent = fmt(totalExpenses);
    if (q('#bal-expense-count')) q('#bal-expense-count').textContent = `${this.state.expenses.length} salida${this.state.expenses.length !== 1 ? 's' : ''} registrada${this.state.expenses.length !== 1 ? 's' : ''}`;
    if (q('#bal-net')) {
      q('#bal-net').textContent = fmt(net);
      q('#bal-net').style.color = net >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
    }
    if (q('#bal-margin')) q('#bal-margin').textContent = `Margen neto: ${margin}%`;

    // Income by day
    const dayMap = {};
    completedOrders.forEach(o => {
      const day = TimeService.dateFormatter({ weekday: 'short', month: 'short', day: 'numeric' }).format(TimeService.toDate(o.createdAt || Date.now()));
      dayMap[day] = (dayMap[day] || 0) + Number(o.total || 0);
    });
    const incomeEl = q('#income-breakdown');
    if (incomeEl) {
      const entries = Object.entries(dayMap).slice(-7);
      incomeEl.innerHTML = entries.length > 0 ? entries.map(([day, val]) => `
        <div class="d-flex justify-content-between align-items-center" style="padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border);">
          <span class="text-sm">${day}</span>
          <strong style="color: var(--color-success);">${fmt(val)}</strong>
        </div>
      `).join('') : `<p class="text-xs text-secondary text-center py-4">Sin ventas registradas.</p>`;
    }

    // Expenses by category
    const catMap = {};
    this.state.expenses.forEach(e => {
      const cat = e.category || 'Otros';
      catMap[cat] = (catMap[cat] || 0) + Number(e.amount || 0);
    });
    const expEl = q('#expense-breakdown');
    if (expEl) {
      const entries = Object.entries(catMap);
      expEl.innerHTML = entries.length > 0 ? entries.map(([cat, val]) => `
        <div class="d-flex justify-content-between align-items-center" style="padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border);">
          <span class="text-sm">${cat}</span>
          <strong style="color: var(--color-danger);">${fmt(val)}</strong>
        </div>
      `).join('') : `<p class="text-xs text-secondary text-center py-4">Sin egresos registrados.</p>`;
    }
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.layout.unmount();
    super.unmount();
  }
}
