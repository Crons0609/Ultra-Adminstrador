/**
 * @file qr-codes.view.js
 * @description QR Code Generator with:
 *  - Persistent storage in Firebase (qr_codes collection)
 *  - Business logo overlay using Canvas API
 *  - Auto-loads saved QRs on mount
 *  - SVG generation via qrcode-generator v1.4.4 (Kazuhiko Arase)
 *    with Quiet Zone 10px and error correction H (30%)
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';

export class QRCodesView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || 'demo';
    this.branchId  = currentUser.branchId  || 'main';
    this.baseMenuUrl = `${window.location.origin}/#/customer/menu/${this.companyId}/${this.branchId}/`;

    this.state = {
      tableCount: 10,
      tableType: 'mesa',
      savedQRs: [],       // loaded from Firebase
      qrLibLoaded: false,
      logoUrl: ''
    };

    this.listeners = [];

    this.layout = new PageLayout({
      title: 'Generador de Códigos QR',
      subtitle: 'Genera y guarda códigos QR permanentes para cada mesa. Los QR persisten en la base de datos aunque cierres sesión.',
      actionHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-print-all">🖨️ Imprimir Todo</button>
        <button class="btn btn-success btn-sm" id="btn-save-qrs" style="background:#34d399;border:none;color:#000;font-weight:700;">💾 Guardar QR en DB</button>
        <button class="btn btn-primary btn-sm" id="btn-generate-qr">⚡ Generar QR</button>
      `,
      contentHTML: `
        <!-- Configuration Panel -->
        <div class="card p-5 mb-6">
          <h3 class="text-lg font-semibold mb-4">⚙️ Configuración</h3>
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
      `
    });
  }

  async mount() {
    const element = this.layout.mount();
    await this.loadQRLibrary();
    this.subscribeToSavedQRs(element);
    this.loadBusinessLogo();
    this.bindEvents(element);
    return element;
  }

  bindEvents(element) {
    element.querySelector('#btn-generate-qr')?.addEventListener('click', () => this.generateQRCodes(element));
    element.querySelector('#btn-save-qrs')?.addEventListener('click',    () => this.saveQRsToDB(element));
    element.querySelector('#btn-print-all')?.addEventListener('click',   () => this.printAllQR(element));
    element.querySelector('#btn-delete-all-saved-qrs')?.addEventListener('click', () => this.deleteAllSavedQRs());
  }

  /** Delete ALL saved QRs from Firebase */
  async deleteAllSavedQRs() {
    const total = this.state.savedQRs.length;
    if (total === 0) {
      NotificationService.warn('No hay códigos QR guardados para eliminar.');
      return;
    }

    if (!confirm(`⚠️ ¿Estás seguro de que deseas eliminar TODOS los ${total} códigos QR guardados de la base de datos?\n\nEsta acción no se puede deshacer.`)) {
      return;
    }

    try {
      await FirestoreService.deleteAll('qr_codes');
      NotificationService.success(`Se han eliminado todos los códigos QR (${total}) de la base de datos.`);
    } catch (e) {
      console.error('[QRCodesView] Error al eliminar todos los QR:', e);
      NotificationService.error(`Error al eliminar los códigos QR: ${e.message || e}`);
    }
  }

  /** Load business logo from informacion_local for QR overlay */
  loadBusinessLogo() {
    try {
      FirestoreService.listenToPathRaw(`${this.companyId}/informacion_local`, (info) => {
        this.state.logoUrl = (info && info.logo) ? info.logo : '';
      });
    } catch(e) { /* no logo available */ }
  }

  /** Subscribe to persisted QRs in Firebase and render them */
  subscribeToSavedQRs(element) {
    try {
      const listener = FirestoreService.listenToTenant('qr_codes', (qrs) => {
        this.state.savedQRs = qrs || [];
        this.renderSavedQRs(element);
      });
      this.listeners.push(listener);
    } catch(e) {
      console.warn('[QRCodesView] Could not subscribe to qr_codes:', e.message);
    }
  }

  renderSavedQRs(element) {
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

    // Render QR images into saved cards
    setTimeout(() => {
      this.state.savedQRs.forEach(qr => {
        const container = element.querySelector(`#saved-qr-canvas-${qr.id}`);
        if (container) this.renderQRCodeWithLogo(container, qr.url);
      });
    }, 60);

    // Bind delete buttons
    grid.querySelectorAll('.btn-delete-saved-qr').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('¿Eliminar este QR de la base de datos?')) return;
        await FirestoreService.delete('qr_codes', id);
        NotificationService.success('QR eliminado de la base de datos.');
      });
    });
  }

  /** Generate QR grid in memory (not yet saved to DB) */
  generateQRCodes(element) {
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

    // Store generation params for later save
    this._lastGenParams = { count, tableType, prefix, baseUrl, typeLabel };

    let html = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--space-4);" id="qr-cards-grid">`;
    for (let i = 1; i <= count; i++) {
      const tableId = `${tableType}-${prefix}${i}`;
      const label   = `${typeLabel} ${prefix}${i}`;
      const url     = `${baseUrl}/${tableId}`;
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
        const tableId = `${tableType}-${prefix}${i}`;
        const url     = `${baseUrl}/${tableId}`;
        const ph      = element.querySelector(`#qr-canvas-${i}`);
        if (ph) this.renderQRCodeWithLogo(ph, url);
      }
    }, 60);

    NotificationService.success(`${count} códigos QR generados. Presiona "Guardar QR en DB" para hacerlos permanentes.`);
  }

  /** Save currently-generated QRs to Firebase (idempotent via customId) */
  async saveQRsToDB(element) {
    const cards = element.querySelectorAll('[data-table-id]');
    if (cards.length === 0) {
      NotificationService.warn('Primero genera los QR antes de guardar.');
      return;
    }

    const btn = element.querySelector('#btn-save-qrs');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    let saved = 0;
    for (const card of cards) {
      const tableId = card.getAttribute('data-table-id');
      const url     = card.getAttribute('data-url');
      const label   = card.getAttribute('data-label');
      const p = this._lastGenParams || {};

      try {
        await FirestoreService.create('qr_codes', {
          tableId,
          label,
          url,
          type:   p.tableType || 'mesa',
          prefix: p.prefix    || '',
          branchId: this.branchId,
        }, tableId); // customId = tableId → idempotent upsert

        // Synchronize with tables collection for Waiter/POS views
        const existingTable = await FirestoreService.readPath(`${this.companyId}/tables/${tableId}`);
        await FirestoreService.updatePath(`${this.companyId}/tables/${tableId}`, {
          id: tableId,
          name: label,
          type: p.tableType || 'mesa',
          status: existingTable?.status || 'FREE',
          activeOrderId: existingTable?.activeOrderId || null,
          activeOrderIds: existingTable?.activeOrderIds || [],
          updatedAt: Date.now()
        });
        saved++;
      } catch(e) {
        console.warn('[QRCodesView] Could not save QR:', tableId, e.message);
      }
    }

    if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar QR en DB'; }
    NotificationService.success(`${saved} códigos QR guardados permanentemente en la base de datos.`);
  }

  /**
   * Render a QR code with optional business logo overlay.
   * Uses qrcode-generator (Kazuhiko Arase) SVG → Canvas → logo draw.
   * @param {HTMLElement} container
   * @param {string} url
   */
  renderQRCodeWithLogo(container, url) {
    try {
      if (typeof window.qrcode !== 'function') {
        container.innerHTML = `<div style="padding:10px;font-size:0.6rem;color:#555;text-align:center;">⚠️ Lib no disponible</div>`;
        return;
      }

      const qr = window.qrcode(0, 'H'); // Auto type, High error correction
      qr.addData(url);
      qr.make();

      const logoUrl = this.state.logoUrl;

      if (logoUrl) {
        // Render to canvas so we can draw the logo on top
        const canvas  = document.createElement('canvas');
        const size    = 180;
        canvas.width  = size;
        canvas.height = size;
        const ctx     = canvas.getContext('2d');

        // Draw QR as SVG → img → canvas
        const svgStr  = qr.createSvgTag(4, 10);
        const blob    = new Blob([svgStr], { type: 'image/svg+xml' });
        const svgUrl  = URL.createObjectURL(blob);
        const qrImg   = new Image();

        qrImg.onload = () => {
          ctx.drawImage(qrImg, 0, 0, size, size);
          URL.revokeObjectURL(svgUrl);

          // Draw logo centered (~22% of QR size)
          const logoSize   = Math.round(size * 0.22);
          const logoOffset = Math.round((size - logoSize) / 2);

          const logoImg = new Image();
          logoImg.crossOrigin = 'anonymous';
          logoImg.onload = () => {
            // White circular background for contrast
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(size / 2, size / 2, logoSize / 2 + 4, 0, Math.PI * 2);
            ctx.fill();

            // Draw logo
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
            // Logo failed — show QR without logo
            container.innerHTML = '';
            container.appendChild(canvas);
          };
          logoImg.src = logoUrl;
        };
        qrImg.onerror = () => {
          // SVG blob failed — fallback to inline SVG
          this._renderSVGFallback(container, qr);
        };
        qrImg.src = svgUrl;

      } else {
        // No logo — render plain SVG
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

  printAllQR(element) {
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

  /**
   * Loads qrcode-generator v1.4.4 (Kazuhiko Arase) from CDN.
   * Produces standards-compliant QR codes with SVG output.
   */
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
