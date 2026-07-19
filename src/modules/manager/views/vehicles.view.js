/**
 * @file vehicles.view.js
 * @description Catálogo de vehículos para negocios de Rent a Car con soporte para escaneo de códigos.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { BarcodeInput } from '../../../components/forms/barcode-input.js';
import { BarcodeRegistryService } from '../../../services/barcode-registry.service.js';
import { TimeService } from '../../../services/time.service.js';

export class VehiclesView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || '';

    this.state = {
      vehicles: [],
      searchQuery: '',
      selectedStatus: ''
    };

    // Initialize DataTable
    this.table = new DataTable({
      columns: [
        { 
          key: 'brand', 
          label: 'Vehículo',
          render: (val, row) => `
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width:40px;height:40px;border-radius:6px;background:var(--color-bg-tertiary);display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">🚗</div>
              <div style="display: flex; flex-direction: column;">
                <span class="font-semibold text-primary">${val} ${row.model || ''}</span>
                <span class="text-xs text-secondary" style="font-size: 0.7rem; margin-top: 2px;">Año: ${row.year || 'N/A'}</span>
              </div>
            </div>
          `
        },
        { key: 'plate', label: 'Placa' },
        { 
          key: 'code', 
          label: 'Código de Barra/QR',
          render: (val) => val ? `<span class="scan-code-badge">📊 ${val}</span>` : '<span class="text-xs text-secondary">Sin asignar</span>'
        },
        { 
          key: 'category', 
          label: 'Categoría',
          render: (val) => `<span class="text-secondary">${val || 'General'}</span>`
        },
        { 
          key: 'status', 
          label: 'Estado',
          render: (val) => {
            let label = 'Disponible';
            let badgeClass = 'stock-ok';
            if (val === 'ALQUILADO') {
              label = 'En Alquiler';
              badgeClass = 'stock-low';
            } else if (val === 'MANTENIMIENTO') {
              label = 'Mantenimiento';
              badgeClass = 'stock-out';
            }
            return `<span class="stock-badge ${badgeClass}">${label}</span>`;
          }
        },
        {
          key: 'id',
          label: 'Acciones',
          render: (val) => `
            <div class="d-flex gap-2">
              <button class="btn btn-secondary btn-sm py-1 px-2 btn-edit-vehicle" data-id="${val}" style="font-size: 0.7rem;">✏️</button>
              <button class="btn btn-danger btn-sm py-1 px-2 btn-delete-vehicle" data-id="${val}" style="font-size: 0.7rem;">🗑️</button>
            </div>
          `
        }
      ],
      data: []
    });

    this.layout = new PageLayout({
      title: 'Catálogo de Vehículos',
      subtitle: 'Administra la flota de vehículos, estados de disponibilidad y códigos de barra o placa.',
      actionHTML: `
        <button class="btn btn-primary btn-sm" id="btn-add-vehicle">
          + Agregar Vehículo
        </button>
      `,
      contentHTML: `
        <!-- KPI Cards Row -->
        <div class="grid-stats animate-fade-in" id="vehicles-kpis">
          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Total Vehículos</span>
              <div class="kpi-icon kpi-icon-accent">🚘</div>
            </div>
            <h3 class="kpi-value" id="kpi-total-vehicles">0</h3>
            <span class="text-xs text-secondary">Registrados en flota</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Disponibles</span>
              <div class="kpi-icon kpi-icon-success">✅</div>
            </div>
            <h3 class="kpi-value text-success" id="kpi-available-vehicles">0</h3>
            <span class="text-xs text-secondary">Listos para alquilar</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">En Alquiler</span>
              <div class="kpi-icon kpi-icon-warning">🔑</div>
            </div>
            <h3 class="kpi-value text-warning" id="kpi-rented-vehicles">0</h3>
            <span class="text-xs text-secondary">Alquilados actualmente</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Mantenimiento</span>
              <div class="kpi-icon kpi-icon-danger">🔧</div>
            </div>
            <h3 class="kpi-value text-danger" id="kpi-maintenance-vehicles">0</h3>
            <span class="text-xs text-secondary">En taller / no disponibles</span>
          </div>
        </div>

        <!-- Filter and Search Toolbar -->
        <div class="card p-4 mb-4">
          <div class="inv-toolbar">
            <div class="inv-search">
              <span class="inv-search-icon">🔍</span>
              <input type="text" id="inp-search-vehicle" class="input input-md" placeholder="Buscar por marca, modelo, placa o código..." />
            </div>

            <select id="sel-filter-status" class="inv-filter-select">
              <option value="">Todos los estados</option>
              <option value="DISPONIBLE">Disponibles</option>
              <option value="ALQUILADO">En Alquiler</option>
              <option value="MANTENIMIENTO">Mantenimiento</option>
            </select>
          </div>
        </div>

        <!-- Main Data Table Container -->
        <div class="card p-5">
          <div id="vehicles-table-wrapper"></div>
        </div>
      `
    });

    this.listeners = [];
    this.modalInstance = null;
    this.modalBarcodeInput = null;
  }

  mount() {
    const element = this.layout.mount();

    // Inject table
    const tableWrapper = element.querySelector('#vehicles-table-wrapper');
    if (tableWrapper) {
      tableWrapper.appendChild(this.table.mount());
    }

    this.afterMount(element);
    this.subscribeToVehicles(element);

    return element;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    // Search and filters
    const inpSearch = root.querySelector('#inp-search-vehicle');
    if (inpSearch) {
      inpSearch.addEventListener('input', (e) => {
        this.state.searchQuery = e.target.value.toLowerCase();
        this.applyFilters();
      });
    }

    const selStatus = root.querySelector('#sel-filter-status');
    if (selStatus) {
      selStatus.addEventListener('change', (e) => {
        this.state.selectedStatus = e.target.value;
        this.applyFilters();
      });
    }

    // Add Vehicle click
    const addBtn = root.querySelector('#btn-add-vehicle');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openVehicleModal());
    }

    // Edit/Delete click delegation
    const tableWrapper = root.querySelector('#vehicles-table-wrapper');
    if (tableWrapper) {
      tableWrapper.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.btn-edit-vehicle');
        if (editBtn) {
          const vehId = editBtn.getAttribute('data-id');
          const veh = this.state.vehicles.find(v => v.id === vehId);
          if (veh) this.openVehicleModal(veh);
        }

        const deleteBtn = e.target.closest('.btn-delete-vehicle');
        if (deleteBtn) {
          const vehId = deleteBtn.getAttribute('data-id');
          if (confirm('¿Estás seguro de que deseas eliminar este vehículo de la flota?')) {
            try {
              await FirestoreService.delete('vehiculos', vehId);
              NotificationService.success('Vehículo eliminado de la flota.');
            } catch (err) {
              console.error('[VehiclesView] Error deleting:', err);
              NotificationService.error('Error al eliminar el vehículo.');
            }
          }
        }
      });
    }
  }

  subscribeToVehicles(element) {
    try {
      const listener = FirestoreService.listenToTenant('vehiculos', (vehicles) => {
        this.state.vehicles = vehicles || [];
        this.recalculateKPIs(element);
        this.applyFilters();
      });
      this.listeners.push(listener);
    } catch (e) {
      console.warn('[VehiclesView] Error establishing real-time subscription:', e.message);
    }
  }

  recalculateKPIs(element) {
    const root = element || this.layout.element;
    if (!root) return;

    const vehicles = this.state.vehicles;

    const total = vehicles.length;
    const available = vehicles.filter(v => v.status === 'DISPONIBLE' || !v.status).length;
    const rented = vehicles.filter(v => v.status === 'ALQUILADO').length;
    const maintenance = vehicles.filter(v => v.status === 'MANTENIMIENTO').length;

    const totalEl = root.querySelector('#kpi-total-vehicles');
    if (totalEl) totalEl.textContent = total;

    const availableEl = root.querySelector('#kpi-available-vehicles');
    if (availableEl) availableEl.textContent = available;

    const rentedEl = root.querySelector('#kpi-rented-vehicles');
    if (rentedEl) rentedEl.textContent = rented;

    const maintenanceEl = root.querySelector('#kpi-maintenance-vehicles');
    if (maintenanceEl) maintenanceEl.textContent = maintenance;
  }

  applyFilters() {
    const { searchQuery, selectedStatus, vehicles } = this.state;

    let filtered = vehicles.filter(v => {
      const matchesSearch = !searchQuery || 
        (v.brand || '').toLowerCase().includes(searchQuery) ||
        (v.model || '').toLowerCase().includes(searchQuery) ||
        (v.plate || '').toLowerCase().includes(searchQuery) ||
        (v.code || '').toLowerCase().includes(searchQuery);

      let matchesStatus = true;
      if (selectedStatus) {
        if (selectedStatus === 'DISPONIBLE') {
          matchesStatus = v.status === 'DISPONIBLE' || !v.status;
        } else {
          matchesStatus = v.status === selectedStatus;
        }
      }

      return matchesSearch && matchesStatus;
    });

    const tableWrapper = this.layout.$('#vehicles-table-wrapper');
    if (tableWrapper) {
      tableWrapper.innerHTML = '';
      this.table.props.data = filtered;
      tableWrapper.appendChild(this.table.mount());
    }
  }

  openVehicleModal(vehicle = null) {
    const isEdit = !!vehicle;

    const formHTML = `
      <form id="vehicle-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary);">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="veh-brand">Marca</label>
            <input type="text" id="veh-brand" class="input input-md" placeholder="Ej. Toyota" value="${isEdit ? vehicle.brand : ''}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="veh-model">Modelo</label>
            <input type="text" id="veh-model" class="input input-md" placeholder="Ej. Hilux" value="${isEdit ? vehicle.model : ''}" required />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="veh-plate">Placa / Matrícula</label>
            <input type="text" id="veh-plate" class="input input-md" placeholder="Ej. M 123456" value="${isEdit ? vehicle.plate : ''}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="veh-year">Año</label>
            <input type="number" id="veh-year" class="input input-md" placeholder="Ej. 2024" value="${isEdit ? vehicle.year : ''}" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Asociar Código de Barras / QR para escaneo</label>
          <div id="veh-barcode-container"></div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="veh-category">Categoría</label>
            <input type="text" id="veh-category" class="input input-md" placeholder="Ej. Sedán, Camioneta" value="${isEdit ? (vehicle.category || '') : ''}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="veh-status">Estado inicial</label>
            <select id="veh-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="DISPONIBLE" ${isEdit && vehicle.status === 'DISPONIBLE' ? 'selected' : ''}>Disponible</option>
              <option value="ALQUILADO" ${isEdit && vehicle.status === 'ALQUILADO' ? 'selected' : ''}>En Alquiler</option>
              <option value="MANTENIMIENTO" ${isEdit && vehicle.status === 'MANTENIMIENTO' ? 'selected' : ''}>Mantenimiento</option>
            </select>
          </div>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-submit-btn">${isEdit ? 'Guardar Cambios' : 'Registrar Vehículo'}</button>
    `;

    this.modalInstance = new Modal({
      title: isEdit ? 'Editar Vehículo' : 'Registrar Vehículo en Flota',
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'md',
      onClose: () => {
        if (this.modalBarcodeInput) {
          this.modalBarcodeInput.unmount();
          this.modalBarcodeInput = null;
        }
      }
    });

    document.body.appendChild(this.modalInstance.mount());

    // Mount BarcodeInput component inside the modal
    const barcodeContainer = this.modalInstance.$('#veh-barcode-container');
    if (barcodeContainer) {
      this.modalBarcodeInput = new BarcodeInput({
        id: 'veh-code',
        compact: true,
        placeholder: 'Escanea código de barra o QR...',
        value: isEdit ? (vehicle.code || '') : '',
        onScan: (code) => {
          this.modalBarcodeInput.setValue(code);
        }
      });
      barcodeContainer.appendChild(this.modalBarcodeInput.mount());
    }

    const cancelBtn = this.modalInstance.$('#modal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.modalInstance.close());
    }

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitVehicle(vehicle));
    }
  }

  async submitVehicle(vehicle = null) {
    const form = this.modalInstance.$('#vehicle-form');
    if (!form || !form.reportValidity()) return;

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }

    const brand = this.modalInstance.$('#veh-brand').value.trim();
    const model = this.modalInstance.$('#veh-model').value.trim();
    const plate = this.modalInstance.$('#veh-plate').value.trim();
    const year = Number(this.modalInstance.$('#veh-year').value || 0);
    const category = this.modalInstance.$('#veh-category').value.trim();
    const status = this.modalInstance.$('#veh-status').value;
    const code = this.modalBarcodeInput ? this.modalBarcodeInput.getValue() : '';

    const payload = {
      brand,
      model,
      plate,
      year,
      category,
      status,
      code,
      updatedAt: Date.now(),
      updatedAtLocal: TimeService.timestamp()
    };

    // Register barcode in the central registry
    if (code) {
      try {
        await BarcodeRegistryService.registerCode(code, {
          productName: `${brand} ${model} (${plate})`,
          associatedWith: 'vehiculo'
        });
      } catch (err) {
        console.warn('[VehiclesView] Barcode registry error:', err.message);
      }
    }

    try {
      if (vehicle) {
        await FirestoreService.update('vehiculos', vehicle.id, payload);
        NotificationService.success('Vehículo actualizado correctamente.');
        if (code) {
          await BarcodeRegistryService.associateCode(code, vehicle.id, 'vehiculo', `${brand} ${model}`).catch(() => {});
        }
      } else {
        payload.createdAt = Date.now();
        payload.createdAtLocal = TimeService.timestamp();
        const newId = await FirestoreService.create('vehiculos', payload);
        NotificationService.success('Vehículo agregado a la flota.');
        if (code && newId) {
          await BarcodeRegistryService.associateCode(code, newId, 'vehiculo', `${brand} ${model}`).catch(() => {});
        }
      }
      this.modalInstance.close();
    } catch (err) {
      console.error('[VehiclesView] Error saving vehicle:', err);
      alert(`Error al guardar: ${err.message}`);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = vehicle ? 'Guardar Cambios' : 'Registrar Vehículo';
      }
    }
  }

  unmount() {
    if (this.modalBarcodeInput) {
      this.modalBarcodeInput.unmount();
      this.modalBarcodeInput = null;
    }
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.table.unmount();
    this.layout.unmount();
    super.unmount();
  }
}
