/**
 * @file assets.view.js
 * @description Gestión de Activos y Equipos con soporte para escaneo de códigos de barra/QR.
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

export class AssetsView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || '';

    this.state = {
      assets: [],
      searchQuery: '',
      selectedStatus: ''
    };

    // Initialize DataTable
    this.table = new DataTable({
      columns: [
        { 
          key: 'name', 
          label: 'Activo / Equipo',
          render: (val, row) => `
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width:40px;height:40px;border-radius:6px;background:var(--color-bg-tertiary);display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">🖥️</div>
              <div style="display: flex; flex-direction: column;">
                <span class="font-semibold text-primary">${val}</span>
                <span class="text-xs text-secondary" style="font-size: 0.7rem; margin-top: 2px;">S/N: ${row.serialNumber || 'N/A'}</span>
              </div>
            </div>
          `
        },
        { 
          key: 'code', 
          label: 'Código de Activo',
          render: (val) => val ? `<span class="scan-code-badge">📊 ${val}</span>` : '<span class="text-xs text-secondary">Sin asignar</span>'
        },
        { key: 'category', label: 'Categoría' },
        { 
          key: 'cost', 
          label: 'Valor/Costo',
          render: (val) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val || 0)
        },
        { key: 'location', label: 'Ubicación' },
        { 
          key: 'status', 
          label: 'Estado',
          render: (val) => {
            let label = 'Operativo';
            let badgeClass = 'stock-ok';
            if (val === 'MANTENIMIENTO') {
              label = 'Mantenimiento';
              badgeClass = 'stock-low';
            } else if (val === 'DEBAJA') {
              label = 'De Baja';
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
              <button class="btn btn-secondary btn-sm py-1 px-2 btn-edit-asset" data-id="${val}" style="font-size: 0.7rem;">✏️</button>
              <button class="btn btn-danger btn-sm py-1 px-2 btn-delete-asset" data-id="${val}" style="font-size: 0.7rem;">🗑️</button>
            </div>
          `
        }
      ],
      data: []
    });

    this.layout = new PageLayout({
      title: 'Registro de Activos y Equipos',
      subtitle: 'Administra los bienes tangibles de la empresa, inventario de computadoras, mobiliario e infraestructura.',
      actionHTML: `
        <button class="btn btn-primary btn-sm" id="btn-add-asset">
          + Registrar Activo
        </button>
      `,
      contentHTML: `
        <!-- KPI Cards Row -->
        <div class="grid-stats animate-fade-in" id="assets-kpis">
          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Activos Registrados</span>
              <div class="kpi-icon kpi-icon-accent">🖥️</div>
            </div>
            <h3 class="kpi-value" id="kpi-total-assets">0</h3>
            <span class="text-xs text-secondary">Bienes registrados</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Valor en Activos</span>
              <div class="kpi-icon kpi-icon-success">💰</div>
            </div>
            <h3 class="kpi-value text-success" id="kpi-total-cost">$0.00</h3>
            <span class="text-xs text-secondary">Valor acumulado</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Operativos</span>
              <div class="kpi-icon kpi-icon-success">✅</div>
            </div>
            <h3 class="kpi-value text-success" id="kpi-active-assets">0</h3>
            <span class="text-xs text-secondary">Activos en funcionamiento</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">En Reparación</span>
              <div class="kpi-icon kpi-icon-warning">🔧</div>
            </div>
            <h3 class="kpi-value text-warning" id="kpi-maintenance-assets">0</h3>
            <span class="text-xs text-secondary">Fuera de servicio temporal</span>
          </div>
        </div>

        <!-- Filter and Search Toolbar -->
        <div class="card p-4 mb-4">
          <div class="inv-toolbar">
            <div class="inv-search">
              <span class="inv-search-icon">🔍</span>
              <input type="text" id="inp-search-asset" class="input input-md" placeholder="Buscar por nombre, placa de activo, número de serie o categoría..." />
            </div>

            <select id="sel-filter-status" class="inv-filter-select">
              <option value="">Todos los estados</option>
              <option value="OPERATIVO">Operativos</option>
              <option value="MANTENIMIENTO">En Mantenimiento</option>
              <option value="DEBAJA">De Baja</option>
            </select>
          </div>
        </div>

        <!-- Main Data Table Container -->
        <div class="card p-5">
          <div id="assets-table-wrapper"></div>
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
    const tableWrapper = element.querySelector('#assets-table-wrapper');
    if (tableWrapper) {
      tableWrapper.appendChild(this.table.mount());
    }

    this.afterMount(element);
    this.subscribeToAssets(element);

    return element;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    // Search and filters
    const inpSearch = root.querySelector('#inp-search-asset');
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

    // Add Asset click
    const addBtn = root.querySelector('#btn-add-asset');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openAssetModal());
    }

    // Edit/Delete click delegation
    const tableWrapper = root.querySelector('#assets-table-wrapper');
    if (tableWrapper) {
      tableWrapper.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.btn-edit-asset');
        if (editBtn) {
          const assetId = editBtn.getAttribute('data-id');
          const asset = this.state.assets.find(a => a.id === assetId);
          if (asset) this.openAssetModal(asset);
        }

        const deleteBtn = e.target.closest('.btn-delete-asset');
        if (deleteBtn) {
          const assetId = deleteBtn.getAttribute('data-id');
          if (confirm('¿Estás seguro de que deseas eliminar este activo definitivamente?')) {
            try {
              await FirestoreService.delete('activos', assetId);
              NotificationService.success('Activo eliminado.');
            } catch (err) {
              console.error('[AssetsView] Error deleting:', err);
              NotificationService.error('Error al eliminar el activo.');
            }
          }
        }
      });
    }
  }

  subscribeToAssets(element) {
    try {
      const listener = FirestoreService.listenToTenant('activos', (assets) => {
        this.state.assets = assets || [];
        this.recalculateKPIs(element);
        this.applyFilters();
      });
      this.listeners.push(listener);
    } catch (e) {
      console.warn('[AssetsView] Error establishing real-time subscription:', e.message);
    }
  }

  recalculateKPIs(element) {
    const root = element || this.layout.element;
    if (!root) return;

    const assets = this.state.assets;

    const total = assets.length;
    const totalVal = assets.reduce((sum, a) => sum + Number(a.cost || 0), 0);
    const operative = assets.filter(a => a.status === 'OPERATIVO' || !a.status).length;
    const maintenance = assets.filter(a => a.status === 'MANTENIMIENTO').length;

    const totalEl = root.querySelector('#kpi-total-assets');
    if (totalEl) totalEl.textContent = total;

    const costEl = root.querySelector('#kpi-total-cost');
    if (costEl) {
      costEl.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalVal);
    }

    const activeEl = root.querySelector('#kpi-active-assets');
    if (activeEl) activeEl.textContent = operative;

    const maintenanceEl = root.querySelector('#kpi-maintenance-assets');
    if (maintenanceEl) maintenanceEl.textContent = maintenance;
  }

  applyFilters() {
    const { searchQuery, selectedStatus, assets } = this.state;

    let filtered = assets.filter(a => {
      const matchesSearch = !searchQuery || 
        (a.name || '').toLowerCase().includes(searchQuery) ||
        (a.serialNumber || '').toLowerCase().includes(searchQuery) ||
        (a.category || '').toLowerCase().includes(searchQuery) ||
        (a.code || '').toLowerCase().includes(searchQuery);

      let matchesStatus = true;
      if (selectedStatus) {
        if (selectedStatus === 'OPERATIVO') {
          matchesStatus = a.status === 'OPERATIVO' || !a.status;
        } else {
          matchesStatus = a.status === selectedStatus;
        }
      }

      return matchesSearch && matchesStatus;
    });

    const tableWrapper = this.layout.$('#assets-table-wrapper');
    if (tableWrapper) {
      tableWrapper.innerHTML = '';
      this.table.props.data = filtered;
      tableWrapper.appendChild(this.table.mount());
    }
  }

  openAssetModal(asset = null) {
    const isEdit = !!asset;

    const formHTML = `
      <form id="asset-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary);">
        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="ass-name">Nombre del Activo / Descripción</label>
            <input type="text" id="ass-name" class="input input-md" placeholder="Ej. Impresora HP Laserjet" value="${isEdit ? asset.name : ''}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="ass-serial">Número de Serie</label>
            <input type="text" id="ass-serial" class="input input-md" placeholder="Ej. CNB12345" value="${isEdit ? (asset.serialNumber || '') : ''}" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Asociar Código de Barras / QR (Etiqueta de Activo)</label>
          <div id="ass-barcode-container"></div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="ass-category">Categoría</label>
            <select id="ass-category" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="Equipos de Oficina" ${isEdit && asset.category === 'Equipos de Oficina' ? 'selected' : ''}>Equipos de Oficina</option>
              <option value="Mobiliario" ${isEdit && asset.category === 'Mobiliario' ? 'selected' : ''}>Mobiliario</option>
              <option value="Tecnología" ${isEdit && asset.category === 'Tecnología' ? 'selected' : ''}>Tecnología (PC, Servidores)</option>
              <option value="Herramientas" ${isEdit && asset.category === 'Herramientas' ? 'selected' : ''}>Herramientas</option>
              <option value="Otros" ${isEdit && asset.category === 'Otros' ? 'selected' : ''}>Otros</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="ass-cost">Costo de Adquisición</label>
            <input type="number" id="ass-cost" class="input input-md" placeholder="0.00" min="0" step="0.01" value="${isEdit ? asset.cost : ''}" />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="ass-location">Ubicación física</label>
            <input type="text" id="ass-location" class="input input-md" placeholder="Ej. Oficina Principal, Recepción" value="${isEdit ? (asset.location || '') : ''}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="ass-status">Estado del Activo</label>
            <select id="ass-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="OPERATIVO" ${isEdit && asset.status === 'OPERATIVO' ? 'selected' : ''}>Operativo / Activo</option>
              <option value="MANTENIMIENTO" ${isEdit && asset.status === 'MANTENIMIENTO' ? 'selected' : ''}>En Mantenimiento</option>
              <option value="DEBAJA" ${isEdit && asset.status === 'DEBAJA' ? 'selected' : ''}>Dado de Baja / Desechado</option>
            </select>
          </div>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-submit-btn">${isEdit ? 'Guardar Cambios' : 'Registrar Activo'}</button>
    `;

    this.modalInstance = new Modal({
      title: isEdit ? 'Editar Activo / Equipo' : 'Registrar Nuevo Activo Fijo',
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

    // Mount barcode scanner input
    const barcodeContainer = this.modalInstance.$('#ass-barcode-container');
    if (barcodeContainer) {
      this.modalBarcodeInput = new BarcodeInput({
        id: 'ass-code',
        compact: true,
        placeholder: 'Escanea el código del activo...',
        value: isEdit ? (asset.code || '') : '',
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
      submitBtn.addEventListener('click', () => this.submitAsset(asset));
    }
  }

  async submitAsset(asset = null) {
    const form = this.modalInstance.$('#asset-form');
    if (!form || !form.reportValidity()) return;

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }

    const name = this.modalInstance.$('#ass-name').value.trim();
    const serialNumber = this.modalInstance.$('#ass-serial').value.trim();
    const category = this.modalInstance.$('#ass-category').value;
    const cost = Number(this.modalInstance.$('#ass-cost').value || 0);
    const location = this.modalInstance.$('#ass-location').value.trim();
    const status = this.modalInstance.$('#ass-status').value;
    const code = this.modalBarcodeInput ? this.modalBarcodeInput.getValue() : '';

    const payload = {
      name,
      serialNumber,
      category,
      cost,
      location,
      status,
      code,
      updatedAt: Date.now(),
      updatedAtLocal: TimeService.timestamp()
    };

    // Register barcode in the central registry
    if (code) {
      try {
        await BarcodeRegistryService.registerCode(code, {
          productName: name,
          associatedWith: 'activo'
        });
      } catch (err) {
        console.warn('[AssetsView] Registry error:', err.message);
      }
    }

    try {
      if (asset) {
        await FirestoreService.update('activos', asset.id, payload);
        NotificationService.success('Activo actualizado correctamente.');
        if (code) {
          await BarcodeRegistryService.associateCode(code, asset.id, 'activo', name).catch(() => {});
        }
      } else {
        payload.createdAt = Date.now();
        payload.createdAtLocal = TimeService.timestamp();
        const newId = await FirestoreService.create('activos', payload);
        NotificationService.success('Activo registrado correctamente.');
        if (code && newId) {
          await BarcodeRegistryService.associateCode(code, newId, 'activo', name).catch(() => {});
        }
      }
      this.modalInstance.close();
    } catch (err) {
      console.error('[AssetsView] Error saving asset:', err);
      alert(`Error al guardar: ${err.message}`);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = asset ? 'Guardar Cambios' : 'Registrar Activo';
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
