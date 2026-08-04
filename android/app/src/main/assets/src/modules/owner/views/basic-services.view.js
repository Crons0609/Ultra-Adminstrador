import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';

export class BasicServicesView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || 'company-test';
    this.currentUser = currentUser;

    this.state = {
      services: []
    };

    // Icons map for each basic service
    this.icons = {
      'Energía Eléctrica': '⚡',
      'Agua Potable': '💧',
      'Internet / Cable': '🌐',
      'Gas / Propano': '🔥',
      'Otros': '🛠️'
    };

    // Initialize DataTable
    this.table = new DataTable({
      columns: [
        { 
          key: 'serviceType', 
          label: 'Servicio', 
          render: (val) => `<span class="font-semibold text-primary">${this.icons[val] || '🛠️'} ${val}</span>` 
        },
        { key: 'providerName', label: 'Proveedor', render: (val) => `<strong>${val}</strong>` },
        { 
          key: 'amount', 
          label: 'Monto', 
          render: (val) => `<strong>${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val || 0)}</strong>` 
        },
        { 
          key: 'dueDate', 
          label: 'Vence el', 
          render: (val) => val ? new Date(val).toLocaleDateString() : '<span class="text-secondary">N/D</span>' 
        },
        {
          key: 'status',
          label: 'Estado',
          render: (val) => `<span class="badge" style="background-color: ${val === 'PENDIENTE' ? 'rgba(239,68,68,0.15)' : 'rgba(52,211,153,0.15)'}; color: ${val === 'PENDIENTE' ? 'var(--color-danger)' : 'var(--color-success)'}; border: 1px solid var(--color-border); padding: 2px 8px; border-radius: var(--radius-md); font-size: 0.75rem;">${val || 'PENDIENTE'}</span>`
        },
        {
          key: 'id',
          label: 'Acciones',
          render: (val, row) => `
            <div class="d-flex gap-2">
              ${row.status === 'PENDIENTE' ? `
                <button class="btn btn-primary btn-xs btn-pay-service" data-id="${val}" style="padding: 2px 6px; font-size: 0.7rem;">💳 Pagar Recibo</button>
              ` : ''}
              <button class="btn btn-danger btn-xs btn-delete-service" data-id="${val}" style="padding: 2px 6px; font-size: 0.7rem;">🗑️</button>
            </div>
          `
        }
      ],
      data: this.state.services
    });

    this.layout = new PageLayout({
      title: 'Servicios Básicos',
      subtitle: 'Administra tus gastos y deudas mensuales de servicios básicos (Cable, Agua, Energía, etc.).',
      actionHTML: `
        <div class="d-flex gap-2">
          <a class="btn btn-secondary btn-sm" href="#/owner/supplier-reminders">
            🏢 Avisos de Pago
          </a>
          <button class="btn btn-primary btn-sm" id="btn-add-service-bill">
            + Registrar Recibo
          </button>
        </div>
      `,
      contentHTML: `
        <!-- KPI summary row -->
        <div class="grid-stats mb-5" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-4);">
          <div class="card p-4">
            <span class="text-sm text-secondary">Recibos Pendientes de Pago</span>
            <h3 class="text-2xl font-bold mt-1 text-primary" id="kpi-pending-sum" style="color:var(--color-danger);">$0.00</h3>
          </div>
          <div class="card p-4">
            <span class="text-sm text-secondary">Total Pagado este Mes</span>
            <h3 class="text-2xl font-bold mt-1 text-primary" id="kpi-paid-sum" style="color:var(--color-success);">$0.00</h3>
          </div>
          <div class="card p-4">
            <span class="text-sm text-secondary">Recibos Pendientes (Cantidad)</span>
            <h3 class="text-2xl font-bold mt-1 text-primary" id="kpi-pending-qty">0</h3>
          </div>
        </div>

        <div class="card p-5">
          <h3 class="text-lg font-semibold mb-4">Listado de Recibos y Facturas</h3>
          <div id="services-table-wrapper"></div>
        </div>
      `
    });

    this.modalInstance = null;
    this.listeners = [];
  }

  mount() {
    const element = this.layout.mount();

    const tableWrapper = element.querySelector('#services-table-wrapper');
    if (tableWrapper) {
      tableWrapper.appendChild(this.table.mount());
    }

    this.afterMount(element);
    this.subscribeToServices(element);

    return element;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    const addBillBtn = root.querySelector('#btn-add-service-bill');
    if (addBillBtn) {
      addBillBtn.addEventListener('click', () => this.openAddServiceBillModal());
    }

    const tableWrapper = root.querySelector('#services-table-wrapper');
    if (tableWrapper) {
      tableWrapper.addEventListener('click', async (e) => {
        const id = e.target.closest('button')?.getAttribute('data-id');
        if (!id) return;

        const service = this.state.services.find(s => s.id === id);
        if (!service) return;

        if (e.target.closest('.btn-pay-service')) {
          this.payServiceBill(service);
        } else if (e.target.closest('.btn-delete-service')) {
          if (confirm('¿Estás seguro de que deseas eliminar este recibo?')) {
            try {
              await FirestoreService.delete('basic_services', id);
              NotificationService.success('Recibo eliminado.');
            } catch (err) {
              NotificationService.error('Error al eliminar.');
            }
          }
        }
      });
    }
  }

  subscribeToServices(element) {
    try {
      const servicesListener = FirestoreService.listenToTenant('basic_services', (services) => {
        this.state.services = services || [];
        this.refreshTable(this.state.services);
        this.updateKPIs();
      });
      this.listeners.push(servicesListener);
    } catch (e) {
      console.warn('[BasicServicesView] DB error:', e.message);
    }
  }

  refreshTable(data) {
    const tableWrapper = this.layout.$('#services-table-wrapper');
    if (tableWrapper) {
      tableWrapper.innerHTML = '';
      this.table.props.data = data;
      tableWrapper.appendChild(this.table.mount());
    }
  }

  updateKPIs() {
    const pending = this.state.services.filter(s => s.status === 'PENDIENTE');
    const paid = this.state.services.filter(s => s.status === 'PAGADO');

    const pendingSum = pending.reduce((acc, s) => acc + Number(s.amount || 0), 0);
    const paidSum = paid.reduce((acc, s) => acc + Number(s.amount || 0), 0);

    const elPendSum = this.layout.$('#kpi-pending-sum');
    const elPaidSum = this.layout.$('#kpi-paid-sum');
    const elPendQty = this.layout.$('#kpi-pending-qty');

    if (elPendSum) elPendSum.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(pendingSum);
    if (elPaidSum) elPaidSum.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(paidSum);
    if (elPendQty) elPendQty.textContent = pending.length;
  }

  async payServiceBill(service) {
    if (confirm(`¿Confirmas realizar el pago de $${service.amount} para el servicio de ${service.serviceType} (${service.providerName})?\nSe registrará automáticamente en los gastos operativos de tu local.`)) {
      try {
        // 1. Update bill status
        await FirestoreService.update('basic_services', service.id, {
          status: 'PAGADO',
          paymentDate: Date.now(),
          updatedAt: Date.now()
        });

        // 2. Feed expenses collection automatically
        await FirestoreService.create('expenses', {
          concept: `Pago de Servicio Básicos: ${service.serviceType} - ${service.providerName}`,
          category: 'Servicios',
          amount: Number(service.amount),
          date: new Date().toISOString().split('T')[0],
          registeredBy: this.currentUser.displayName || this.currentUser.email || 'Admin',
          createdAt: Date.now()
        });

        NotificationService.success('Recibo de servicio pagado y registrado en Gastos.');
      } catch (err) {
        alert('Error al procesar el pago: ' + err.message);
      }
    }
  }

  openAddServiceBillModal() {
    const formHTML = `
      <form id="service-bill-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary);">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="sb-type">Tipo de Servicio</label>
            <select id="sb-type" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="Energía Eléctrica">⚡ Energía Eléctrica</option>
              <option value="Agua Potable">💧 Agua Potable</option>
              <option value="Internet / Cable">🌐 Internet / Cable</option>
              <option value="Gas / Propano">🔥 Gas / Propano</option>
              <option value="Otros">🛠️ Otros</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="sb-provider">Proveedor del Servicio</label>
            <input type="text" id="sb-provider" class="input input-md" placeholder="Ej. Claro, CFE, Enacal" required />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="sb-amount">Monto a Pagar ($ MXN)</label>
            <input type="number" id="sb-amount" class="input input-md" placeholder="0.00" min="0.01" step="0.01" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="sb-due-date">Fecha de Vencimiento</label>
            <input type="date" id="sb-due-date" class="input input-md" required />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="sb-status">Estado Inicial</label>
          <select id="sb-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
            <option value="PENDIENTE">PENDIENTE (Aún por pagar)</option>
            <option value="PAGADO">PAGADO (Registrar gasto inmediatamente)</option>
          </select>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-submit-btn">Guardar Recibo</button>
    `;

    this.modalInstance = new Modal({
      title: '🔌 Registrar Recibo de Servicio Básico',
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'md'
    });

    document.body.appendChild(this.modalInstance.mount());

    const cancelBtn = this.modalInstance.$('#modal-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.modalInstance.close());

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitServiceBill());
    }

    // Default due date to today
    const dateInput = this.modalInstance.$('#sb-due-date');
    if (dateInput) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
  }

  async submitServiceBill() {
    const form = this.modalInstance.$('#service-bill-form');
    if (!form || !form.reportValidity()) return;

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }

    const serviceType = this.modalInstance.$('#sb-type').value;
    const providerName = this.modalInstance.$('#sb-provider').value.trim();
    const amount = Number(this.modalInstance.$('#sb-amount').value);
    const dueDate = new Date(this.modalInstance.$('#sb-due-date').value).getTime();
    const status = this.modalInstance.$('#sb-status').value;

    const payload = {
      serviceType,
      providerName,
      amount,
      dueDate,
      status,
      date: Date.now()
    };

    try {
      // 1. Create service bill record
      const billId = await FirestoreService.create('basic_services', payload);

      // 2. If it is already marked as paid, immediately create the operational expense record
      if (status === 'PAGADO') {
        await FirestoreService.create('expenses', {
          concept: `Pago de Servicio Básicos: ${serviceType} - ${providerName}`,
          category: 'Servicios',
          amount,
          date: new Date().toISOString().split('T')[0],
          registeredBy: this.currentUser.displayName || this.currentUser.email || 'Admin',
          createdAt: Date.now()
        });
      }

      NotificationService.success('Recibo de servicio registrado con éxito.');
      this.modalInstance.close();
    } catch (e) {
      alert('Error al registrar recibo: ' + e.message);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar Recibo';
      }
    }
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.table.unmount();
    this.layout.unmount();
    super.unmount();
  }
}
