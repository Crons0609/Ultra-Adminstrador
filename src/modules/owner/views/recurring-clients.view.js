import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';

export class RecurringClientsView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || 'company-test';
    this.currentUser = currentUser;

    this.state = {
      clients: []
    };

    // Initialize DataTable
    this.table = new DataTable({
      columns: [
        { key: 'name', label: 'Nombre Cliente', render: (val) => `<span class="font-semibold text-primary">👤 ${val}</span>` },
        { key: 'phone', label: 'Teléfono', render: (val) => val || '<span class="text-secondary">N/D</span>' },
        { key: 'email', label: 'Correo', render: (val) => val || '<span class="text-secondary">N/D</span>' },
        {
          key: 'creditLimit',
          label: 'Límite de Crédito',
          render: (val) => `<span style="font-weight: 500;">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val || 0)}</span>`
        },
        {
          key: 'currentDebt',
          label: 'Deuda Actual',
          render: (val) => `<strong style="color: ${Number(val) > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val || 0)}</strong>`
        },
        {
          key: 'status',
          label: 'Estado',
          render: (val) => `<span class="badge" style="background-color: ${val === 'SUSPENDIDO' ? 'var(--color-bg-tertiary)' : 'rgba(52,211,153,0.15)'}; color: ${val === 'SUSPENDIDO' ? 'var(--color-danger)' : 'var(--color-success)'}; border: 1px solid var(--color-border); padding: 2px 8px; border-radius: var(--radius-md); font-size: 0.75rem;">${val || 'ACTIVO'}</span>`
        },
        {
          key: 'id',
          label: 'Acciones',
          render: (val, row) => `
            <div class="d-flex gap-2">
              <button class="btn btn-secondary btn-xs btn-edit-client" data-id="${val}" style="padding: 2px 6px; font-size: 0.7rem;">✏️ Editar</button>
              <button class="btn btn-danger btn-xs btn-delete-client" data-id="${val}" style="padding: 2px 6px; font-size: 0.7rem;">🗑️ Eliminar</button>
            </div>
          `
        }
      ],
      data: this.state.clients
    });

    this.layout = new PageLayout({
      title: 'Clientes Recurrentes',
      subtitle: 'Administración y control de límites de crédito para tus clientes frecuentes.',
      actionHTML: `
        <button class="btn btn-primary btn-sm" id="btn-add-client">
          + Agregar Cliente
        </button>
      `,
      contentHTML: `
        <!-- KPI summary row -->
        <div class="grid-stats mb-5" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-4);">
          <div class="card p-4">
            <span class="text-sm text-secondary">Total Clientes</span>
            <h3 class="text-2xl font-bold mt-1 text-primary" id="kpi-total-clients">0</h3>
          </div>
          <div class="card p-4">
            <span class="text-sm text-secondary">Deuda Total Otorgada</span>
            <h3 class="text-2xl font-bold mt-1 text-primary" id="kpi-total-debt" style="color: var(--color-danger);">$0.00</h3>
          </div>
          <div class="card p-4">
            <span class="text-sm text-secondary">Promedio de Límite</span>
            <h3 class="text-2xl font-bold mt-1 text-primary" id="kpi-avg-limit">$0.00</h3>
          </div>
        </div>

        <div class="card p-5">
          <h3 class="text-lg font-semibold mb-4">Directorio de Clientes de Crédito</h3>
          <div id="clients-table-wrapper"></div>
        </div>
      `
    });

    this.modalInstance = null;
    this.listeners = [];
  }

  mount() {
    const element = this.layout.mount();

    const tableWrapper = element.querySelector('#clients-table-wrapper');
    if (tableWrapper) {
      tableWrapper.appendChild(this.table.mount());
    }

    this.afterMount(element);
    this.subscribeToClients(element);

    return element;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    const addBtn = root.querySelector('#btn-add-client');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openClientModal());
    }

    const tableWrapper = root.querySelector('#clients-table-wrapper');
    if (tableWrapper) {
      tableWrapper.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.btn-edit-client');
        if (editBtn) {
          const clientId = editBtn.getAttribute('data-id');
          const client = this.state.clients.find(c => c.id === clientId);
          if (client) {
            this.openClientModal(client);
          }
          return;
        }

        const deleteBtn = e.target.closest('.btn-delete-client');
        if (deleteBtn) {
          const clientId = deleteBtn.getAttribute('data-id');
          if (confirm('¿Estás seguro de que deseas eliminar este cliente recurrente? Se perderán sus límites asociados.')) {
            try {
              await FirestoreService.delete('recurring_clients', clientId);
              NotificationService.success('Cliente eliminado.');
            } catch (err) {
              console.error('[RecurringClientsView] Error deleting:', err);
              NotificationService.error('Error al eliminar el cliente.');
            }
          }
        }
      });
    }
  }

  subscribeToClients(element) {
    try {
      const clientsListener = FirestoreService.listenToTenant('recurring_clients', (clients) => {
        this.state.clients = clients || [];
        this.refreshTable(this.state.clients);
        this.updateKPIs();
      });
      this.listeners.push(clientsListener);
    } catch (e) {
      console.warn('[RecurringClientsView] Listening error:', e.message);
    }
  }

  refreshTable(data) {
    const tableWrapper = this.layout.$('#clients-table-wrapper');
    if (tableWrapper) {
      tableWrapper.innerHTML = '';
      this.table.props.data = data;
      tableWrapper.appendChild(this.table.mount());
    }
  }

  updateKPIs() {
    const total = this.state.clients.length;
    const totalDebt = this.state.clients.reduce((acc, c) => acc + Number(c.currentDebt || 0), 0);
    const avgLimit = total > 0 ? (this.state.clients.reduce((acc, c) => acc + Number(c.creditLimit || 0), 0) / total) : 0;

    const elTotal = this.layout.$('#kpi-total-clients');
    const elDebt = this.layout.$('#kpi-total-debt');
    const elAvg = this.layout.$('#kpi-avg-limit');

    if (elTotal) elTotal.textContent = total;
    if (elDebt) elDebt.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalDebt);
    if (elAvg) elAvg.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(avgLimit);
  }

  openClientModal(client = null) {
    const formHTML = `
      <form id="client-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary);">
        <div class="form-group">
          <label class="form-label" for="cli-name">Nombre Completo</label>
          <input type="text" id="cli-name" class="input input-md" placeholder="Ej. Juan Pérez" value="${client?.name || ''}" required />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="cli-phone">Teléfono</label>
            <input type="tel" id="cli-phone" class="input input-md" placeholder="Ej. 8888-8888" value="${client?.phone || ''}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="cli-email">Correo Electrónico</label>
            <input type="email" id="cli-email" class="input input-md" placeholder="Ej. juan@correo.com" value="${client?.email || ''}" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="cli-address">Dirección</label>
          <input type="text" id="cli-address" class="input input-md" placeholder="Ej. Semáforos del Club Terraza 1c. al Norte" value="${client?.address || ''}" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="cli-limit">Límite de Crédito ($ MXN)</label>
            <input type="number" id="cli-limit" class="input input-md" placeholder="5000" min="0" value="${client?.creditLimit || 5000}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="cli-status">Estado</label>
            <select id="cli-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="ACTIVO" ${client?.status === 'ACTIVO' ? 'selected' : ''}>ACTIVO</option>
              <option value="SUSPENDIDO" ${client?.status === 'SUSPENDIDO' ? 'selected' : ''}>SUSPENDIDO</option>
            </select>
          </div>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-submit-btn">${client ? 'Guardar Cambios' : 'Registrar Cliente'}</button>
    `;

    this.modalInstance = new Modal({
      title: client ? '✏️ Editar Cliente Recurrente' : '👤 Agregar Cliente Recurrente',
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'md'
    });

    document.body.appendChild(this.modalInstance.mount());

    const cancelBtn = this.modalInstance.$('#modal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.modalInstance.close());
    }

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitClient(client));
    }
  }

  async submitClient(client = null) {
    const form = this.modalInstance.$('#client-form');
    if (!form || !form.reportValidity()) return;

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }

    const name = this.modalInstance.$('#cli-name').value.trim();
    const phone = this.modalInstance.$('#cli-phone').value.trim();
    const email = this.modalInstance.$('#cli-email').value.trim();
    const address = this.modalInstance.$('#cli-address').value.trim();
    const creditLimit = Number(this.modalInstance.$('#cli-limit').value);
    const status = this.modalInstance.$('#cli-status').value;

    const payload = {
      name,
      phone,
      email,
      address,
      creditLimit,
      status,
      currentDebt: client ? (client.currentDebt || 0) : 0,
      updatedAt: Date.now()
    };

    try {
      if (client) {
        await FirestoreService.update('recurring_clients', client.id, payload);
        NotificationService.success('Cliente actualizado correctamente.');
      } else {
        await FirestoreService.create('recurring_clients', payload);
        NotificationService.success('Cliente registrado correctamente.');
      }
      this.modalInstance.close();
    } catch (err) {
      console.error('[RecurringClientsView] Error saving client:', err);
      alert(`Error al guardar cliente: ${err.message}`);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = client ? 'Guardar Cambios' : 'Registrar Cliente';
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
