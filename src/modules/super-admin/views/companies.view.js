import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';
import { Modal } from '../../../components/ui/modal.js';
import { Company } from '../../../models/company.model.js';
import { GlobalStore } from '../../../core/state.js';
import { NotificationService } from '../../../services/notification.service.js';
import { AuthService } from '../../../services/auth.service.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { getBusinessTypeOptions, getBusinessCategory } from '../../../config/business-types.config.js';

export class CompaniesView extends Component {
  constructor(params = {}) {
    super(params);

    // Initialize store with empty list — data will be loaded from Firebase RTDB
    GlobalStore.set({ companies: [] });

    // Initialize DataTable
    this.table = new DataTable({
      columns: [
        { key: 'name', label: 'Empresa / Negocio' },
        { 
          key: 'businessType', 
          label: 'Tipo', 
          render: (val) => val || 'Restaurante'
        },
        { 
          key: 'plan', 
          label: 'Plan',
          render: (val) => `<span style="font-weight: 600; color: var(--color-accent);">${val}</span>`
        },
        { 
          key: 'status', 
          label: 'Estado',
          render: (val) => {
            let label = 'Activo';
            let variant = 'success';
            if (val === 'INACTIVO') {
              label = 'Inactivo';
              variant = 'secondary';
            } else if (val === 'FALTA_PAGO') {
              label = 'Falta de Pago';
              variant = 'danger';
            } else if (val === 'SUSPENDIDO') {
              label = 'Suspendido';
              variant = 'warning';
            } else if (val === 'ELIMINADO') {
              label = 'Papelera';
              variant = 'danger';
            }
            return `<span class="badge" style="display:inline-flex;padding:2px 8px;font-size:0.75rem;font-weight:500;border-radius:var(--radius-full);background-color:var(--color-${variant}-light);color:var(--color-${variant});">${label}</span>`;
          }
        },
        {
          key: 'subscriptionExpiresAt',
          label: 'Vencimiento',
          render: (val) => {
            if (!val) return '<span style="color:var(--color-text-secondary); font-style:italic;">Ilimitado</span>';
            const expDate = new Date(val);
            const today = new Date();
            today.setHours(0,0,0,0);
            const isExpired = expDate < today;
            const formatted = val.split('-').reverse().join('/'); // DD/MM/YYYY
            return isExpired 
              ? `<span style="color:var(--color-danger); font-weight:600;">⚠️ ${formatted} (Vencido)</span>`
              : `<span style="color:var(--color-text-primary);">${formatted}</span>`;
          }
        },
        {
          key: 'ownerEmail',
          label: 'Credenciales del Cliente (Dueño)',
          render: (val, row) => `
            <div>
              <div style="font-weight: 600; color: var(--color-accent); font-size: 0.82rem;">📧 ${val || row.ownerEmail || '—'}</div>
              <div style="font-size: 0.75rem; color: var(--color-text-secondary); margin-top:2px;">
                🔑 <code style="background:var(--color-bg-tertiary); border:1px solid var(--color-border); padding:1px 6px; border-radius:4px; font-family:monospace; font-weight:bold; color:var(--color-text-primary);">${row.ownerPassword || '••••••••'}</code>
              </div>
            </div>
          `
        },
        { key: 'branches', label: 'Sucursales' },
        { key: 'users', label: 'Usuarios' },
        {
          key: 'id',
          label: 'Acciones',
          render: (_, row) => `
            <div class="d-flex gap-2 flex-wrap" data-stop-row-click="true">
              ${row.status === 'ELIMINADO'
                ? `<button class="btn btn-secondary btn-sm btn-company-action" data-action="restore" data-id="${row.id}">Restaurar</button>
                   <button class="btn btn-danger btn-sm btn-company-action" data-action="hard-delete" data-id="${row.id}">Eliminar definitivo</button>`
                : `<button class="btn btn-primary btn-sm btn-company-action" data-action="edit" data-id="${row.id}" style="background-color: var(--color-accent); color: white; border: none;">Editar</button>
                   <button class="btn btn-warning btn-sm btn-company-action" data-action="credentials" data-id="${row.id}" style="font-size:0.75rem; padding: 3px 8px;" title="Ver / Cambiar Contraseña">🔑 Credenciales</button>
                   <button class="btn btn-secondary btn-sm btn-company-action" data-action="deactivate" data-id="${row.id}">Desactivar</button>
                   <button class="btn btn-secondary btn-sm btn-company-action" data-action="suspend" data-id="${row.id}">Suspender</button>
                   <button class="btn btn-danger btn-sm btn-company-action" data-action="trash" data-id="${row.id}">Papelera</button>`}
            </div>
          `
        }
      ],
      data: GlobalStore.getState().companies,
      onRowClick: (row) => {
        this.openEditCompanyModal(row);
      }
    });

    // PageLayout setup
    this.layout = new PageLayout({
      title: 'Gestión de Empresas',
      subtitle: 'Administración, parametrización y asignación de licencias para múltiples modelos de negocio en el SaaS.',
      actionHTML: `
        <div class="d-flex gap-2">
          <button class="btn btn-danger btn-sm" id="btn-purge-production" style="background:var(--color-danger); color:white; font-weight:600;">
            💣 Reset para Producción
          </button>
          <button class="btn btn-primary btn-sm" id="btn-add-company">
            <span style="margin-right: var(--space-1);">+</span> Registrar Negocio
          </button>
        </div>
      `,
      contentHTML: `
        <div class="card p-5">
          <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
            <h3 class="text-lg font-semibold">Registros de Clientes Activos</h3>
          </div>
          <!-- Table container -->
          <div id="companies-table-wrapper"></div>
        </div>
      `
    });

    // Subscribe to store updates to dynamically redraw the table
    this.unsubscribe = GlobalStore.subscribe('companies', (companies) => {
      this.refreshTable(companies);
    });

    this.modalInstance = null;
  }

