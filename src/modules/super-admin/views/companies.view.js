/**
 * @file companies.view.js
 * @description SuperAdmin Companies View. Shows the responsive PageLayout, Sidebar, Header and data table controls.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';

export class CompaniesView extends Component {
  constructor(params = {}) {
    super(params);

    // Mock data for display purposes in Phase 1
    const mockCompanies = [
      { id: '1', name: 'Burger & Co.', plan: 'Premium', status: 'Activo', branches: 3, users: 12 },
      { id: '2', name: 'La Cantina del Sol', plan: 'Basic', status: 'Activo', branches: 1, users: 5 },
      { id: '3', name: 'Café Bistro Madrid', plan: 'Free', status: 'Suspendido', branches: 2, users: 4 }
    ];

    // Instantiate DataTable component
    this.table = new DataTable({
      columns: [
        { key: 'name', label: 'Empresa / Restaurant' },
        { key: 'plan', label: 'Plan Contratado' },
        { 
          key: 'status', 
          label: 'Estado',
          render: (val) => {
            const variant = val === 'Activo' ? 'success' : 'danger';
            return `<span class="badge" style="display:inline-flex;padding:2px 8px;font-size:0.75rem;font-weight:500;border-radius:var(--radius-full);background-color:var(--color-${variant}-light);color:var(--color-${variant});">${val}</span>`;
          }
        },
        { key: 'branches', label: 'Sucursales' },
        { key: 'users', label: 'Usuarios' }
      ],
      data: mockCompanies,
      onRowClick: (row) => {
        alert(`Fase 12: Seleccionaste la empresa: ${row.name}`);
      }
    });

    // PageLayout setup
    this.layout = new PageLayout({
      title: 'Gestión de Empresas',
      subtitle: 'Administración, suspensión y asignación de licencias para todos los restaurantes registrados en el SaaS.',
      actionHTML: `
        <button class="btn btn-primary btn-sm" id="btn-add-company">
          <span style="margin-right: var(--space-1);">+</span> Nueva Empresa
        </button>
      `,
      contentHTML: `
        <div class="card p-5">
          <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
            <h3 class="text-lg font-semibold">Registros de Clientes Activos</h3>
            <div id="company-search-container" style="width: 280px;"></div>
          </div>
          <!-- Table placeholder -->
          <div id="companies-table-wrapper"></div>
        </div>
      `
    });
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
    // Parent components mount does this, but we can bind details here
    const addBtn = this.layout.$('#btn-add-company');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        alert('Fase 12: Crear nueva empresa. Se habilitará el formulario completo de registro.');
      });
    }
  }

  unmount() {
    this.table.unmount();
    this.layout.unmount();
    super.unmount();
  }
}