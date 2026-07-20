/**
 * @file qr-codes.view.js
 * @description QR Code Generator for tables, seats, and delivery zones.
 * Uses Kazuhiko Arase's qrcode-generator (v1.4.4) loaded dynamically from CDN.
 * Generates crisp, scannable SVG QR codes with proper Quiet Zone and error correction H.
 * Supports configuration of table count, custom labels, and bulk printing.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';
import { NotificationService } from '../../../services/notification.service.js';

export class QRCodesView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || 'demo';
    this.branchId = currentUser.branchId || 'main';

    // Base URL for customer menu (QR destination)
    // tableId segment will be appended as "mesa-{N}" matching the DB convention
    this.baseMenuUrl = `${window.location.origin}/#/customer/menu/${this.companyId}/${this.branchId}/`;

    this.state = {
      tableCount: 10,
      tableType: 'Mesa',
      generatedQRs: [],
      qrLibLoaded: false
    };

    this.layout = new PageLayout({
      title: 'Generador de Códigos QR',
      subtitle: 'Genera códigos QR para mesas, asientos o zonas. Los clientes escanean y acceden directamente al menú digital.',
      actionHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-print-all">🖨️ Imprimir Todo</button>
        <button class="btn btn-primary btn-sm" id="btn-generate-qr">⚡ Generar QR</button>
      `,
      contentHTML: `
        <!-- Configuration Panel -->
        <div class="card p-5 mb-6">
          <h3 class="text-lg font-semibold mb-4">⚙️ Configuración</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-4); align-items: end;">
            <div class="form-group">
              <label class="form-label" for="qr-table-count">Número de mesas / asientos</label>
              <input type="number" id="qr-table-count" class="input input-md" value="10" min="1" max="200" />
            </div>
            <div class="form-group">
              <label class="form-label" for="qr-table-type">Tipo de ubicación</label>
              <select id="qr-table-type" class="input input-md" style="background-color:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:0 var(--space-3); color:var(--color-text-primary);">
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
              <input type="text" id="qr-prefix" class="input input-md" value="" placeholder="Ej. A, B, VIP, Sin prefijo..." />
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size: 0.75rem;">URL base del menú (destino de los QR)</label>
              <input type="text" id="qr-base-url" class="input input-md" value="${window.location.origin}/#/customer/menu/${this.companyId}/${this.branchId}/" style="font-size:0.72rem;" />
            </div>
          </div>
        </div>

        <!-- QR Codes Grid -->
        <div id="qr-grid-container" class="card p-5">
          <div class="text-center py-8 text-secondary" id="qr-empty-state">
            <span style="font-size: 3rem; display: block; margin-bottom: 12px;">📱</span>
            <p>Configura el número de mesas y presiona <strong>Generar Códigos</strong> para obtener tus QR.</p>
            <p class="text-xs mt-2" style="color: var(--color-text-tertiary);">Los códigos generados son escaneables por la cámara nativa de iOS y Android.</p>
          </div>
        </div>
      `
    });
  }

  async mount() {
    const element = this.layout.mount();

    // Load QR library from CDN dynamically
    await this.loadQRLibrary();

    const btn = this.layout.$('#btn-generate-qr');
    if (btn) {
      btn.addEventListener('click', () => this.generateQRCodes());
    }

    const printBtn = this.layout.$('#btn-print-all');
    if (printBtn) {
      printBtn.addEventListener('click', () => this.printAllQR());
    }

    return element;
  }

  /**
   * Dynamically loads Kazuhiko Arase's qrcode-generator library (v1.4.4)
   * This library supports SVG output with proper Quiet Zone — critical for iOS/Android camera apps.
   */
  async loadQRLibrary() {
    return new Promise((resolve) => {
      // If already loaded, skip
      if (typeof window.qrcode === 'function') {
        this.state.qrLibLoaded = true;
        resolve();
        return;
      }

      const primary = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
      const fallback = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';

      const tryLoad = (src, onFailure) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
          this.state.qrLibLoaded = true;
          resolve();
        };
        script.onerror = onFailure;
        document.head.appendChild(script);
      };

      tryLoad(primary, () => tryLoad(fallback, () => {
        console.warn('[QRCodesView] Could not load qrcode-generator library. QR codes will show text fallback.');
        resolve();
      }));
    });
  }

  /**
   * Generates QR code SVG elements for each table/seat.
   * TableId format matches the DB convention: "{type}-{prefix}{number}" (e.g. "mesa-3", "mesa-VIP1")
   */
  generateQRCodes() {
    const countInput = this.layout.$('#qr-table-count');
    const typeInput  = this.layout.$('#qr-table-type');
    const prefixInput = this.layout.$('#qr-prefix');
    const baseUrlInput = this.layout.$('#qr-base-url');
    const gridContainer = this.layout.$('#qr-grid-container');

    if (!countInput || !gridContainer) return;

    const count = Math.min(parseInt(countInput.value) || 10, 200);
    const tableType = typeInput ? typeInput.value.toLowerCase().trim() : 'mesa'; // e.g. "mesa"
    const prefix    = prefixInput ? prefixInput.value.trim() : '';
    const baseUrl   = baseUrlInput ? baseUrlInput.value.trim() : this.baseMenuUrl;

    // Human-readable display label mapping
    const typeLabels = {
      'mesa': 'Mesa', 'asiento': 'Asiento', 'barra': 'Barra',
      'cabina': 'Cabina', 'zona': 'Zona', 'habitacion': 'Habitación'
    };
    const typeLabel = typeLabels[tableType] || tableType;

    // Build grid HTML shell
    let gridHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-4);" id="qr-cards-grid">
    `;

    for (let i = 1; i <= count; i++) {
      // DB-compatible tableId: "mesa-1", "mesa-VIP2", etc.
      const tableId = `${tableType}-${prefix}${i}`;
      const label   = `${typeLabel} ${prefix}${i}`;
      const url     = `${baseUrl.replace(/\/$/, '')}/${tableId}`;

      gridHTML += `
        <div class="card p-4 text-center hover-lift" style="display: flex; flex-direction: column; align-items: center; gap: var(--space-2);">
          <div id="qr-canvas-${i}" style="width: 180px; height: 180px; display: flex; align-items: center; justify-content: center; background: white; border-radius: var(--radius-sm); overflow: hidden; padding: 4px;"></div>
          <h4 style="font-weight: 700; font-size: 1rem; margin: 0;">${label}</h4>
          <p style="font-size: 0.6rem; color: var(--color-text-tertiary); word-break: break-all; margin: 0; max-width: 200px;">${url}</p>
          <div style="display:flex; gap:6px; width:100%;">
            <button class="btn btn-secondary btn-sm" style="flex:1; font-size:0.75rem;" onclick="navigator.clipboard.writeText('${url}').then(()=>alert('URL copiada: ${label}'))">📋 Copiar</button>
          </div>
        </div>
      `;
    }

    gridHTML += `</div>`;
    gridContainer.innerHTML = gridHTML;

    // Inject QR SVGs after DOM is ready
    setTimeout(() => {
      for (let i = 1; i <= count; i++) {
        const tableType2 = typeInput ? typeInput.value.toLowerCase().trim() : 'mesa';
        const tableId = `${tableType2}-${prefix}${i}`;
        const url = `${baseUrl.replace(/\/$/, '')}/${tableId}`;
        const placeholder = this.layout.$(`#qr-canvas-${i}`);
        if (placeholder) {
          this.renderQRCode(placeholder, url);
        }
      }
    }, 50);

    NotificationService.success(`${count} códigos QR generados para "${typeLabel}".`);
  }

  /**
   * Render a scannable QR code SVG into a given DOM container.
   * Uses qrcode-generator with error level H and a proper Quiet Zone of 10px.
   * @param {HTMLElement} container
   * @param {string} url
   */
  renderQRCode(container, url) {
    try {
      if (typeof window.qrcode === 'function') {
        // Kazuhiko Arase's qrcode-generator — produces standards-compliant QR codes
        // Type 0 = auto-select best type; 'H' = highest error correction (30% restoration)
        const qr = window.qrcode(0, 'H');
        qr.addData(url);
        qr.make();

        // createSvgTag(cellSize, margin) — 4px per module, 10px quiet zone (mandatory for iOS/Android cameras)
        const svgTag = qr.createSvgTag(4, 10);
        container.innerHTML = svgTag;

        // Ensure SVG fills container properly
        const svg = container.querySelector('svg');
        if (svg) {
          svg.style.width  = '100%';
          svg.style.height = '100%';
          svg.style.display = 'block';
        }
      } else {
        // Plain text fallback if library failed to load
        container.innerHTML = `
          <div style="padding: 10px; font-size: 0.6rem; word-break: break-all; color: #555; text-align: center; height: 100%; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 4px;">
            <span style="font-size: 1.5rem;">⚠️</span>
            <span>Librería no disponible. Copia la URL manualmente.</span>
          </div>
        `;
      }
    } catch (e) {
      console.error('[QRCodesView] renderQRCode error:', e);
      container.innerHTML = '<div style="color: red; font-size: 0.65rem; padding:8px;">Error al generar QR</div>';
    }
  }

  /**
   * Opens the browser print dialog targeting only QR cards
   */
  printAllQR() {
    const grid = this.layout.$('#qr-cards-grid');
    if (!grid || grid.children.length === 0) {
      NotificationService.warn('Primero genera los códigos QR antes de imprimir.');
      return;
    }

    const printStyles = `
      <style>
        @media print {
          body * { visibility: hidden; }
          #print-qr-area, #print-qr-area * { visibility: visible; }
          #print-qr-area { position: fixed; top: 0; left: 0; width: 100%; }
          .qr-print-card {
            display: inline-block;
            width: 220px;
            text-align: center;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 12px;
            margin: 8px;
            page-break-inside: avoid;
          }
        }
      </style>
    `;

    const printArea = document.createElement('div');
    printArea.id = 'print-qr-area';
    printArea.innerHTML = printStyles + grid.outerHTML;
    document.body.appendChild(printArea);

    window.print();

    setTimeout(() => {
      if (document.body.contains(printArea)) {
        document.body.removeChild(printArea);
      }
    }, 1500);
  }

  unmount() {
    this.layout.unmount();
    super.unmount();
  }
}