  async loadCompanies() {
    try {
      const companies = await FirestoreService.listAllCompanies();
      GlobalStore.set({ companies });
      
      let plans = await FirestoreService.listPlans();
      if (!plans || !plans.length) {
        const defaults = [
          { id: 'BASIC', name: 'Plan Basic', price: 499, currency: 'NIO', duration: 'Mensual', description: 'Ideal para cafeterías pequeñas o un solo local.', benefits: '1 Sucursal, 3 Usuarios activos, Menú Digital QR', userLimit: 3, employeeLimit: 5, storageGb: 1, branchLimit: 1, productLimit: 100, status: 'ACTIVO', color: '#64748b', icon: 'store', order: 1, enabledFeatures: 'menu_qr,inventario' },
          { id: 'PREMIUM', name: 'Plan Premium', price: 999, currency: 'NIO', duration: 'Mensual', description: 'El más popular para restaurantes en crecimiento.', benefits: '3 Sucursales, Usuarios ilimitados, Módulo KDS e Inventario', userLimit: 20, employeeLimit: 50, storageGb: 5, branchLimit: 3, productLimit: 1000, status: 'ACTIVO', color: '#7c75ff', icon: 'crown', order: 2, enabledFeatures: 'menu_qr,inventario,kds,reportes' },
          { id: 'ENTERPRISE', name: 'Plan Enterprise', price: 1999, currency: 'NIO', duration: 'Mensual', description: 'Para franquicias y grandes cadenas de comida.', benefits: 'Sucursales ilimitadas, Soporte prioritario 24/7, API abierta e informes avanzados', userLimit: 0, employeeLimit: 0, storageGb: 25, branchLimit: 0, productLimit: 0, status: 'ACTIVO', color: '#16a34a', icon: 'building', order: 3, enabledFeatures: 'menu_qr,inventario,kds,reportes,api,soporte_prioritario' }
        ];
        await Promise.all(defaults.map(plan => FirestoreService.savePlan(plan.id, plan)));
        plans = defaults;
      }
      GlobalStore.set({ plans });
      console.log('[CompaniesView] ✅ Carga desde RTDB. Total:', companies.length);
    } catch (e) {
      console.error('[CompaniesView] Fallo al leer de la base de datos:', e);
      NotificationService.error('Error al sincronizar con la base de datos remota.');
    }
  }

  mount() {
    const element = this.layout.mount();

    // Inject Table
    const tableWrapper = element.querySelector('#companies-table-wrapper');
    if (tableWrapper) {
      tableWrapper.appendChild(this.table.mount());
    }

    // Call afterMount manually to bind events since mount is overridden
    this.afterMount();

    // Sync with Firestore asynchronously
    this.loadCompanies();

    return element;
  }

