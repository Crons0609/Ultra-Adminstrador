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
import { GeolocationService } from '../../../services/geolocation.service.js';
import { TimeService } from '../../../services/time.service.js';
import { WaiterAssignmentService } from '../../../services/waiter-assignment.service.js';

export class EmployeesView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || 'company-test';
    this.branchId = currentUser.branchId || 'main';
    this.currentUser = currentUser;

    // Initialize state
    this.state = {
      employees: [],
      locations: [],
      tables: []
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
        },
        {
          key: 'locationStatus',
          label: 'GPS',
          render: (_, row) => {
            const location = this.state.locations.find(l => l.employeeId === row.uid || l.id === row.uid);
            if (!location) return '<span class="text-xs text-secondary">Sin ubicación</span>';
            return `<span class="text-xs text-secondary">${location.status || 'Disponible'} · ${TimeService.formatDate(location.updatedAt?.epochMs || location.updatedAt, true)}</span>`;
          }
        },
        {
          key: 'locationLink',
          label: 'Mapa',
          render: (_, row) => {
            const location = this.state.locations.find(l => l.employeeId === row.uid || l.id === row.uid);
            if (!location?.latitude || !location?.longitude) return '';
            return `<a class="btn btn-secondary btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${location.latitude},${location.longitude}">Ver</a>`;
          }
        },
        {
          key: 'actions',
          label: 'Acciones',
          render: (_, row) => {
            if (this.currentUser.role !== 'OWNER') return '<span class="text-xs text-secondary">Solo Dueño</span>';
            return `<button class="btn btn-danger btn-sm btn-delete-employee" data-uid="${row.uid}" data-name="${row.displayName || row.email}">Dar de Baja</button>`;
          }
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
        <button class="btn btn-secondary btn-sm" id="btn-start-gps">Activar mi GPS</button>
        <button class="btn btn-secondary btn-sm" id="btn-stop-gps">Detener GPS</button>
      `,
      contentHTML: `
        <div class="card p-5 mb-5">
          <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
            <h3 class="text-lg font-semibold">Listado de Personal</h3>
          </div>
          <!-- Table Wrapper -->
          <div id="employees-table-wrapper"></div>
        </div>

        <!-- Waiter Table Distribution Panel -->
        <div class="card p-5">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <div>
              <h3 class="text-md font-bold" style="margin:0;">📍 Distribución de Mesas</h3>
              <p class="text-secondary" style="font-size:0.8rem; margin:4px 0 0;">Carga de trabajo de meseros activos y mesas asignadas.</p>
            </div>
          </div>
          <div id="waiter-distribution-panel">
            <p class="text-secondary" style="font-size:0.85rem;">Cargando datos de distribución...</p>
          </div>
        </div>
      `
    });

    this.modalInstance = null;
    this.listeners = [];
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
      // Re-render distribution panel now that employee names are available
      this.renderWaiterDistribution();
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
    this.subscribeToLocations(element);
    this.subscribeToTablesDistribution(element);

    return element;
  }

  afterMount() {
    const addBtn = this.layout.$('#btn-add-employee');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openAddEmployeeModal());
    }

    const startGpsBtn = this.layout.$('#btn-start-gps');
    if (startGpsBtn) {
      startGpsBtn.addEventListener('click', () => this.startOwnGpsTracking());
    }

    const stopGpsBtn = this.layout.$('#btn-stop-gps');
    if (stopGpsBtn) {
      stopGpsBtn.addEventListener('click', () => {
        GeolocationService.stopTracking();
        NotificationService.success('Seguimiento GPS detenido en este dispositivo.');
      });
    }

    // Event delegation for delete buttons
    const tableWrapper = this.layout.$('#employees-table-wrapper');
    if (tableWrapper) {
      tableWrapper.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.btn-delete-employee');
        if (deleteBtn) {
          const uid = deleteBtn.getAttribute('data-uid');
          const name = deleteBtn.getAttribute('data-name');
          this.confirmDeleteEmployee(uid, name);
        }
      });
    }

    // Delegation for reassign buttons in distribution panel
    const distPanel = this.layout.$('#waiter-distribution-panel');
    if (distPanel) {
      distPanel.addEventListener('click', async (e) => {
        const resetBtn = e.target.closest('#btn-reset-rr-index');
        if (resetBtn) {
          await WaiterAssignmentService.resetRoundRobinIndex();
          NotificationService.success('Contador de asignación Round-Robin reiniciado.');
          return;
        }
        const reassignBtn = e.target.closest('.btn-reassign-table');
        if (reassignBtn) {
          const tableId = reassignBtn.getAttribute('data-table');
          const tableName = reassignBtn.getAttribute('data-table-name');
          this.openReassignModal(tableId, tableName);
        }
      });
    }
  }

  subscribeToLocations(element) {
    try {
      const listener = FirestoreService.listenToPath(`${this.companyId}/employee_locations`, (locations) => {
        this.state.locations = locations || [];
        this.refreshTable(this.state.employees);
      });
      this.listeners.push(listener);
    } catch (error) {
      console.warn('[EmployeesView] Error loading GPS locations:', error.message);
    }
  }

  subscribeToTablesDistribution(element) {
    try {
      const listener = FirestoreService.listenToTenant('tables', (tables) => {
        this.state.tables = tables || [];
        this.renderWaiterDistribution();
      });
      this.listeners.push(listener);
    } catch (err) {
      console.warn('[EmployeesView] Error subscribing to tables:', err.message);
    }
  }

  renderWaiterDistribution() {
    const panel = this.layout.$('#waiter-distribution-panel');
    if (!panel) return;

    const waiters = this.state.employees.filter(e => e.role === 'WAITER');
    const tables = this.state.tables.filter(t => t.status !== 'FREE');

    if (waiters.length === 0) {
      panel.innerHTML = '<p class="text-secondary" style="font-size:0.85rem;">No hay meseros registrados.</p>';
      return;
    }

    const rows = waiters.map(w => {
      const assignedTables = tables.filter(t => t.assignedWaiterId === w.uid);
      const unassignedCount = tables.filter(t => !t.assignedWaiterId).length;
      return `
        <tr>
          <td style="padding: 8px 12px; font-weight:600;">${w.displayName || w.email}</td>
          <td style="padding: 8px 12px; text-align:center;">
            <span class="badge" style="background:var(--color-accent-light, #3b82f622); color:var(--color-accent); font-size:0.8rem; padding: 2px 10px;">${assignedTables.length} mesas</span>
          </td>
          <td style="padding: 8px 12px;">
            ${assignedTables.map(t =>
              `<span style="display:inline-block; background:var(--color-bg-tertiary); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:2px 8px; font-size:0.75rem; margin:2px;">
                ${t.name}
                <button class="btn-reassign-table" data-table="${t.id}" data-table-name="${t.name}" title="Reasignar" style="background:none; border:none; cursor:pointer; color:var(--color-accent); font-size:0.7rem; padding:0 2px;">✏️</button>
              </span>`
            ).join('') || '<span class="text-secondary" style="font-size:0.8rem;">—</span>'}
          </td>
        </tr>
      `;
    }).join('');

    const unassigned = tables.filter(t => !t.assignedWaiterId);
    const unassignedRow = unassigned.length > 0 ? `
      <tr style="background: rgba(239,68,68,0.04);">
        <td style="padding: 8px 12px; color:#ef4444; font-weight:600;">⚠️ Sin asignar</td>
        <td style="padding: 8px 12px; text-align:center;"><span class="badge" style="background:#ef444422; color:#ef4444;">${unassigned.length}</span></td>
        <td style="padding: 8px 12px;">${unassigned.map(t =>
          `<span style="display:inline-block; background:#ef444411; border:1px solid #ef444433; border-radius:var(--radius-md); padding:2px 8px; font-size:0.75rem; margin:2px;">
            ${t.name}
            <button class="btn-reassign-table" data-table="${t.id}" data-table-name="${t.name}" title="Asignar" style="background:none; border:none; cursor:pointer; color:var(--color-accent); font-size:0.7rem; padding:0 2px;">➕</button>
          </span>`
        ).join('')}</td>
      </tr>
    ` : '';

    panel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-3);">
        <span style="font-size:0.82rem; color:var(--color-text-secondary);">Distribución en tiempo real. ${tables.length} mesa(s) activa(s).</span>
        <button id="btn-reset-rr-index" class="btn btn-secondary btn-xs">🔄 Reiniciar Rotación</button>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
          <thead>
            <tr style="border-bottom:2px solid var(--color-border);">
              <th style="padding:8px 12px; text-align:left;">Mesero</th>
              <th style="padding:8px 12px; text-align:center;">Carga</th>
              <th style="padding:8px 12px; text-align:left;">Mesas Asignadas</th>
            </tr>
          </thead>
          <tbody>${rows}${unassignedRow}</tbody>
        </table>
      </div>
    `;
  }

  async openReassignModal(tableId, tableName) {
    const waiters = this.state.employees.filter(e => e.role === 'WAITER');
    if (waiters.length === 0) {
      NotificationService.error('No hay meseros registrados para reasignar.');
      return;
    }

    const modal = new Modal({
      title: `Reasignar ${tableName}`,
      bodyHTML: `
        <p style="font-size:0.85rem; color:var(--color-text-secondary); margin-bottom:var(--space-3);">Selecciona el mesero al que deseas asignar esta mesa:</p>
        <div style="display:flex; flex-direction:column; gap:var(--space-2);">
          ${waiters.map(w => `
            <button class="btn btn-secondary w-full btn-pick-waiter" style="justify-content:flex-start;" data-uid="${w.uid}" data-name="${w.displayName || w.email}">
              👤 ${w.displayName || w.email}
            </button>
          `).join('')}
        </div>
      `,
      footerHTML: `<button class="btn btn-secondary btn-sm" id="btn-reassign-cancel">Cancelar</button>`,
      size: 'sm'
    });

    const el = modal.mount();
    document.body.appendChild(el);

    el.querySelector('#btn-reassign-cancel')?.addEventListener('click', () => modal.close());
    el.querySelectorAll('.btn-pick-waiter').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uid = btn.getAttribute('data-uid');
        const name = btn.getAttribute('data-name');
        try {
          await WaiterAssignmentService.reassignTable(tableId, uid, name);
          NotificationService.success(`${tableName} reasignada a ${name}.`);
          modal.close();
        } catch (e) {
          console.error(e);
          NotificationService.error('Error al reasignar la mesa.');
        }
      });
    });
  }

  startOwnGpsTracking() {
    const consent = confirm('¿Autorizas registrar tu ubicación GPS para seguimiento laboral en tiempo real? Puedes detenerlo desde este panel.');
    if (!consent) return;

    GeolocationService.startTracking({
      status: 'DISPONIBLE',
      onUpdate: () => NotificationService.success('Ubicación GPS actualizada.'),
      onError: (error) => NotificationService.error(error.message || 'No se pudo obtener la ubicación.')
    });
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

  confirmDeleteEmployee(uid, name) {
    if (confirm(`¿Estás seguro de que deseas dar de baja y eliminar al empleado "${name}" del negocio?`)) {
      this.deleteEmployee(uid);
    }
  }

  async deleteEmployee(uid) {
    try {
      await FirestoreService.removeEmployeeFromCompany(this.companyId, uid);
      NotificationService.success('Empleado dado de baja exitosamente.');
      this.loadEmployees();
    } catch (e) {
      console.error('[EmployeesView] Error deleting employee:', e);
      alert(`Error al dar de baja al empleado: ${e.message || e}`);
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
