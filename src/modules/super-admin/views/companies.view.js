/**
 * @file companies.view.js
 * @description SuperAdmin Companies View. Shows the responsive PageLayout, Sidebar, Header,
 * and a fully functional dynamic Modal to register and parameterize new multi-tenant businesses.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';
import { Modal } from '../../../components/ui/modal.js';
import { Company } from '../../../models/company.model.js';
import { GlobalStore } from '../../../core/state.js';
import { NotificationService } from '../../../services/notification.service.js';

export class CompaniesView extends Component {
  constructor(params = {}) {
    super(params);

    // Initialize mock database in GlobalStore if not present
    if (!GlobalStore.getState().companies) {
      GlobalStore.set({
        companies: [
          { id: '1', name: 'Burger & Co.', plan: 'PREMIUM', status: 'ACTIVO', branches: 3, users: 12, businessType: 'Restaurante', config: { enableKDS: true, enableWhatsApp: true } },
          { id: '2', name: 'La Cantina del Sol', plan: 'BASIC', status: 'ACTIVO', branches: 1, users: 5, businessType: 'Bar', config: { enableKDS: false, enableWhatsApp: true } },
          { id: '3', name: 'Café Bistro Madrid', plan: 'FREE', status: 'SUSPENDIDO', branches: 2, users: 4, businessType: 'Cafetería', config: { enableKDS: true, enableWhatsApp: false } }
        ]
      });
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
            const variant = val === 'ACTIVO' ? 'success' : 'danger';
            return `<span class="badge" style="display:inline-flex;padding:2px 8px;font-size:0.75rem;font-weight:500;border-radius:var(--radius-full);background-color:var(--color-${variant}-light);color:var(--color-${variant});">${val}</span>`;
          }
        },
        { key: 'branches', label: 'Sucursales' },
        { key: 'users', label: 'Usuarios' }
      ],
      data: GlobalStore.getState().companies,
      onRowClick: (row) => {
        const configText = Object.entries(row.config || {})
          .map(([k, v]) => `${k}: ${v ? '✅' : '❌'}`)
          .join('\n');
        alert(`Negocio: ${row.name}\nTipo: ${row.businessType || 'Restaurante'}\nPlan: ${row.plan}\nConfiguración:\n${configText}`);
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

  mount() {
    const element = this.layout.mount();

    // Inject Table
    const tableWrapper = element.querySelector('#companies-table-wrapper');
    if (tableWrapper) {
      tableWrapper.appendChild(this.table.mount());
    }

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
      <form id="add-company-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary);">
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
   * Processes the form inputs, instantiates Company model, and pushes it to GlobalStore
   */
  submitNewCompany() {
    const form = this.modalInstance.$('#add-company-form');
    if (!form || !form.reportValidity()) return;

    const name = this.modalInstance.$('#comp-name').value.trim();
    const ownerEmail = this.modalInstance.$('#owner-email').value.trim();
    const ownerPassword = this.modalInstance.$('#owner-password').value;
    const businessType = this.modalInstance.$('#comp-type').value;
    const plan = this.modalInstance.$('#comp-plan').value;

    const enableKDS = this.modalInstance.$('#mod-kds').checked;
    const enableQR = this.modalInstance.$('#mod-qr').checked;
    const enableWhatsApp = this.modalInstance.$('#mod-whatsapp').checked;
    const enableBilling = this.modalInstance.$('#mod-billing').checked;

    // Instantiate model Company safely
    const newCompanyId = String(Date.now());
    const companyInstance = new Company({
      id: newCompanyId,
      name: name,
      plan: plan,
      status: 'ACTIVO',
      config: {
        enableKDS,
        enableQR,
        enableWhatsApp,
        enableBilling,
        businessType // Customized dynamic param
      }
    });

    // Save dynamic owner credentials locally for test logins
    try {
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
    } catch (e) {
      console.error('[CompaniesView] Error registering owner credentials locally:', e);
    }

    // Update global state reactive array
    const currentCompanies = GlobalStore.getState().companies || [];
    const updatedCompanies = [
      ...currentCompanies,
      {
        id: companyInstance.id,
        name: companyInstance.name,
        plan: companyInstance.plan,
        status: companyInstance.status,
        branches: 1, // Default initial branch
        users: 1,    // Default initial owner
        businessType: businessType,
        config: companyInstance.config
      }
    ];

    GlobalStore.set({ companies: updatedCompanies });

    // Success notifications
    NotificationService.success(`Negocio "${name}" registrado. Dueño creado: ${ownerEmail}`);
    
    // Close modal
    this.modalInstance.close();
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