  afterMount() {
    const addBtn = this.layout.$('#btn-add-company');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openAddCompanyModal());
    }

    const purgeBtn = this.layout.$('#btn-purge-production');
    if (purgeBtn) {
      purgeBtn.addEventListener('click', () => this.openPurgeModal());
    }

    const wrapper = this.layout.$('#companies-table-wrapper');
    if (wrapper && !this._companyActionsBound) {
      this._companyActionsBound = true;
      wrapper.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-company-action');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        const company = (GlobalStore.getState().companies || []).find(c => c.id === id);

        if (action === 'edit') {
          if (company) this.openEditCompanyModal(company);
        } else if (action === 'credentials') {
          if (company) this.openCredentialsModal(company);
        } else {
          this.handleCompanyAction(id, action);
        }
      });
    }
  }

  /**
   * Refreshes the Table inside DOM using updated data from GlobalStore
   * @param {Array} companies 
   */
  refreshTable(companies) {
    const tableWrapper = this.layout.$('#companies-table-wrapper');
    if (tableWrapper) {
      tableWrapper.innerHTML = '';
      this.table.props.data = companies;
      tableWrapper.appendChild(this.table.mount());
    }
  }

  /**
   * Automatically select checkboxes in modal form based on business category.
   */
  autoConfigureModules(type, prefix = '') {
    const category = getBusinessCategory(type);
    const setChecked = (id, checked) => {
      const el = this.modalInstance.$(`#${prefix}${id}`);
      if (el) el.checked = checked;
    };
    
    if (category === 'GASTRONOMIA' || category === 'BAR_DISCOTECA') {
      setChecked('mod-kds', true);
      setChecked('mod-qr', true);
      setChecked('mod-whatsapp', false);
      setChecked('mod-billing', true);
      setChecked('mod-vehicles-catalog', false);
      setChecked('mod-rentals', false);
      setChecked('mod-rental-reminders', false);
      setChecked('mod-appointments', false);
      setChecked('mod-schedules', false);
      setChecked('mod-service-requests', false);
      setChecked('mod-staff-roles', true);
      setChecked('mod-employee-pricing', false);
    } else if (category === 'SUPERMERCADO_TIENDA') {
      setChecked('mod-kds', false);
      setChecked('mod-qr', true); // Catálogo QR
      setChecked('mod-whatsapp', false);
      setChecked('mod-billing', true);
      setChecked('mod-vehicles-catalog', false);
      setChecked('mod-rentals', false);
      setChecked('mod-rental-reminders', false);
      setChecked('mod-appointments', false);
      setChecked('mod-schedules', false);
      setChecked('mod-service-requests', false);
      setChecked('mod-staff-roles', true);
      setChecked('mod-employee-pricing', true);
    } else if (category === 'RENT_A_CAR') {
      setChecked('mod-kds', false);
      setChecked('mod-qr', false);
      setChecked('mod-whatsapp', true);
      setChecked('mod-billing', true);
      setChecked('mod-vehicles-catalog', true);
      setChecked('mod-rentals', true);
      setChecked('mod-rental-reminders', true);
      setChecked('mod-appointments', false);
      setChecked('mod-schedules', false);
      setChecked('mod-service-requests', false);
      setChecked('mod-staff-roles', false);
      setChecked('mod-employee-pricing', false);
    } else if (category === 'BARBERIA') {
      setChecked('mod-kds', false);
      setChecked('mod-qr', false);
      setChecked('mod-whatsapp', true);
      setChecked('mod-billing', true);
      setChecked('mod-vehicles-catalog', false);
      setChecked('mod-rentals', false);
      setChecked('mod-rental-reminders', false);
      setChecked('mod-appointments', true);
      setChecked('mod-schedules', true);
      setChecked('mod-service-requests', false);
      setChecked('mod-staff-roles', false);
      setChecked('mod-employee-pricing', false);
    } else if (category === 'VENTAS') {
      setChecked('mod-kds', false);
      setChecked('mod-qr', false);
      setChecked('mod-whatsapp', false);
      setChecked('mod-billing', true);
      setChecked('mod-vehicles-catalog', false);
      setChecked('mod-rentals', false);
      setChecked('mod-rental-reminders', false);
      setChecked('mod-appointments', false);
      setChecked('mod-schedules', false);
      setChecked('mod-service-requests', false);
      setChecked('mod-staff-roles', true);
      setChecked('mod-employee-pricing', true);
    } else if (category === 'SERVICIOS_PERSONALIZADOS') {
      setChecked('mod-kds', false);
      setChecked('mod-qr', false);
      setChecked('mod-whatsapp', true);
      setChecked('mod-billing', true);
      setChecked('mod-vehicles-catalog', false);
      setChecked('mod-rentals', false);
      setChecked('mod-rental-reminders', false);
      setChecked('mod-appointments', false);
      setChecked('mod-schedules', false);
      setChecked('mod-service-requests', true);
      setChecked('mod-staff-roles', false);
      setChecked('mod-employee-pricing', false);
    }
  }

  /**
   * Opens the customizable modal form to add a parameterized business
   */
  async openAddCompanyModal() {
    // Always fetch fresh plans from Firebase RTDB (saas_plans collection)
    let plans = [];
    try {
      console.log('[CompaniesView] Fetching plans from saas_plans...');
      plans = await FirestoreService.listPlans();
      console.log(`[CompaniesView] ✅ Loaded ${plans.length} plans:`, plans.map(p => `${p.name} $${p.price}`));
      GlobalStore.set({ plans });
    } catch (e) {
      console.error('[CompaniesView] ❌ Could not fetch plans from Firebase:', e);
      // Try GlobalStore as last resort
      plans = GlobalStore.getState().plans || [];
    }

    if (!plans.length) {
      console.warn('[CompaniesView] ⚠️ No plans found in saas_plans. Check Firebase DB path.');
      NotificationService.warning('No se encontraron planes en Firebase. Ve a Planes SaaS y crea al menos uno.', 5000);
    }

    const planOptionsHTML = plans.length > 0
      ? plans
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
          .map(p => `<option value="${p.id}">${p.name} — ${p.currency || 'NIO'} $${p.price}/${p.duration || 'mes'}</option>`)
          .join('\n')
      : `
        <option value="PREMIUM">Premium (NIO $999/Mensual)</option>
        <option value="BASIC">Basic (NIO $499/Mensual)</option>
        <option value="FREE">Free (Demo)</option>
      `;


    const formHTML = `
      <form id="add-company-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary); max-height: 80vh; overflow-y: auto; padding-right: 8px;">
        <div class="form-group">
          <label class="form-label" for="comp-name">Nombre de la Empresa / Local</label>
          <input type="text" id="comp-name" class="input input-md" placeholder="Ej. Pizzería San Pedro" required />
        </div>

        <!-- OWNER CREDENTIALS -->
        <div style="border-top: 1px dashed var(--color-border); padding-top: var(--space-3);">
          <label class="form-label mb-2" style="font-weight: 600; color: var(--color-accent);">Credenciales del Dueño (Owner)</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
            <div class="form-group">
              <label class="form-label" for="owner-email">Correo Electrónico</label>
              <input type="email" id="owner-email" class="input input-md" placeholder="dueno@negocio.com" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="owner-password">Contraseña de Acceso</label>
              <input type="password" id="owner-password" class="input input-md" placeholder="Mín. 6 caracteres" minlength="6" required />
            </div>
          </div>
        </div>

        <!-- TIPO + PLAN (2 col) -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); border-top: 1px dashed var(--color-border); padding-top: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="comp-type">Tipo de Negocio</label>
            <select id="comp-type" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              ${getBusinessTypeOptions()}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="comp-plan">Plan SaaS</label>
            <select id="comp-plan" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              ${planOptionsHTML}
            </select>
          </div>
        </div>

        <!-- ESTADO + FECHA LÍMITE (2 col) — visible sin scroll -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); border-top: 1px solid var(--color-border); padding-top: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="comp-status">Estado del Negocio</label>
            <select id="comp-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="ACTIVO">Activo (Cuenta normal)</option>
              <option value="INACTIVO">Inactivo (Suspendido)</option>
              <option value="FALTA_PAGO">Falta de Pago (Bloqueo)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="comp-expiration">📅 Fecha Límite de Suscripción</label>
            <input type="date" id="comp-expiration" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);" />
            <small style="color: var(--color-text-secondary); font-size: 0.72rem; margin-top: 4px; display: block;">Dejar vacío si no tiene vencimiento</small>
          </div>
        </div>

        <div style="border-top: 1px solid var(--color-border); margin-top: var(--space-2); padding-top: var(--space-3);">
          <label class="form-label mb-2" style="font-weight: 600;">Parámetros y Módulos Habilitados</label>
          
          <div class="d-flex flex-column gap-2">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
              <input type="checkbox" id="mod-kds" checked style="accent-color: var(--color-accent);" />
              <span>Pantalla de Cocina (KDS)</span>
            </label>
            
            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
              <input type="checkbox" id="mod-qr" checked style="accent-color: var(--color-accent);" />
              <span>Menú Digital QR para mesas</span>
            </label>
            
            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
              <input type="checkbox" id="mod-whatsapp" checked style="accent-color: var(--color-accent);" />
              <span>WhatsApp Automation Hub (API WhatsApp de negocio)</span>
            </label>
            
            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
              <input type="checkbox" id="mod-telegram" checked style="accent-color: var(--color-accent);" />
              <span>Telegram Automation Hub (Bot Telegram de negocio)</span>
            </label>
            
            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
              <input type="checkbox" id="mod-billing" checked style="accent-color: var(--color-accent);" />
              <span>Facturación Electrónica Mexicana (SAT CFDI 4.0)</span>
            </label>

            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
              <input type="checkbox" id="mod-vehicles-catalog" style="accent-color: var(--color-accent);" />
              <span>Catálogo de Vehículos (Rent a Car)</span>
            </label>

            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
              <input type="checkbox" id="mod-rentals" style="accent-color: var(--color-accent);" />
              <span>Gestión de Alquileres</span>
            </label>

            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
              <input type="checkbox" id="mod-rental-reminders" style="accent-color: var(--color-accent);" />
              <span>Recordatorios de Alquiler</span>
            </label>

            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
              <input type="checkbox" id="mod-appointments" style="accent-color: var(--color-accent);" />
              <span>Citas y Reservas</span>
            </label>

            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
              <input type="checkbox" id="mod-schedules" style="accent-color: var(--color-accent);" />
              <span>Horarios de Personal (Estilistas)</span>
            </label>

            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
              <input type="checkbox" id="mod-service-requests" style="accent-color: var(--color-accent);" />
              <span>Solicitudes de Trabajo Personalizado</span>
            </label>

            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
              <input type="checkbox" id="mod-staff-roles" checked style="accent-color: var(--color-accent);" />
              <span>Roles de Personal (Mesero/Cocina/Cajero)</span>
            </label>

            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
              <input type="checkbox" id="mod-employee-pricing" style="accent-color: var(--color-accent);" />
              <span>Precios Especiales Vendedor/Público</span>
            </label>
          </div>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-submit-btn">Guardar Empresa</button>
    `;

    // Instantiate Modal Component
    this.modalInstance = new Modal({
      title: 'Registrar y Configurar Nuevo Negocio',
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'md'
    });

    document.body.appendChild(this.modalInstance.mount());

    // Bind dynamic auto-select logic
    const compTypeSelect = this.modalInstance.$('#comp-type');
    if (compTypeSelect) {
      compTypeSelect.addEventListener('change', (e) => {
        this.autoConfigureModules(e.target.value, '');
      });
      // Initial trigger
      this.autoConfigureModules(compTypeSelect.value, '');
    }

    // Bind footer actions
    const cancelBtn = this.modalInstance.$('#modal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.modalInstance.close());
    }

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitNewCompany());
    }
  }

  /**
   * Processes the form inputs, saves in Firebase Auth + Firestore, and updates local state.
   */
  async submitNewCompany() {
    const form = this.modalInstance.$('#add-company-form');
    if (!form || !form.reportValidity()) return;

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando en la nube...';
    }

    const name = this.modalInstance.$('#comp-name').value.trim();
    const ownerEmail = this.modalInstance.$('#owner-email').value.trim();
    const ownerPassword = this.modalInstance.$('#owner-password').value;
    const businessType = this.modalInstance.$('#comp-type').value;
    const plan = this.modalInstance.$('#comp-plan').value;
    const status = this.modalInstance.$('#comp-status').value;
    const subscriptionExpiresAt = this.modalInstance.$('#comp-expiration').value || '';

    const enableKDS = this.modalInstance.$('#mod-kds').checked;
    const enableQR = this.modalInstance.$('#mod-qr').checked;
    const enableWhatsApp = this.modalInstance.$('#mod-whatsapp').checked;
    const enableTelegram = this.modalInstance.$('#mod-telegram').checked;
    const enableBilling = this.modalInstance.$('#mod-billing').checked;
    const enableVehiclesCatalog = this.modalInstance.$('#mod-vehicles-catalog').checked;
    const enableRentals = this.modalInstance.$('#mod-rentals').checked;
    const enableRentalReminders = this.modalInstance.$('#mod-rental-reminders').checked;
    const enableAppointments = this.modalInstance.$('#mod-appointments').checked;
    const enableSchedules = this.modalInstance.$('#mod-schedules').checked;
    const enableServiceRequests = this.modalInstance.$('#mod-service-requests').checked;
    const enableStaffRoles = this.modalInstance.$('#mod-staff-roles').checked;
    const enableEmployeePricing = this.modalInstance.$('#mod-employee-pricing').checked;

    // Use the sanitised company name as the company ID (root branch name)
    const newCompanyId = FirestoreService.sanitiseKey(name);

    if (!newCompanyId) {
      alert('El nombre del negocio contiene caracteres no válidos. Usa letras y números.');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar Empresa';
      }
      return;
    }

    try {
      // 1. Create full company branch structure in RTDB atomically
      console.log('[CompaniesView] Creando rama de empresa en RTDB...');
      await FirestoreService.createCompanyBranch(newCompanyId, {
        name,
        businessType,
        plan,
        status,
        subscriptionExpiresAt
      }, {
        enableKDS,
        enableQR,
        enableWhatsApp,
        enableTelegram,
        enableBilling,
        enableVehiclesCatalog,
        enableRentals,
        enableRentalReminders,
        enableAppointments,
        enableSchedules,
        enableServiceRequests,
        enableStaffRoles,
        enableEmployeePricing
      });

      // 2. Create the Owner user in Firebase Auth + dual-write to /users + /companies/employees
      console.log('[CompaniesView] Creando cuenta del dueño en Firebase Auth...');
      const ownerUid = await AuthService.createUser(ownerEmail, ownerPassword, {
        displayName: `Dueño - ${name}`,
        role: 'OWNER',
        companyId: newCompanyId,
        branchId: 'main'
      });

      // 3. Set ownerId in the company info (AuthService does this for OWNER role,
      //    but we ensure it here as well)
      await FirestoreService.updateCompanyInfo(newCompanyId, { ownerId: ownerUid });

      // 4. Reload companies from RTDB to get fresh state
      await this.loadCompanies();

      // Close registration modal
      this.modalInstance.close();

      // Show confirmation URL modal
      this.showOwnerCredentialsModal(name, ownerEmail, ownerPassword);

    } catch (error) {
      console.error('[CompaniesView] Error en el registro completo del negocio:', error);
      alert(`Error al registrar el negocio: ${error.message || error}`);
      
      // Reset button state on error
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar Empresa';
      }
    }
  }

  /**
   * Helper to display credentials and access URL copy dialog
   */
  showOwnerCredentialsModal(name, ownerEmail, ownerPassword) {
    const baseUrl = window.location.origin + window.location.pathname;
    const ownerLoginUrl = `${baseUrl}#/login`;

    const confirmHTML = `
      <div class="d-flex flex-column gap-4" style="color: var(--color-text-primary);">
        <div style="text-align: center; font-size: 2.5rem;">🎉</div>
        <div style="text-align: center;">
          <h3 style="font-weight: 700; font-size: 1.1rem; margin-bottom: 4px;">Negocio registrado exitosamente</h3>
          <p style="font-size: 0.875rem; color: var(--color-text-secondary);">Envíale al dueño las siguientes credenciales para acceder a su panel.</p>
        </div>

        <!-- Credentials Card -->
        <div style="background: var(--color-bg-tertiary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-4);">
          <p style="font-size: 0.75rem; font-weight: 600; color: var(--color-accent); margin-bottom: var(--space-2);">DATOS DE ACCESO DEL DUEÑO</p>
          <div style="display: flex; flex-direction: column; gap: var(--space-2); font-size: 0.875rem;">
            <div><span style="color: var(--color-text-secondary);">Empresa:</span> <strong>${name}</strong></div>
            <div><span style="color: var(--color-text-secondary);">Correo:</span> <strong>${ownerEmail}</strong></div>
            <div><span style="color: var(--color-text-secondary);">Contraseña inicial:</span> <strong>${ownerPassword}</strong></div>
          </div>
        </div>

        <!-- Access URL -->
        <div style="background: var(--color-bg-tertiary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-4);">
          <p style="font-size: 0.75rem; font-weight: 600; color: var(--color-accent); margin-bottom: var(--space-2);">ENLACE DE ACCESO AL PANEL</p>
          <div style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;">
            <code id="owner-url-display" style="font-size: 0.75rem; word-break: break-all; flex: 1; color: var(--color-text-primary);">${ownerLoginUrl}</code>
            <button class="btn btn-primary btn-sm" id="btn-copy-owner-url">📋 Copiar URL</button>
          </div>
        </div>

        <p style="font-size: 0.75rem; color: var(--color-text-tertiary); text-align: center;">
          💡 Guarda estas credenciales de manera segura. La contraseña puede ser cambiada más adelante.
        </p>
      </div>
    `;

    const confirmFooterHTML = `
      <button class="btn btn-primary btn-md" id="modal-confirm-close-btn">✓ Entendido</button>
    `;

    this.modalInstance = new Modal({
      title: 'Credenciales del Nuevo Negocio',
      bodyHTML: confirmHTML,
      footerHTML: confirmFooterHTML,
      size: 'md'
    });

    document.body.appendChild(this.modalInstance.mount());

    const copyUrlBtn = this.modalInstance.$('#btn-copy-owner-url');
    if (copyUrlBtn) {
      copyUrlBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(ownerLoginUrl)
          .then(() => NotificationService.success('Enlace de acceso copiado al portapapeles.'))
          .catch(() => {
            const el = document.createElement('textarea');
            el.value = ownerLoginUrl;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            NotificationService.success('Enlace copiado.');
          });
      });
    }

    const closConfirmBtn = this.modalInstance.$('#modal-confirm-close-btn');
    if (closConfirmBtn) {
      closConfirmBtn.addEventListener('click', () => this.modalInstance.close());
    }
  }

  /**
   * Opens the edit/status administration modal when clicking a row.
   * Loads company users from Firestore.
   */
  async openEditCompanyModal(row) {
    // Fetch fresh plans from Firebase RTDB to guarantee synchronization
    let plans = [];
    try {
      plans = await FirestoreService.listPlans();
      GlobalStore.set({ plans });
    } catch (e) {
      console.warn('[CompaniesView] Could not load latest plans:', e.message);
      plans = GlobalStore.getState().plans || [];
    }

    // Load employees for this company from /companies/{id}/employees/
    let companyUsers = [];
    try {
      companyUsers = await FirestoreService.getCompanyEmployees(row.id);
    } catch (e) {
      console.warn('[CompaniesView] Could not load company employees:', e.message);
    }

    const roleLabel = { OWNER: 'Dueño', MANAGER: 'Manager', CASHIER: 'Cajero', WAITER: 'Mesero', BARTENDER: 'Bartender', KITCHEN: 'Cocina' };

    const usersListHTML = companyUsers.length > 0
      ? companyUsers.map(u => `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) var(--space-3); background: var(--color-bg-tertiary); border-radius: var(--radius-sm); font-size: 0.8rem;">
            <div style="display: flex; align-items: center; gap: var(--space-2);">
              <span style="width: 28px; height: 28px; border-radius: 50%; background: var(--color-accent); color: white; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700;">${(u.displayName || u.email || '?')[0].toUpperCase()}</span>
              <div>
                <div style="font-weight: 600; color: var(--color-text-primary);">${u.displayName || 'Sin nombre'}</div>
                <div style="color: var(--color-text-secondary); font-size: 0.7rem;">${u.email || ''}</div>
              </div>
            </div>
            <span style="font-size: 0.7rem; font-weight: 600; padding: 2px 8px; border-radius: var(--radius-full); background: var(--color-accent-muted, rgba(99,102,241,.15)); color: var(--color-accent);">${roleLabel[u.role] || u.role}</span>
          </div>
        `).join('')
      : `<p style="font-size: 0.8rem; color: var(--color-text-secondary); text-align: center; padding: var(--space-3) 0;">No hay usuarios registrados para este negocio.</p>`;

    const formHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-4); max-height: 75vh; overflow-y: auto; padding-right: 4px;">

        <!-- Company Settings -->
        <form id="edit-company-form" style="display: flex; flex-direction: column; gap: var(--space-3); color: var(--color-text-primary);">
          <div class="form-group">
            <label class="form-label" for="edit-comp-name">Nombre de la Empresa</label>
            <input type="text" id="edit-comp-name" class="input input-md" value="${row.name}" required />
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
            <div class="form-group">
              <label class="form-label" for="edit-comp-type">Tipo de Negocio</label>
              <select id="edit-comp-type" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
                ${getBusinessTypeOptions(row.businessType)}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="edit-comp-plan">Plan SaaS</label>
              <select id="edit-comp-plan" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
                ${plans.length > 0
                  ? plans.map(p => `<option value="${p.id}" ${row.plan === p.id ? 'selected' : ''}>${p.name} (${p.currency || 'NIO'} $${p.price}/${p.duration || 'mes'})</option>`).join('\n')
                  : `
                    <option value="PREMIUM" ${row.plan === 'PREMIUM' ? 'selected' : ''}>Premium ($999/mes)</option>
                    <option value="BASIC" ${row.plan === 'BASIC' ? 'selected' : ''}>Basic ($499/mes)</option>
                    <option value="FREE" ${row.plan === 'FREE' ? 'selected' : ''}>Free (Demo)</option>
                  `
                }
              </select>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
            <div class="form-group">
              <label class="form-label" for="edit-comp-status">Estado del Negocio</label>
              <select id="edit-comp-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
                <option value="ACTIVO" ${row.status === 'ACTIVO' ? 'selected' : ''}>Activo (Acceso normal habilitado)</option>
                <option value="INACTIVO" ${row.status === 'INACTIVO' ? 'selected' : ''}>Inactivo / Suspendido</option>
                <option value="FALTA_PAGO" ${row.status === 'FALTA_PAGO' ? 'selected' : ''}>Falta de Pago (Bloquear acceso al panel)</option>
                <option value="SUSPENDIDO" ${row.status === 'SUSPENDIDO' ? 'selected' : ''}>Suspendido temporalmente</option>
                <option value="ELIMINADO" ${row.status === 'ELIMINADO' ? 'selected' : ''}>Papelera (eliminación lógica)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="edit-comp-expiration">Fecha Límite de Suscripción (Opcional)</label>
              <input type="date" id="edit-comp-expiration" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);" value="${row.subscriptionExpiresAt || ''}" />
            </div>
          </div>

          <div style="border-top: 1px solid var(--color-border); margin-top: var(--space-2); padding-top: var(--space-3);">
            <label class="form-label mb-2" style="font-weight: 600;">Módulos Habilitados</label>
            <div class="d-flex flex-column gap-2">
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
                <input type="checkbox" id="edit-mod-kds" ${row.config?.enableKDS ? 'checked' : ''} style="accent-color: var(--color-accent);" />
                <span>Pantalla de Cocina (KDS)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
                <input type="checkbox" id="edit-mod-qr" ${row.config?.enableQR ? 'checked' : ''} style="accent-color: var(--color-accent);" />
                <span>Menú Digital QR para mesas</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
                <input type="checkbox" id="edit-mod-whatsapp" ${row.config?.enableWhatsApp !== false ? 'checked' : ''} style="accent-color: var(--color-accent);" />
                <span>WhatsApp Automation Hub (API WhatsApp de negocio)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
                <input type="checkbox" id="edit-mod-telegram" ${row.config?.enableTelegram !== false ? 'checked' : ''} style="accent-color: var(--color-accent);" />
                <span>Telegram Automation Hub (Bot Telegram de negocio)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
                <input type="checkbox" id="edit-mod-billing" ${row.config?.enableBilling ? 'checked' : ''} style="accent-color: var(--color-accent);" />
                <span>Facturación Electrónica Mexicana (SAT CFDI 4.0)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
                <input type="checkbox" id="edit-mod-vehicles-catalog" ${row.config?.enableVehiclesCatalog ? 'checked' : ''} style="accent-color: var(--color-accent);" />
                <span>Catálogo de Vehículos (Rent a Car)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
                <input type="checkbox" id="edit-mod-rentals" ${row.config?.enableRentals ? 'checked' : ''} style="accent-color: var(--color-accent);" />
                <span>Gestión de Alquileres</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
                <input type="checkbox" id="edit-mod-rental-reminders" ${row.config?.enableRentalReminders ? 'checked' : ''} style="accent-color: var(--color-accent);" />
                <span>Recordatorios de Alquiler</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
                <input type="checkbox" id="edit-mod-appointments" ${row.config?.enableAppointments ? 'checked' : ''} style="accent-color: var(--color-accent);" />
                <span>Citas y Reservas</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
                <input type="checkbox" id="edit-mod-schedules" ${row.config?.enableSchedules ? 'checked' : ''} style="accent-color: var(--color-accent);" />
                <span>Horarios de Personal (Estilistas)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
                <input type="checkbox" id="edit-mod-service-requests" ${row.config?.enableServiceRequests ? 'checked' : ''} style="accent-color: var(--color-accent);" />
                <span>Solicitudes de Trabajo Personalizado</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
                <input type="checkbox" id="edit-mod-staff-roles" ${row.config?.enableStaffRoles ? 'checked' : ''} style="accent-color: var(--color-accent);" />
                <span>Roles de Personal (Mesero/Cocina/Cajero)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
                <input type="checkbox" id="edit-mod-employee-pricing" ${row.config?.enableEmployeePricing ? 'checked' : ''} style="accent-color: var(--color-accent);" />
                <span>Precios Especiales Vendedor/Público</span>
              </label>
            </div>
          </div>
        </form>

        <!-- Users Section -->
        <div style="border-top: 2px solid var(--color-border); padding-top: var(--space-4);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3);">
            <h4 style="font-weight: 700; font-size: 0.95rem; color: var(--color-text-primary); margin: 0;">
              👥 Usuarios de este Negocio
              <span style="font-size: 0.75rem; font-weight: 400; color: var(--color-text-secondary); margin-left: 6px;">(${companyUsers.length} registrado${companyUsers.length !== 1 ? 's' : ''})</span>
            </h4>
            <button class="btn btn-primary btn-sm" id="btn-toggle-add-user" style="font-size: 0.75rem; padding: 4px 12px;">+ Agregar Usuario</button>
          </div>

          <!-- User List -->
          <div id="company-users-list" style="display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-3);">
            ${usersListHTML}
          </div>

          <!-- Add User Form (hidden by default) -->
          <div id="add-user-panel" style="display: none; border: 1px dashed var(--color-accent); border-radius: var(--radius-md); padding: var(--space-4); background: var(--color-bg-tertiary);">
            <p style="font-size: 0.8rem; font-weight: 600; color: var(--color-accent); margin-bottom: var(--space-3);">➕ Nuevo Usuario para: ${row.name}</p>
            <form id="add-user-form" style="display: flex; flex-direction: column; gap: var(--space-3);">
              <div class="form-group">
                <label class="form-label" style="font-size: 0.8rem;">Nombre Completo</label>
                <input type="text" id="new-user-name" class="input input-md" placeholder="Ej. Juan Pérez" required />
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
                <div class="form-group">
                  <label class="form-label" style="font-size: 0.8rem;">Correo Electrónico</label>
                  <input type="email" id="new-user-email" class="input input-md" placeholder="usuario@negocio.com" required />
                </div>
                <div class="form-group">
                  <label class="form-label" style="font-size: 0.8rem;">Contraseña</label>
                  <input type="password" id="new-user-password" class="input input-md" placeholder="Mín. 6 caracteres" minlength="6" required />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label" style="font-size: 0.8rem;">Rol / Puesto</label>
                <select id="new-user-role" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
                  <option value="MANAGER">Manager (Administrador del local)</option>
                  <option value="CASHIER">Cajero</option>
                  <option value="WAITER">Mesero</option>
                  <option value="BARTENDER">Bartender</option>
                  <option value="KITCHEN">Personal de Cocina</option>
                </select>
              </div>
              <button type="submit" id="btn-save-new-user" class="btn btn-primary btn-sm" style="width: 100%; margin-top: var(--space-1);">
                💾 Guardar Usuario en Firebase
              </button>
              <p id="add-user-error" style="display:none; color: var(--color-danger, #ef4444); font-size: 0.78rem; text-align: center;"></p>
            </form>
          </div>
        </div>

      </div>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-save-btn">Guardar Cambios</button>
    `;

    this.modalInstance = new Modal({
      title: `Administrar Negocio: ${row.name}`,
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'lg'
    });

    document.body.appendChild(this.modalInstance.mount());

    // Cancel button
    const cancelBtn = this.modalInstance.$('#modal-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.modalInstance.close());

    // Save company settings button
    const saveBtn = this.modalInstance.$('#modal-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', () => this.submitEditCompany(row.id));

    // Toggle add-user panel
    const toggleAddUser = this.modalInstance.$('#btn-toggle-add-user');
    const addUserPanel = this.modalInstance.$('#add-user-panel');
    if (toggleAddUser && addUserPanel) {
      toggleAddUser.addEventListener('click', () => {
        const isVisible = addUserPanel.style.display !== 'none';
        addUserPanel.style.display = isVisible ? 'none' : 'block';
        toggleAddUser.textContent = isVisible ? '+ Agregar Usuario' : '✕ Cancelar';
      });
    }

    // Add user form submission
    const addUserForm = this.modalInstance.$('#add-user-form');
    if (addUserForm) {
      addUserForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitAddUserToCompany(row.id, row.name);
      });
    }
  }

  /**
   * Creates a new user account and saves their profile linked to a company.
   * @param {string} companyId
   * @param {string} companyName
   */
  async submitAddUserToCompany(companyId, companyName) {
    const saveBtn = this.modalInstance.$('#btn-save-new-user');
    const errorEl = this.modalInstance.$('#add-user-error');

    const displayName  = this.modalInstance.$('#new-user-name').value.trim();
    const email        = this.modalInstance.$('#new-user-email').value.trim();
    const password     = this.modalInstance.$('#new-user-password').value;
    const role         = this.modalInstance.$('#new-user-role').value;

    if (!displayName || !email || !password) return;

    if (errorEl) errorEl.style.display = 'none';
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Guardando en Firebase...'; }

    try {
      const newUid = await AuthService.createUser(email, password, {
        displayName,
        role,
        companyId,
        branchId: 'main'
      });

      console.log(`[CompaniesView] ✅ User "${email}" (${role}) added to company ${companyId}. UID: ${newUid}`);
      NotificationService.success(`Usuario "${displayName}" registrado exitosamente en ${companyName}.`);

      // Update the users count in GlobalStore
      const companies = GlobalStore.getState().companies || [];
      const updated = companies.map(c => {
        if (c.id === companyId) return { ...c, users: (c.users || 0) + 1 };
        return c;
      });
      GlobalStore.set({ companies: updated });

      // Close modal and reopen to refresh user list
      this.modalInstance.close();
      // Small delay for UX — then reopen with refreshed data
      setTimeout(() => {
        const refreshedRow = (GlobalStore.getState().companies || []).find(c => c.id === companyId);
        if (refreshedRow) this.openEditCompanyModal(refreshedRow);
      }, 300);

    } catch (err) {
      console.error('[CompaniesView] Error adding user to company:', err);
      if (errorEl) {
        errorEl.textContent = err.message || 'Error desconocido al registrar el usuario.';
        errorEl.style.display = 'block';
      }
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Guardar Usuario en Firebase'; }
    }
  }

  /**
   * Processes company edits and updates Firestore and GlobalStore
   * @param {string} id
   */
  async submitEditCompany(id) {
    const form = this.modalInstance.$('#edit-company-form');
    if (!form || !form.reportValidity()) return;

    const saveBtn = this.modalInstance.$('#modal-save-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Actualizando nube...';
    }

    const name        = this.modalInstance.$('#edit-comp-name').value.trim();
    const businessType = this.modalInstance.$('#edit-comp-type').value;
    const plan        = this.modalInstance.$('#edit-comp-plan').value;
    const status      = this.modalInstance.$('#edit-comp-status').value;
    const subscriptionExpiresAt = this.modalInstance.$('#edit-comp-expiration').value || '';

    const enableKDS      = this.modalInstance.$('#edit-mod-kds').checked;
    const enableQR       = this.modalInstance.$('#edit-mod-qr').checked;
    const enableWhatsApp = this.modalInstance.$('#edit-mod-whatsapp').checked;
    const enableTelegram = this.modalInstance.$('#edit-mod-telegram').checked;
    const enableBilling  = this.modalInstance.$('#edit-mod-billing').checked;
    const enableVehiclesCatalog   = this.modalInstance.$('#edit-mod-vehicles-catalog').checked;
    const enableRentals           = this.modalInstance.$('#edit-mod-rentals').checked;
    const enableRentalReminders   = this.modalInstance.$('#edit-mod-rental-reminders').checked;
    const enableAppointments      = this.modalInstance.$('#edit-mod-appointments').checked;
    const enableSchedules         = this.modalInstance.$('#edit-mod-schedules').checked;
    const enableServiceRequests   = this.modalInstance.$('#edit-mod-service-requests').checked;
    const enableStaffRoles        = this.modalInstance.$('#edit-mod-staff-roles').checked;
    const enableEmployeePricing   = this.modalInstance.$('#edit-mod-employee-pricing').checked;

    try {
      // 1. Update company registry and tenant mirrors in RTDB
      await FirestoreService.updateCompany(id, {
        name,
        businessType,
        plan,
        status,
        subscriptionExpiresAt
      });

      // 2. Update company config in RTDB
      await FirestoreService.updateCompanyConfig(id, {
        enableKDS,
        enableQR,
        enableWhatsApp,
        enableTelegram,
        enableBilling,
        enableVehiclesCatalog,
        enableRentals,
        enableRentalReminders,
        enableAppointments,
        enableSchedules,
        enableServiceRequests,
        enableStaffRoles,
        enableEmployeePricing
      });

      // 3. Reload companies from RTDB
      await this.loadCompanies();

      NotificationService.success(`Cambios aplicados en la nube para "${name}".`);
      this.modalInstance.close();
    } catch (e) {
      console.error('[CompaniesView] Error updating company:', e);
      alert(`Error al actualizar el negocio en Firebase: ${e.message || e}`);
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar Cambios';
      }
    }
  }

  async handleCompanyAction(companyId, action) {
    const company = (GlobalStore.getState().companies || []).find(c => c.id === companyId);
    const companyName = company?.name || companyId;
    const reason = prompt(`Motivo para ${this.getCompanyActionLabel(action)} "${companyName}":`, '');
    if (reason === null) return;

    try {
      if (action === 'deactivate') {
        await FirestoreService.setCompanyLifecycle(companyId, 'INACTIVO', reason);
        NotificationService.success('Empresa desactivada temporalmente.');
      } else if (action === 'suspend') {
        await FirestoreService.setCompanyLifecycle(companyId, 'SUSPENDIDO', reason);
        NotificationService.success('Empresa suspendida.');
      } else if (action === 'trash') {
        if (!confirm(`¿Mover "${companyName}" a la papelera? La empresa podrá restaurarse más adelante.`)) return;
        await FirestoreService.setCompanyLifecycle(companyId, 'ELIMINADO', reason);
        NotificationService.success('Empresa enviada a papelera.');
      } else if (action === 'restore') {
        await FirestoreService.setCompanyLifecycle(companyId, 'ACTIVO', reason || 'Restauración desde papelera');
        NotificationService.success('Empresa restaurada.');
      } else if (action === 'hard-delete') {
        const confirmation = prompt(`Para eliminar definitivamente "${companyName}" y todos sus datos, escribe ELIMINAR:`);
        if (confirmation !== 'ELIMINAR') return;
        await FirestoreService.permanentlyDeleteCompany(companyId, reason);
        NotificationService.success('Empresa eliminada definitivamente.');
      }
      await this.loadCompanies();
    } catch (error) {
      console.error('[CompaniesView] Error changing lifecycle:', error);
      NotificationService.error(error.message || 'No se pudo cambiar el estado de la empresa.');
    }
  }

  getCompanyActionLabel(action) {
    const labels = {
      deactivate: 'desactivar',
      suspend: 'suspender',
      trash: 'enviar a papelera',
      restore: 'restaurar',
      'hard-delete': 'eliminar definitivamente'
    };
    return labels[action] || 'actualizar';
  }

  unmount() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.table.unmount();
    this.layout.unmount();
    super.unmount();
  }
}
