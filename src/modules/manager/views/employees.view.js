/**
 * @file employees.view.js
 * @description Employees Management view for Managers and Owners with full Firebase Auth + Firestore integration.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { NotificationService } from '../../../services/notification.service.js';
import { AuthService } from '../../../services/auth.service.js';
import { FirestoreService } from '../../../services/firestore.service.js';

export class EmployeesView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || 'company-test';
    this.branchId = currentUser.branchId || 'main';

    // Initialize state
    this.state = {
      employees: []
    };

    // Initialize DataTable
    this.table = new DataTable({
      columns: [
        { key: 'displayName', label: 'Nombre Completo' },
        { key: 'email', label: 'Correo Electrónico' },
        { 
          key: 'customRole', 
          label: 'Puesto / Cargo',
          render: (val, row) => {
            if (val) return `<span class="badge" style="background-color: var(--color-bg-tertiary); color: var(--color-text-primary); border: 1px solid var(--color-border); padding: 2px 8px; border-radius: var(--radius-md); font-weight: 500;">${val}</span>`;
            
            const roleLabels = {
              MANAGER: 'Gerente',
              CASHIER: 'Cajero',
              WAITER: 'Mesero',
              KITCHEN: 'Cocinero'
            };
            return `<span style="color: var(--color-text-secondary);">${roleLabels[row.role] || row.role}</span>`;
          }
        },
        { 
          key: 'role', 
          label: 'Permisos del Sistema',
          render: (val) => {
            const roleLabels = {
              MANAGER: 'Acceso Total (Gerente)',
              CASHIER: 'Caja Registradora',
              WAITER: 'Toma de Pedidos (Mesero)',
              KITCHEN: 'Pantalla de Cocina (Chef)'
            };
            return `<span style="font-size: 0.8rem; color: var(--color-accent); font-weight: 500;">${roleLabels[val] || val}</span>`;
          }
        },
        { 
          key: 'status', 
          label: 'Estado',
          render: () => `<span class="badge" style="display:inline-flex;padding:2px 8px;font-size:0.75rem;font-weight:500;border-radius:var(--radius-full);background-color:var(--color-success-light);color:var(--color-success);">Activo</span>`
        }
      ],
      data: this.state.employees
    });

    // PageLayout setup
    this.layout = new PageLayout({
      title: 'Gestión de Empleados',
      subtitle: 'Administración del personal de tu local. Registra meseros, cocineros, cajeros y gerentes.',
      actionHTML: `
        <button class="btn btn-primary btn-sm" id="btn-add-employee">
          <span style="margin-right: var(--space-1);">+</span> Agregar Trabajador
        </button>
      `,
      contentHTML: `
        <div class="card p-5">
          <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
            <h3 class="text-lg font-semibold">Listado de Personal</h3>
          </div>
          <!-- Table Wrapper -->
          <div id="employees-table-wrapper"></div>
        </div>
      `
    });

    this.modalInstance = null;
  }

  async loadEmployees() {
    try {
      console.log('[EmployeesView] Cargando empleados desde /companies/', this.companyId, '/employees/');
      const employees = await FirestoreService.getCompanyEmployees(this.companyId);

      // Filter out the OWNER and SUPER_ADMIN roles — they're not "employees" in this view
      const filtered = employees
        .filter(e => e.role !== 'OWNER' && e.role !== 'SUPER_ADMIN')
        .map(e => ({
          uid: e.uid || e.id,
          email: e.email,
          displayName: e.displayName,
          role: e.role,
          customRole: e.customRole || '',
          companyId: this.companyId,
          branchId: e.branchId || 'main',
          active: e.active !== false
        }));

      this.state.employees = filtered;
      this.refreshTable(filtered);
      console.log('[EmployeesView] ✅ Empleados cargados. Total:', filtered.length);
    } catch (e) {
      console.error('[EmployeesView] Fallo al cargar empleados:', e);
      NotificationService.error('Error al sincronizar lista de empleados.');
    }
  }

  mount() {
    const element = this.layout.mount();

    // Inject Table
    const tableWrapper = element.querySelector('#employees-table-wrapper');
    if (tableWrapper) {
      tableWrapper.appendChild(this.table.mount());
    }

    this.afterMount();

    // Load data from Cloud Firestore
    this.loadEmployees();

    return element;
  }

  afterMount() {
    const addBtn = this.layout.$('#btn-add-employee');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openAddEmployeeModal());
    }
  }

  /**
   * Refreshes the Table inside DOM using updated data
   */
  refreshTable(employees) {
    const tableWrapper = this.layout.$('#employees-table-wrapper');
    if (tableWrapper) {
      tableWrapper.innerHTML = '';
      this.table.props.data = employees;
      tableWrapper.appendChild(this.table.mount());
    }
  }

  /**
   * Opens the dynamic Modal form to register an employee
   */
  openAddEmployeeModal() {
    const formHTML = `
      <form id="add-employee-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary);">
        <div class="form-group">
          <label class="form-label" for="emp-name">Nombre Completo</label>
          <input type="text" id="emp-name" class="input input-md" placeholder="Ej. Juan Gómez" required />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="emp-role">Rol / Permiso</label>
            <select id="emp-role" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="WAITER">Mesero (Toma de pedidos)</option>
              <option value="KITCHEN">Cocinero (Visualización KDS)</option>
              <option value="CASHIER">Cajero (Punto de Venta / POS)</option>
              <option value="MANAGER">Gerente (Métricas y Personal)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="emp-custom-role">Puesto Personalizado (opcional)</label>
            <input type="text" id="emp-custom-role" class="input input-md" placeholder="Ej. Barman, Hostess, Cajero Nocturno" />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="emp-email">Correo Electrónico</label>
            <input type="email" id="emp-email" class="input input-md" placeholder="empleado@empresa.com" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="emp-password">Contraseña inicial</label>
            <input type="password" id="emp-password" class="input input-md" placeholder="Mín. 6 caracteres" minlength="6" required />
          </div>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-submit-btn">Guardar Empleado</button>
    `;

    this.modalInstance = new Modal({
      title: 'Agregar Trabajador a la Sucursal',
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
      submitBtn.addEventListener('click', () => this.submitNewEmployee());
    }
  }

  /**
   * Processes input values and saves them in Firebase Auth + Firestore
   */
  async submitNewEmployee() {
    const form = this.modalInstance.$('#add-employee-form');
    if (!form || !form.reportValidity()) return;

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creando cuenta...';
    }

    const name = this.modalInstance.$('#emp-name').value.trim();
    const role = this.modalInstance.$('#emp-role').value;
    const customRole = this.modalInstance.$('#emp-custom-role').value.trim();
    const email = this.modalInstance.$('#emp-email').value.trim();
    const password = this.modalInstance.$('#emp-password').value;

    try {
      console.log('[EmployeesView] Creando cuenta del empleado en la nube...');
      await AuthService.createUser(email, password, {
        displayName: name,
        role: role,
        customRole: customRole,
        companyId: this.companyId,
        branchId: this.branchId
      });

      NotificationService.success(`Trabajador "${name}" agregado exitosamente.`);
      
      // Close modal
      this.modalInstance.close();

      // Reload data
      this.loadEmployees();
    } catch (e) {
      console.error('[EmployeesView] Error al crear empleado:', e);
      alert(`Error al registrar el empleado en la nube: ${e.message || e}`);
      
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar Empleado';
      }
    }
  }

  unmount() {
    this.table.unmount();
    this.layout.unmount();
    super.unmount();
  }
}