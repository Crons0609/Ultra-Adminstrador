/**
 * @file finance.view.js
 * @description Vista de Control Financiero para el dueño.
 * Conectada en tiempo real a la colección `ventas` y `expenses` de Firebase.
 * Incluye:
 *  - KPIs de ingresos, gastos y utilidad neta
 *  - Historial detallado de ítems vendidos (nombre, qty, precio, total, hora, método de pago)
 *  - Botón de purga de ventas del día con doble confirmación de seguridad
 *  - Gráfico multi-período (Diario, Semanal, Mensual, Trimestral, Anual)
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Chart } from '../../../components/data/chart.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { Modal } from '../../../components/ui/modal.js';

export class FinanceView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || 'company-test';

    this.listeners = [];
    this.state = {
      ventas: [],
      expenses: [],
      activePeriod: 'weekly' // 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'
    };

    this.chart = new Chart({
      type: 'bar',
      labels: ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'],
      datasets: [
        { label: 'Ingresos ($)', data: [0, 0, 0, 0, 0, 0, 0], color: '#34d399' },
        { label: 'Egresos ($)',  data: [0, 0, 0, 0, 0, 0, 0], color: '#f87171' }
      ]
    });

    this.layout = new PageLayout({
      title: 'Control Financiero',
      subtitle: 'Administración de ingresos, egresos y utilidad neta en tiempo real.',
      actionHTML: `
        <button class="btn btn-danger btn-sm" id="btn-purge-sales" style="display:flex;align-items:center;gap:6px;">
          ⚠️ Purgar Ventas del Día
        </button>
        <span class="badge" id="fin-sync-badge" style="font-size: 0.75rem; padding: 4px 10px; border: 1px solid var(--color-border); display: flex; align-items: center; gap: 4px;">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: #34d399; display: inline-block;"></span>
          Sincronizado con Firebase
        </span>
      `,
      contentHTML: `
        <!-- Financial KPI cards -->
        <div class="grid-stats">
          <div class="card p-4 hover-lift">
            <div class="d-flex justify-content-between align-items-start">
              <span class="text-sm text-secondary">Ingresos Totales</span>
              <span style="font-size: 1.2rem; color: var(--color-success);">📈</span>
            </div>
            <h3 class="text-2xl font-bold mt-1 text-primary" id="val-total-income">$0.00</h3>
            <span class="text-xs text-secondary">Ventas registradas en la base de datos</span>
          </div>

          <div class="card p-4 hover-lift">
            <div class="d-flex justify-content-between align-items-start">
              <span class="text-sm text-secondary">Gastos Registrados</span>
              <span style="font-size: 1.2rem; color: var(--color-danger);">📉</span>
            </div>
            <h3 class="text-2xl font-bold mt-1 text-primary" id="val-total-expenses">$0.00</h3>
            <span class="text-xs text-secondary" id="val-expenses-count">0 salidas de caja registradas</span>
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

        <!-- Multi-period chart -->
        <div class="card p-5 mt-6">
          <div class="d-flex justify-content-between align-items-center mb-4" style="flex-wrap:wrap;gap:var(--space-3);">
            <h3 class="text-lg font-semibold">Flujo de Caja</h3>
            <div class="d-flex gap-2" id="period-tabs" style="flex-wrap:wrap;">
              ${[
                ['daily',     'Diario'],
                ['weekly',    'Semanal'],
                ['monthly',   'Mensual'],
                ['quarterly', 'Trimestral'],
                ['annual',    'Anual']
              ].map(([val, label]) => `
                <button class="btn btn-sm period-tab ${val === 'weekly' ? 'btn-primary' : 'btn-secondary'}"
                        data-period="${val}" style="font-size:0.78rem;padding:4px 12px;">${label}</button>
              `).join('')}
            </div>
          </div>
          <div id="fin-weekly-chart" style="width: 100%; height: 280px;"></div>
        </div>

        <!-- Detailed sold items list -->
        <div class="card p-5 mt-6">
          <div class="d-flex justify-content-between align-items-center mb-4">
            <h3 class="text-lg font-semibold">Historial Detallado de Ventas</h3>
            <span class="text-xs text-secondary" id="sales-list-count">0 transacciones</span>
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.82rem;" id="sales-detail-table">
              <thead>
                <tr style="border-bottom:1px solid var(--color-border);">
                  <th style="text-align:left;padding:8px 12px;color:var(--color-text-secondary);font-weight:600;font-size:0.75rem;">Producto</th>
                  <th style="text-align:center;padding:8px 12px;color:var(--color-text-secondary);font-weight:600;font-size:0.75rem;">Cant.</th>
                  <th style="text-align:right;padding:8px 12px;color:var(--color-text-secondary);font-weight:600;font-size:0.75rem;">P. Unit.</th>
                  <th style="text-align:right;padding:8px 12px;color:var(--color-text-secondary);font-weight:600;font-size:0.75rem;">Total</th>
                  <th style="text-align:center;padding:8px 12px;color:var(--color-text-secondary);font-weight:600;font-size:0.75rem;">Hora</th>
                  <th style="text-align:center;padding:8px 12px;color:var(--color-text-secondary);font-weight:600;font-size:0.75rem;">Método de Pago</th>
                </tr>
              </thead>
              <tbody id="sales-detail-body">
                <tr><td colspan="6" style="text-align:center;padding:24px;color:var(--color-text-secondary);">Esperando transacciones...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      `
    });
  }

  mount() {
    const element = this.layout.mount();

    // Inject chart
    const chartContainer = element.querySelector('#fin-weekly-chart');
    if (chartContainer) {
      chartContainer.appendChild(this.chart.mount());
    }

    // Bind period tabs
    element.querySelector('#period-tabs')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.period-tab');
      if (!btn) return;
      const period = btn.getAttribute('data-period');
      this.state.activePeriod = period;
      element.querySelectorAll('.period-tab').forEach(b => {
        b.classList.toggle('btn-primary', b === btn);
        b.classList.toggle('btn-secondary', b !== btn);
      });
      this.recalculate(element);
    });

    // Bind purge button
    element.querySelector('#btn-purge-sales')?.addEventListener('click', () => {
      this.confirmAndPurgeDailySales();
    });

    this.subscribeToFinancialData(element);
    return element;
  }

  subscribeToFinancialData(element) {
    try {
      // Listen to ventas (completed sales) instead of raw orders
      const ventasListener = FirestoreService.listenToTenant('ventas', (ventas) => {
        this.state.ventas = ventas || [];
        this.recalculate(element);
      });
      this.listeners.push(ventasListener);

      const expensesListener = FirestoreService.listenToTenant('expenses', (expenses) => {
        this.state.expenses = expenses || [];
        this.recalculate(element);
      });
      this.listeners.push(expensesListener);
    } catch (e) {
      console.warn('[FinanceView] Listening error:', e.message);
    }
  }

  recalculate(element) {
    const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v);
    const q   = s => element.querySelector(s);

    const ventas   = this.state.ventas;
    const expenses = this.state.expenses;

    // ── KPIs ─────────────────────────────────────────────────────────────────
    const incomeTotal   = ventas.reduce((s, v) => s + Number(v.total || 0), 0);
    const expensesTotal = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const netProfit     = incomeTotal - expensesTotal;
    const margin        = incomeTotal > 0 ? Math.round((netProfit / incomeTotal) * 100) : 0;

    if (q('#val-total-income'))   q('#val-total-income').textContent   = fmt(incomeTotal);
    if (q('#val-total-expenses')) q('#val-total-expenses').textContent = fmt(expensesTotal);
    if (q('#val-expenses-count')) q('#val-expenses-count').textContent  = `${expenses.length} salida${expenses.length !== 1 ? 's' : ''} de caja registrada${expenses.length !== 1 ? 's' : ''}`;
    if (q('#val-net-profit')) {
      q('#val-net-profit').textContent = fmt(netProfit);
      q('#val-net-profit').style.color = netProfit < 0 ? 'var(--color-danger)' : 'var(--color-success)';
    }
    if (q('#val-profit-icon'))   q('#val-profit-icon').textContent   = netProfit < 0 ? '📉' : '📈';
    if (q('#val-profit-margin')) q('#val-profit-margin').textContent = `Margen neto: ${margin}%`;

    // ── Detailed sales list ───────────────────────────────────────────────────
    this.renderSalesList(element, ventas);

    // ── Multi-period chart ────────────────────────────────────────────────────
    this.renderChart(ventas, expenses);
  }

  renderSalesList(element, ventas) {
    const fmt = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v);
    const body = element.querySelector('#sales-detail-body');
    const countEl = element.querySelector('#sales-list-count');

    // Expand each venta into individual line items for detail view
    const rows = [];
    ventas.forEach(v => {
      const d    = new Date(v.date || v.createdAt || Date.now());
      const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      const pago = this.formatPaymentMethod(v.paymentMethod);

      if (Array.isArray(v.items) && v.items.length > 0) {
        v.items.forEach(item => {
          rows.push({
            name:   item.name || '—',
            qty:    item.qty || 1,
            price:  Number(item.price || 0),
            total:  Number(item.total || (item.price * item.qty) || 0),
            hora,
            pago,
            ts: d.getTime()
          });
        });
      } else {
        // Venta sin items desglosados (e.g. cobro global)
        rows.push({
          name:   'Venta General',
          qty:    1,
          price:  Number(v.total || 0),
          total:  Number(v.total || 0),
          hora,
          pago,
          ts: d.getTime()
        });
      }
    });

    // Sort newest first
    rows.sort((a, b) => b.ts - a.ts);

    if (countEl) countEl.textContent = `${rows.length} ítems vendidos`;

    if (!body) return;

    if (rows.length === 0) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--color-text-secondary);">No hay ventas registradas aún.</td></tr>`;
      return;
    }

    body.innerHTML = rows.map((r, i) => `
      <tr style="border-bottom:1px solid var(--color-border); background:${i % 2 === 0 ? 'transparent' : 'var(--color-bg-secondary)'};">
        <td style="padding:8px 12px; font-weight:500;">${r.name}</td>
        <td style="padding:8px 12px; text-align:center;">${r.qty}</td>
        <td style="padding:8px 12px; text-align:right; color:var(--color-text-secondary);">${fmt(r.price)}</td>
        <td style="padding:8px 12px; text-align:right; font-weight:700; color:var(--color-success);">${fmt(r.total)}</td>
        <td style="padding:8px 12px; text-align:center; color:var(--color-text-secondary); font-size:0.78rem;">${r.hora}</td>
        <td style="padding:8px 12px; text-align:center;">
          <span class="badge" style="font-size:0.7rem;padding:3px 8px;">${r.pago}</span>
        </td>
      </tr>
    `).join('');
  }

  formatPaymentMethod(method) {
    const map = {
      EFECTIVO: 'Efectivo 💵',
      TARJETA: 'Tarjeta 💳',
      TRANSFERENCIA: 'Transferencia 📱',
      QR: 'QR 📲',
      CREDITO: 'Crédito 🏦',
      DEBITO: 'Débito 💳',
      MIXTO: 'Mixto ⚡'
    };
    return map[(method || '').toUpperCase()] || method || 'N/A';
  }

  renderChart(ventas, expenses) {
    const period = this.state.activePeriod;
    const now    = new Date();

    let labels      = [];
    let incomeData  = [];
    let expenseData = [];

    if (period === 'daily') {
      // Group by 3-hour blocks: 00-03, 03-06, ..., 21-24
      const blocks = ['00-03', '03-06', '06-09', '09-12', '12-15', '15-18', '18-21', '21-24'];
      labels = blocks;
      incomeData  = Array(8).fill(0);
      expenseData = Array(8).fill(0);
      const today = new Date().toDateString();
      ventas.forEach(v => {
        const d = new Date(v.date || v.createdAt || Date.now());
        if (d.toDateString() === today) {
          const block = Math.floor(d.getHours() / 3);
          incomeData[block] += Number(v.total || 0);
        }
      });
      expenses.forEach(e => {
        const d = new Date(e.date || Date.now());
        if (d.toDateString() === today) {
          const block = Math.floor(d.getHours() / 3);
          expenseData[block] += Number(e.amount || 0);
        }
      });
    } else if (period === 'weekly') {
      labels      = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
      incomeData  = Array(7).fill(0);
      expenseData = Array(7).fill(0);
      // Last 7 days window
      const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 6); cutoff.setHours(0,0,0,0);
      ventas.forEach(v => {
        const d = new Date(v.date || v.createdAt || Date.now());
        if (d >= cutoff) {
          let idx = d.getDay() - 1; // 0=Mon
          if (idx < 0) idx = 6;
          incomeData[idx] += Number(v.total || 0);
        }
      });
      expenses.forEach(e => {
        const d = new Date(e.date || Date.now());
        if (d >= cutoff) {
          let idx = d.getDay() - 1;
          if (idx < 0) idx = 6;
          expenseData[idx] += Number(e.amount || 0);
        }
      });
    } else if (period === 'monthly') {
      // Weeks of the current month
      labels      = ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5'];
      incomeData  = Array(5).fill(0);
      expenseData = Array(5).fill(0);
      const y = now.getFullYear(); const m = now.getMonth();
      ventas.forEach(v => {
        const d = new Date(v.date || v.createdAt || Date.now());
        if (d.getFullYear() === y && d.getMonth() === m) {
          const week = Math.min(Math.floor((d.getDate() - 1) / 7), 4);
          incomeData[week] += Number(v.total || 0);
        }
      });
      expenses.forEach(e => {
        const d = new Date(e.date || Date.now());
        if (d.getFullYear() === y && d.getMonth() === m) {
          const week = Math.min(Math.floor((d.getDate() - 1) / 7), 4);
          expenseData[week] += Number(e.amount || 0);
        }
      });
    } else if (period === 'quarterly') {
      // Last 3 months
      const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      const months = [];
      for (let i = 2; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ year: d.getFullYear(), month: d.getMonth(), label: monthNames[d.getMonth()] });
      }
      labels      = months.map(m => m.label);
      incomeData  = Array(3).fill(0);
      expenseData = Array(3).fill(0);
      ventas.forEach(v => {
        const d = new Date(v.date || v.createdAt || Date.now());
        const idx = months.findIndex(m => m.year === d.getFullYear() && m.month === d.getMonth());
        if (idx >= 0) incomeData[idx] += Number(v.total || 0);
      });
      expenses.forEach(e => {
        const d = new Date(e.date || Date.now());
        const idx = months.findIndex(m => m.year === d.getFullYear() && m.month === d.getMonth());
        if (idx >= 0) expenseData[idx] += Number(e.amount || 0);
      });
    } else if (period === 'annual') {
      const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      labels      = monthNames;
      incomeData  = Array(12).fill(0);
      expenseData = Array(12).fill(0);
      const y = now.getFullYear();
      ventas.forEach(v => {
        const d = new Date(v.date || v.createdAt || Date.now());
        if (d.getFullYear() === y) incomeData[d.getMonth()] += Number(v.total || 0);
      });
      expenses.forEach(e => {
        const d = new Date(e.date || Date.now());
        if (d.getFullYear() === y) expenseData[d.getMonth()] += Number(e.amount || 0);
      });
    }

    this.chart.updateData(labels, [
      { label: 'Ingresos ($)', data: incomeData,  color: '#34d399' },
      { label: 'Egresos ($)',  data: expenseData, color: '#f87171' }
    ]);
  }

  /**
   * Two-step deletion confirmation for today's sales:
   * Step 1 — browser confirm dialog
   * Step 2 — modal requiring user to type "ELIMINAR"
   */
  confirmAndPurgeDailySales() {
    // Step 1: native confirm
    if (!confirm('⚠️ Esta acción eliminará PERMANENTEMENTE todas las ventas registradas hoy del historial.\n\n¿Deseas continuar con la primera confirmación?')) return;

    // Step 2: modal requiring typed keyword
    const modal = new Modal({
      title: '🔐 Confirmación de Seguridad — Purga de Ventas',
      bodyHTML: `
        <div style="display:flex;flex-direction:column;gap:var(--space-4);">
          <div class="card p-4" style="background:rgba(248,113,113,0.08);border-color:var(--color-danger);border-radius:var(--radius-md);">
            <p class="font-bold text-sm" style="color:var(--color-danger);">⚠️ Acción irreversible</p>
            <p class="text-xs text-secondary mt-1">
              Esta acción eliminará de forma permanente todas las transacciones de ventas del día de hoy de la base de datos.
              Esta operación <strong>no puede deshacerse</strong>.
            </p>
          </div>
          <div class="form-group">
            <label class="form-label" for="purge-confirm-input" style="font-weight:600;">Escribe <code style="background:var(--color-bg-secondary);padding:2px 6px;border-radius:4px;">ELIMINAR</code> para confirmar:</label>
            <input type="text" id="purge-confirm-input" class="input input-md" placeholder="ELIMINAR" autocomplete="off" />
          </div>
        </div>
      `,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-purge-cancel">Cancelar</button>
        <button class="btn btn-danger btn-sm" id="btn-purge-confirm" disabled>Eliminar Definitivamente</button>
      `
    });

    const el = modal.mount();
    document.body.appendChild(el);

    const input   = modal.$('#purge-confirm-input');
    const btnOk   = modal.$('#btn-purge-confirm');
    const btnCancel = modal.$('#btn-purge-cancel');

    input?.addEventListener('input', () => {
      btnOk.disabled = input.value.trim() !== 'ELIMINAR';
    });

    btnCancel?.addEventListener('click', () => modal.close());

    btnOk?.addEventListener('click', async () => {
      btnOk.disabled  = true;
      btnOk.textContent = 'Eliminando...';
      await this.purgeTodaySales();
      modal.close();
    });
  }

  async purgeTodaySales() {
    const today = new Date().toDateString();
    const toDelete = this.state.ventas.filter(v => {
      const d = new Date(v.date || v.createdAt || Date.now());
      return d.toDateString() === today;
    });

    let deleted = 0;
    for (const v of toDelete) {
      try {
        await FirestoreService.delete('ventas', v.id);
        deleted++;
      } catch (e) {
        console.warn('[FinanceView] Could not delete sale', v.id, e);
      }
    }

    if (deleted > 0) {
      NotificationService.success(`Se eliminaron ${deleted} transacciones del historial del día.`);
    } else {
      NotificationService.info('No se encontraron transacciones del día para eliminar.');
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