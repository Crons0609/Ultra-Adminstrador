/**
 * @file employees.view.js
 * @description Employees Management view for Managers and Owners.
 * Allows adding new employees (Waiters, Cashiers, Chefs, Managers) and configures their credentials.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { NotificationService } from '../../../services/notification.service.js';

export class EmployeesView extends Component {
  constructor(params = {}) {
    super(params);

    // Get current logged-in user to filter employees by tenant (companyId)
    const currentUser = GlobalStore.getState().currentUser || { companyId: 'company-test' };
    this.companyId = currentUser.companyId;

    // Load initial mock employees for this tenant if not present
    this.initMockEmployees();

    // Initialize DataTable
    this.table = new DataTable({
      columns: [
        { key: 'displayName', label: 'Nombre Completo' },
        { key: 'email', label: 'Correo Electrónico' },
        { 
          key: 'role', 
          label: 'Rol de Trabajo',
          render: (val) => {
            const roleLabels = {
              MANAGER: 'Gerente',
              CASHIER: 'Cajero',
              WAITER: 'Mesero',
              KITCHEN: 'Cocinero'
            };
            return `<span style="font-weight: 500;">${roleLabels[val] || val}</span>`;
          }
        },
        { 
          key: 'status', 
          label: 'Estado',
          render: () => `<span class="badge" style="display:inline-flex;padding:2px 8px;font-size:0.75rem;font-weight:500;border-radius:var(--radius-full);background-color:var(--color-success-light);color:var(--color-success);">Activo</span>`
        }
      ],
      data: this.getTenantEmployees()
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

  /**
   * Initializes local employees list in localStorage if empty
   */
  initMockEmployees() {
    try {
      const dynamicUsers = JSON.parse(localStorage.getItem('ua_dynamic_users') || '[]');
      
      // Add default mock employees for the test tenant if empty
      const testEmployees = [
        { uid: 'emp-1', email: 'mesero@test.com', password: 'password', displayName: 'Juan Pérez', role: 'WAITER', companyId: this.companyId, branchId: 'main' },
        { uid: 'emp-2', email: 'cocina@test.com', password: 'password', displayName: 'Chef María', role: 'KITCHEN', companyId: this.companyId, branchId: 'main' },
        { uid: 'emp-3', email: 'cajero@test.com', password: 'password', displayName: 'Carlos López', role: 'CASHIER', companyId: this.companyId, branchId: 'main' }
      ];

      let added = false;
      testEmployees.forEach(mockEmp => {
        if (!dynamicUsers.some(u => u.email === mockEmp.email)) {
          dynamicUsers.push(mockEmp);
          added = true;
        }
      });

      if (added) {
        localStorage.setItem('ua_dynamic_users', JSON.stringify(dynamicUsers));
      }
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * Filter and return employees belonging to the current tenant (companyId)
   */
  getTenantEmployees() {
    try {
      const dynamicUsers = JSON.parse(localStorage.getItem('ua_dynamic_users') || '[]');
      // Filter out SUPER_ADMIN and users from other companies
      return dynamicUsers.filter(u => u.companyId === this.companyId && u.role !== 'SUPER_ADMIN' && u.role !== 'OWNER');
    } catch (e) {
      return [];
    }
  }

  mount() {
    const element = this.layout.mount();

    // Inject Table
    const tableWrapper = element.querySelector('#employees-table-wrapper');
    if (tableWrapper) {
      tableWrapper.appendChild(this.table.mount());
    }

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
  refreshTable() {
    const tableWrapper = this.layout.$('#employees-table-wrapper');
    if (tableWrapper) {
      tableWrapper.innerHTML = '';
      this.table.props.data = this.getTenantEmployees();
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

        <div class="form-group">
          <label class="form-label" for="emp-role">Rol de Trabajo / Permisos</label>
          <select id="emp-role" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
            <option value="WAITER">Mesero (Toma de pedidos)</option>
            <option value="KITCHEN">Cocinero (Visualización KDS)</option>
            <option value="CASHIER">Cajero (Punto de Venta / POS)</option>
            <option value="MANAGER">Gerente (Acceso a métricas y personal)</option>
          </select>
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

    // Bind footer actions
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
   * Processes input values and saves them dynamically in localStorage database
   */
  submitNewEmployee() {
    const form = this.modalInstance.$('#add-employee-form');
    if (!form || !form.reportValidity()) return;

    const name = this.modalInstance.$('#emp-name').value.trim();
    const role = this.modalInstance.$('#emp-role').value;
    const email = this.modalInstance.$('#emp-email').value.trim();
    const password = this.modalInstance.$('#emp-password').value;

    try {
      const dynamicUsers = JSON.parse(localStorage.getItem('ua_dynamic_users') || '[]');
      
      // Avoid duplicate emails
      if (dynamicUsers.some(u => u.email === email)) {
        alert('Este correo ya está registrado en el sistema.');
        return;
      }

      // Add new employee dynamic schema
      dynamicUsers.push({
        uid: `emp-${Date.now()}`,
        email: email,
        password: password,
        displayName: name,
        role: role,
        companyId: this.companyId,
        branchId: 'main'
      });

      localStorage.setItem('ua_dynamic_users', JSON.stringify(dynamicUsers));
      NotificationService.success(`Trabajador "${name}" agregado exitosamente.`);
      
      // Close modal and redraw table
      this.modalInstance.close();
      this.refreshTable();
    } catch (e) {
      console.error(e);
      alert('Error al guardar el empleado.');
    }
  }

  unmount() {
    this.table.unmount();
    this.layout.unmount();
    super.unmount();
  }
}