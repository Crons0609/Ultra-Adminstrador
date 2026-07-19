import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';

export class InvoicesView extends Component {
  constructor(params = {}) {
    super(params);
    this.state = { sales: [], search: '' };

    this.layout = new PageLayout({
      title: 'Comprobantes de Venta',
      subtitle: 'Consulta y descarga los recibos de todas las ventas procesadas.',
      actionHTML: `
        <input type="text" id="inv-search" class="input input-sm" placeholder="Buscar por vendedor o monto..." style="min-width:240px;"/>
      `,
      contentHTML: `
        <style>
          .inv-card {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr auto;
            gap: var(--space-4);
            align-items: center;
            background: var(--color-bg-secondary);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            padding: var(--space-4);
            margin-bottom: var(--space-3);
            transition: transform 0.18s;
          }
          .inv-card:hover { transform: translateX(4px); }
          .inv-folio { font-size: 0.8rem; color: var(--color-text-secondary); }
          .inv-amount { font-size: 1.1rem; font-weight: 700; color: var(--color-success); }
          .inv-items-list { font-size: 0.78rem; color: var(--color-text-secondary); }
          .inv-print-btn { background: none; border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 8px 14px; cursor: pointer; font-size: 0.85rem; transition: background 0.2s; }
          .inv-print-btn:hover { background: var(--color-bg-tertiary); }
        </style>

        <div id="invoices-container" class="animate-fade-in">
          <p class="text-center py-10 text-secondary">Cargando comprobantes...</p>
        </div>
      `
    });
    this.listeners = [];
  }

  mount() {
    const element = this.layout.mount();
    this.subscribeToSales(element);

    element.querySelector('#inv-search')?.addEventListener('input', (e) => {
      this.state.search = e.target.value.toLowerCase();
      this.renderInvoices(element);
    });

    return element;
  }

  subscribeToSales(element) {
    try {
      const listener = FirestoreService.listenToTenant('ventas', (sales) => {
        this.state.sales = (sales || []).sort((a, b) => (b.date || b.createdAt) - (a.date || a.createdAt));
        this.renderInvoices(element);
      });
      this.listeners.push(listener);
    } catch (e) { console.error(e); }
  }

  renderInvoices(element) {
    const container = element.querySelector('#invoices-container');
    if (!container) return;

    const { sales, search } = this.state;
    const filtered = search
      ? sales.filter(s =>
          (s.sellerName || '').toLowerCase().includes(search) ||
          String(s.total || '').includes(search) ||
          (s.paymentMethod || '').toLowerCase().includes(search)
        )
      : sales;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="card p-10 text-center text-secondary">
          <div style="font-size:3rem; margin-bottom:12px;">🧾</div>
          <h4 class="font-bold">Sin comprobantes registrados</h4>
          <p class="text-xs mt-1">Los comprobantes se generan automáticamente al completar una venta desde el Punto de Venta (POS).</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map((s, i) => {
      const ts = new Date(s.date || s.createdAt).toLocaleString();
      const folio = `FC-${String(i + 1).padStart(4, '0')}`;
      const items = (s.items || []).map(item => `${item.qty}x ${item.name}`).join(', ');
      const method = s.paymentMethod || 'N/D';

      return `
        <div class="inv-card animate-slide-up">
          <div>
            <div class="text-sm font-semibold">${folio}</div>
            <div class="inv-folio">${ts}</div>
          </div>
          <div>
            <div class="text-xs font-medium" style="margin-bottom:4px;">Vendedor: ${s.sellerName || 'Cajero'}</div>
            <div class="inv-items-list">${items || 'Sin detalle de artículos'}</div>
          </div>
          <div>
            <div class="inv-amount">$${Number(s.total || 0).toFixed(2)}</div>
            <div class="inv-folio" style="margin-top:4px;">${method}</div>
          </div>
          <button class="inv-print-btn" data-id="${s.id}" onclick="this.textContent='🖨️ Enviado!'; setTimeout(()=>this.textContent='🖨️ Imprimir',2000);">🖨️ Imprimir</button>
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