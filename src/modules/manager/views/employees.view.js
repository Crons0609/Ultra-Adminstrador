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
import { getBusinessCategory } from '../../../config/business-types.config.js';

export class EmployeesView extends Component {
  constructor(params = {}) {
    super(params);

    const { currentUser, currentCompany } = GlobalStore.getState();
    this.companyId = currentUser?.companyId || 'company-test';
    this.branchId = currentUser?.branchId || 'main';
    this.currentUser = currentUser || {};
    this.currentCompany = currentCompany || {};

    const category = getBusinessCategory(this.currentCompany.businessType || '');
    this.isRestaurant = (category === 'GASTRONOMIA' || category === 'BAR_DISCOTECA');

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
            return `
              <div style="display:flex; gap:4px;">
                <button class="btn btn-secondary btn-sm btn-edit-employee" data-uid="${row.uid}" title="Editar">✏️ Editar</button>
                <button class="btn btn-danger btn-sm btn-delete-employee" data-uid="${row.uid}" data-name="${row.displayName || row.email}" title="Baja">🗑️ Baja</button>
              </div>
            `;
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
      `,
      contentHTML: `
        <div class="card p-5 mb-5">
          <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
            <h3 class="text-lg font-semibold">Listado de Personal</h3>
          </div>
          <!-- Table Wrapper -->
          <div id="employees-table-wrapper"></div>
        </div>

        <!-- GPS Live Location Map Panel -->
        <div class="card p-5 mb-5">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <div>
              <h3 class="text-md font-bold" style="margin:0;">🗺️ Mapa de Ubicaciones GPS</h3>
              <p class="text-secondary" style="font-size:0.8rem; margin:4px 0 0;">Posición en tiempo real de los empleados que compartieron su ubicación.</p>
            </div>
            <button class="btn btn-secondary btn-xs" id="btn-refresh-gps-map">🔄 Actualizar</button>
          </div>
          <div id="gps-map-panel">
            <div class="text-center py-6 text-secondary" style="font-size:0.85rem;">📡 Cargando ubicaciones GPS...</div>
          </div>
        </div>

        <!-- Waiter Table Distribution Panel -->
        ${this.isRestaurant ? `
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
        ` : ''}
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
          active: e.active !== false,
          permissions: e.permissions || {}
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
    
    if (this.isRestaurant) {
      this.subscribeToTablesDistribution(element);
    }

    return element;
  }

