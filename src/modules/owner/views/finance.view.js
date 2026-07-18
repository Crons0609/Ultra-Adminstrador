import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Chart } from '../../../components/data/chart.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';

export class FinanceView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || 'company-test';

    this.listeners = [];
    this.state = {
      orders: [],
      expenses: []
    };

    // Instantiate premium canvas chart for weekly financial performance
    this.chart = new Chart({
      type: 'bar',
      labels: ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'],
      datasets: [
        { label: 'Ingresos ($)', data: [0, 0, 0, 0, 0, 0, 0], color: '#34d399' },
        { label: 'Egresos ($)', data: [0, 0, 0, 0, 0, 0, 0], color: '#f87171' }
      ]
    });

    this.layout = new PageLayout({
      title: 'Control Financiero',
      subtitle: 'Administración de ingresos, egresos y utilidad neta en tiempo real.',
      actionHTML: `
        <span class="badge" id="fin-sync-badge" style="font-size: 0.75rem; padding: 4px 10px; border: 1px solid var(--color-border); display: flex; align-items: center; gap: 4px;">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: #34d399; display: inline-block;"></span>
          Sincronizado con Firebase
        </span>
      `,
      contentHTML: `
        <!-- Financial cards grid -->
        <div class="grid-stats">
          <div class="card p-4 hover-lift">
            <div class="d-flex justify-content-between align-items-start">
              <span class="text-sm text-secondary">Ingresos Totales</span>
              <span style="font-size: 1.2rem; color: var(--color-success);">📈</span>
            </div>
            <h3 class="text-2xl font-bold mt-1 text-primary" id="val-total-income">$0.00</h3>
            <span class="text-xs text-secondary">Ventas de órdenes completadas</span>
          </div>

          <div class="card p-4 hover-lift">
            <div class="d-flex justify-content-between align-items-start">
              <span class="text-sm text-secondary">Gastos Registrados</span>
              <span style="font-size: 1.2rem; color: var(--color-danger);">📉</span>
            </div>
            <h3 class="text-2xl font-bold mt-1 text-primary" id="val-total-expenses">$0.00</h3>
            <span class="text-xs text-secondary" id="val-expenses-count">0 transacciones registradas</span>
          </div>

          <div class="card p-4 hover-lift">
            <div class="d-flex justify-content-between align-items-start">
              <span class="text-sm text-secondary">Utilidad Neta (Balance)</span>
              <span style="font-size: 1.2rem;" id="val-profit-icon">⚖️</span>
            </div>
            <h3 class="text-2xl font-bold mt-1 text-primary" id="val-net-profit">$0.00</h3>
            <span class="text-xs text-secondary" id="val-profit-margin">Margen neto: 0%</span>
          </div>
        </div>

        <!-- Weekly summary and recent transaction feed -->
        <div class="grid-responsive mt-6">
          <div class="col-8 card p-5">
            <h3 class="text-lg font-semibold mb-4">Flujo de Caja Semanal</h3>
            <div id="fin-weekly-chart" style="width: 100%; height: 280px;"></div>
          </div>

          <div class="col-4 card p-5">
            <h3 class="text-lg font-semibold mb-4">Movimientos Recientes</h3>
            <div style="max-height: 280px; overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-3);" id="fin-movements-list">
              <p class="text-xs text-secondary text-center py-4">Esperando transacciones de la nube...</p>
            </div>
          </div>
        </div>
      `
    });
  }

  mount() {
    const element = this.layout.mount();

    // Inject weekly flow chart
    const chartContainer = element.querySelector('#fin-weekly-chart');
    if (chartContainer) {
      chartContainer.appendChild(this.chart.mount());
    }

    this.subscribeToFinancialData(element);

    return element;
  }

  subscribeToFinancialData(element) {
    try {
      // Listen to completed orders
      const ordersListener = FirestoreService.listenToTenant('orders', (orders) => {
        this.state.orders = orders || [];
        this.recalculate(element);
      });
      this.listeners.push(ordersListener);

      // Listen to expenses
      const expensesListener = FirestoreService.listenToTenant('expenses', (expenses) => {
        this.state.expenses = expenses || [];
        this.recalculate(element);
      });
      this.listeners.push(expensesListener);

    } catch (e) {
      console.warn('[FinanceView] RTDB listening error:', e.message);
    }
  }

  recalculate(element) {
    const orders = this.state.orders;
    const expenses = this.state.expenses;

    // 1. Calculate Income (Completed orders total)
    const incomeTotal = orders
      .filter(o => o.status === 'COMPLETED')
      .reduce((sum, o) => sum + Number(o.total || 0), 0);

    // 2. Calculate Expenses
    const expensesTotal = expenses
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    // 3. Calculate Net Profit
    const netProfit = incomeTotal - expensesTotal;
    const margin = incomeTotal > 0 ? Math.round((netProfit / incomeTotal) * 100) : 0;

    // Update DOM fields
    const incomeEl = element.querySelector('#val-total-income');
    if (incomeEl) {
      incomeEl.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(incomeTotal);
    }

    const expensesEl = element.querySelector('#val-total-expenses');
    if (expensesEl) {
      expensesEl.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(expensesTotal);
    }
    const expensesCountEl = element.querySelector('#val-expenses-count');
    if (expensesCountEl) {
      expensesCountEl.textContent = `${expenses.length} salida${expenses.length !== 1 ? 's' : ''} de caja registrada${expenses.length !== 1 ? 's' : ''}`;
    }

    const profitEl = element.querySelector('#val-net-profit');
    const profitIconEl = element.querySelector('#val-profit-icon');
    const profitMarginEl = element.querySelector('#val-profit-margin');
    if (profitEl) {
      profitEl.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(netProfit);
      if (netProfit < 0) {
        profitEl.style.color = 'var(--color-danger, #f87171)';
        if (profitIconEl) profitIconEl.textContent = '📉';
      } else {
        profitEl.style.color = 'var(--color-success, #34d399)';
        if (profitIconEl) profitIconEl.textContent = '📈';
      }
    }
    if (profitMarginEl) {
      profitMarginEl.textContent = `Margen neto: ${margin}%`;
    }

    // 4. Populate recent movements list (Combine orders and expenses)
    const movements = [];
    orders.filter(o => o.status === 'COMPLETED').forEach(o => {
      movements.push({
        type: 'INCOME',
        concept: `Venta Orden #${o.id.slice(-4).toUpperCase()}`,
        amount: Number(o.total || 0),
        time: new Date(o.createdAt || Date.now())
      });
    });

    expenses.forEach(e => {
      movements.push({
        type: 'EXPENSE',
        concept: e.concept || 'Gasto Operativo',
        amount: Number(e.amount || 0),
        time: new Date(e.date || Date.now())
      });
    });

    // Sort descending by time
    movements.sort((a, b) => b.time - a.time);

    const movementsListEl = element.querySelector('#fin-movements-list');
    if (movementsListEl) {
      if (movements.length > 0) {
        movementsListEl.innerHTML = movements.slice(0, 7).map(m => `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) var(--space-3); background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: 0.8rem;">
            <div style="display: flex; flex-direction: column;">
              <span class="font-medium text-primary">${m.concept}</span>
              <span class="text-xs text-secondary" style="font-size: 0.65rem;">${m.time.toLocaleDateString()} ${m.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <span style="font-weight: 700; color: ${m.type === 'INCOME' ? 'var(--color-success)' : 'var(--color-danger)'};">
              ${m.type === 'INCOME' ? '+' : '-'}${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(m.amount)}
            </span>
          </div>
        `).join('');
      } else {
        movementsListEl.innerHTML = `<p class="text-xs text-secondary text-center py-4">No hay movimientos comerciales registrados.</p>`;
      }
    }

    // 5. Update flow chart weekly data
    const weeklyIncome = [0, 0, 0, 0, 0, 0, 0];
    const weeklyExpenses = [0, 0, 0, 0, 0, 0, 0];

    orders.filter(o => o.status === 'COMPLETED').forEach(o => {
      const orderDate = new Date(o.createdAt || Date.now());
      let dayIdx = orderDate.getDay() - 1;
      if (dayIdx < 0) dayIdx = 6;
      weeklyIncome[dayIdx] += Number(o.total || 0);
    });

    expenses.forEach(e => {
      const expDate = new Date(e.date || Date.now());
      let dayIdx = expDate.getDay() - 1;
      if (dayIdx < 0) dayIdx = 6;
      weeklyExpenses[dayIdx] += Number(e.amount || 0);
    });

    this.chart.updateData(
      ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'],
      [
        { label: 'Ingresos ($)', data: weeklyIncome, color: '#34d399' },
        { label: 'Egresos ($)', data: weeklyExpenses, color: '#f87171' }
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