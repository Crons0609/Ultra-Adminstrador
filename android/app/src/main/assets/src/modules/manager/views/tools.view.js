/**
 * @file tools.view.js
 * @description Gestión de Herramientas con soporte para escaneo de códigos de barra/QR.
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

export class ToolsView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || '';

    this.state = {
      tools: [],
      searchQuery: '',
      selectedStatus: ''
    };

    // Initialize DataTable
    this.table = new DataTable({
      columns: [
        { 
          key: 'name', 
          label: 'Herramienta',
          render: (val, row) => `
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width:40px;height:40px;border-radius:6px;background:var(--color-bg-tertiary);display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">🔧</div>
              <div style="display: flex; flex-direction: column;">
                <span class="font-semibold text-primary">${val}</span>
                <span class="text-xs text-secondary" style="font-size: 0.7rem; margin-top: 2px;">Condición: ${row.condition || 'Buena'}</span>
              </div>
            </div>
          `
        },
        { 
          key: 'code', 
          label: 'Código de Barra/QR',
          render: (val) => val ? `<span class="scan-code-badge">📊 ${val}</span>` : '<span class="text-xs text-secondary">Sin asignar</span>'
        },
        { key: 'category', label: 'Categoría' },
        { key: 'location', label: 'Ubicación' },
        { 
          key: 'status', 
          label: 'Estado',
          render: (val) => {
            let label = 'Disponible';
            let badgeClass = 'stock-ok';
            if (val === 'EN_USO') {
              label = 'En Uso';
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
              <button class="btn btn-secondary btn-sm py-1 px-2 btn-edit-tool" data-id="${val}" style="font-size: 0.7rem;">✏️</button>
              <button class="btn btn-danger btn-sm py-1 px-2 btn-delete-tool" data-id="${val}" style="font-size: 0.7rem;">🗑️</button>
            </div>
          `
        }
      ],
      data: []
    });

    this.layout = new PageLayout({
      title: 'Control de Herramientas',
      subtitle: 'Gestiona las herramientas de trabajo del negocio, asignaciones de uso, ubicaciones y control de daño.',
      actionHTML: `
        <button class="btn btn-primary btn-sm" id="btn-add-tool">
          + Agregar Herramienta
        </button>
      `,
      contentHTML: `
        <!-- KPI Cards Row -->
        <div class="grid-stats animate-fade-in" id="tools-kpis">
          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Herramientas Totales</span>
              <div class="kpi-icon kpi-icon-accent">🔧</div>
            </div>
            <h3 class="kpi-value" id="kpi-total-tools">0</h3>
            <span class="text-xs text-secondary">Herramientas registradas</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Disponibles</span>
              <div class="kpi-icon kpi-icon-success">✅</div>
            </div>
            <h3 class="kpi-value text-success" id="kpi-available-tools">0</h3>
            <span class="text-xs text-secondary">Listas para su uso</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">En Uso</span>
              <div class="kpi-icon kpi-icon-warning">👷</div>
            </div>
            <h3 class="kpi-value text-warning" id="kpi-used-tools">0</h3>
            <span class="text-xs text-secondary">Asignadas a operarios</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Dañadas / Taller</span>
              <div class="kpi-icon kpi-icon-danger">⚠️</div>
            </div>
            <h3 class="kpi-value text-danger" id="kpi-damaged-tools">0</h3>
            <span class="text-xs text-secondary">No utilizables actualmente</span>
          </div>
        </div>

        <!-- Filter and Search Toolbar -->
        <div class="card p-4 mb-4">
          <div class="inv-toolbar">
            <div class="inv-search">
              <span class="inv-search-icon">🔍</span>
              <input type="text" id="inp-search-tool" class="input input-md" placeholder="Buscar por nombre, código de barra, categoría..." />
            </div>

            <select id="sel-filter-status" class="inv-filter-select">
              <option value="">Todos los estados</option>
              <option value="DISPONIBLE">Disponibles</option>
              <option value="EN_USO">En Uso</option>
              <option value="MANTENIMIENTO">En Mantenimiento</option>
            </select>
          </div>
        </div>

        <!-- Main Data Table Container -->
        <div class="card p-5">
          <div id="tools-table-wrapper"></div>
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
    const tableWrapper = element.querySelector('#tools-table-wrapper');
    if (tableWrapper) {
      tableWrapper.appendChild(this.table.mount());
    }

    this.afterMount(element);
    this.subscribeToTools(element);

    return element;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    // Search and filters
    const inpSearch = root.querySelector('#inp-search-tool');
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

    // Add Tool click
    const addBtn = root.querySelector('#btn-add-tool');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openToolModal());
    }

    // Edit/Delete click delegation
    const tableWrapper = root.querySelector('#tools-table-wrapper');
    if (tableWrapper) {
      tableWrapper.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.btn-edit-tool');
        if (editBtn) {
          const toolId = editBtn.getAttribute('data-id');
          const tool = this.state.tools.find(t => t.id === toolId);
          if (tool) this.openToolModal(tool);
        }

        const deleteBtn = e.target.closest('.btn-delete-tool');
        if (deleteBtn) {
          const toolId = deleteBtn.getAttribute('data-id');
          if (confirm('¿Estás seguro de que deseas eliminar esta herramienta definitivamente?')) {
            try {
              await FirestoreService.delete('herramientas', toolId);
              NotificationService.success('Herramienta eliminada.');
            } catch (err) {
              console.error('[ToolsView] Error deleting:', err);
              NotificationService.error('Error al eliminar la herramienta.');
            }
          }
        }
      });
    }
  }

  subscribeToTools(element) {
    try {
      const listener = FirestoreService.listenToTenant('herramientas', (tools) => {
        this.state.tools = tools || [];
        this.recalculateKPIs(element);
        this.applyFilters();
      });
      this.listeners.push(listener);
    } catch (e) {
      console.warn('[ToolsView] Error establishing real-time subscription:', e.message);
    }
  }

  recalculateKPIs(element) {
    const root = element || this.layout.element;
    if (!root) return;

    const tools = this.state.tools;

    const total = tools.length;
    const available = tools.filter(t => t.status === 'DISPONIBLE' || !t.status).length;
    const used = tools.filter(t => t.status === 'EN_USO').length;
    const damaged = tools.filter(t => t.status === 'MANTENIMIENTO' || t.condition === 'DAÑADO').length;

    const totalEl = root.querySelector('#kpi-total-tools');
    if (totalEl) totalEl.textContent = total;

    const availableEl = root.querySelector('#kpi-available-tools');
    if (availableEl) availableEl.textContent = available;

    const usedEl = root.querySelector('#kpi-used-tools');
    if (usedEl) usedEl.textContent = used;

    const damagedEl = root.querySelector('#kpi-damaged-tools');
    if (damagedEl) damagedEl.textContent = damaged;
  }

  applyFilters() {
    const { searchQuery, selectedStatus, tools } = this.state;

    let filtered = tools.filter(t => {
      const matchesSearch = !searchQuery || 
        (t.name || '').toLowerCase().includes(searchQuery) ||
        (t.condition || '').toLowerCase().includes(searchQuery) ||
        (t.category || '').toLowerCase().includes(searchQuery) ||
        (t.code || '').toLowerCase().includes(searchQuery);

      let matchesStatus = true;
      if (selectedStatus) {
        if (selectedStatus === 'DISPONIBLE') {
          matchesStatus = t.status === 'DISPONIBLE' || !t.status;
        } else {
          matchesStatus = t.status === selectedStatus;
        }
      }

      return matchesSearch && matchesStatus;
    });

    const tableWrapper = this.layout.$('#tools-table-wrapper');
    if (tableWrapper) {
      tableWrapper.innerHTML = '';
      this.table.props.data = filtered;
      tableWrapper.appendChild(this.table.mount());
    }
  }

  openToolModal(tool = null) {
    const isEdit = !!tool;

    const formHTML = `
      <form id="tool-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary);">
        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="tol-name">Nombre de la Herramienta</label>
            <input type="text" id="tol-name" class="input input-md" placeholder="Ej. Taladro Percutor 20V" value="${isEdit ? tool.name : ''}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="tol-condition">Condición Física</label>
            <select id="tol-condition" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="EXCELENTE" ${isEdit && tool.condition === 'EXCELENTE' ? 'selected' : ''}>Excelente</option>
              <option value="BUENO" ${isEdit && tool.condition === 'BUENO' ? 'selected' : ''}>Bueno</option>
              <option value="REGULAR" ${isEdit && tool.condition === 'REGULAR' ? 'selected' : ''}>Regular</option>
              <option value="DAÑADO" ${isEdit && tool.condition === 'DAÑADO' ? 'selected' : ''}>Dañado</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Asociar Código de Barras / QR (Etiqueta de Herramienta)</label>
          <div id="tol-barcode-container"></div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="tol-category">Categoría</label>
            <input type="text" id="tol-category" class="input input-md" placeholder="Ej. Carpintería, Eléctrica" value="${isEdit ? (tool.category || '') : ''}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="tol-location">Ubicación de Resguardo</label>
            <input type="text" id="tol-location" class="input input-md" placeholder="Ej. Caja 2, Bodega Este" value="${isEdit ? (tool.location || '') : ''}" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="tol-status">Estado Operativo</label>
          <select id="tol-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
            <option value="DISPONIBLE" ${isEdit && tool.status === 'DISPONIBLE' ? 'selected' : ''}>Disponible / En Bodega</option>
            <option value="EN_USO" ${isEdit && tool.status === 'EN_USO' ? 'selected' : ''}>En Uso / Asignada</option>
            <option value="MANTENIMIENTO" ${isEdit && tool.status === 'MANTENIMIENTO' ? 'selected' : ''}>En Mantenimiento</option>
          </select>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-submit-btn">${isEdit ? 'Guardar Cambios' : 'Registrar Herramienta'}</button>
    `;

    this.modalInstance = new Modal({
      title: isEdit ? 'Editar Herramienta' : 'Registrar Nueva Herramienta',
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
    const barcodeContainer = this.modalInstance.$('#tol-barcode-container');
    if (barcodeContainer) {
      this.modalBarcodeInput = new BarcodeInput({
        id: 'tol-code',
        compact: true,
        placeholder: 'Escanea el código de la herramienta...',
        value: isEdit ? (tool.code || '') : '',
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
      submitBtn.addEventListener('click', () => this.submitTool(tool));
    }
  }

  async submitTool(tool = null) {
    const form = this.modalInstance.$('#tool-form');
    if (!form || !form.reportValidity()) return;

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }

    const name = this.modalInstance.$('#tol-name').value.trim();
    const condition = this.modalInstance.$('#tol-condition').value;
    const category = this.modalInstance.$('#tol-category').value.trim();
    const location = this.modalInstance.$('#tol-location').value.trim();
    const status = this.modalInstance.$('#tol-status').value;
    const code = this.modalBarcodeInput ? this.modalBarcodeInput.getValue() : '';

    const payload = {
      name,
      condition,
      category,
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
          associatedWith: 'herramienta'
        });
      } catch (err) {
        console.warn('[ToolsView] Registry error:', err.message);
      }
    }

    try {
      if (tool) {
        await FirestoreService.update('herramientas', tool.id, payload);
        NotificationService.success('Herramienta actualizada correctamente.');
        if (code) {
          await BarcodeRegistryService.associateCode(code, tool.id, 'herramienta', name).catch(() => {});
        }
      } else {
        payload.createdAt = Date.now();
        payload.createdAtLocal = TimeService.timestamp();
        const newId = await FirestoreService.create('herramientas', payload);
        NotificationService.success('Herramienta registrada correctamente.');
        if (code && newId) {
          await BarcodeRegistryService.associateCode(code, newId, 'herramienta', name).catch(() => {});
        }
      }
      this.modalInstance.close();
    } catch (err) {
      console.error('[ToolsView] Error saving tool:', err);
      alert(`Error al guardar: ${err.message}`);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = tool ? 'Guardar Cambios' : 'Registrar Herramienta';
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