  afterMount() {
    const addBtn = this.layout.$('#btn-add-employee');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openAddEmployeeModal());
    }



    // Refresh GPS map button
    const refreshGpsBtn = this.layout.$('#btn-refresh-gps-map');
    if (refreshGpsBtn) {
      refreshGpsBtn.addEventListener('click', () => {
        this.renderGpsMap();
        NotificationService.success('Mapa GPS actualizado.');
      });
    }

    // Event delegation for actions buttons
    const tableWrapper = this.layout.$('#employees-table-wrapper');
    if (tableWrapper) {
      tableWrapper.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.btn-edit-employee');
        if (editBtn) {
          const uid = editBtn.getAttribute('data-uid');
          this.openEditEmployeeModal(uid);
          return;
        }

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
        this.renderGpsMap();
      });
      this.listeners.push(listener);
    } catch (error) {
      console.warn('[EmployeesView] Error loading GPS locations:', error.message);
    }
  }

  renderGpsMap() {
    const panel = this.layout.$('#gps-map-panel');
    if (!panel) return;

    const locations = this.state.locations.filter(l => l.latitude && l.longitude);

    if (locations.length === 0) {
      panel.innerHTML = `
        <div style="text-align:center; padding: var(--space-6);">
          <div style="font-size:2.5rem; margin-bottom:var(--space-3);">🛰️</div>
          <p class="font-semibold" style="margin-bottom:6px;">Sin ubicaciones activas</p>
          <p class="text-secondary" style="font-size:0.82rem; max-width:340px; margin:0 auto;">
            Ningún empleado ha activado el seguimiento GPS todavía.
            Al iniciar sesión, el sistema les solicitará permiso de ubicación automáticamente.
          </p>
        </div>
      `;
      return;
    }

    // If there's a single location, show a full-width map iframe.
    // If multiple, show cards + individual map links.
    const now = Date.now();

    const locationCards = locations.map(loc => {
      const employee = this.state.employees.find(e => e.uid === (loc.employeeId || loc.id));
      const name = loc.displayName || employee?.displayName || loc.email || 'Empleado';
      const status = loc.status || 'Disponible';
      const lastUpdated = loc.updatedAt?.epochMs || (typeof loc.updatedAt === 'number' ? loc.updatedAt : null);
      const elapsed = lastUpdated ? Math.round((now - lastUpdated) / 60000) : null;
      const elapsedText = elapsed === null ? '' : elapsed < 1 ? 'Hace un momento' : `Hace ${elapsed} min`;
      const accuracy = loc.accuracy ? `~${Math.round(loc.accuracy)}m` : '';
      const mapsUrl = `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`;
      const embedUrl = `https://maps.google.com/maps?q=${loc.latitude},${loc.longitude}&z=16&output=embed`;

      const statusColor = status === 'DISPONIBLE' || status === 'Disponible'
        ? '#10b981' : status === 'OCUPADO' ? '#f59e0b' : '#6b7280';

      return `
        <div style="
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        ">
          <!-- Map Embed -->
          <div style="position:relative; height:220px; background: #1a1a2e; overflow:hidden;">
            <iframe
              src="${embedUrl}"
              style="width:100%; height:100%; border:none; pointer-events:auto;"
              loading="lazy"
              referrerpolicy="no-referrer-when-downgrade"
              title="Ubicación de ${name}"
            ></iframe>
          </div>

          <!-- Employee Info -->
          <div style="padding: var(--space-4); display:flex; justify-content:space-between; align-items:center; gap:var(--space-3); flex-wrap:wrap;">
            <div>
              <div style="font-weight:700; font-size:0.9rem;">${name}</div>
              <div style="display:flex; align-items:center; gap:8px; margin-top:4px; flex-wrap:wrap;">
                <span style="display:inline-flex; align-items:center; gap:4px; font-size:0.75rem; color:${statusColor}; font-weight:600;">
                  <span style="width:6px; height:6px; border-radius:50%; background:currentColor; display:inline-block;"></span>
                  ${status}
                </span>
                ${elapsedText ? `<span class="text-secondary" style="font-size:0.72rem;">${elapsedText}</span>` : ''}
                ${accuracy ? `<span class="text-secondary" style="font-size:0.72rem;">📡 ${accuracy}</span>` : ''}
              </div>
            </div>
            <div style="display:flex; gap:var(--space-2);">
              <a href="${mapsUrl}" target="_blank" rel="noopener" class="btn btn-primary btn-xs">
                🗺️ Ver en Maps
              </a>
            </div>
          </div>
        </div>
      `;
    }).join('');

    panel.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:var(--space-4);">
        ${locationCards}
      </div>
    `;
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

    const waiters = this.state.employees.filter(e => e.role === 'WAITER' || e.permissions?.tomar_pedidos === true);
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
    const waiters = this.state.employees.filter(e => e.role === 'WAITER' || e.permissions?.tomar_pedidos === true);
    if (waiters.length === 0) {
      NotificationService.error('No hay personal habilitado para tomar pedidos.');
      return;
    }

    const modal = new Modal({
      title: `Reasignar ${tableName}`,
      bodyHTML: `
        <p style="font-size:0.85rem; color:var(--color-text-secondary); margin-bottom:var(--space-3);">Selecciona el trabajador al que deseas asignar esta mesa:</p>
        <div style="display:flex; flex-direction:column; gap:var(--space-2);">
          ${waiters.map(w => {
            const displayCargo = w.customRole || (w.role === 'WAITER' ? 'Mesero' : w.role);
            return `
              <button class="btn btn-secondary w-full btn-pick-waiter" style="justify-content:flex-start;" data-uid="${w.uid}" data-name="${w.displayName || w.email}" data-role="${displayCargo}">
                👤 ${w.displayName || w.email} (${displayCargo})
              </button>
            `;
          }).join('')}
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
        const role = btn.getAttribute('data-role');
        try {
          await WaiterAssignmentService.reassignTable(tableId, uid, name, role);
          NotificationService.success(`${tableName} reasignada a ${name}.`);
          modal.close();
        } catch (e) {
          console.error(e);
          NotificationService.error('Error al reasignar la mesa.');
        }
      });
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

  getSYSTEM_PERMISSIONS() {
    return [
      // Restaurante / Alimentos
      { key: 'tomar_pedidos', label: '🍽️ Tomar pedidos' },
      { key: 'editar_pedidos', label: '📝 Editar pedidos' },
      { key: 'cancelar_pedidos', label: '❌ Cancelar pedidos' },
      { key: 'cobrar_pedidos', label: '💵 Cobrar pedidos' },
      { key: 'administrar_caja', label: '🏦 Administrar caja' },
      { key: 'administrar_mesas', label: '📍 Administrar mesas' },
      { key: 'gestionar_reservas', label: '📅 Gestionar reservas' },

      // Servicios Múltiples / Citas / Rentas
      { key: 'gestionar_servicios', label: '🛠️ Gestionar servicios / tareas' },
      { key: 'gestionar_citas', label: '🗓️ Gestionar citas y agenda' },
      { key: 'gestionar_alquileres', label: '🔑 Gestionar alquileres y rentas' },
      { key: 'gestionar_vehiculos', label: '🚗 Gestionar vehículos / delivery' },
      { key: 'gestionar_herramientas', label: '🔧 Gestionar herramientas y equipos' },
      { key: 'gestionar_clientes', label: '👥 Gestionar clientes' },
      { key: 'registrar_ubicacion_clientes', label: '📍 Registrar ubicación de clientes' },

      // Operaciones Generales
      { key: 'ver_reportes', label: '📊 Ver reportes' },
      { key: 'gestionar_productos', label: '📦 Gestionar productos y catálogo' },
      { key: 'gestionar_categorias', label: '📁 Gestionar categorías' },
      { key: 'gestionar_inventario', label: '🗄️ Gestionar inventario / stock' },
      { key: 'administrar_empleados', label: '👥 Administrar empleados' },
      { key: 'ver_estadisticas', label: '📈 Ver estadísticas' },
      { key: 'configurar_impresoras', label: '🖨️ Configurar impresoras' },
      { key: 'recibir_notificaciones', label: '🔔 Recibir notificaciones' },
      { key: 'administrar_promociones', label: '🏷️ Administrar promociones' }
    ];
  }

  renderPermissionsCheckboxes(existingPermissions = {}) {
    return this.getSYSTEM_PERMISSIONS().map(p => {
      const isChecked = existingPermissions[p.key] === true ? 'checked' : '';
      return `
        <label style="display:flex; align-items:center; gap:8px; font-size:0.75rem; background:rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 6px 10px; border-radius: 6px; cursor:pointer; user-select:none;">
          <input type="checkbox" class="permission-chk-input" data-permission="${p.key}" ${isChecked} style="cursor:pointer;" />
          <span style="color:var(--color-text-secondary);">${p.label}</span>
        </label>
      `;
    }).join('');
  }

  setupModalCargoListeners(modalOverlay, selectId, customContainerId, customInputId) {
    const select = modalOverlay.querySelector(`#${selectId}`);
    const customContainer = modalOverlay.querySelector(`#${customContainerId}`);
    const customInput = modalOverlay.querySelector(`#${customInputId}`);

    const updateUI = (isUserChange = false) => {
      const val = select.value;
      if (val === 'CUSTOM') {
        customContainer.style.display = 'block';
        customInput.required = true;
      } else {
        customContainer.style.display = 'none';
        customInput.required = false;
        if (isUserChange) customInput.value = '';
      }
      if (isUserChange) {
        this.applyPermissionPresets(val, modalOverlay);
      }
    };

    select.addEventListener('change', () => updateUI(true));
    updateUI(false);
  }

  applyPermissionPresets(roleValue, modalEl) {
    const checkboxes = modalEl.querySelectorAll('.permission-chk-input');
    const presets = {
      MANAGER: {
        tomar_pedidos: true, editar_pedidos: true, cancelar_pedidos: true, cobrar_pedidos: true,
        administrar_caja: true, ver_reportes: true, gestionar_productos: true, gestionar_categorias: true,
        gestionar_inventario: true, administrar_empleados: true, administrar_mesas: true, gestionar_reservas: true,
        ver_estadisticas: true, configurar_impresoras: true, recibir_notificaciones: true, administrar_promociones: true,
        gestionar_clientes: true
      },
      WAITER: {
        tomar_pedidos: true, editar_pedidos: true, recibir_notificaciones: true
      },
      CASHIER: {
        cobrar_pedidos: true, administrar_caja: true, recibir_notificaciones: true
      },
      KITCHEN: {
        recibir_notificaciones: true
      },
      CUSTOM: {}
    };

    const selectedPreset = presets[roleValue] || {};
    checkboxes.forEach(chk => {
      const key = chk.getAttribute('data-permission');
      chk.checked = selectedPreset[key] === true;
    });
  }

  extractModalPermissions(modalEl) {
    const permissions = {};
    modalEl.querySelectorAll('.permission-chk-input').forEach(chk => {
      const key = chk.getAttribute('data-permission');
      permissions[key] = chk.checked;
    });
    return permissions;
  }

  openAddEmployeeModal() {
    let modalOverlay = document.getElementById('settings-worker-modal-manager');
    if (modalOverlay) modalOverlay.remove();

    const rolesSelectOptions = `
      <option value="WAITER">Mesero / Salonero</option>
      <option value="KITCHEN">Cocinero / Chef</option>
      <option value="CASHIER">Cajero</option>
      <option value="MANAGER">Gerente / Administrador</option>
      <option value="CUSTOM">Cargo Personalizado...</option>
    `;

    const formHTML = `
      <form id="add-employee-form" style="display:flex; flex-direction:column; gap: var(--space-3); color: var(--color-text-primary);">
        <div class="form-group">
          <label class="form-label" for="emp-name">Nombre Completo <span class="form-label-required"></span></label>
          <input type="text" id="emp-name" class="input input-md" placeholder="Ej. Carlos Torres" required />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="emp-role">Cargo / Rol <span class="form-label-required"></span></label>
            <select id="emp-role" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              ${rolesSelectOptions}
            </select>
          </div>
          <div class="form-group" id="emp-custom-container" style="display:none;">
            <label class="form-label" for="emp-custom-role">Especificar Cargo <span class="form-label-required"></span></label>
            <input type="text" id="emp-custom-role" class="input input-md" placeholder="Ej. Bartender, Recepcionista" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="emp-phone">Teléfono</label>
          <input type="text" id="emp-phone" class="input input-md" placeholder="Ej. +505 8888-8888" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="emp-email">Correo Electrónico <span class="form-label-required"></span></label>
            <input type="email" id="emp-email" class="input input-md" placeholder="empleado@correo.com" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="emp-password">Contraseña Inicial <span class="form-label-required"></span></label>
            <input type="password" id="emp-password" class="input input-md" placeholder="Min. 6 caracteres" minlength="6" required />
          </div>
        </div>

        <!-- Permisos checklist -->
        <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px; margin-top: 4px;">
          <label class="form-label" style="font-weight: 700; margin-bottom: 8px; display: block; color: var(--color-accent);">🔑 Permisos del Sistema</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-height: 180px; overflow-y: auto; padding-right: 4px;">
            ${this.renderPermissionsCheckboxes()}
          </div>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-submit-btn">Guardar Empleado</button>
    `;

    this.modalInstance = new Modal({
      title: '👥 Registrar Nuevo Trabajador',
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'md'
    });

    const el = this.modalInstance.mount();
    el.setAttribute('id', 'settings-worker-modal-manager');
    document.body.appendChild(el);

    this.setupModalCargoListeners(el, 'emp-role', 'emp-custom-container', 'emp-custom-role');

    el.querySelector('#modal-cancel-btn')?.addEventListener('click', () => this.modalInstance.close());
    el.querySelector('#modal-submit-btn')?.addEventListener('click', () => this.submitNewEmployee(el));
  }

  async submitNewEmployee(modalEl) {
    const form = modalEl.querySelector('#add-employee-form');
    if (!form || !form.reportValidity()) return;

    const submitBtn = modalEl.querySelector('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creando cuenta...';
    }

    const displayName = modalEl.querySelector('#emp-name').value.trim();
    const roleSelectVal = modalEl.querySelector('#emp-role').value;
    const customRoleInputVal = modalEl.querySelector('#emp-custom-role').value.trim();
    const phone = modalEl.querySelector('#emp-phone').value.trim();
    const email = modalEl.querySelector('#emp-email').value.trim();
    const password = modalEl.querySelector('#emp-password').value;

    const permissions = this.extractModalPermissions(modalEl);

    const role = roleSelectVal === 'CUSTOM' ? 'WAITER' : roleSelectVal;
    const customRole = roleSelectVal === 'CUSTOM' ? customRoleInputVal : '';

    try {
      console.log('[EmployeesView] Creando cuenta del empleado en la nube...');
      const uid = await AuthService.createUser(email, password, {
        displayName,
        role,
        customRole,
        companyId: this.companyId,
        branchId: this.branchId,
        permissions
      });

      // Save phone details to user profile in RTDB if defined
      const { db } = await import('../../../config/firebase.config.js');
      const { ref, update } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');
      if (phone && db) {
        await update(ref(db, `users/${uid}`), { phone });
        await update(ref(db, `${this.companyId}/employees/${uid}`), { phone });
      }

      NotificationService.success(`Trabajador "${displayName}" agregado exitosamente.`);
      this.modalInstance.close();
      this.loadEmployees();
    } catch (e) {
      console.error('[EmployeesView] Error al crear empleado:', e);
      alert(`Error al registrar el empleado: ${e.message || e}`);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar Empleado';
      }
    }
  }

  openEditEmployeeModal(uid) {
    const emp = this.state.employees.find(e => e.uid === uid);
    if (!emp) return;

    let modalOverlay = document.getElementById('settings-worker-edit-modal-manager');
    if (modalOverlay) modalOverlay.remove();

    const isCustom = emp.customRole ? true : false;
    const rolesSelectOptions = `
      <option value="WAITER" ${(!isCustom && emp.role === 'WAITER') ? 'selected' : ''}>Mesero / Salonero</option>
      <option value="KITCHEN" ${(!isCustom && emp.role === 'KITCHEN') ? 'selected' : ''}>Cocinero / Chef</option>
      <option value="CASHIER" ${(!isCustom && emp.role === 'CASHIER') ? 'selected' : ''}>Cajero</option>
      <option value="MANAGER" ${(!isCustom && emp.role === 'MANAGER') ? 'selected' : ''}>Gerente / Administrador</option>
      <option value="CUSTOM" ${isCustom ? 'selected' : ''}>Cargo Personalizado...</option>
    `;

    const formHTML = `
      <form id="edit-employee-form" style="display:flex; flex-direction:column; gap: var(--space-3); color: var(--color-text-primary);">
        <div class="form-group">
          <label class="form-label" for="edit-emp-name">Nombre Completo <span class="form-label-required"></span></label>
          <input type="text" id="edit-emp-name" class="input input-md" value="${this.escapeHTML(emp.displayName)}" required />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="edit-emp-role">Cargo / Rol</label>
            <select id="edit-emp-role" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              ${rolesSelectOptions}
            </select>
          </div>
          <div class="form-group" id="edit-emp-custom-container" style="display:${isCustom ? 'block' : 'none'};">
            <label class="form-label" for="edit-emp-custom-role">Especificar Cargo <span class="form-label-required"></span></label>
            <input type="text" id="edit-emp-custom-role" class="input input-md" value="${isCustom ? this.escapeHTML(emp.customRole) : ''}" placeholder="Ej. Bartender, Recepcionista" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="edit-emp-phone">Teléfono</label>
          <input type="text" id="edit-emp-phone" class="input input-md" value="${this.escapeHTML(emp.phone && emp.phone !== '—' ? emp.phone : '')}" placeholder="Ej. +505 8888-8888" />
        </div>

        <div class="form-group">
          <label class="form-label" for="edit-emp-email">Correo Electrónico</label>
          <input type="email" id="edit-emp-email" class="input input-md" value="${this.escapeHTML(emp.email)}" required />
        </div>

        <div class="form-group">
          <label class="switch-container">
            <input type="checkbox" id="edit-emp-active" class="switch-input" ${emp.active ? 'checked' : ''} />
            <div>
              <strong style="font-size:0.85rem; display:block;">Estado de la cuenta</strong>
              <span class="text-xs text-secondary">Activar o suspender el acceso de este trabajador.</span>
            </div>
          </label>
        </div>

        <!-- Permisos checklist -->
        <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px; margin-top: 4px;">
          <label class="form-label" style="font-weight: 700; margin-bottom: 8px; display: block; color: var(--color-accent);">🔑 Permisos del Sistema</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-height: 180px; overflow-y: auto; padding-right: 4px;">
            ${this.renderPermissionsCheckboxes(emp.permissions)}
          </div>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="edit-modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="edit-modal-submit-btn">Guardar Cambios</button>
    `;

    const editModal = new Modal({
      title: '✏️ Editar Información de Empleado',
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'md'
    });

    const el = editModal.mount();
    el.setAttribute('id', 'settings-worker-edit-modal-manager');
    document.body.appendChild(el);

    this.setupModalCargoListeners(el, 'edit-emp-role', 'edit-emp-custom-container', 'edit-emp-custom-role');

    el.querySelector('#edit-modal-cancel-btn')?.addEventListener('click', () => editModal.close());
    el.querySelector('#edit-modal-submit-btn')?.addEventListener('click', async () => {
      const form = el.querySelector('#edit-employee-form');
      if (!form || !form.reportValidity()) return;

      const submitBtn = el.querySelector('#edit-modal-submit-btn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando cambios...';

      const displayName = el.querySelector('#edit-emp-name').value.trim();
      const roleSelectVal = el.querySelector('#edit-emp-role').value;
      const customRoleInputVal = el.querySelector('#edit-emp-custom-role').value.trim();
      const phone = el.querySelector('#edit-emp-phone').value.trim();
      const email = el.querySelector('#edit-emp-email').value.trim();
      const active = el.querySelector('#edit-emp-active').checked;

      const permissions = this.extractModalPermissions(el);

      const role = roleSelectVal === 'CUSTOM' ? 'WAITER' : roleSelectVal;
      const customRole = roleSelectVal === 'CUSTOM' ? customRoleInputVal : '';

      try {
        const timestamp = Date.now();
        const updates = {};

        updates[`users/${uid}/displayName`] = displayName;
        updates[`users/${uid}/email`] = email;
        updates[`users/${uid}/role`] = role;
        updates[`users/${uid}/customRole`] = customRole;
        updates[`users/${uid}/phone`] = phone;
        updates[`users/${uid}/status`] = active ? 'ACTIVE' : 'DISABLED';
        updates[`users/${uid}/disabled`] = !active;
        updates[`users/${uid}/permissions`] = permissions;
        updates[`users/${uid}/updatedAt`] = timestamp;

        updates[`${this.companyId}/employees/${uid}/displayName`] = displayName;
        updates[`${this.companyId}/employees/${uid}/email`] = email;
        updates[`${this.companyId}/employees/${uid}/role`] = role;
        updates[`${this.companyId}/employees/${uid}/customRole`] = customRole;
        updates[`${this.companyId}/employees/${uid}/phone`] = phone;
        updates[`${this.companyId}/employees/${uid}/active`] = active;
        updates[`${this.companyId}/employees/${uid}/permissions`] = permissions;
        updates[`${this.companyId}/employees/${uid}/updatedAt`] = timestamp;

        const { db } = await import('../../../config/firebase.config.js');
        const { ref, update } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');
        if (db) {
          await update(ref(db), updates);
        }

        await FirestoreService.logAudit({
          action: 'OWNER_EDIT_EMPLOYEE',
          companyId: this.companyId,
          description: `El gerente/dueño editó el perfil del empleado ${displayName} (${email}). Rol: ${role}, Cargo: ${customRole || 'Predefinido'}, Activo: ${active}.`
        });

        NotificationService.success(`Datos de "${displayName}" actualizados.`);
        editModal.close();
        this.loadEmployees();
      } catch (err) {
        console.error(err);
        alert(`Error al guardar cambios: ${err.message || err}`);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar Cambios';
      }
    });
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

  escapeHTML(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.table.unmount();
    this.layout.unmount();
    super.unmount();
  }
}
