/**
 * @file invoice-ocr.view.js
 * @description Intelligent Supplier Purchase Invoice Reader view for Owner/Manager Dashboard.
 * Features document scanning, image canvas filters, interactive editable item table with confidence badges,
 * selling price margin calculators, duplicate inventory match resolver, invoice history, and financial metrics.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';
import { OCRService } from '../../../services/ocr.service.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { I18nService } from '../../../services/i18n.service.js';

export class InvoiceOCRView extends Component {
  constructor(params = {}) {
    super(params);

    const { currentUser, currentCompany } = GlobalStore.getState();
    this.currentUser = currentUser || {};
    this.companyId = currentUser?.companyId || 'company-test';
    this.currentCompany = currentCompany || {};

    this.state = {
      activeTab: 'digitize', // 'digitize' | 'history' | 'stats'
      isScanning: false,
      scanningText: '',
      hasScannedData: false,

      // File & Preview states
      imageFile: null,
      imagePreviewUrl: null,
      fileName: '',
      fileSizeText: '',

      // Extracted Invoice Header
      supplierName: '',
      ruc: '',
      invoiceNumber: '',
      invoiceDate: new Date().toISOString().split('T')[0],
      phone: '',
      email: '',
      address: '',

      // Extracted Items
      items: [],
      confidenceScores: {},

      // Match Resolver Modal State
      showMatchModal: false,
      matchedProducts: [], // [{ scannedItem, existingProduct, action }]

      // History Tab State
      historyInvoices: [],
      historyFilterStatus: 'ALL',
      historySearch: '',
      selectedHistoryInvoice: null,

      // Stats State
      stats: {
        totalSpent: 0,
        supplierCounts: {},
        topProducts: [],
        avgMargin: 0,
        totalInventoryCostValue: 0
      }
    };

    this.layout = new PageLayout({
      title: I18nService.t('ocr_title'),
      subtitle: I18nService.t('ocr_subtitle'),
      actionHTML: `
        <div class="d-flex gap-2">
          <button class="btn btn-secondary btn-sm" id="hdr-btn-digitize">${I18nService.t('ocr_tab_digitize')}</button>
          <button class="btn btn-secondary btn-sm" id="hdr-btn-history">${I18nService.t('ocr_tab_history')}</button>
          <button class="btn btn-secondary btn-sm" id="hdr-btn-stats">${I18nService.t('ocr_tab_stats')}</button>
        </div>
      `,
      contentHTML: `<div id="invoice-ocr-view-container"></div>`
    });
  }

  mount() {
    const element = this.layout.mount();
    this.element = element;
    this.container = element.querySelector('#invoice-ocr-view-container');

    this.renderView();
    this.loadInvoiceHistory();

    return element;
  }

  updateView() {
    if (!this.container) return;
    this.renderView();
  }

  renderView() {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="invoice-ocr-container space-y-6">
        ${this.renderTabsNav()}

        ${this.state.activeTab === 'digitize' ? this.renderDigitizeTab() : ''}
        ${this.state.activeTab === 'history' ? this.renderHistoryTab() : ''}
        ${this.state.activeTab === 'stats' ? this.renderStatsTab() : ''}

        ${this.state.showMatchModal ? this.renderMatchModal() : ''}
      </div>
    `;

    this.setupHeaderActionListeners();
    this.setupTabListeners();

    if (this.state.activeTab === 'digitize') this.setupDigitizeListeners();
    if (this.state.activeTab === 'history') {
      this.setupHistoryListeners();
      this.renderHistoryRows();
    }
  }

  setupHeaderActionListeners() {
    const root = this.element || document;
    root.querySelector('#hdr-btn-digitize')?.addEventListener('click', () => this.switchTab('digitize'));
    root.querySelector('#hdr-btn-history')?.addEventListener('click', () => this.switchTab('history'));
    root.querySelector('#hdr-btn-stats')?.addEventListener('click', () => this.switchTab('stats'));
  }

  setupTabListeners() {
    if (!this.container) return;
    this.container.querySelector('#tab-btn-digitize')?.addEventListener('click', () => this.switchTab('digitize'));
    this.container.querySelector('#tab-btn-history')?.addEventListener('click', () => this.switchTab('history'));
    this.container.querySelector('#tab-btn-stats')?.addEventListener('click', () => this.switchTab('stats'));
  }

  switchTab(tab) {
    this.state.activeTab = tab;
    if (tab === 'stats') {
      this.calculateStats();
    } else {
      this.updateView();
    }
  }

  setupDigitizeListeners() {
    if (!this.container) return;

    const fileInput = this.container.querySelector('#invoice-file-input');
    const dropzone = this.container.querySelector('#invoice-dropzone');
    const btnScanDemo = this.container.querySelector('#btn-scan-demo');
    const btnClear = this.container.querySelector('#btn-clear-form');
    const btnConfirm = this.container.querySelector('#btn-confirm-import');
    const btnAddRow = this.container.querySelector('#btn-add-item-row');

    dropzone?.addEventListener('click', () => {
      if (fileInput) {
        fileInput.value = '';
        fileInput.click();
      }
    });

    fileInput?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.handleFileUpload(e.target.files[0]);
      }
    });

    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-primary');
    });

    dropzone?.addEventListener('dragleave', () => {
      dropzone.classList.remove('border-primary');
    });

    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-primary');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        this.handleFileUpload(e.dataTransfer.files[0]);
      }
    });

    btnScanDemo?.addEventListener('click', () => this.processInvoiceOCR());

    btnClear?.addEventListener('click', () => {
      this.state.hasScannedData = false;
      this.state.imageFile = null;
      this.state.imagePreviewUrl = null;
      this.state.fileName = '';
      this.state.fileSizeText = '';
      this.state.items = [];
      this.state.supplierName = '';
      this.state.ruc = '';
      this.state.invoiceNumber = '';
      this.updateView();
    });

    btnAddRow?.addEventListener('click', () => {
      this.addNewRow();
    });

    btnConfirm?.addEventListener('click', () => {
      this.openInventoryMatchModal();
    });

    // Delegate inline table row edits
    const tableBody = this.container.querySelector('#items-table-body');
    tableBody?.addEventListener('input', (e) => {
      const row = e.target.closest('tr');
      if (!row) return;
      const itemId = row.getAttribute('data-item-id');
      const item = this.state.items.find(i => i.id === itemId);
      if (!item) return;

      const field = e.target.getAttribute('data-field');
      if (field === 'quantity') item.quantity = parseFloat(e.target.value) || 0;
      if (field === 'costPrice') item.costPrice = parseFloat(e.target.value) || 0;
      if (field === 'profitMargin') item.profitMargin = parseFloat(e.target.value) || 0;
      if (field === 'name') item.name = e.target.value;
      if (field === 'sku') item.sku = e.target.value;

      // Recalculate prices
      item.sellingPrice = parseFloat(OCRService.calculateSellingPrice(item.costPrice, item.profitMargin, 'percent').toFixed(2));
      item.subtotal = parseFloat((item.quantity * item.costPrice).toFixed(2));
      item.total = parseFloat((item.subtotal * 1.18).toFixed(2));

      // Update row total display
      const tdSellingPrice = row.querySelector('.td-selling-price');
      const tdSubtotal = row.querySelector('.td-subtotal');
      if (tdSellingPrice) tdSellingPrice.textContent = `S/ ${item.sellingPrice.toFixed(2)}`;
      if (tdSubtotal) tdSubtotal.textContent = `S/ ${item.subtotal.toFixed(2)}`;

      this.updateTotalsSummary();
    });

    tableBody?.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete-row')) {
        const row = e.target.closest('tr');
        const itemId = row?.getAttribute('data-item-id');
        this.state.items = this.state.items.filter(i => i.id !== itemId);
        row?.remove();
        this.updateTotalsSummary();
      }
    });
  }

  async handleFileUpload(file) {
    if (!file) return;
    if (file.size === 0) {
      NotificationService.warning(I18nService.t('ocr_error_empty_file'));
      return;
    }

    this.state.imageFile = file;
    this.state.fileName = file.name || I18nService.t('ri_invoice');
    this.state.fileSizeText = `${(file.size / 1024).toFixed(1)} KB`;

    if (file.type && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        this.state.imagePreviewUrl = evt.target.result;
        this.processInvoiceOCR(file);
      };
      reader.readAsDataURL(file);
    } else {
      this.state.imagePreviewUrl = null;
      this.processInvoiceOCR(file);
    }
  }

  async processInvoiceOCR(file = null) {
    const targetFile = file || this.state.imageFile || null;
    this.state.isScanning = true;
    this.state.scanningText = targetFile ? I18nService.t('ocr_scanning_file', { name: targetFile.name }) : I18nService.t('ocr_scanning_generic');
    this.updateView();

    try {
      const data = await OCRService.scanInvoice(targetFile);
      this.state.supplierName = data.supplierName || '';
      this.state.ruc = data.ruc || '';
      this.state.invoiceNumber = data.invoiceNumber || '';
      this.state.invoiceDate = data.invoiceDate || new Date().toISOString().split('T')[0];
      this.state.phone = data.phone || '';
      this.state.email = data.email || '';
      this.state.address = data.address || '';
      this.state.items = data.items || [];
      this.state.confidenceScores = data.confidenceScores || {};
      this.state.hasScannedData = true;
      NotificationService.success(I18nService.t('ocr_scan_success_toast', { count: this.state.items.length }));
    } catch (err) {
      console.error('[OCR] Scan failed:', err);
      NotificationService.error(I18nService.t('ocr_scan_error_toast', { error: err.message }));
    } finally {
      this.state.isScanning = false;
      this.updateView();
    }
  }

  renderTabsNav() {
    return `
      <div class="d-flex gap-2 border-b mb-4 pb-2 overflow-x-auto touch-scroll flex-nowrap" style="-webkit-overflow-scrolling: touch;">
        <button id="tab-btn-digitize" class="btn ${this.state.activeTab === 'digitize' ? 'btn-primary' : 'btn-secondary'} btn-sm text-truncate" style="flex-shrink:0;">
          ${I18nService.t('ocr_tab_digitize')}
        </button>
        <button id="tab-btn-history" class="btn ${this.state.activeTab === 'history' ? 'btn-primary' : 'btn-secondary'} btn-sm text-truncate" style="flex-shrink:0;">
          ${I18nService.t('ocr_tab_history')}
        </button>
        <button id="tab-btn-stats" class="btn ${this.state.activeTab === 'stats' ? 'btn-primary' : 'btn-secondary'} btn-sm text-truncate" style="flex-shrink:0;">
          ${I18nService.t('ocr_tab_stats')}
        </button>
      </div>
    `;
  }

  renderDigitizeTab() {
    const subtotal = this.state.items.reduce((sum, i) => sum + (i.subtotal || 0), 0);
    const tax = subtotal * 0.18;
    const grandTotal = subtotal + tax;

    return `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Column 1: Upload & File Status -->
        <div class="card p-4 sm:p-5">
          <h3 class="text-md font-bold mb-3">1. Subir Factura o Documento</h3>
          
          <div id="invoice-dropzone" class="border-dashed border-2 p-4 sm:p-6 text-center rounded-lg mb-4 cursor-pointer hover:bg-slate-800 transition" style="border-radius: var(--radius-lg);">
            <input type="file" id="invoice-file-input" accept=".pdf,.xlsx,.xls,.csv,.docx,.json,.txt,image/*" class="hidden" />
            <label class="cursor-pointer">
              <div class="text-3xl mb-2">📸 / 📁</div>
              <p class="font-medium text-sm">Arrastra tu factura o haz clic para explorar</p>
              <span class="text-xs text-secondary mt-1 block">Formatos: PDF, Excel (.xlsx, .csv), JSON, Word, TXT e Imágenes (JPG, PNG)</span>
            </label>
          </div>

          <div class="d-flex gap-2 mb-4">
            <button class="btn btn-secondary btn-xs w-full" id="btn-scan-demo">⚡ Probar Factura Demo</button>
          </div>

          <!-- Loading & Scanning Indicator -->
          ${this.state.isScanning ? `
            <div class="p-6 text-center rounded-lg border border-accent" style="background: rgba(124, 58, 237, 0.1);">
              <div class="spinner-border text-accent mb-3" role="status" style="width: 2.5rem; height: 2.5rem; border-width: 3px; border-color: var(--color-accent) transparent transparent transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
              <h4 class="font-bold text-sm" style="color: var(--color-text-primary);">Analizando e Interpretando Documento...</h4>
              <p class="text-xs text-secondary mt-1">${this.state.scanningText || 'Extrayendo productos y precios...'}</p>
            </div>
          ` : ''}

          <!-- Clean File Preview (No Pre-processing Sliders) -->
          ${!this.state.isScanning && (this.state.imagePreviewUrl || this.state.fileName) ? `
            <div class="border rounded-lg p-4 bg-slate-900 text-center">
              ${this.state.imagePreviewUrl ? `
                <img id="img-invoice-preview" src="${this.state.imagePreviewUrl}" class="max-h-48 mx-auto rounded object-contain mb-2" />
              ` : `
                <div class="text-4xl mb-2">📄</div>
              `}
              <h4 class="font-bold text-xs text-truncate">${this.state.fileName}</h4>
              <span class="text-xs text-secondary">${this.state.fileSizeText || 'Documento cargado'}</span>
            </div>
          ` : ''}
        </div>
        
        <!-- Placeholder for rest of component view logic -->
      </div>
    `;
  }

  addNewRow() {
    const newItem = {
      id: 'item_' + Math.random().toString(36).substr(2, 9),
      name: 'Nuevo Producto Manual',
      sku: 'SKU-' + Math.floor(1000 + Math.random() * 9000),
      barcode: '775' + Math.floor(100000000 + Math.random() * 900000000),
      quantity: 1,
      costPrice: 10.00,
      subtotal: 10.00,
      profitMargin: 30,
      sellingPrice: 13.00,
      confidence: 100
    };
    this.state.items.push(newItem);
    this.updateView();
  }

  updateTotalsSummary() {
    if (!this.container) return;
    const subtotal = this.state.items.reduce((sum, i) => sum + (i.subtotal || 0), 0);
    const tax = subtotal * 0.18;
    const total = subtotal + tax;

    const elSubtotal = this.container.querySelector('#summary-subtotal');
    const elTax = this.container.querySelector('#summary-tax');
    const elTotal = this.container.querySelector('#summary-total');

    if (elSubtotal) elSubtotal.textContent = `S/ ${subtotal.toFixed(2)}`;
    if (elTax) elTax.textContent = `S/ ${tax.toFixed(2)}`;
    if (elTotal) elTotal.textContent = `S/ ${total.toFixed(2)}`;
  }

  async openInventoryMatchModal() {
    if (this.state.items.length === 0) {
      NotificationService.warning('Agrega al menos un producto antes de importar.');
      return;
    }

    try {
      const existingProducts = await FirestoreService.query('products');
      const matches = this.state.items.map(scanned => {
        const found = existingProducts.find(p => 
          (p.sku && p.sku === scanned.sku) ||
          (p.barcode && p.barcode === scanned.barcode) ||
          (p.name && p.name.toLowerCase().trim() === scanned.name.toLowerCase().trim())
        );

        return {
          scannedItem: scanned,
          existingProduct: found || null,
          action: found ? 'UPDATE_STOCK_AND_PRICE' : 'CREATE_NEW'
        };
      });

      this.state.matchedProducts = matches;
      this.state.showMatchModal = true;
      this.updateView();
      this.setupMatchModalListeners();
    } catch (err) {
      console.error('[OCR Match] Error matching inventory:', err);
      NotificationService.error('Error al consultar productos.');
    }
  }

  setupMatchModalListeners() {
    if (!this.container) return;
    const btnCancel = this.container.querySelector('#btn-cancel-match');
    const btnFinalConfirm = this.container.querySelector('#btn-final-confirm-import');
    const selects = this.container.querySelectorAll('.select-match-action');

    btnCancel?.addEventListener('click', () => {
      this.state.showMatchModal = false;
      this.updateView();
    });

    selects?.forEach(select => {
      select.addEventListener('change', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'));
        if (this.state.matchedProducts[idx]) {
          this.state.matchedProducts[idx].action = e.target.value;
        }
      });
    });

    btnFinalConfirm?.addEventListener('click', () => {
      this.executeImportToInventory();
    });
  }

  async executeImportToInventory() {
    try {
      for (const m of this.state.matchedProducts) {
        const scanned = m.scannedItem;
        if (m.action === 'UPDATE_STOCK_AND_PRICE' && m.existingProduct) {
          const newStock = (parseFloat(m.existingProduct.stock) || 0) + scanned.quantity;
          await FirestoreService.update('products', m.existingProduct.id, {
            stock: newStock,
            costPrice: scanned.costPrice,
            price: scanned.sellingPrice,
            updatedAtLocal: new Date().toISOString()
          });
        } else if (m.action === 'ONLY_UPDATE_COST' && m.existingProduct) {
          await FirestoreService.update('products', m.existingProduct.id, {
            costPrice: scanned.costPrice,
            updatedAtLocal: new Date().toISOString()
          });
        } else {
          await FirestoreService.create('products', {
            name: scanned.name,
            sku: scanned.sku,
            barcode: scanned.barcode,
            stock: scanned.quantity,
            costPrice: scanned.costPrice,
            price: scanned.sellingPrice,
            category: 'General',
            supplier: this.state.supplierName,
            status: 'ACTIVO'
          });
        }
      }

      const subtotal = this.state.items.reduce((s, i) => s + i.subtotal, 0);
      const invoicePayload = {
        id: `INV-${Date.now()}`,
        supplierName: this.state.supplierName,
        ruc: this.state.ruc,
        invoiceNumber: this.state.invoiceNumber,
        invoiceDate: this.state.invoiceDate,
        totalAmount: subtotal * 1.18,
        itemCount: this.state.items.length,
        items: this.state.items,
        importedBy: this.currentUser.name || this.currentUser.email || 'Admin',
        importedByUid: this.currentUser.uid || 'admin',
        status: 'Confirmada',
        createdAt: new Date().toISOString()
      };

      await FirestoreService.saveInvoiceImport(invoicePayload);

      await FirestoreService.create('audit_logs', {
        action: 'INVOICE_OCR_CONFIRMED',
        details: `Factura ${invoicePayload.invoiceNumber} importada con ${invoicePayload.itemCount} productos por S/ ${invoicePayload.totalAmount.toFixed(2)}`,
        userUid: this.currentUser.uid || 'admin',
        userName: this.currentUser.name || 'Admin',
        companyId: this.companyId
      });

      NotificationService.success('¡Importación completada en el inventario!');
      this.state.showMatchModal = false;
      this.state.hasScannedData = false;
      this.state.items = [];
      this.state.supplierName = '';
      this.state.ruc = '';
      this.state.invoiceNumber = '';
      this.switchTab('history');
    } catch (err) {
      console.error('[Import Execution] Error importing items:', err);
      NotificationService.error('Error al guardar datos en el inventario.');
    }
  }

  async loadInvoiceHistory() {
    try {
      const records = await FirestoreService.getInvoicesHistory();
      this.state.historyInvoices = records || [];
      if (this.state.activeTab === 'history') {
        this.renderHistoryRows();
      }
    } catch (err) {
      console.error('[History] Error loading invoices:', err);
    }
  }

  setupHistoryListeners() {
    if (!this.container) return;
    const inputSearch = this.container.querySelector('#history-search');
    const selectFilter = this.container.querySelector('#history-filter-status');

    inputSearch?.addEventListener('input', (e) => {
      this.state.historySearch = e.target.value.toLowerCase();
      this.renderHistoryRows();
    });

    selectFilter?.addEventListener('change', (e) => {
      this.state.historyFilterStatus = e.target.value;
      this.renderHistoryRows();
    });
  }

  renderHistoryRows() {
    if (!this.container) return;
    const tbody = this.container.querySelector('#history-tbody');
    if (!tbody) return;

    let filtered = this.state.historyInvoices;
    if (this.state.historyFilterStatus !== 'ALL') {
      filtered = filtered.filter(i => i.status === this.state.historyFilterStatus);
    }
    if (this.state.historySearch) {
      filtered = filtered.filter(i => 
        (i.supplierName && i.supplierName.toLowerCase().includes(this.state.historySearch)) ||
        (i.invoiceNumber && i.invoiceNumber.toLowerCase().includes(this.state.historySearch))
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-secondary">${I18nService.t('ocr_history_empty')}</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(inv => `
      <tr class="border-b hover:bg-slate-900 transition">
        <td class="py-2 font-mono text-sm">${inv.invoiceDate || 'N/A'}</td>
        <td class="py-2 font-bold">${inv.invoiceNumber || 'N/A'}</td>
        <td class="py-2">${inv.supplierName || 'N/A'}</td>
        <td class="py-2 font-bold text-emerald-400">S/ ${(inv.totalAmount || 0).toFixed(2)}</td>
        <td class="py-2"><span class="badge badge-secondary">${inv.itemCount || 0} ${I18nService.t('ri_items')}</span></td>
        <td class="py-2"><span class="badge ${inv.status === 'Confirmada' ? 'badge-success' : 'badge-warning'}">${inv.status === 'Confirmada' ? I18nService.t('ocr_status_confirmed') : I18nService.t('pending')}</span></td>
        <td class="py-2 text-xs text-secondary">${inv.importedBy || I18nService.t('nav_system')}</td>
      </tr>
    `).join('');
  }

  calculateStats() {
    const invoices = this.state.historyInvoices;
    const totalSpent = invoices.reduce((sum, i) => sum + (i.totalAmount || 0), 0);
    const supplierCounts = {};
    const productQtyMap = {};
    let totalMarginSum = 0;
    let itemCount = 0;

    invoices.forEach(inv => {
      supplierCounts[inv.supplierName] = (supplierCounts[inv.supplierName] || 0) + (inv.totalAmount || 0);
      (inv.items || []).forEach(item => {
        productQtyMap[item.name] = (productQtyMap[item.name] || 0) + (item.quantity || 0);
        totalMarginSum += (item.profitMargin || 30);
        itemCount++;
      });
    });

    const topProducts = Object.entries(productQtyMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    this.state.stats = {
      totalSpent,
      supplierCounts,
      topProducts,
      avgMargin: itemCount > 0 ? (totalMarginSum / itemCount) : 30,
      totalInventoryCostValue: totalSpent * 0.82
    };

    this.updateView();
  }

  renderTabsNav() {
    return `
      <div class="d-flex gap-2 border-b mb-4 pb-2 overflow-x-auto touch-scroll flex-nowrap" style="-webkit-overflow-scrolling: touch;">
        <button id="tab-btn-digitize" class="btn ${this.state.activeTab === 'digitize' ? 'btn-primary' : 'btn-secondary'} btn-sm text-truncate" style="flex-shrink:0;">
          ${I18nService.t('ocr_tab_digitize')}
        </button>
        <button id="tab-btn-history" class="btn ${this.state.activeTab === 'history' ? 'btn-primary' : 'btn-secondary'} btn-sm text-truncate" style="flex-shrink:0;">
          ${I18nService.t('ocr_tab_history')}
        </button>
        <button id="tab-btn-stats" class="btn ${this.state.activeTab === 'stats' ? 'btn-primary' : 'btn-secondary'} btn-sm text-truncate" style="flex-shrink:0;">
          ${I18nService.t('ocr_tab_stats')}
        </button>
      </div>
    `;
  }

  renderDigitizeTab() {
    const subtotal = this.state.items.reduce((sum, i) => sum + (i.subtotal || 0), 0);
    const tax = subtotal * 0.18;
    const grandTotal = subtotal + tax;

    return `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Column 1: Upload & File Status -->
        <div class="card p-4 sm:p-5">
          <h3 class="text-md font-bold mb-3">${I18nService.t('ocr_step1_title')}</h3>
          
          <div id="invoice-dropzone" class="border-dashed border-2 p-4 sm:p-6 text-center rounded-lg mb-4 cursor-pointer hover:bg-slate-800 transition" style="border-radius: var(--radius-lg);">
            <input type="file" id="invoice-file-input" accept=".pdf,.xlsx,.xls,.csv,.docx,.json,.txt,image/*" class="hidden" />
            <label class="cursor-pointer">
              <div class="text-3xl mb-2">📸 / 📁</div>
              <p class="font-medium text-sm">${I18nService.t('ocr_dropzone_text')}</p>
              <span class="text-xs text-secondary mt-1 block">${I18nService.t('ocr_dropzone_formats')}</span>
            </label>
          </div>

          <div class="d-flex gap-2 mb-4">
            <button class="btn btn-secondary btn-xs w-full" id="btn-scan-demo">${I18nService.t('ocr_demo_btn')}</button>
          </div>

          <!-- Loading & Scanning Indicator -->
          ${this.state.isScanning ? `
            <div class="p-6 text-center rounded-lg border border-accent mb-4" style="background: rgba(124, 58, 237, 0.1);">
              <div class="spinner-border text-accent mb-3" role="status" style="width: 2.5rem; height: 2.5rem; border-width: 3px; border-color: var(--color-accent) transparent transparent transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
              <h4 class="font-bold text-sm" style="color: var(--color-text-primary);">${I18nService.t('ocr_analyzing_title')}</h4>
              <p class="text-xs text-secondary mt-1">${this.state.scanningText || I18nService.t('ocr_analyzing_desc')}</p>
            </div>
          ` : ''}

          <!-- Clean File Preview (No Pre-processing Sliders) -->
          ${!this.state.isScanning && (this.state.imagePreviewUrl || this.state.fileName) ? `
            <div class="border rounded-lg p-4 bg-slate-900 text-center">
              ${this.state.imagePreviewUrl ? `
                <img id="img-invoice-preview" src="${this.state.imagePreviewUrl}" class="max-h-48 mx-auto rounded object-contain mb-2" />
              ` : `
                <div class="text-4xl mb-2">📄</div>
              `}
              <h4 class="font-bold text-xs text-truncate">${this.state.fileName}</h4>
              <span class="text-xs text-secondary">${this.state.fileSizeText || I18nService.t('ocr_file_loaded')}</span>
            </div>
          ` : ''}
        </div>

        <!-- Column 2 & 3: Extracted Header & Line Items Table -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Supplier Header Form -->
          <div class="card p-4 sm:p-5">
            <div class="d-flex justify-between align-items-center mb-3 flex-wrap gap-2">
              <h3 class="text-md font-bold">${I18nService.t('ocr_step2_title')}</h3>
              ${this.state.hasScannedData ? `<span class="badge badge-success text-xs">${I18nService.t('ocr_status_completed')}</span>` : ''}
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label class="font-medium text-secondary d-flex justify-between">
                  ${I18nService.t('sup_title')}
                  ${(this.state.confidenceScores.supplierName || 100) < 80 ? `<span class="badge badge-warning text-xs">${I18nService.t('ocr_low_confidence')}</span>` : ''}
                </label>
                <input type="text" class="input input-sm text-xs w-full mt-1" value="${this.state.supplierName}" placeholder="${I18nService.t('ocr_supplier_name_placeholder')}" />
              </div>

              <div>
                <label class="font-medium text-secondary d-flex justify-between">
                  ${I18nService.t('ocr_ruc_label')}
                  ${(this.state.confidenceScores.ruc || 100) < 80 ? `<span class="badge badge-warning text-xs">${I18nService.t('ocr_low_confidence')}</span>` : ''}
                </label>
                <input type="text" class="input input-sm text-xs w-full mt-1 font-mono" value="${this.state.ruc}" placeholder="Ej. 20123456789" />
              </div>

              <div>
                <label class="font-medium text-secondary d-flex justify-between">
                  ${I18nService.t('ocr_invoice_num_label')}
                  ${(this.state.confidenceScores.invoiceNumber || 100) < 80 ? `<span class="badge badge-warning text-xs">${I18nService.t('ocr_low_confidence')}</span>` : ''}
                </label>
                <input type="text" class="input input-sm text-xs w-full mt-1 font-mono" value="${this.state.invoiceNumber}" placeholder="Ej. F001-0029" />
              </div>

              <div>
                <label class="font-medium text-secondary">${I18nService.t('ocr_invoice_date_label')}</label>
                <input type="date" class="input input-sm text-xs w-full mt-1" value="${this.state.invoiceDate}" />
              </div>

              <div>
                <label class="font-medium text-secondary">${I18nService.t('col_phone')}</label>
                <input type="text" class="input input-sm text-xs w-full mt-1" value="${this.state.phone}" />
              </div>

              <div>
                <label class="font-medium text-secondary">${I18nService.t('col_email')}</label>
                <input type="email" class="input input-sm text-xs w-full mt-1" value="${this.state.email}" />
              </div>
            </div>
          </div>

          <!-- Items Table -->
          <div class="card p-4 sm:p-5">
            <div class="d-flex justify-between align-items-center mb-3 flex-wrap gap-2">
              <div>
                <h3 class="text-md font-bold">${I18nService.t('ocr_step3_title')}</h3>
                <p class="text-xs text-secondary">${I18nService.t('ocr_step3_subtitle')}</p>
              </div>
              <button class="btn btn-secondary btn-xs" id="btn-add-item-row">${I18nService.t('ocr_add_row')}</button>
            </div>

            <div class="overflow-x-auto touch-scroll border rounded-lg" style="-webkit-overflow-scrolling: touch;">
              <table class="w-full text-xs text-left" style="min-width: 680px;">
                <thead>
                  <tr class="border-b text-secondary bg-slate-900/50">
                    <th class="py-2.5 px-3">${I18nService.t('inv_product_name')}</th>
                    <th class="py-2.5 px-2 w-28">SKU</th>
                    <th class="py-2.5 px-2 w-20 text-center">${I18nService.t('quantity_short')}</th>
                    <th class="py-2.5 px-2 w-24 text-right">${I18nService.t('ocr_cost_unit_col')}</th>
                    <th class="py-2.5 px-2 w-20 text-center">${I18nService.t('ocr_margin_col')}</th>
                    <th class="py-2.5 px-2 w-24 text-right">${I18nService.t('ocr_price_sale_col')}</th>
                    <th class="py-2.5 px-2 w-24 text-right">${I18nService.t('subtotal')}</th>
                    <th class="py-2.5 px-2 text-center w-12">${I18nService.t('actions')}</th>
                  </tr>
                </thead>
                <tbody id="items-table-body">
                  ${this.state.items.map(item => `
                    <tr data-item-id="${item.id}" class="border-b hover:bg-slate-900 transition">
                      <td class="py-2 px-3">
                        <input type="text" data-field="name" class="input input-sm text-xs w-full" value="${item.name}" />
                        ${item.confidence < 80 ? `<span class="text-amber-400 text-[10px]">${I18nService.t('ocr_conf_warn', { conf: item.confidence })}</span>` : ''}
                      </td>
                      <td class="py-2 px-2">
                        <input type="text" data-field="sku" class="input input-sm text-xs w-full font-mono" value="${item.sku}" />
                      </td>
                      <td class="py-2 px-2">
                        <input type="number" data-field="quantity" class="input input-sm text-xs w-full text-center" value="${item.quantity}" min="1" step="1" />
                      </td>
                      <td class="py-2 px-2">
                        <input type="number" data-field="costPrice" class="input input-sm text-xs w-full text-right" value="${item.costPrice.toFixed(2)}" step="0.1" />
                      </td>
                      <td class="py-2 px-2">
                        <input type="number" data-field="profitMargin" class="input input-sm text-xs w-full text-center text-emerald-400 font-bold" value="${item.profitMargin}" min="0" step="5" />
                      </td>
                      <td class="py-2 px-2 font-bold text-emerald-400 text-right td-selling-price">
                        S/ ${(item.sellingPrice || 0).toFixed(2)}
                      </td>
                      <td class="py-2 px-2 font-semibold text-right td-subtotal">
                        S/ ${(item.subtotal || 0).toFixed(2)}
                      </td>
                      <td class="py-2 px-2 text-center">
                        <button class="btn btn-secondary btn-xs btn-delete-row text-red-400">🗑️</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <!-- Totals Footer Summary -->
            <div class="d-flex flex-column sm:flex-row justify-between align-items-stretch sm:align-items-center gap-3 mt-4 pt-3 border-t">
              <div class="d-flex flex-column sm:flex-row gap-2">
                <button class="btn btn-secondary btn-sm w-full sm:w-auto" id="btn-clear-form">🧹 ${I18nService.t('clear')}</button>
                <button class="btn btn-primary btn-sm w-full sm:w-auto" id="btn-confirm-import">${I18nService.t('ocr_confirm_import')}</button>
              </div>

              <div class="text-left sm:text-right text-xs space-y-1 bg-slate-900/60 p-3 sm:p-0 rounded-lg">
                <div>${I18nService.t('subtotal')}: <span id="summary-subtotal" class="font-semibold">S/ ${subtotal.toFixed(2)}</span></div>
                <div>${I18nService.t('ocr_tax_label')} <span id="summary-tax" class="text-secondary">S/ ${tax.toFixed(2)}</span></div>
                <div class="text-sm font-bold text-emerald-400">${I18nService.t('ocr_total_label')} <span id="summary-total">S/ ${grandTotal.toFixed(2)}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderMatchModal() {
    return `
      <div class="modal-overlay">
        <div class="modal-container modal-lg p-4 sm:p-6 space-y-4">
          <div class="modal-header px-0 pt-0 pb-3">
            <div>
              <h3 class="modal-title text-base sm:text-lg">${I18nService.t('ocr_match_title')}</h3>
              <span class="text-xs text-secondary">${I18nService.t('ocr_match_subtitle')}</span>
            </div>
            <button class="modal-close" id="btn-cancel-match">&times;</button>
          </div>

          <p class="text-xs text-secondary">
            ${I18nService.t('ocr_match_desc')}
          </p>

          <div class="modal-body px-0 space-y-3">
            ${this.state.matchedProducts.map((m, idx) => `
              <div class="border rounded-lg p-3 text-xs bg-slate-900 space-y-2">
                <div class="d-flex flex-column sm:flex-row justify-between font-bold gap-1">
                  <span>${m.scannedItem.name} (SKU: ${m.scannedItem.sku})</span>
                  <span class="text-emerald-400">${I18nService.t('quantity_short')}: ${m.scannedItem.quantity} | ${I18nService.t('fin_concept')}: S/ ${m.scannedItem.costPrice.toFixed(2)}</span>
                </div>
                ${m.existingProduct ? `
                  <div class="text-amber-400 bg-amber-950/40 p-2 rounded">
                    ${I18nService.t('ocr_match_found', { name: m.existingProduct.name, stock: m.existingProduct.stock || 0 })}
                  </div>
                ` : `
                  <div class="text-sky-400">${I18nService.t('ocr_match_new')}</div>
                `}

                <div>
                  <label class="font-medium text-secondary">${I18nService.t('ocr_match_action_label')}</label>
                  <select data-index="${idx}" class="select-match-action select select-sm text-xs w-full mt-1">
                    ${m.existingProduct ? `
                      <option value="UPDATE_STOCK_AND_PRICE" selected>🟢 [RECOMENDADO] ${I18nService.t('ocr_match_update', { qty: m.scannedItem.quantity })}</option>
                      <option value="ONLY_UPDATE_COST">🟡 ${I18nService.t('ocr_match_cost')}</option>
                      <option value="CREATE_NEW">🔵 ${I18nService.t('ocr_match_create')}</option>
                    ` : `
                      <option value="CREATE_NEW" selected>🟢 ${I18nService.t('ocr_match_create_new')}</option>
                    `}
                  </select>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="modal-footer px-0 pb-0 pt-3 border-t">
            <button class="btn btn-secondary btn-sm w-full sm:w-auto" id="btn-cancel-match">${I18nService.t('cancel')}</button>
            <button class="btn btn-success btn-sm font-bold w-full sm:w-auto" id="btn-final-confirm-import">${I18nService.t('ocr_process_btn')}</button>
          </div>
        </div>
      </div>
    `;
  }

  renderHistoryTab() {
    return `
      <div class="card p-4 sm:p-5 space-y-4">
        <div class="d-flex flex-column sm:flex-row justify-between align-items-start sm:align-items-center gap-3">
          <div>
            <h3 class="text-md font-bold">${I18nService.t('ocr_history_title')}</h3>
            <p class="text-xs text-secondary">${I18nService.t('ocr_history_subtitle')}</p>
          </div>

          <div class="d-flex flex-column sm:flex-row gap-2 w-full sm:w-auto">
            <input type="text" id="history-search" class="input input-sm text-xs w-full sm:w-auto" placeholder="${I18nService.t('ocr_history_search_placeholder')}" />
            <select id="history-filter-status" class="select select-sm text-xs w-full sm:w-auto">
              <option value="ALL">${I18nService.t('ocr_all_statuses')}</option>
              <option value="Confirmada">${I18nService.t('ocr_status_confirmed')}</option>
              <option value="Pendiente">${I18nService.t('pending')}</option>
            </select>
          </div>
        </div>

        <div class="overflow-x-auto touch-scroll border rounded-lg" style="-webkit-overflow-scrolling: touch;">
          <table class="w-full text-xs text-left" style="min-width: 650px;">
            <thead>
              <tr class="border-b text-secondary bg-slate-900/50">
                <th class="py-2.5 px-3">${I18nService.t('col_date')}</th>
                <th class="py-2.5 px-3">${I18nService.t('ocr_invoice_num_label')}</th>
                <th class="py-2.5 px-3">${I18nService.t('sup_title')}</th>
                <th class="py-2.5 px-3 text-right">${I18nService.t('col_amount')}</th>
                <th class="py-2.5 px-3 text-center">${I18nService.t('ri_items')}</th>
                <th class="py-2.5 px-3 text-center">${I18nService.t('status')}</th>
                <th class="py-2.5 px-3">${I18nService.t('ocr_imported_by')}</th>
              </tr>
            </thead>
            <tbody id="history-tbody">
              <!-- Rendered via JS -->
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderStatsTab() {
    const s = this.state.stats;
    return `
      <div class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="card p-5 border-l-4 border-l-emerald-500">
            <span class="text-xs text-secondary font-medium">${I18nService.t('ocr_total_spent_kpi')}</span>
            <div class="text-2xl font-bold text-emerald-400 mt-1">S/ ${(s.totalSpent || 0).toFixed(2)}</div>
          </div>

          <div class="card p-5 border-l-4 border-l-sky-500">
            <span class="text-xs text-secondary font-medium">${I18nService.t('ocr_avg_margin_kpi')}</span>
            <div class="text-2xl font-bold text-sky-400 mt-1">${(s.avgMargin || 30).toFixed(1)}%</div>
          </div>

          <div class="card p-5 border-l-4 border-l-amber-500">
            <span class="text-xs text-secondary font-medium">${I18nService.t('ocr_total_cost_kpi')}</span>
            <div class="text-2xl font-bold text-amber-400 mt-1">S/ ${(s.totalInventoryCostValue || 0).toFixed(2)}</div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="card p-5">
            <h4 class="font-bold text-sm mb-3">${I18nService.t('ocr_top_products_title')}</h4>
            <div class="space-y-2 text-xs">
              ${(s.topProducts || []).map(([name, qty]) => `
                <div class="d-flex justify-between border-b pb-1">
                  <span>${name}</span>
                  <span class="font-bold text-emerald-400">${qty} ${I18nService.t('inv_unit_units')}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="card p-5">
            <h4 class="font-bold text-sm mb-3">${I18nService.t('ocr_spent_by_supplier_title')}</h4>
            <div class="space-y-2 text-xs">
              ${Object.entries(s.supplierCounts || {}).map(([sup, amt]) => `
                <div class="d-flex justify-between border-b pb-1">
                  <span>${sup}</span>
                  <span class="font-bold">S/ ${amt.toFixed(2)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
