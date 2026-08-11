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
import { I18nService } from '../../../services/i18n.service.js';

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
          label: I18nService.t('ass_name_col'),
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
          label: I18nService.t('ass_code_col'),
          render: (val) => val ? `<span class="scan-code-badge">📊 ${val}</span>` : `<span class="text-xs text-secondary">${I18nService.t('unassigned')}</span>`
        },
        { key: 'category', label: I18nService.t('category') },
        { 
          key: 'cost', 
          label: I18nService.t('ass_cost_col'),
          render: (val) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val || 0)
        },
        { key: 'location', label: I18nService.t('qr_location') },
        { 
          key: 'status', 
          label: I18nService.t('status'),
          render: (val) => {
            let label = I18nService.t('ass_status_operative');
            let badgeClass = 'stock-ok';
            if (val === 'MANTENIMIENTO') {
              label = I18nService.t('ass_status_maintenance');
              badgeClass = 'stock-low';
            } else if (val === 'DEBAJA') {
              label = I18nService.t('ass_status_retired');
              badgeClass = 'stock-out';
            }
            return `<span class="stock-badge ${badgeClass}">${label}</span>`;
          }
        },
        {
          key: 'id',
          label: I18nService.t('actions'),
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
      title: I18nService.t('ass_title'),
      subtitle: I18nService.t('ass_subtitle'),
      actionHTML: `
        <button class="btn btn-primary btn-sm" id="btn-add-asset">
          ${I18nService.t('ass_add')}
        </button>
      `,
      contentHTML: `
        <!-- KPI Cards Row -->
        <div class="grid-stats animate-fade-in" id="assets-kpis">
          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">${I18nService.t('ass_total_kpi')}</span>
              <div class="kpi-icon kpi-icon-accent">🖥️</div>
            </div>
            <h3 class="kpi-value" id="kpi-total-assets">0</h3>
            <span class="text-xs text-secondary">${I18nService.t('ass_total_desc')}</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">${I18nService.t('ass_total_value_kpi')}</span>
              <div class="kpi-icon kpi-icon-success">💰</div>
            </div>
            <h3 class="kpi-value text-success" id="kpi-total-cost">$0.00</h3>
            <span class="text-xs text-secondary">${I18nService.t('ass_total_value_desc')}</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">${I18nService.t('ass_operative_kpi')}</span>
              <div class="kpi-icon kpi-icon-success">✅</div>
            </div>
            <h3 class="kpi-value text-success" id="kpi-active-assets">0</h3>
            <span class="text-xs text-secondary">${I18nService.t('ass_operative_desc')}</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">${I18nService.t('ass_maintenance_kpi')}</span>
              <div class="kpi-icon kpi-icon-warning">🔧</div>
            </div>
            <h3 class="kpi-value text-warning" id="kpi-maintenance-assets">0</h3>
            <span class="text-xs text-secondary">${I18nService.t('ass_maintenance_desc')}</span>
          </div>
        </div>

        <!-- Filter and Search Toolbar -->
        <div class="card p-4 mb-4">
          <div class="inv-toolbar">
            <div class="inv-search">
              <span class="inv-search-icon">🔍</span>
              <input type="text" id="inp-search-asset" class="input input-md" placeholder="${I18nService.t('ass_search_placeholder')}" />
            </div>

            <select id="sel-filter-status" class="inv-filter-select">
              <option value="">${I18nService.t('ocr_all_statuses')}</option>
              <option value="OPERATIVO">${I18nService.t('ass_status_operative')}</option>
              <option value="MANTENIMIENTO">${I18nService.t('ass_status_maintenance')}</option>
              <option value="DEBAJA">${I18nService.t('ass_status_retired')}</option>
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
          if (confirm(I18nService.t('ass_confirm_delete'))) {
            try {
              await FirestoreService.delete('activos', assetId);
              NotificationService.success(I18nService.t('ass_deleted_success'));
            } catch (err) {
              console.error('[AssetsView] Error deleting:', err);
              NotificationService.error(I18nService.t('ass_delete_error'));
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
            <label class="form-label" for="ass-name">${I18nService.t('ass_name_label')}</label>
            <input type="text" id="ass-name" class="input input-md" placeholder="${I18nService.t('ass_name_placeholder')}" value="${isEdit ? asset.name : ''}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="ass-serial">${I18nService.t('qr_serial_number_label')}</label>
            <input type="text" id="ass-serial" class="input input-md" placeholder="${I18nService.t('ass_serial_number_placeholder')}" value="${isEdit ? (asset.serialNumber || '') : ''}" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">${I18nService.t('ass_barcode_label')}</label>
          <div id="ass-barcode-container"></div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="ass-category">${I18nService.t('category')}</label>
            <select id="ass-category" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="Equipos de Oficina" ${isEdit && asset.category === 'Equipos de Oficina' ? 'selected' : ''}>${I18nService.t('ass_cat_office')}</option>
              <option value="Mobiliario" ${isEdit && asset.category === 'Mobiliario' ? 'selected' : ''}>${I18nService.t('ass_cat_furniture')}</option>
              <option value="Tecnología" ${isEdit && asset.category === 'Tecnología' ? 'selected' : ''}>${I18nService.t('ass_cat_tech')}</option>
              <option value="Herramientas" ${isEdit && asset.category === 'Herramientas' ? 'selected' : ''}>${I18nService.t('nav_tools')}</option>
              <option value="Otros" ${isEdit && asset.category === 'Otros' ? 'selected' : ''}>${I18nService.t('inv_category_others')}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="ass-cost">${I18nService.t('ass_cost_label')}</label>
            <input type="number" id="ass-cost" class="input input-md" placeholder="0.00" min="0" step="0.01" value="${isEdit ? asset.cost : ''}" />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="ass-location">${I18nService.t('ass_location_label')}</label>
            <input type="text" id="ass-location" class="input input-md" placeholder="${I18nService.t('ass_location_placeholder')}" value="${isEdit ? (asset.location || '') : ''}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="ass-status">${I18nService.t('ass_status_label')}</label>
            <select id="ass-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="OPERATIVO" ${isEdit && asset.status === 'OPERATIVO' ? 'selected' : ''}>${I18nService.t('ass_status_operative_desc')}</option>
              <option value="MANTENIMIENTO" ${isEdit && asset.status === 'MANTENIMIENTO' ? 'selected' : ''}>${I18nService.t('ass_status_maintenance')}</option>
              <option value="DEBAJA" ${isEdit && asset.status === 'DEBAJA' ? 'selected' : ''}>${I18nService.t('ass_status_retired_desc')}</option>
            </select>
          </div>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">${I18nService.t('cancel')}</button>
      <button class="btn btn-primary btn-sm" id="modal-submit-btn">${isEdit ? I18nService.t('save_changes') : I18nService.t('ass_add')}</button>
    `;

    this.modalInstance = new Modal({
      title: isEdit ? I18nService.t('ass_edit_title') : I18nService.t('ass_add_title'),
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
        placeholder: I18nService.t('ass_scan_placeholder'),
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
      submitBtn.textContent = I18nService.t('saving');
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
        NotificationService.success(I18nService.t('ass_updated_success'));
        if (code) {
          await BarcodeRegistryService.associateCode(code, asset.id, 'activo', name).catch(() => {});
        }
      } else {
        payload.createdAt = Date.now();
        payload.createdAtLocal = TimeService.timestamp();
        const newId = await FirestoreService.create('activos', payload);
        NotificationService.success(I18nService.t('ass_saved_success'));
        if (code && newId) {
          await BarcodeRegistryService.associateCode(code, newId, 'activo', name).catch(() => {});
        }
      }
      this.modalInstance.close();
    } catch (err) {
      console.error('[AssetsView] Error saving asset:', err);
      alert(I18nService.t('ass_save_error', { error: err.message }));
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = asset ? I18nService.t('save_changes') : I18nService.t('ass_add');
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
