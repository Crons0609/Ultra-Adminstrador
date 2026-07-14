import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';
import { Modal } from '../../../components/ui/modal.js';
import { Company } from '../../../models/company.model.js';
import { GlobalStore } from '../../../core/state.js';
import { NotificationService } from '../../../services/notification.service.js';
import { AuthService } from '../../../services/auth.service.js';
import { db } from '../../../config/firebase.config.js';

// Firestore functions (CDN v12.16.0)
import {
  collection,
  doc,
  setDoc,
  getDocs,
  updateDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

export class CompaniesView extends Component {
  constructor(params = {}) {
    super(params);

    // Initial mock fallback state
    const defaultCompanies = [
      { id: '1', name: 'Burger & Co.', plan: 'PREMIUM', status: 'ACTIVO', branches: 3, users: 12, businessType: 'Restaurante', config: { enableKDS: true, enableWhatsApp: true, enableBilling: true, enableQR: true } },
      { id: '2', name: 'La Cantina del Sol', plan: 'BASIC', status: 'FALTA_PAGO', branches: 1, users: 5, businessType: 'Bar', config: { enableKDS: false, enableWhatsApp: true, enableBilling: true, enableQR: true } },
      { id: '3', name: 'Café Bistro Madrid', plan: 'FREE', status: 'INACTIVO', branches: 2, users: 4, businessType: 'Cafetería', config: { enableKDS: true, enableWhatsApp: false, enableBilling: false, enableQR: true } }
    ];

    if (!GlobalStore.getState().companies) {
      GlobalStore.set({ companies: defaultCompanies });
    }

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
            }
            return `<span class="badge" style="display:inline-flex;padding:2px 8px;font-size:0.75rem;font-weight:500;border-radius:var(--radius-full);background-color:var(--color-${variant}-light);color:var(--color-${variant});">${label}</span>`;
          }
        },
        { key: 'branches', label: 'Sucursales' },
        { key: 'users', label: 'Usuarios' }
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
        <button class="btn btn-primary btn-sm" id="btn-add-company">
          <span style="margin-right: var(--space-1);">+</span> Registrar Negocio
        </button>
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

  /**
   * Load companies directly from Firestore if available
   */
  async loadCompanies() {
    if (!db) {
      console.warn('[CompaniesView] Firestore no conectado. Ejecutando en modo simulación local.');
      return;
    }

    try {
      const querySnapshot = await getDocs(collection(db, 'companies'));
      const companies = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        companies.push({
          id: docSnap.id,
          name: data.name,
          plan: data.plan,
          status: data.status,
          branches: data.branches || 1,
          users: data.users || 1,
          businessType: data.config?.businessType || 'Restaurante',
          config: data.config || {}
        });
      });

      // Update store and trigger table redraw
      GlobalStore.set({ companies });
      console.log('[CompaniesView] ✅ Carga exitosa desde Firestore. Total:', companies.length);
    } catch (e) {
      console.error('[CompaniesView] Fallo al leer de Firestore:', e);
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
   * Opens the customizable modal form to add a parameterized business
   */
  openAddCompanyModal() {
    const formHTML = `
      <form id="add-company-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary); max-height: 70vh; overflow-y: auto; padding-right: 4px;">
        <div class="form-group">
          <label class="form-label" for="comp-name">Nombre de la Empresa / Local</label>
          <input type="text" id="comp-name" class="input input-md" placeholder="Ej. Pizzería San Pedro" required />
        </div>

        <!-- OWNER CREDENTIALS -->
        <div style="border-top: 1px dashed var(--color-border); margin-top: var(--space-2); padding-top: var(--space-3);">
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

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); border-top: 1px dashed var(--color-border); padding-top: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="comp-type">Tipo de Negocio</label>
            <select id="comp-type" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="Restaurante">Restaurante</option>
              <option value="Bar">Bar</option>
              <option value="Cafetería">Cafetería</option>
              <option value="Food Truck">Food Truck</option>
              <option value="Tienda de Alimentos">Tienda de Alimentos</option>
              <option value="Discoteca">Discoteca / Club</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="comp-plan">Plan SaaS</label>
            <select id="comp-plan" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="PREMIUM">Premium ($999/mes)</option>
              <option value="BASIC">Basic ($499/mes)</option>
              <option value="FREE">Free (Demo)</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="comp-status">Estado del Negocio</label>
          <select id="comp-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
            <option value="ACTIVO">Activo (Cuenta normal)</option>
            <option value="INACTIVO">Inactivo (Suspendido)</option>
            <option value="FALTA_PAGO">Falta de Pago (Bloqueo de acceso)</option>
          </select>
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
              <input type="checkbox" id="mod-whatsapp" style="accent-color: var(--color-accent);" />
              <span>Alertas e Informes automáticos vía WhatsApp</span>
            </label>
            
            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
              <input type="checkbox" id="mod-billing" checked style="accent-color: var(--color-accent);" />
              <span>Facturación Electrónica Mexicana (SAT CFDI 4.0)</span>
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

    const enableKDS = this.modalInstance.$('#mod-kds').checked;
    const enableQR = this.modalInstance.$('#mod-qr').checked;
    const enableWhatsApp = this.modalInstance.$('#mod-whatsapp').checked;
    const enableBilling = this.modalInstance.$('#mod-billing').checked;

    const newCompanyId = String(Date.now());
    const companyData = {
      name: name,
      plan: plan,
      status: status,
      branches: 1,
      users: 1,
      config: {
        enableKDS,
        enableQR,
        enableWhatsApp,
        enableBilling,
        businessType
      }
    };

    try {
      // 1. Save company document in Cloud Firestore
      if (db) {
        console.log('[CompaniesView] Guardando negocio en Firestore...');
        await setDoc(doc(db, 'companies', newCompanyId), {
          ...companyData,
          createdAt: serverTimestamp()
        });

        // 2. Create the Owner user account in Firebase Auth (using secondary App)
        console.log('[CompaniesView] Creando cuenta del dueño en Firebase Auth...');
        await AuthService.createUser(ownerEmail, ownerPassword, {
          displayName: `Dueño - ${name}`,
          role: 'OWNER',
          companyId: newCompanyId,
          branchId: 'main'
        });
      } else {
        // Fallback local persistence if offline
        const dynamicUsers = JSON.parse(localStorage.getItem('ua_dynamic_users') || '[]');
        dynamicUsers.push({
          uid: `owner-${Date.now()}`,
          email: ownerEmail,
          password: ownerPassword,
          displayName: `Dueño - ${name}`,
          role: 'OWNER',
          companyId: newCompanyId,
          branchId: 'main'
        });
        localStorage.setItem('ua_dynamic_users', JSON.stringify(dynamicUsers));
      }

      // 3. Update global store reactive array
      const currentCompanies = GlobalStore.getState().companies || [];
      const updatedCompanies = [
        ...currentCompanies,
        {
          id: newCompanyId,
          ...companyData,
          businessType
        }
      ];
      GlobalStore.set({ companies: updatedCompanies });

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
   * Opens the edit/status administration modal when clicking a row
   * @param {Object} row 
   */
  openEditCompanyModal(row) {
    const formHTML = `
      <form id="edit-company-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary);">
        <div class="form-group">
          <label class="form-label" for="edit-comp-name">Nombre de la Empresa</label>
          <input type="text" id="edit-comp-name" class="input input-md" value="${row.name}" required />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="edit-comp-type">Tipo de Negocio</label>
            <select id="edit-comp-type" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="Restaurante" ${row.businessType === 'Restaurante' ? 'selected' : ''}>Restaurante</option>
              <option value="Bar" ${row.businessType === 'Bar' ? 'selected' : ''}>Bar</option>
              <option value="Cafetería" ${row.businessType === 'Cafetería' ? 'selected' : ''}>Cafetería</option>
              <option value="Food Truck" ${row.businessType === 'Food Truck' ? 'selected' : ''}>Food Truck</option>
              <option value="Tienda de Alimentos" ${row.businessType === 'Tienda de Alimentos' ? 'selected' : ''}>Tienda de Alimentos</option>
              <option value="Discoteca" ${row.businessType === 'Discoteca' ? 'selected' : ''}>Discoteca / Club</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="edit-comp-plan">Plan SaaS</label>
            <select id="edit-comp-plan" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="PREMIUM" ${row.plan === 'PREMIUM' ? 'selected' : ''}>Premium ($999/mes)</option>
              <option value="BASIC" ${row.plan === 'BASIC' ? 'selected' : ''}>Basic ($499/mes)</option>
              <option value="FREE" ${row.plan === 'FREE' ? 'selected' : ''}>Free (Demo)</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="edit-comp-status">Estado del Negocio (Administración de Cuenta)</label>
          <select id="edit-comp-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
            <option value="ACTIVO" ${row.status === 'ACTIVO' ? 'selected' : ''}>Activo (Acceso normal habilitado)</option>
            <option value="INACTIVO" ${row.status === 'INACTIVO' ? 'selected' : ''}>Inactivo / Suspendido</option>
            <option value="FALTA_PAGO" ${row.status === 'FALTA_PAGO' ? 'selected' : ''}>Falta de Pago (Bloquear acceso al panel)</option>
          </select>
        </div>

        <div style="border-top: 1px solid var(--color-border); margin-top: var(--space-2); padding-top: var(--space-3);">
          <label class="form-label mb-2" style="font-weight: 600;">Parámetros y Módulos Habilitados</label>
          
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
              <input type="checkbox" id="edit-mod-whatsapp" ${row.config?.enableWhatsApp ? 'checked' : ''} style="accent-color: var(--color-accent);" />
              <span>Alertas e Informes automáticos vía WhatsApp</span>
            </label>
            
            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
              <input type="checkbox" id="edit-mod-billing" ${row.config?.enableBilling ? 'checked' : ''} style="accent-color: var(--color-accent);" />
              <span>Facturación Electrónica Mexicana (SAT CFDI 4.0)</span>
            </label>
          </div>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-save-btn">Guardar Cambios</button>
    `;

    this.modalInstance = new Modal({
      title: `Administrar Negocio: ${row.name}`,
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'md'
    });

    document.body.appendChild(this.modalInstance.mount());

    const cancelBtn = this.modalInstance.$('#modal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.modalInstance.close());
    }

    const saveBtn = this.modalInstance.$('#modal-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.submitEditCompany(row.id));
    }
  }

  /**
   * Processes company edits and updates Firestore and GlobalStore
   * @param {string} id 
   */
  async submitEditCompany(id) {
    const form = this.modalInstance.$('#edit-company-form');
    if (!form || !form.reportValidity()) return;

    const saveBtn = this.modalInstance.$('#edit-company-form').parentNode.parentNode.querySelector('#modal-save-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Actualizando nube...';
    }

    const name = this.modalInstance.$('#edit-comp-name').value.trim();
    const businessType = this.modalInstance.$('#edit-comp-type').value;
    const plan = this.modalInstance.$('#edit-comp-plan').value;
    const status = this.modalInstance.$('#edit-comp-status').value;

    const enableKDS = this.modalInstance.$('#edit-mod-kds').checked;
    const enableQR = this.modalInstance.$('#edit-mod-qr').checked;
    const enableWhatsApp = this.modalInstance.$('#edit-mod-whatsapp').checked;
    const enableBilling = this.modalInstance.$('#edit-mod-billing').checked;

    const companyData = {
      name: name,
      plan: plan,
      status: status,
      config: {
        enableKDS,
        enableQR,
        enableWhatsApp,
        enableBilling,
        businessType
      }
    };

    try {
      // 1. Update in Cloud Firestore
      if (db) {
        const docRef = doc(db, 'companies', id);
        await updateDoc(docRef, companyData);
      }

      // 2. Update local state
      const currentCompanies = GlobalStore.getState().companies || [];
      const updatedCompanies = currentCompanies.map(c => {
        if (c.id === id) {
          return {
            ...c,
            ...companyData,
            businessType
          };
        }
        return c;
      });
      GlobalStore.set({ companies: updatedCompanies });

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

  unmount() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.table.unmount();
    this.layout.unmount();
    super.unmount();
  }
}