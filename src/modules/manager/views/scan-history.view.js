/**
 * @file scan-history.view.js
 * @description Vista de auditoría e historial de escaneos para el Administrador/Gerente.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { BarcodeScannerService } from '../../../services/barcode-scanner.service.js';
import { BarcodeRegistryService } from '../../../services/barcode-registry.service.js';

export class ScanHistoryView extends Component {
  constructor(params = {}) {
    super(params);

    this.state = {
      scans: [],
      searchQuery: '',
      selectedType: '',
      selectedFormat: ''
    };

    // Initialize DataTable
    this.table = new DataTable({
      columns: [
        { 
          key: 'lastScannedAt', 
          label: 'Fecha y Hora',
          render: (val) => new Date(val).toLocaleString()
        },
        { 
          key: 'code', 
          label: 'Código',
          render: (val) => `<span class="scan-code-badge">${val}</span>`
        },
        { 
          key: 'format', 
          label: 'Formato',
          render: (val) => {
            const label = BarcodeScannerService.getFormatLabel(val);
            const lower = (val || '').toLowerCase();
            return `<span class="scan-format-badge scan-format-${lower}">${label}</span>`;
          }
        },
        { 
          key: 'associatedWith', 
          label: 'Tipo',
          render: (val) => {
            if (!val) return '<span class="text-xs text-secondary">—</span>';
            const label = BarcodeRegistryService.getTypeLabel(val);
            const icon = BarcodeRegistryService.getTypeIcon(val);
            return `<span class="scan-type-badge scan-type-${val}">${icon} ${label}</span>`;
          }
        },
        { 
          key: 'productName', 
          label: 'Objeto Asociado',
          render: (val, row) => val 
            ? `<strong class="text-primary">${val}</strong>` 
            : `<span class="text-xs text-secondary">No asociado</span>`
        },
        { 
          key: 'scanCount', 
          label: 'Lecturas',
          render: (val) => `<strong style="color:var(--color-accent);">${val || 1}</strong>`
        }
      ],
      data: []
    });

    this.layout = new PageLayout({
      title: 'Auditoría e Historial de Escaneos',
      subtitle: 'Consulta el registro permanente de todos los códigos de barra y QR leídos por los dispositivos del negocio.',
      contentHTML: `
        <!-- KPI Cards Row -->
        <div class="grid-stats animate-fade-in" id="history-kpis">
          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Códigos Únicos</span>
              <div class="kpi-icon kpi-icon-accent">📊</div>
            </div>
            <h3 class="kpi-value" id="kpi-unique-codes">0</h3>
            <span class="text-xs text-secondary">Registrados permanentemente</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Total Lecturas</span>
              <div class="kpi-icon kpi-icon-success">📡</div>
            </div>
            <h3 class="kpi-value text-success" id="kpi-total-scans">0</h3>
            <span class="text-xs text-secondary">Escaneos acumulados</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Códigos QR</span>
              <div class="kpi-icon kpi-icon-warning">📱</div>
            </div>
            <h3 class="kpi-value text-warning" id="kpi-qr-count">0</h3>
            <span class="text-xs text-secondary">Lecturas de códigos QR</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Códigos Asociados</span>
              <div class="kpi-icon kpi-icon-success">🔗</div>
            </div>
            <h3 class="kpi-value text-success" id="kpi-linked-count">0</h3>
            <span class="text-xs text-secondary">Vinculados a productos/activos</span>
          </div>
        </div>

        <!-- Toolbar -->
        <div class="card p-4 mb-4">
          <div class="inv-toolbar">
            <div class="inv-search">
              <span class="inv-search-icon">🔍</span>
              <input type="text" id="inp-search-scan" class="input input-md" placeholder="Buscar por código u objeto..." />
            </div>

            <select id="sel-filter-type" class="inv-filter-select">
              <option value="">Todos los tipos</option>
              <option value="producto">Productos</option>
              <option value="activo">Activos</option>
              <option value="vehiculo">Vehículos</option>
              <option value="herramienta">Herramientas</option>
              <option value="insumo">Insumos</option>
            </select>

            <select id="sel-filter-format" class="inv-filter-select">
              <option value="">Todos los formatos</option>
              <option value="EAN13">EAN-13</option>
              <option value="EAN8">EAN-8</option>
              <option value="UPC_A">UPC-A</option>
              <option value="CODE128">Code 128</option>
              <option value="QR">QR</option>
              <option value="CUSTOM">Personalizados</option>
            </select>
          </div>
        </div>

        <!-- Table -->
        <div class="card p-5">
          <div id="scans-table-wrapper"></div>
        </div>
      `
    });

    this.listeners = [];
  }

  mount() {
    const element = this.layout.mount();

    const tableWrapper = element.querySelector('#scans-table-wrapper');
    if (tableWrapper) {
      tableWrapper.appendChild(this.table.mount());
    }

    this.afterMount(element);
    this.subscribeToScans(element);

    return element;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    const inpSearch = root.querySelector('#inp-search-scan');
    if (inpSearch) {
      inpSearch.addEventListener('input', (e) => {
        this.state.searchQuery = e.target.value.toLowerCase();
        this.applyFilters();
      });
    }

    const selType = root.querySelector('#sel-filter-type');
    if (selType) {
      selType.addEventListener('change', (e) => {
        this.state.selectedType = e.target.value;
        this.applyFilters();
      });
    }

    const selFormat = root.querySelector('#sel-filter-format');
    if (selFormat) {
      selFormat.addEventListener('change', (e) => {
        this.state.selectedFormat = e.target.value;
        this.applyFilters();
      });
    }
  }

  subscribeToScans(element) {
    try {
      const listenerId = BarcodeRegistryService.listenToScans((scans) => {
        this.state.scans = scans || [];
        this.recalculateKPIs(element);
        this.applyFilters();
      });
      this.listeners.push(listenerId);
    } catch (e) {
      console.warn('[ScanHistoryView] Error listening to scans:', e.message);
    }
  }

  recalculateKPIs(element) {
    const root = element || this.layout.element;
    if (!root) return;

    const scans = this.state.scans;

    const unique = scans.length;
    const totalScans = scans.reduce((sum, s) => sum + Number(s.scanCount || 1), 0);
    const qr = scans.filter(s => s.format === 'QR').length;
    const linked = scans.filter(s => s.productId).length;

    const uniqueEl = root.querySelector('#kpi-unique-codes');
    if (uniqueEl) uniqueEl.textContent = unique;

    const totalEl = root.querySelector('#kpi-total-scans');
    if (totalEl) totalEl.textContent = totalScans;

    const qrEl = root.querySelector('#kpi-qr-count');
    if (qrEl) qrEl.textContent = qr;

    const linkedEl = root.querySelector('#kpi-linked-count');
    if (linkedEl) linkedEl.textContent = linked;
  }

  applyFilters() {
    const { searchQuery, selectedType, selectedFormat, scans } = this.state;

    let filtered = scans.filter(s => {
      const matchesSearch = !searchQuery || 
        (s.code || '').toLowerCase().includes(searchQuery) ||
        (s.productName || '').toLowerCase().includes(searchQuery);

      const matchesType = !selectedType || s.associatedWith === selectedType;
      const matchesFormat = !selectedFormat || s.format === selectedFormat;

      return matchesSearch && matchesType && matchesFormat;
    });

    const tableWrapper = this.layout.$('#scans-table-wrapper');
    if (tableWrapper) {
      tableWrapper.innerHTML = '';
      this.table.props.data = filtered;
      tableWrapper.appendChild(this.table.mount());
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
