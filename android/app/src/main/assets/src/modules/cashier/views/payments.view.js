import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { FirestoreService } from '../../../services/firestore.service.js';

export class PaymentsView extends Component {
  constructor(params = {}) {
    super(params);
    this.state = { sales: [], filter: 'today' };

    this.layout = new PageLayout({
      title: 'Historial de Cobros',
      subtitle: 'Registro completo de todas las transacciones procesadas por caja.',
      actionHTML: `
        <select id="pay-filter-period" class="input input-sm" style="min-width:140px;">
          <option value="today">Hoy</option>
          <option value="week">Esta semana</option>
          <option value="month">Este mes</option>
        </select>
      `,
      contentHTML: `
        <style>
          .pay-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:var(--space-4); margin-bottom:var(--space-6); }
          .pay-kpi { background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:var(--radius-lg); padding:var(--space-4); }
          .pay-kpi-val { font-size:1.5rem; font-weight:800; }
          .pay-kpi-label { font-size:0.78rem; color:var(--color-text-secondary); margin-top:4px; }
          .pay-row { display:grid; grid-template-columns:160px 1fr 120px 120px; gap:var(--space-3); padding:12px; border-bottom:1px solid var(--color-border); font-size:0.85rem; align-items:center; }
          .pay-row.header { font-weight:700; background:var(--color-bg-tertiary); border-radius:var(--radius-md) var(--radius-md) 0 0; }
          .pay-method-badge { padding:3px 8px; border-radius:999px; font-size:0.72rem; font-weight:600; display:inline-block; }
          .pay-method-EFECTIVO { background:#10b98122; color:#10b981; }
          .pay-method-TARJETA { background:#3b82f622; color:#3b82f6; }
          .pay-method-other { background:#8b5cf622; color:#8b5cf6; }
        </style>

        <div class="pay-kpis animate-fade-in">
          <div class="pay-kpi" style="border-top:4px solid var(--color-success);">
            <div class="pay-kpi-val text-success" id="pay-total">$0.00</div>
            <div class="pay-kpi-label">Total Cobrado</div>
          </div>
          <div class="pay-kpi" style="border-top:4px solid var(--color-accent);">
            <div class="pay-kpi-val" style="color:var(--color-accent);" id="pay-count">0</div>
            <div class="pay-kpi-label">Transacciones</div>
          </div>
          <div class="pay-kpi" style="border-top:4px solid #10b981;">
            <div class="pay-kpi-val" style="color:#10b981;" id="pay-cash">$0.00</div>
            <div class="pay-kpi-label">En Efectivo</div>
          </div>
          <div class="pay-kpi" style="border-top:4px solid #3b82f6;">
            <div class="pay-kpi-val" style="color:#3b82f6;" id="pay-card">$0.00</div>
            <div class="pay-kpi-label">Con Tarjeta</div>
          </div>
        </div>

        <div class="card p-5">
          <div class="pay-row header">
            <span>Fecha / Hora</span>
            <span>Vendedor</span>
            <span>Método de Pago</span>
            <span class="text-right">Monto</span>
          </div>
          <div id="payments-list" style="max-height:400px;overflow-y:auto;">
            <p class="text-center py-10 text-secondary">Cargando historial...</p>
          </div>
        </div>
      `
    });
    this.listeners = [];
  }

  mount() {
    const element = this.layout.mount();
    this.subscribeToSales(element);

    element.querySelector('#pay-filter-period')?.addEventListener('change', (e) => {
      this.state.filter = e.target.value;
      this.renderPayments(element);
    });

    return element;
  }

  subscribeToSales(element) {
    try {
      const listener = FirestoreService.listenToTenant('ventas', (sales) => {
        this.state.sales = sales || [];
        this.renderPayments(element);
      });
      this.listeners.push(listener);
    } catch (e) { console.error(e); }
  }

  getFilteredSales() {
    const now = Date.now();
    const { sales, filter } = this.state;

    return sales.filter(s => {
      const ts = s.date || s.createdAt || 0;
      if (filter === 'today') {
        const start = new Date(); start.setHours(0,0,0,0);
        return ts >= start.getTime();
      } else if (filter === 'week') {
        return ts >= now - 7 * 24 * 60 * 60 * 1000;
      } else {
        return ts >= now - 30 * 24 * 60 * 60 * 1000;
      }
    });
  }

  renderPayments(element) {
    const q = sel => element.querySelector(sel);
    const filtered = this.getFilteredSales().sort((a, b) => (b.date || b.createdAt) - (a.date || a.createdAt));

    const total = filtered.reduce((s, v) => s + Number(v.total || 0), 0);
    const cash = filtered.filter(v => v.paymentMethod === 'EFECTIVO').reduce((s, v) => s + Number(v.total || 0), 0);
    const card = filtered.filter(v => v.paymentMethod !== 'EFECTIVO').reduce((s, v) => s + Number(v.total || 0), 0);

    if (q('#pay-total')) q('#pay-total').textContent = `$${total.toFixed(2)}`;
    if (q('#pay-count')) q('#pay-count').textContent = filtered.length;
    if (q('#pay-cash')) q('#pay-cash').textContent = `$${cash.toFixed(2)}`;
    if (q('#pay-card')) q('#pay-card').textContent = `$${card.toFixed(2)}`;

    const list = q('#payments-list');
    if (!list) return;

    if (filtered.length === 0) {
      list.innerHTML = `<p class="text-center py-10 text-secondary">No hay cobros registrados para el período seleccionado.</p>`;
      return;
    }

    list.innerHTML = filtered.map(s => {
      const ts = new Date(s.date || s.createdAt).toLocaleString();
      const method = s.paymentMethod || 'EFECTIVO';
      const cls = method === 'EFECTIVO' ? 'pay-method-EFECTIVO' : (method === 'TARJETA' ? 'pay-method-TARJETA' : 'pay-method-other');
      return `
        <div class="pay-row animate-slide-up">
          <span class="text-secondary text-xs">${ts}</span>
          <span>👤 ${s.sellerName || 'Cajero'}</span>
          <span><span class="pay-method-badge ${cls}">${method}</span></span>
          <strong class="text-right text-success">$${Number(s.total || 0).toFixed(2)}</strong>
        </div>
      `;
    }).join('');
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.layout.unmount();
    super.unmount();
  }
}