import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';

export class ExpensesView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || 'company-test';
    this.currentUser = currentUser;

    this.state = {
      expenses: []
    };

    // Initialize DataTable
    this.table = new DataTable({
      columns: [
        { key: 'concept', label: 'Concepto / Descripción' },
        { 
          key: 'category', 
          label: 'Categoría',
          render: (val) => `<span class="badge" style="background-color: var(--color-bg-tertiary); color: var(--color-text-primary); border: 1px solid var(--color-border); padding: 2px 8px; border-radius: var(--radius-md); font-size: 0.75rem;">📦 ${val}</span>`
        },
        { 
          key: 'amount', 
          label: 'Monto',
          render: (val) => `<strong style="color: var(--color-danger);">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val)}</strong>`
        },
        { 
          key: 'date', 
          label: 'Fecha',
          render: (val) => new Date(val).toLocaleDateString()
        },
        { key: 'registeredBy', label: 'Registrado por' },
        {
          key: 'id',
          label: 'Acción',
          render: (val) => `<button class="btn btn-danger btn-sm py-1 px-2 btn-delete-expense" data-id="${val}" style="font-size: 0.7rem;">🗑️ Eliminar</button>`
        }
      ],
      data: this.state.expenses
    });

    this.layout = new PageLayout({
      title: 'Control de Gastos',
      subtitle: 'Registra y monitorea las salidas de caja y costos operativos del negocio.',
      actionHTML: `
        <button class="btn btn-primary btn-sm" id="btn-add-expense">
          + Registrar Gasto
        </button>
      `,
      contentHTML: `
        <div class="card p-5">
          <h3 class="text-lg font-semibold mb-4">Registro Histórico de Gastos</h3>
          <div id="expenses-table-wrapper"></div>
        </div>
      `
    });

    this.modalInstance = null;
    this.listeners = [];
  }

  mount() {
    const element = this.layout.mount();

    // Inject Table
    const tableWrapper = element.querySelector('#expenses-table-wrapper');
    if (tableWrapper) {
      tableWrapper.appendChild(this.table.mount());
    }

    this.afterMount(element);
    this.subscribeToExpenses(element);

    return element;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    const addBtn = root.querySelector('#btn-add-expense');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openAddExpenseModal());
    }

    // Dynamic delete button delegation
    const tableWrapper = root.querySelector('#expenses-table-wrapper');
    if (tableWrapper) {
      tableWrapper.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.btn-delete-expense');
        if (deleteBtn) {
          const expenseId = deleteBtn.getAttribute('data-id');
          if (confirm('¿Estás seguro de que deseas eliminar este registro de gasto?')) {
            try {
              await FirestoreService.delete(this.companyId, 'expenses', expenseId);
              NotificationService.success('Gasto eliminado.');
            } catch (err) {
              console.error('[ExpensesView] Error deleting:', err);
              NotificationService.error('Error al eliminar el gasto.');
            }
          }
        }
      });
    }
  }

  subscribeToExpenses(element) {
    try {
      const expensesListener = FirestoreService.listenToTenant('expenses', (expenses) => {
        this.state.expenses = expenses || [];
        this.refreshTable(this.state.expenses);
      });
      this.listeners.push(expensesListener);
    } catch (e) {
      console.warn('[ExpensesView] Listening error:', e.message);
    }
  }

  refreshTable(data) {
    const tableWrapper = this.layout.$('#expenses-table-wrapper');
    if (tableWrapper) {
      tableWrapper.innerHTML = '';
      this.table.props.data = data;
      tableWrapper.appendChild(this.table.mount());
    }
  }

  openAddExpenseModal() {
    const formHTML = `
      <form id="add-expense-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary);">
        <div class="form-group">
          <label class="form-label" for="exp-concept">Concepto / Descripción</label>
          <input type="text" id="exp-concept" class="input input-md" placeholder="Ej. Pago de luz local, Compra de insumos" required />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="exp-category">Categoría</label>
            <select id="exp-category" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="Servicios">Servicios (Luz, Agua, Internet)</option>
              <option value="Materia Prima">Materia Prima / Insumos</option>
              <option value="Nómina">Nómina / Sueldos</option>
              <option value="Alquiler">Alquiler de Local</option>
              <option value="Mantenimiento">Mantenimiento y Reparación</option>
              <option value="Marketing">Marketing / Publicidad</option>
              <option value="Otros">Otros Gastos Operativos</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="exp-amount">Monto ($ MXN)</label>
            <input type="number" id="exp-amount" class="input input-md" placeholder="0.00" min="0.01" step="0.01" required />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="exp-date">Fecha de Transacción</label>
          <input type="date" id="exp-date" class="input input-md" required />
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-submit-btn">Guardar Gasto</button>
    `;

    this.modalInstance = new Modal({
      title: 'Registrar Gasto de Operación',
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'md'
    });

    document.body.appendChild(this.modalInstance.mount());

    // Set today's date as default
    const dateInput = this.modalInstance.$('#exp-date');
    if (dateInput) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }

    const cancelBtn = this.modalInstance.$('#modal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.modalInstance.close());
    }

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitExpense());
    }
  }

  async submitExpense() {
    const form = this.modalInstance.$('#add-expense-form');
    if (!form || !form.reportValidity()) return;

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }

    const concept = this.modalInstance.$('#exp-concept').value.trim();
    const category = this.modalInstance.$('#exp-category').value;
    const amount = Number(this.modalInstance.$('#exp-amount').value);
    const date = this.modalInstance.$('#exp-date').value;

    try {
      await FirestoreService.create(this.companyId, 'expenses', {
        concept,
        category,
        amount,
        date,
        registeredBy: this.currentUser.displayName || this.currentUser.email || 'Admin',
        createdAt: Date.now()
      });

      NotificationService.success('Gasto registrado correctamente.');
      this.modalInstance.close();
    } catch (err) {
      console.error('[ExpensesView] Error saving expense:', err);
      alert(`Error al registrar el gasto: ${err.message}`);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar Gasto';
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