import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';

export class LogsView extends Component {
  constructor(params = {}) {
    super(params);

    const mockLogs = [
      { timestamp: '2026-07-14 02:12:44', level: 'INFO', message: 'Sesión iniciada por super@admin.com', user: 'super@admin.com' },
      { timestamp: '2026-07-14 02:14:02', level: 'WARNING', message: 'Intento de acceso denegado a /owner/finance', user: 'admin@admin.com' },
      { timestamp: '2026-07-14 02:15:10', level: 'ERROR', message: 'Fallo al inicializar Firebase Cloud Messaging en Safari', user: 'Sistema' }
    ];

    this.table = new DataTable({
      columns: [
        { key: 'timestamp', label: 'Fecha / Hora' },
        { 
          key: 'level', 
          label: 'Nivel',
          render: (val) => {
            let variant = 'info';
            if (val === 'WARNING') variant = 'warning';
            if (val === 'ERROR') variant = 'danger';
            return `<span class="badge" style="display:inline-flex;padding:2px 8px;font-size:0.75rem;font-weight:500;border-radius:var(--radius-full);background-color:var(--color-${variant}-light);color:var(--color-${variant});">${val}</span>`;
          }
        },
        { key: 'message', label: 'Acción / Suceso' },
        { key: 'user', label: 'Usuario Autor' }
      ],
      data: mockLogs
    });

    this.layout = new PageLayout({
      title: 'Bitácora del Sistema (Audit Logs)',
      subtitle: 'Registro inmutable de auditoría para auditorías de seguridad, accesos y errores del SaaS.',
      contentHTML: `
        <div class="card p-5">
          <h3 class="text-lg font-semibold mb-4">Eventos Recientes</h3>
          <div id="logs-table-container"></div>
        </div>
      `
    });
  }

  mount() {
    const el = this.layout.mount();
    const tableContainer = el.querySelector('#logs-table-container');
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