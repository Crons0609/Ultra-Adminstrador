/**
 * @file qr-codes.view.js
 * @description Advanced QR Code Generator with dual modes:
 *  - Restaurant Mode: QR generator for tables (mesa, barra, etc.).
 *  - Product Mode: QR generator for individual inventory units (serial numbers, warranties, redirects, and scans analytics).
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { TimeService } from '../../../services/time.service.js';
import { db } from '../../../config/firebase.config.js';
import { ref, get, update, push, set, remove, onValue } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { getBusinessCategory } from '../../../config/business-types.config.js';
import { Modal } from '../../../components/ui/modal.js';

export class QRCodesView extends Component {
  constructor(params = {}) {
    super(params);

    const { currentUser, currentCompany } = GlobalStore.getState();
    this.currentUser = currentUser || {};
    this.currentCompany = currentCompany || {};
    this.companyId = this.currentUser.companyId || '';
    this.branchId = this.currentUser.branchId || 'main';

    // Categorization check
    const category = getBusinessCategory(this.currentCompany.businessType || '');
    this.isRestaurantMode = (category === 'GASTRONOMIA' || category === 'BAR_DISCOTECA');

    // URLs setups
    const rawBaseUrl = `${window.location.origin}/#/customer/menu/${this.companyId}/${this.branchId}/`;
    this.baseMenuUrl = encodeURI(rawBaseUrl);

    // Initial state
    this.state = {
      activeTab: 'generator', // 'generator' | 'inventory' | 'settings' | 'stats'
      
      // Restaurant mode states
      tableCount: 10,
      tableType: 'mesa',
      savedQRs: [],
      qrLibLoaded: false,
      logoUrl: '',

      // Product mode states
      products: [],
      itemQrs: [],
      scanHistory: [],
      qrSettings: {
        defaultRedirect: 'landing',
        webUrl: '',
        supportUrl: '',
        warrantyUrl: '',
        customUrl: '',
        showServiceHistoryToClient: true,
        faqContent: '',
        labelSize: 'mediana',
        printLogo: true,
        footerText: 'Escanear para garantía'
      },
      
      // Product generator form state
      genProductId: '',
      genQuantity: 1,
      genSerialNumber: 'AUTOGENERADO',
      genWarrantyMonths: 12,
      
      // Search filters
      filters: {
        searchQuery: '',
        status: 'ALL'
      }
    };

    this.listeners = [];
    this.maps = {};

    this.layout = new PageLayout({
      title: 'Generador de Códigos QR',
      subtitle: this.isRestaurantMode 
        ? 'Genera y guarda códigos QR permanentes para cada mesa. Los QR persisten en la base de datos.'
        : 'Genera códigos QR únicos para cada unidad de tu inventario, asocia números de serie, administra garantías y analiza escaneos.',
      actionHTML: this.isRestaurantMode 
        ? `
          <button class="btn btn-secondary btn-sm" id="btn-print-all">🖨️ Imprimir Todo</button>
          <button class="btn btn-success btn-sm" id="btn-save-qrs" style="background:#34d399;border:none;color:#000;font-weight:700;">💾 Guardar QR en DB</button>
          <button class="btn btn-primary btn-sm" id="btn-generate-qr">⚡ Generar QR</button>
        `
        : '',
      contentHTML: `<div id="qr-module-view-container"></div>`
    });
  }

  async mount() {
    const element = this.layout.mount();
    this.container = element.querySelector('#qr-module-view-container');

    await this.loadQRLibrary();
    this.loadBusinessLogo();

    if (this.isRestaurantMode) {
      this.mountRestaurantMode(element);
    } else {
      await this.loadProductModeData();
      this.mountProductMode();
    }

    return element;
  }

  loadBusinessLogo() {
    try {
      FirestoreService.listenToPathRaw(`${this.companyId}/informacion_local`, (info) => {
        this.state.logoUrl = (info && info.logo) ? info.logo : '';
      });
    } catch(e) { /* no logo available */ }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESTAURANT MODE (TABLES QR GENERATOR)
  // ═══════════════════════════════════════════════════════════════════════════

  mountRestaurantMode(element) {
    this.container.innerHTML = `
      <!-- Configuration Panel -->
      <div class="card p-5 mb-6">
        <h3 class="text-lg font-semibold mb-4">⚙️ Configuración de Mesas</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: var(--space-4); align-items: end;">
          <div class="form-group">
            <label class="form-label" for="qr-table-count">Número de mesas / asientos</label>
            <input type="number" id="qr-table-count" class="input input-md" value="10" min="1" max="200" />
          </div>
          <div class="form-group">
            <label class="form-label" for="qr-table-type">Tipo de ubicación</label>
            <select id="qr-table-type" class="input input-md" style="background-color:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:0 var(--space-3);color:var(--color-text-primary);">
              <option value="mesa">Mesa</option>
              <option value="asiento">Asiento / Silla</option>
              <option value="barra">Barra / Bar</option>
              <option value="cabina">Cabina</option>
              <option value="zona">Zona</option>
              <option value="habitacion">Habitación</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="qr-prefix">Prefijo del número</label>
            <input type="text" id="qr-prefix" class="input input-md" value="" placeholder="Ej. A, VIP, Sin prefijo..." />
          </div>
          <div class="form-group">
            <label class="form-label" for="qr-base-url" style="font-size:0.75rem;">URL base del menú</label>
            <input type="text" id="qr-base-url" class="input input-md" value="${this.baseMenuUrl}" style="font-size:0.72rem;" />
          </div>
        </div>
      </div>

      <!-- Saved QRs section -->
      <div id="qr-saved-section" class="card p-5 mb-6" style="display:none;">
        <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
          <div>
            <h3 class="text-lg font-semibold">📂 QR Guardados en Base de Datos</h3>
            <p class="text-xs text-secondary mt-1">Estos QR están almacenados permanentemente y son reutilizables.</p>
          </div>
          <div style="display:flex;align-items:center;gap:var(--space-3);">
            <span class="badge" id="saved-qr-count" style="font-size:0.78rem;padding:4px 12px;"></span>
            <button class="btn btn-sm" id="btn-delete-all-saved-qrs" style="background:rgba(248,113,113,0.15);color:#f87171;border:1px solid rgba(248,113,113,0.3);font-weight:700;font-size:0.78rem;padding:4px 12px;cursor:pointer;">
              🗑️ Eliminar Todos
            </button>
          </div>
        </div>
        <div id="saved-qr-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:var(--space-4);"></div>
      </div>

      <!-- Generated QR grid -->
      <div id="qr-grid-container" class="card p-5">
        <div class="text-center py-8 text-secondary" id="qr-empty-state">
          <span style="font-size: 3rem; display: block; margin-bottom: 12px;">📱</span>
          <p>Configura el número de mesas y presiona <strong>Generar QR</strong>.</p>
          <p class="text-xs mt-2" style="color:var(--color-text-tertiary);">Luego presiona <strong>Guardar QR en DB</strong> para hacerlos permanentes.</p>
        </div>
      </div>
    `;

    // Action buttons inside layout header
    document.querySelector('#btn-generate-qr')?.addEventListener('click', () => this.generateRestaurantQRCodes(element));
    document.querySelector('#btn-save-qrs')?.addEventListener('click',    () => this.saveRestaurantQRsToDB(element));
    document.querySelector('#btn-print-all')?.addEventListener('click',   () => this.printRestaurantAllQR(element));
    element.querySelector('#btn-delete-all-saved-qrs')?.addEventListener('click', () => this.deleteRestaurantAllSavedQRs());

    this.subscribeToSavedRestaurantQRs(element);
  }

  subscribeToSavedRestaurantQRs(element) {
    try {
      const listener = FirestoreService.listenToTenant('qr_codes', (qrs) => {
        this.state.savedQRs = qrs || [];
        this.renderSavedRestaurantQRs(element);
      });
      this.listeners.push(listener);
    } catch(e) {
      console.warn('[QRCodesView] Could not subscribe to qr_codes:', e.message);
    }
  }

  renderSavedRestaurantQRs(element) {
    const section = element.querySelector('#qr-saved-section');
    const grid    = element.querySelector('#saved-qr-grid');
    const count   = element.querySelector('#saved-qr-count');

    if (!section || !grid) return;

    if (this.state.savedQRs.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    if (count) count.textContent = `${this.state.savedQRs.length} guardados`;

    grid.innerHTML = this.state.savedQRs.map(qr => `
      <div class="card p-4 text-center hover-lift" style="display:flex;flex-direction:column;align-items:center;gap:var(--space-2);">
        <div id="saved-qr-canvas-${qr.id}" style="width:180px;height:180px;display:flex;align-items:center;justify-content:center;background:white;border-radius:var(--radius-sm);overflow:hidden;padding:4px;"></div>
        <h4 style="font-weight:700;font-size:0.9rem;margin:0;">${qr.label || qr.tableId}</h4>
        <p style="font-size:0.6rem;color:var(--color-text-tertiary);word-break:break-all;margin:0;max-width:200px;">${qr.url}</p>
        <div style="display:flex;gap:6px;width:100%;">
          <button class="btn btn-secondary btn-sm" style="flex:1;font-size:0.72rem;" onclick="navigator.clipboard.writeText('${qr.url}').then(()=>alert('URL copiada'))">📋 Copiar</button>
          <button class="btn btn-sm btn-delete-saved-qr" data-id="${qr.id}" style="flex:0.6;font-size:0.72rem;background:rgba(248,113,113,0.1);color:#f87171;border:1px solid rgba(248,113,113,0.2);">🗑</button>
        </div>
      </div>
    `).join('');

    setTimeout(() => {
      this.state.savedQRs.forEach(qr => {
        const container = element.querySelector(`#saved-qr-canvas-${qr.id}`);
        if (container) this.renderQRCodeWithLogo(container, qr.url);
      });
    }, 60);

    grid.querySelectorAll('.btn-delete-saved-qr').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('¿Eliminar este QR de la base de datos?')) return;
        await FirestoreService.delete('qr_codes', id);
        NotificationService.success('QR eliminado de la base de datos.');
      });
    });
  }

  generateRestaurantQRCodes(element) {
    const countInput   = element.querySelector('#qr-table-count');
    const typeInput    = element.querySelector('#qr-table-type');
    const prefixInput  = element.querySelector('#qr-prefix');
    const baseUrlInput = element.querySelector('#qr-base-url');
    const container    = element.querySelector('#qr-grid-container');
    if (!countInput || !container) return;

    const count     = Math.min(parseInt(countInput.value) || 10, 200);
    const tableType = (typeInput?.value || 'mesa').toLowerCase().trim();
    const prefix    = prefixInput?.value.trim() || '';
    const baseUrl   = (baseUrlInput?.value.trim() || this.baseMenuUrl).replace(/\/$/, '');

    const typeLabels = { mesa:'Mesa', asiento:'Asiento', barra:'Barra', cabina:'Cabina', zona:'Zona', habitacion:'Habitación' };
    const typeLabel  = typeLabels[tableType] || tableType;

    this._lastGenParams = { count, tableType, prefix, baseUrl, typeLabel };

    let html = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--space-4);" id="qr-cards-grid">`;
    for (let i = 1; i <= count; i++) {
      const tableId = `${tableType}-${prefix}${i}`;
      const label   = `${typeLabel} ${prefix}${i}`;
      const rawUrl  = `${baseUrl}/${tableId}`;
      const url     = encodeURI(rawUrl);
      html += `
        <div class="card p-4 text-center hover-lift" data-table-id="${tableId}" data-url="${url}" data-label="${label}"
             style="display:flex;flex-direction:column;align-items:center;gap:var(--space-2);">
          <div id="qr-canvas-${i}" style="width:180px;height:180px;display:flex;align-items:center;justify-content:center;background:white;border-radius:var(--radius-sm);overflow:hidden;padding:4px;"></div>
          <h4 style="font-weight:700;font-size:1rem;margin:0;">${label}</h4>
          <p style="font-size:0.6rem;color:var(--color-text-tertiary);word-break:break-all;margin:0;max-width:200px;">${url}</p>
          <button class="btn btn-secondary btn-sm" style="width:100%;font-size:0.75rem;" onclick="navigator.clipboard.writeText('${url}').then(()=>alert('URL copiada: ${label}'))">📋 Copiar URL</button>
        </div>`;
    }
    html += `</div>`;

    container.innerHTML = html;

    setTimeout(() => {
      for (let i = 1; i <= count; i++) {
        const c = container.querySelector(`#qr-canvas-${i}`);
        const card = c.closest('.card');
        const url = card.getAttribute('data-url');
        if (c && url) this.renderQRCodeWithLogo(c, url);
      }
    }, 60);
  }

  async saveRestaurantQRsToDB(element) {
    const grid = element.querySelector('#qr-cards-grid');
    if (!grid || grid.children.length === 0) {
      NotificationService.warn('Primero genera los códigos QR antes de guardarlos.');
      return;
    }

    const btn = element.querySelector('#btn-save-qrs');
    if (btn) { btn.disabled = true; btn.textContent = '💾 Guardando...'; }

    const cards = grid.querySelectorAll('.card');
    let saved = 0;
    for (let card of cards) {
      const tableId = card.getAttribute('data-table-id');
      const url     = card.getAttribute('data-url');
      const label   = card.getAttribute('data-label');

      try {
        await FirestoreService.create('qr_codes', {
          tableId,
          url,
          label,
          createdAt: Date.now()
        });
        saved++;
      } catch(e) {
        console.warn('[QRCodesView] Could not save QR:', tableId, e.message);
      }
    }

    if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar QR en DB'; }
    NotificationService.success(`${saved} códigos QR guardados permanentemente en la base de datos.`);
  }

  async deleteRestaurantAllSavedQRs() {
    const total = this.state.savedQRs.length;
    if (total === 0) {
      NotificationService.warn('No hay códigos QR guardados para eliminar.');
      return;
    }
    if (!confirm(`⚠️ ¿Estás seguro de que deseas eliminar TODOS los ${total} códigos QR?\n\nEsta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await FirestoreService.deleteAll('qr_codes');
      NotificationService.success(`Se han eliminado todos los códigos QR (${total}) de la base de datos.`);
    } catch (e) {
      console.error(e);
    }
  }

  printRestaurantAllQR(element) {
    const grid = element.querySelector('#qr-cards-grid');
    if (!grid || grid.children.length === 0) {
      NotificationService.warn('Primero genera los códigos QR antes de imprimir.');
      return;
    }
    const printArea = document.createElement('div');
    printArea.id = 'print-qr-area';
    printArea.innerHTML = `
      <style>@media print { body * { visibility: hidden; } #print-qr-area, #print-qr-area * { visibility: visible; } #print-qr-area { position:fixed;top:0;left:0;width:100%; } }</style>
    ` + grid.outerHTML;
    document.body.appendChild(printArea);
    window.print();
    setTimeout(() => { if (document.body.contains(printArea)) document.body.removeChild(printArea); }, 1500);
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PRODUCT MODE (ADVANCED CODES INVENTORY SUITE)
  // ═══════════════════════════════════════════════════════════════════════════

  async loadProductModeData() {
    if (!db || !this.companyId) return;

    try {
      // 1. Fetch products catalog
      const prodSnap = await get(ref(db, `${this.companyId}/productos`));
      this.state.products = prodSnap.exists() ? Object.keys(prodSnap.val()).map(k => ({ id: k, ...prodSnap.val()[k] })) : [];

      // 2. Fetch QR Settings
      const settingsSnap = await get(ref(db, `${this.companyId}/qr_settings`));
      if (settingsSnap.exists()) {
        this.state.qrSettings = { ...this.state.qrSettings, ...settingsSnap.val() };
      }

      // 3. Setup realtime listener for product items QR codes
      const itemsRef = ref(db, `${this.companyId}/item_qrs`);
      onValue(itemsRef, (snap) => {
        this.state.itemQrs = snap.exists() ? Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k] })) : [];
        if (this.state.activeTab === 'inventory') this.renderProductInventoryTab();
        if (this.state.activeTab === 'stats') this.renderProductStatsTab();
      });

      // 4. Setup realtime listener for scan history
      const historyRef = ref(db, `${this.companyId}/scan_history`);
      onValue(historyRef, (snap) => {
        this.state.scanHistory = snap.exists() ? Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k] })) : [];
        if (this.state.activeTab === 'stats') this.renderProductStatsTab();
      });

    } catch (e) {
      console.error(e);
    }
  }

  mountProductMode() {
    this.container.innerHTML = `
      <style>
        .qr-tabs {
          display: flex;
          gap: 10px;
          border-bottom: 1px solid var(--color-border);
          margin-bottom: var(--space-5);
        }
        .qr-tab-btn {
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--color-text-secondary);
          padding: 10px 16px;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .qr-tab-btn:hover { color: var(--color-text-primary); }
        .qr-tab-btn.active { color: var(--color-accent); border-bottom-color: var(--color-accent); }
      </style>

      <div class="qr-tabs">
        <button class="qr-tab-btn ${this.state.activeTab === 'generator' ? 'active' : ''}" data-tab="generator">⚡ Generar Códigos</button>
        <button class="qr-tab-btn ${this.state.activeTab === 'inventory' ? 'active' : ''}" data-tab="inventory">📂 Inventario de Códigos</button>
        <button class="qr-tab-btn ${this.state.activeTab === 'settings' ? 'active' : ''}" data-tab="settings">⚙️ Ajustes del QR</button>
        <button class="qr-tab-btn ${this.state.activeTab === 'stats' ? 'active' : ''}" data-tab="stats">📊 Estadísticas</button>
      </div>

      <div id="product-qr-tab-content" class="animate-fade-in"></div>
    `;

    this.tabContentEl = this.container.querySelector('#product-qr-tab-content');

    // Tab switcher
    this.container.querySelectorAll('.qr-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('.qr-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.activeTab = btn.getAttribute('data-tab');
        this.renderProductActiveTab();
      });
    });

    this.renderProductActiveTab();
  }

  renderProductActiveTab() {
    if (this.state.activeTab === 'generator') {
      this.renderProductGeneratorTab();
    } else if (this.state.activeTab === 'inventory') {
      this.renderProductInventoryTab();
    } else if (this.state.activeTab === 'settings') {
      this.renderProductSettingsTab();
    } else if (this.state.activeTab === 'stats') {
      this.renderProductStatsTab();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Tab 1:⚡ GENERATE PRODUCT CODES
  // ═══════════════════════════════════════════════════════════════════════════

  renderProductGeneratorTab() {
    const prodOpts = this.state.products.map(p => `
      <option value="${p.id}" ${this.state.genProductId === p.id ? 'selected' : ''}>
        ${p.name} (SKU: ${p.sku || '—'}) — Stock: ${p.stock || 0}
      </option>
    `).join('');

    this.tabContentEl.innerHTML = `
      <div class="card p-6" style="max-width: 650px; margin: 0 auto;">
        <h3 class="text-md font-bold mb-4" style="color:var(--color-accent); border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px;">⚡ Generar Códigos QR para Productos</h3>
        
        <form id="prod-qr-generator-form" style="display:flex; flex-direction:column; gap:12px;">
          
          <div class="form-group">
            <label class="form-label" for="gen-product-select">Selecciona el Producto <span class="form-label-required"></span></label>
            <select id="gen-product-select" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);" required>
              <option value="" disabled ${!this.state.genProductId ? 'selected' : ''}>Escoge un producto del inventario...</option>
              ${prodOpts}
            </select>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div class="form-group">
              <label class="form-label" for="gen-serial-input">Número de Serie <span class="form-label-required"></span></label>
              <input type="text" id="gen-serial-input" class="input input-md" value="${this.state.genSerialNumber}" placeholder="Ej. AUTOGENERADO, SN-123456..." required />
              <span style="font-size:0.65rem; color:var(--color-text-secondary); margin-top:2px; display:block;">Escribe "AUTOGENERADO" para asignar una clave única al lote.</span>
            </div>
            
            <div class="form-group">
              <label class="form-label" for="gen-warranty-select">Vigencia de la Garantía <span class="form-label-required"></span></label>
              <select id="gen-warranty-select" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);" required>
                <option value="0">Sin garantía</option>
                <option value="1">1 Mes</option>
                <option value="3">3 Meses</option>
                <option value="6">6 Meses</option>
                <option value="12" selected>12 Meses (1 año)</option>
                <option value="24">24 Meses (2 años)</option>
                <option value="36">36 Meses (3 años)</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="gen-qty-input">Cantidad de Códigos a Generar (Unidades de Inventario) <span class="form-label-required"></span></label>
            <input type="number" id="gen-qty-input" class="input input-md" min="1" max="100" value="${this.state.genQuantity}" required />
            <span style="font-size:0.65rem; color:var(--color-text-secondary); margin-top:2px; display:block;">Esta acción incrementará automáticamente el stock de este producto en el catálogo.</span>
          </div>

          <div style="display:flex; justify-content:flex-end; margin-top:10px; border-top:1px solid rgba(255,255,255,0.05); padding-top:12px;">
            <button type="submit" class="btn btn-primary" id="btn-submit-prod-qr-gen">⚡ Generar y Agregar al Inventario</button>
          </div>
        </form>
      </div>
    `;

    // Dropdown change mapping helper
    const selectEl = this.tabContentEl.querySelector('#gen-product-select');
    selectEl?.addEventListener('change', (e) => {
      this.state.genProductId = e.target.value;
    });

    const form = this.tabContentEl.querySelector('#prod-qr-generator-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const productId = form.querySelector('#gen-product-select').value;
      const serialNum = form.querySelector('#gen-serial-input').value.trim();
      const warrantyM = parseInt(form.querySelector('#gen-warranty-select').value);
      const qty = Math.min(Math.max(parseInt(form.querySelector('#gen-qty-input').value) || 1, 1), 100);

      const product = this.state.products.find(p => p.id === productId);
      if (!product) {
        NotificationService.error('Debes elegir un producto válido.');
        return;
      }

      const submitBtn = form.querySelector('#btn-submit-prod-qr-gen');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Generando códigos...';

      try {
        const batchKeys = [];
        // Loop to generate product item qr codes
        for (let i = 0; i < qty; i++) {
          const itemId = `ITEM-${this.companyId.substring(0, 4).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
          const isAutoSerial = serialNum.toUpperCase() === 'AUTOGENERADO';
          const calculatedSerial = isAutoSerial 
            ? `SN-${Math.random().toString(36).substring(2, 8).toUpperCase()}` 
            : `${serialNum}${qty > 1 ? `-${i + 1}` : ''}`;

          let warrantyExpiresAt = '';
          if (warrantyM > 0) {
            const expDate = new Date();
            expDate.setMonth(expDate.getMonth() + warrantyM);
            warrantyExpiresAt = expDate.toISOString().split('T')[0];
          }

          const qrUrl = `${window.location.origin}/#/customer/item-info/${this.companyId}/${itemId}`;

          const itemData = {
            id: itemId,
            productId: product.id,
            productName: product.name,
            sku: product.sku || '',
            brand: product.brand || '',
            model: product.model || '',
            serialNumber: calculatedSerial,
            createdAt: Date.now(),
            status: 'Disponible',
            clientName: '',
            warrantyStatus: warrantyM > 0 ? 'Activa' : 'Sin Garantía',
            warrantyExpiresAt: warrantyExpiresAt,
            url: qrUrl,
            scanCount: 0,
            lastScannedAt: 0,
            service_history: {}
          };

          await set(ref(db, `${this.companyId}/item_qrs/${itemId}`), itemData);
          batchKeys.push(itemId);
        }

        // Increment inventory stock
        const newStock = Number(product.stock || 0) + qty;
        await update(ref(db, `${this.companyId}/productos/${product.id}`), {
          stock: newStock,
          updatedAt: Date.now()
        });

        // Audit Trail log
        await FirestoreService.logAudit({
          action: 'PRODUCT_QR_GENERATED',
          companyId: this.companyId,
          description: `Se generaron ${qty} códigos QR únicos para el producto "${product.name}" (IDs del lote: [${batchKeys.join(', ')}]). Stock del inventario actualizado a ${newStock}.`
        });

        NotificationService.success(`Códigos QR generados con éxito. Stock incrementado en ${qty} uds.`);
        
        // Reset generator fields
        this.state.genQuantity = 1;
        this.state.genSerialNumber = 'AUTOGENERADO';
        this.state.activeTab = 'inventory';
        this.loadProductModeData().then(() => this.mountProductMode());

      } catch (err) {
        console.error(err);
        alert('Error al generar los códigos QR: ' + err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = '⚡ Generar y Agregar al Inventario';
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Tab 2:📂 QR INVENTORY LIST
  // ═══════════════════════════════════════════════════════════════════════════

  renderProductInventoryTab() {
    const f = this.state.filters;
    const query = f.searchQuery.toLowerCase();

    // Filtering items
    const filteredItems = this.state.itemQrs.filter(item => {
      const matchSearch = 
        item.productName.toLowerCase().includes(query) ||
        (item.sku && item.sku.toLowerCase().includes(query)) ||
        (item.serialNumber && item.serialNumber.toLowerCase().includes(query)) ||
        (item.id && item.id.toLowerCase().includes(query));
      
      const matchStatus = f.status === 'ALL' || item.status === f.status;
      return matchSearch && matchStatus;
    });

    const rowsHTML = filteredItems.map(item => {
      const stateBadge = {
        Disponible: `<span class="badge" style="background:rgba(16,185,129,0.1); color:#34d399;">Disponible</span>`,
        'En exhibición': `<span class="badge" style="background:rgba(59,130,246,0.1); color:#60a5fa;">En Exhibición</span>`,
        'En reparación': `<span class="badge" style="background:rgba(245,158,11,0.1); color:#fbbf24;">En Reparación</span>`,
        Devuelto: `<span class="badge" style="background:rgba(156,163,175,0.1); color:#9ca3af;">Devuelto</span>`,
        Vendido: `<span class="badge" style="background:rgba(139,92,246,0.1); color:#a78bfa;">Vendido</span>`
      }[item.status] || `<span class="badge">${item.status}</span>`;

      const warrantyStr = item.warrantyExpiresAt 
        ? `${TimeService.formatDate(new Date(item.warrantyExpiresAt).getTime())}`
        : 'Sin Garantía';

      return `
        <tr style="border-bottom:1px solid var(--color-border); font-size:0.78rem;">
          <td style="padding:10px 14px; font-weight:600; color:var(--color-text-primary);">${item.productName}</td>
          <td style="padding:10px 14px; font-family:monospace; color:var(--color-accent);">${item.serialNumber || '—'}</td>
          <td style="padding:10px 14px;">${stateBadge}</td>
          <td style="padding:10px 14px; color:var(--color-text-secondary);">${warrantyStr}</td>
          <td style="padding:10px 14px; font-family:monospace; font-weight:700; text-align:center;">${item.scanCount || 0}</td>
          <td style="padding:10px 14px; text-align:right; display:flex; gap:6px; justify-content:flex-end;">
            <button class="btn btn-secondary btn-xs btn-view-tag-qr" data-id="${item.id}" title="Previsualizar e Imprimir Etiqueta">🏷️ Imprimir</button>
            <button class="btn btn-secondary btn-xs btn-edit-item-qr" data-id="${item.id}" title="Editar Ficha del Artículo">✏️</button>
            <button class="btn btn-danger btn-xs btn-delete-item-qr" data-id="${item.id}" title="Eliminar y descontar stock">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');

    this.tabContentEl.innerHTML = `
      <div class="card p-5">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
          <h3 class="text-md font-bold" style="margin:0;">📂 Inventario de Códigos Generados</h3>
          <div style="display:flex; gap:8px;">
            <input type="text" id="inv-search-input" class="input input-md" placeholder="Buscar por producto, serie o ID..." value="${f.searchQuery}" style="width:230px;" />
            <select id="inv-status-select" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);">
              <option value="ALL" ${f.status === 'ALL' ? 'selected' : ''}>Todos los Estados</option>
              <option value="Disponible" ${f.status === 'Disponible' ? 'selected' : ''}>Disponible</option>
              <option value="En exhibición" ${f.status === 'En exhibición' ? 'selected' : ''}>En Exhibición</option>
              <option value="En reparación" ${f.status === 'En reparación' ? 'selected' : ''}>En Reparación</option>
              <option value="Vendido" ${f.status === 'Vendido' ? 'selected' : ''}>Vendido</option>
              <option value="Devuelto" ${f.status === 'Devuelto' ? 'selected' : ''}>Devuelto</option>
            </select>
          </div>
        </div>

        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; text-align:left;">
            <thead>
              <tr style="border-bottom:2px solid var(--color-border); color:var(--color-text-secondary); font-size:0.75rem;">
                <th style="padding:8px 14px;">Producto</th>
                <th style="padding:8px 14px;">Nº de Serie</th>
                <th style="padding:8px 14px;">Estado</th>
                <th style="padding:8px 14px;">Expiración Garantía</th>
                <th style="padding:8px 14px; text-align:center;">Escaneos</th>
                <th style="padding:8px 14px; text-align:right;">Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHTML || '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--color-text-secondary);">No se encontraron códigos generados en el inventario.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Filter bindings
    this.tabContentEl.querySelector('#inv-search-input')?.addEventListener('input', (e) => {
      this.state.filters.searchQuery = e.target.value;
      this.renderProductInventoryTab();
    });

    this.tabContentEl.querySelector('#inv-status-select')?.addEventListener('change', (e) => {
      this.state.filters.status = e.target.value;
      this.renderProductInventoryTab();
    });

    // Row Actions triggers
    this.tabContentEl.querySelectorAll('.btn-view-tag-qr').forEach(btn => {
      btn.addEventListener('click', () => {
        this.openPrintLabelModal(btn.getAttribute('data-id'));
      });
    });

    this.tabContentEl.querySelectorAll('.btn-edit-item-qr').forEach(btn => {
      btn.addEventListener('click', () => {
        this.openEditItemModal(btn.getAttribute('data-id'));
      });
    });

    this.tabContentEl.querySelectorAll('.btn-delete-item-qr').forEach(btn => {
      btn.addEventListener('click', () => {
        this.deleteProductItem(btn.getAttribute('data-id'));
      });
    });
  }

  async deleteProductItem(itemId) {
    const item = this.state.itemQrs.find(i => i.id === itemId);
    if (!item) return;

    if (!confirm(`¿Eliminar este código QR del inventario (Serie: ${item.serialNumber})?\nNota: El stock del producto se restará por 1.`)) {
      return;
    }

    try {
      // A. Delete document from item_qrs
      await remove(ref(db, `${this.companyId}/item_qrs/${itemId}`));

      // B. Decrement stock
      const product = this.state.products.find(p => p.id === item.productId);
      if (product) {
        const newStock = Math.max(0, Number(product.stock || 0) - 1);
        await update(ref(db, `${this.companyId}/productos/${product.id}`), {
          stock: newStock
        });
      }

      NotificationService.success('Código QR eliminado e inventario actualizado.');
      this.loadProductModeData();

    } catch (e) {
      console.error(e);
      alert('Error al eliminar: ' + e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Tab 3:⚙️ PRODUCT SCAN REDIRECTS AND CUSTOMIZATION SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════

  renderProductSettingsTab() {
    const s = this.state.qrSettings;

    this.tabContentEl.innerHTML = `
      <div class="card p-6 animate-fade-in" style="max-width:700px; margin:0 auto;">
        <h3 class="text-md font-bold mb-4" style="color:var(--color-accent); border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px;">⚙️ Ajustes del Código QR y Redireccionamiento</h3>
        
        <form id="qr-product-settings-form" style="display:flex; flex-direction:column; gap:12px;">
          
          <div class="form-group">
            <label class="form-label" for="sett-redirect">Destino de Escaneo (No Vendidos) <span class="form-label-required"></span></label>
            <select id="sett-redirect" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);" required>
              <option value="landing" ${s.defaultRedirect === 'landing' ? 'selected' : ''}>Ficha de Producto (Detalles y Soporte - Recomendado)</option>
              <option value="web" ${s.defaultRedirect === 'web' ? 'selected' : ''}>Sitio Web de la Empresa</option>
              <option value="catalog" ${s.defaultRedirect === 'catalog' ? 'selected' : ''}>Catálogo QR Digital</option>
              <option value="support" ${s.defaultRedirect === 'support' ? 'selected' : ''}>Página de Soporte Técnico</option>
              <option value="warranty" ${s.defaultRedirect === 'warranty' ? 'selected' : ''}>Página de Registro de Garantía</option>
              <option value="whatsapp" ${s.defaultRedirect === 'whatsapp' ? 'selected' : ''}>Mensaje directo de WhatsApp</option>
              <option value="custom" ${s.defaultRedirect === 'custom' ? 'selected' : ''}>URL Personalizada</option>
            </select>
            <span style="font-size:0.65rem; color:var(--color-text-secondary); margin-top:2px; display:block;">El destino predeterminado cuando un cliente escanea un artículo en la tienda o exhibición.</span>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div class="form-group">
              <label class="form-label" for="sett-web-url">URL de Sitio Web</label>
              <input type="url" id="sett-web-url" class="input input-md" value="${s.webUrl || ''}" placeholder="https://miweb.com" />
            </div>
            <div class="form-group">
              <label class="form-label" for="sett-support-url">URL de Soporte</label>
              <input type="url" id="sett-support-url" class="input input-md" value="${s.supportUrl || ''}" placeholder="https://soporte.com" />
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div class="form-group">
              <label class="form-label" for="sett-warranty-url">URL de Garantías</label>
              <input type="url" id="sett-warranty-url" class="input input-md" value="${s.warrantyUrl || ''}" placeholder="https://garantias.com" />
            </div>
            <div class="form-group">
              <label class="form-label" for="sett-custom-url">URL Personalizada / Link Externo</label>
              <input type="url" id="sett-custom-url" class="input input-md" value="${s.customUrl || ''}" placeholder="https://mi-enlace.com" />
            </div>
          </div>

          <div class="form-section-title">👤 Configuración de Postventa (Productos Vendidos)</div>
          <div style="display:flex; align-items:center; gap:8px; font-size:0.8rem; margin:6px 0;">
            <input type="checkbox" id="sett-history-toggle" ${s.showServiceHistoryToClient ? 'checked' : ''} style="width:16px; height:16px; accent-color:var(--color-accent);" />
            <label for="sett-history-toggle" class="form-label" style="margin:0; cursor:pointer;">Mostrar historial de mantenimientos/servicios al cliente final.</label>
          </div>

          <div class="form-group">
            <label class="form-label" for="sett-faq">Preguntas Frecuentes / Enlaces a Manuales (FAQ)</label>
            <textarea id="sett-faq" class="input" style="height:70px; padding:10px;" placeholder="Ej. Manual de Uso: www.manuales.com/LG&#10;FAQ: ¿Cómo limpiar el filtro?...">${s.faqContent || ''}</textarea>
          </div>

          <div class="form-section-title">🏷️ Estructura e Impresión de Etiquetas</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div class="form-group">
              <label class="form-label" for="sett-size">Tamaño Físico de Etiqueta</label>
              <select id="sett-size" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);">
                <option value="pequeña" ${s.labelSize === 'pequeña' ? 'selected' : ''}>Pequeña (30mm x 30mm)</option>
                <option value="mediana" ${s.labelSize === 'mediana' ? 'selected' : ''}>Mediana (50mm x 50mm)</option>
                <option value="grande" ${s.labelSize === 'grande' ? 'selected' : ''}>Grande (80mm x 80mm)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="sett-footer">Texto de pie de página de la etiqueta</label>
              <input type="text" id="sett-footer" class="input input-md" value="${s.footerText || ''}" placeholder="Ej. Escanear para Garantía" />
            </div>
          </div>

          <div style="display:flex; align-items:center; gap:8px; font-size:0.8rem; margin:6px 0;">
            <input type="checkbox" id="sett-logo-toggle" ${s.printLogo !== false ? 'checked' : ''} style="width:16px; height:16px; accent-color:var(--color-accent);" />
            <label for="sett-logo-toggle" class="form-label" style="margin:0; cursor:pointer;">Imprimir logotipo del negocio centrado en el código QR.</label>
          </div>

          <div style="display:flex; justify-content:flex-end; margin-top:12px; border-top:1px solid rgba(255,255,255,0.05); padding-top:12px;">
            <button type="submit" class="btn btn-primary" id="btn-save-qr-settings">💾 Guardar Ajustes</button>
          </div>
        </form>
      </div>
    `;

    const form = this.tabContentEl.querySelector('#qr-product-settings-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const saveBtn = form.querySelector('#btn-save-qr-settings');
      saveBtn.disabled = true;

      try {
        const payload = {
          defaultRedirect: form.querySelector('#sett-redirect').value,
          webUrl: form.querySelector('#sett-web-url').value.trim(),
          supportUrl: form.querySelector('#sett-support-url').value.trim(),
          warrantyUrl: form.querySelector('#sett-warranty-url').value.trim(),
          customUrl: form.querySelector('#sett-custom-url').value.trim(),
          showServiceHistoryToClient: form.querySelector('#sett-history-toggle').checked,
          faqContent: form.querySelector('#sett-faq').value.trim(),
          labelSize: form.querySelector('#sett-size').value,
          printLogo: form.querySelector('#sett-logo-toggle').checked,
          footerText: form.querySelector('#sett-footer').value.trim(),
          updatedAt: Date.now()
        };

        await set(ref(db, `${this.companyId}/qr_settings`), payload);
        this.state.qrSettings = payload;

        NotificationService.success('Ajustes de códigos QR actualizados.');
      } catch (err) {
        console.error(err);
        alert('Error al guardar ajustes: ' + err.message);
      } finally {
        saveBtn.disabled = false;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Tab 4:📊 CODES SCANS ANALYTICS PANEL
  // ═══════════════════════════════════════════════════════════════════════════

  renderProductStatsTab() {
    const totalGen = this.state.itemQrs.length;
    const totalActive = this.state.itemQrs.filter(i => i.status === 'Disponible' || i.status === 'En exhibición').length;
    const totalSold = this.state.itemQrs.filter(i => i.status === 'Vendido').length;
    const totalScans = this.state.itemQrs.reduce((acc, curr) => acc + (curr.scanCount || 0), 0);

    // Filter top scanned products
    const sortedScans = [...this.state.itemQrs]
      .filter(i => (i.scanCount || 0) > 0)
      .sort((a, b) => b.scanCount - a.scanCount)
      .slice(0, 5);

    const topScansRows = sortedScans.map(item => `
      <tr style="border-bottom:1px solid rgba(255,255,255,0.03); font-size:0.75rem;">
        <td style="padding:8px 4px;"><strong>${item.productName}</strong></td>
        <td style="padding:8px 4px; font-family:monospace;">${item.serialNumber || '—'}</td>
        <td style="padding:8px 4px;"><span class="badge" style="background:rgba(59,130,246,0.1); color:#60a5fa;">${item.status}</span></td>
        <td style="padding:8px 4px; font-weight:700; text-align:center; color:#34d399;">${item.scanCount}</td>
        <td style="padding:8px 4px; color:var(--color-text-secondary); text-align:right;">
          ${item.lastScannedAt ? TimeService.formatDate(item.lastScannedAt, true) : '—'}
        </td>
      </tr>
    `).join('');

    // Timeline logs from scan_history
    const historyLogs = [...this.state.scanHistory]
      .sort((a, b) => b.scannedAt - a.scannedAt)
      .slice(0, 10)
      .map(log => `
        <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:6px; font-size:0.75rem;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong>${log.productName} (S/N: ${log.serialNumber})</strong>
            <span class="text-secondary" style="font-size:0.68rem;">${TimeService.formatDate(log.scannedAt, true)}</span>
          </div>
          <div style="color:var(--color-text-secondary); font-size:0.7rem; margin-top:2px;">
            📱 Dispositivo: ${log.device.substring(0, 75)}... | Ubicación: ${log.location}
          </div>
        </div>
      `).join('');

    this.tabContentEl.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:20px;">
        
        <!-- Metrics Row -->
        <div class="grid-stats" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">
          <div class="card p-4 text-center">
            <span class="text-xs text-secondary font-semibold">Total Códigos QR</span>
            <h3 class="text-xl font-bold mt-1" style="color:var(--color-accent);">${totalGen}</h3>
          </div>
          <div class="card p-4 text-center">
            <span class="text-xs text-secondary font-semibold">Códigos QR Activos</span>
            <h3 class="text-xl font-bold mt-1" style="color:#60a5fa;">${totalActive}</h3>
          </div>
          <div class="card p-4 text-center">
            <span class="text-xs text-secondary font-semibold">Productos Vendidos con QR</span>
            <h3 class="text-xl font-bold mt-1" style="color:#a78bfa;">${totalSold}</h3>
          </div>
          <div class="card p-4 text-center" style="border-left:3px solid #34d399;">
            <span class="text-xs text-secondary font-semibold">Total Escaneos Recibidos</span>
            <h3 class="text-xl font-bold mt-1" style="color:#34d399;">${totalScans}</h3>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 3fr 2fr; gap:20px; align-items:flex-start;">
          
          <!-- Top Scans Table -->
          <div class="card p-5">
            <h3 class="text-sm font-bold uppercase tracking-wider mb-4" style="color:var(--color-accent);">🔥 Productos Más Consultados (QR)</h3>
            <div style="overflow-x:auto;">
              <table style="width:100%; border-collapse:collapse; text-align:left;">
                <thead>
                  <tr style="border-bottom:1px solid rgba(255,255,255,0.05); color:var(--color-text-secondary); font-size:0.7rem; font-weight:700;">
                    <th style="padding:6px 4px;">Producto</th>
                    <th style="padding:6px 4px;">Serie</th>
                    <th style="padding:6px 4px;">Estado</th>
                    <th style="padding:6px 4px; text-align:center;">Escaneos</th>
                    <th style="padding:6px 4px; text-align:right;">Última Lectura</th>
                  </tr>
                </thead>
                <tbody>
                  ${topScansRows || '<tr><td colspan="5" style="text-align:center; padding:15px; color:var(--color-text-secondary); font-size:0.75rem;">Ningún escaneo registrado todavía.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Live Timelines scans -->
          <div class="card p-5" style="display:flex; flex-direction:column; gap:10px; max-height:450px; overflow-y:auto;">
            <h3 class="text-xs font-bold uppercase tracking-wider mb-2" style="color:var(--color-accent);">🔔 Registro de Lecturas en Tiempo Real</h3>
            ${historyLogs || '<div class="text-center py-10 text-secondary" style="font-size:0.75rem;">Escanea un código QR para iniciar el feed.</div>'}
          </div>

        </div>

      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODALS EDITORS AND VISUAL PRINT PREVIEWS
  // ═══════════════════════════════════════════════════════════════════════════

  openEditItemModal(itemId) {
    const item = this.state.itemQrs.find(i => i.id === itemId);
    if (!item) return;

    let modalOverlay = document.getElementById('edit-product-item-modal-container');
    if (modalOverlay) modalOverlay.remove();

    const formHTML = `
      <form id="edit-product-item-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary); font-size:0.85rem;">
        <div class="form-group">
          <label class="form-label" style="font-weight:700;">Producto</label>
          <div style="background:rgba(255,255,255,0.02); padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.05);">
            <strong>${item.productName}</strong> ${item.brand ? `(${item.brand})` : ''}
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group">
            <label class="form-label" for="edit-item-serial">Número de Serie</label>
            <input type="text" id="edit-item-serial" class="input input-md" value="${item.serialNumber || ''}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="edit-item-status">Estado del Artículo</label>
            <select id="edit-item-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);">
              <option value="Disponible" ${item.status === 'Disponible' ? 'selected' : ''}>Disponible</option>
              <option value="En exhibición" ${item.status === 'En exhibición' ? 'selected' : ''}>En Exhibición</option>
              <option value="En reparación" ${item.status === 'En reparación' ? 'selected' : ''}>En Reparación</option>
              <option value="Vendido" ${item.status === 'Vendido' ? 'selected' : ''}>Vendido</option>
              <option value="Devuelto" ${item.status === 'Devuelto' ? 'selected' : ''}>Devuelto</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="edit-item-client">Comprador (Cliente - Opcional)</label>
          <input type="text" id="edit-item-client" class="input input-md" value="${item.clientName || ''}" placeholder="Ej. Carlos Martínez" />
        </div>

        <div class="form-group">
          <label class="form-label" for="edit-item-warranty">Fecha Límite de Garantía</label>
          <input type="date" id="edit-item-warranty" class="input input-md" value="${item.warrantyExpiresAt || ''}" />
        </div>

        <div class="form-section-title">🔧 Historial de Servicios Mantenimiento</div>
        <div id="modal-service-history-list" style="display:flex; flex-direction:column; gap:6px; max-height:120px; overflow-y:auto; margin-bottom:8px;">
          <!-- Loaded dynamically -->
        </div>

        <div style="background:rgba(255,255,255,0.01); border:1px solid rgba(255,255,255,0.05); padding:8px; border-radius:6px; display:flex; flex-direction:column; gap:6px;">
          <strong>Agregar Entrada de Servicio:</strong>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
            <input type="text" id="new-service-type" class="input input-xs" placeholder="Ej. Mantenimiento, Reparación" />
            <input type="text" id="new-service-desc" class="input input-xs" placeholder="Detalle técnico..." />
          </div>
          <button type="button" class="btn btn-secondary btn-xs align-self-end" id="btn-add-service-entry">Añadir Entrada</button>
        </div>
      </form>
    `;

    const editModal = new Modal({
      title: '✏️ Editar Ficha del Artículo',
      bodyHTML: formHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-close-edit-modal">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="btn-save-edit-modal">Guardar Ficha</button>
      `,
      size: 'md'
    });

    const el = editModal.mount();
    el.setAttribute('id', 'edit-product-item-modal-container');
    document.body.appendChild(el);

    const refreshHistoryList = () => {
      const historyList = el.querySelector('#modal-service-history-list');
      if (!historyList) return;

      const history = item.service_history ? Object.values(item.service_history) : [];
      if (history.length === 0) {
        historyList.innerHTML = `<span style="font-size:0.72rem; color:var(--color-text-secondary); text-align:center; display:block;">Sin historial de servicios registrado.</span>`;
        return;
      }

      historyList.innerHTML = history.sort((a,b) => b.date - a.date).map(h => `
        <div style="display:flex; justify-content:space-between; font-size:0.72rem; background:rgba(0,0,0,0.15); padding:4px 8px; border-radius:4px;">
          <span><strong>${TimeService.formatDate(h.date)}</strong> [${h.type}]: ${h.description}</span>
          <button type="button" class="btn-delete-service" data-sid="${h.id}" style="background:transparent; border:none; color:#f87171; cursor:pointer;">🗑️</button>
        </div>
      `).join('');

      historyList.querySelectorAll('.btn-delete-service').forEach(btn => {
        btn.addEventListener('click', async () => {
          const sid = btn.getAttribute('data-sid');
          delete item.service_history[sid];
          refreshHistoryList();
        });
      });
    };

    refreshHistoryList();

    // Add service history entry trigger
    el.querySelector('#btn-add-service-entry')?.addEventListener('click', () => {
      const type = el.querySelector('#new-service-type').value.trim();
      const desc = el.querySelector('#new-service-desc').value.trim();

      if (!type || !desc) {
        alert('Por favor rellena el tipo y detalle.');
        return;
      }

      const sid = `SRV-${Math.random().toString(36).substring(2,8).toUpperCase()}`;
      item.service_history = item.service_history || {};
      item.service_history[sid] = {
        id: sid,
        date: Date.now(),
        type,
        description: desc
      };

      el.querySelector('#new-service-type').value = '';
      el.querySelector('#new-service-desc').value = '';
      refreshHistoryList();
    });

    el.querySelector('#btn-close-edit-modal')?.addEventListener('click', () => editModal.close());
    
    el.querySelector('#btn-save-edit-modal')?.addEventListener('click', async () => {
      const saveBtn = el.querySelector('#btn-save-edit-modal');
      saveBtn.disabled = true;

      try {
        const payload = {
          serialNumber: el.querySelector('#edit-item-serial').value.trim(),
          status: el.querySelector('#edit-item-status').value,
          clientName: el.querySelector('#edit-item-client').value.trim(),
          warrantyExpiresAt: el.querySelector('#edit-item-warranty').value,
          warrantyStatus: el.querySelector('#edit-item-warranty').value ? 'Activa' : 'Sin Garantía',
          service_history: item.service_history || {}
        };

        await update(ref(db, `${this.companyId}/item_qrs/${item.id}`), payload);

        // Audit Trail log
        await FirestoreService.logAudit({
          action: 'PRODUCT_QR_ITEM_UPDATED',
          companyId: this.companyId,
          description: `Se actualizó la ficha técnica del artículo "${item.productName}" (Serie: ${payload.serialNumber}, ID: ${item.id}). Nuevo Estado: ${payload.status}.`
        });

        NotificationService.success('Ficha del artículo guardada con éxito.');
        editModal.close();
        this.loadProductModeData();

      } catch (err) {
        console.error(err);
        saveBtn.disabled = false;
      }
    });
  }

  openPrintLabelModal(itemId) {
    const item = this.state.itemQrs.find(i => i.id === itemId);
    if (!item) return;

    let modalOverlay = document.getElementById('print-product-label-modal-container');
    if (modalOverlay) modalOverlay.remove();

    const textFooter = this.state.qrSettings.footerText || 'Escanear para garantía';

    const bodyHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; gap:12px; color:var(--color-text-primary); text-align:center;">
        
        <!-- Physical Tag layout -->
        <div id="printable-item-tag" style="background:#ffffff; border:1px solid #000; padding:15px; color:#000; border-radius:4px; max-width:250px; width:100%; display:flex; flex-direction:column; align-items:center; gap:8px;">
          <strong style="font-size:0.85rem; border-bottom:1px solid #000; width:100%; padding-bottom:3px; display:block; word-break:break-all;">${this.currentCompany.name || 'Negocio'}</strong>
          <div id="print-modal-qr-canvas" style="width:130px; height:130px; display:flex; align-items:center; justify-content:center; background:#fff; padding:2px;"></div>
          
          <div style="font-size:0.65rem; width:100%; line-height:1.3; font-weight:700;">
            <div>Producto: ${item.productName}</div>
            ${item.brand ? `<div>Marca: ${item.brand}</div>` : ''}
            <div>Serie: <span style="font-family:monospace;">${item.serialNumber}</span></div>
          </div>
          
          <div style="font-size:0.58rem; text-transform:uppercase; font-weight:bold; border-top:1px dashed #666; width:100%; padding-top:4px; color:#333;">
            ${textFooter}
          </div>
        </div>

        <p class="text-xs text-secondary mt-1">Esta vista previsualiza la etiqueta de código QR para impresión.</p>
      </div>
    `;

    const printModal = new Modal({
      title: '🏷️ Imprimir Etiqueta de Producto',
      bodyHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-close-print-modal">Cerrar</button>
        <button class="btn btn-primary btn-sm" id="btn-trigger-label-print">🖨️ Imprimir Etiqueta</button>
      `,
      size: 'sm'
    });

    const el = printModal.mount();
    el.setAttribute('id', 'print-product-label-modal-container');
    document.body.appendChild(el);

    setTimeout(() => {
      const container = el.querySelector('#print-modal-qr-canvas');
      if (container) this.renderQRCodeWithLogo(container, item.url);
    }, 60);

    el.querySelector('#btn-close-print-modal')?.addEventListener('click', () => printModal.close());
    
    el.querySelector('#btn-trigger-label-print')?.addEventListener('click', () => {
      const printDiv = el.querySelector('#printable-item-tag');
      const printArea = document.createElement('div');
      printArea.id = 'print-qr-area';
      printArea.innerHTML = `
        <style>
          @media print { 
            body * { visibility: hidden; } 
            #print-qr-area, #print-qr-area * { visibility: visible; } 
            #print-qr-area { position:fixed; top:40px; left:40px; } 
          }
        </style>
      ` + printDiv.outerHTML;
      
      document.body.appendChild(printArea);
      window.print();
      setTimeout(() => { if (document.body.contains(printArea)) document.body.removeChild(printArea); }, 1500);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAP LEAFLET RENDERING AND DYNAMIC ASYNC RESOURCE LOADER
  // ═══════════════════════════════════════════════════════════════════════════

  renderQRCodeWithLogo(container, url) {
    try {
      let safeUrl = url;
      try {
        if (safeUrl.includes('%EF%BF%BD')) {
          safeUrl = safeUrl.replace(/%EF%BF%BD/gi, '');
        }
        safeUrl = encodeURI(decodeURI(safeUrl));
      } catch (_) {
        safeUrl = encodeURI(url);
      }

      const qr = window.qrcode(0, 'H');
      qr.addData(safeUrl);
      qr.make();

      const logoUrl = this.state.logoUrl;
      const printLogo = this.state.qrSettings.printLogo !== false;

      if (logoUrl && printLogo) {
        const canvas = document.createElement('canvas');
        const size = 180;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const svgStr = qr.createSvgTag(4, 10);
        const blob = new Blob([svgStr], { type: 'image/svg+xml' });
        const svgUrl = URL.createObjectURL(blob);
        const qrImg = new Image();

        qrImg.onload = () => {
          ctx.drawImage(qrImg, 0, 0, size, size);
          URL.revokeObjectURL(svgUrl);

          const logoSize = Math.round(size * 0.22);
          const logoOffset = Math.round((size - logoSize) / 2);

          const logoImg = new Image();
          logoImg.crossOrigin = 'anonymous';
          logoImg.onload = () => {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(size / 2, size / 2, logoSize / 2 + 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.save();
            ctx.beginPath();
            ctx.arc(size / 2, size / 2, logoSize / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(logoImg, logoOffset, logoOffset, logoSize, logoSize);
            ctx.restore();

            container.innerHTML = '';
            container.appendChild(canvas);
          };
          logoImg.onerror = () => {
            container.innerHTML = '';
            container.appendChild(canvas);
          };
          logoImg.src = logoUrl;
        };
        qrImg.onerror = () => {
          this._renderSVGFallback(container, qr);
        };
        qrImg.src = svgUrl;

      } else {
        this._renderSVGFallback(container, qr);
      }
    } catch(e) {
      console.error('[QRCodesView] renderQRCodeWithLogo error:', e);
      container.innerHTML = '<div style="color:red;font-size:0.65rem;padding:8px;">Error al generar QR</div>';
    }
  }

  _renderSVGFallback(container, qr) {
    const svgTag = qr.createSvgTag(4, 10);
    container.innerHTML = svgTag;
    const svg = container.querySelector('svg');
    if (svg) { svg.style.width = '100%'; svg.style.height = '100%'; svg.style.display = 'block'; }
  }

  async loadQRLibrary() {
    return new Promise((resolve) => {
      if (typeof window.qrcode === 'function') { this.state.qrLibLoaded = true; resolve(); return; }

      const tryLoad = (src, onFail) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload  = () => { this.state.qrLibLoaded = true; resolve(); };
        s.onerror = onFail;
        document.head.appendChild(s);
      };

      tryLoad(
        'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
        () => tryLoad(
          'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js',
          () => { console.warn('[QRCodesView] QR library unavailable.'); resolve(); }
        )
      );
    });
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.layout.unmount();
    super.unmount();
  }
}
