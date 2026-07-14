import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';

export class BillingView extends Component {
  constructor(params = {}) {
    super(params);

    const mockInvoices = [
      { id: 'FAC-001', company: 'Burger & Co.', amount: '$999.00', date: '2026-07-01', status: 'Pagado' },
      { id: 'FAC-002', company: 'La Cantina del Sol', amount: '$499.00', date: '2026-07-03', status: 'Pagado' },
      { id: 'FAC-003', company: 'Café Bistro Madrid', amount: '$1,999.00', date: '2026-07-05', status: 'Pendiente' }
    ];

    this.table = new DataTable({
      columns: [
        { key: 'id', label: 'Factura #' },
        { key: 'company', label: 'Empresa / Cliente' },
        { key: 'amount', label: 'Monto Cobrado' },
        { key: 'date', label: 'Fecha Emisión' },
        { 
          key: 'status', 
          label: 'Estado de Pago',
          render: (val) => {
            const variant = val === 'Pagado' ? 'success' : 'warning';
            return `<span class="badge" style="display:inline-flex;padding:2px 8px;font-size:0.75rem;font-weight:500;border-radius:var(--radius-full);background-color:var(--color-${variant}-light);color:var(--color-${variant});">${val}</span>`;
          }
        }
      ],
      data: mockInvoices
    });

    this.layout = new PageLayout({
      title: 'Facturación Global',
      subtitle: 'Registro general de cobros, suscripciones vencidas y pasarela de pago para tenants.',
      contentHTML: `
        <div class="card p-5">
          <h3 class="text-lg font-semibold mb-4">Historial de Transacciones SaaS</h3>
          <div id="billing-table-container"></div>
        </div>
      `
    });
  }

  mount() {
    const el = this.layout.mount();
    const tableContainer = el.querySelector('#billing-table-container');
    if (tableContainer) {
      tableContainer.appendChild(this.table.mount());
    }
    return el;
  }

  unmount() {
    this.table.unmount();
    this.layout.unmount();
    super.unmount();
  }
}