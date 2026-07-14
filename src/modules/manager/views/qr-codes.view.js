/**
 * @file qr-codes.view.js
 * @description QR Code Generator for tables, seats, and delivery zones.
 * Uses the lightweight qrcode-generator library loaded dynamically from CDN.
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
                <option value="Mesa">Mesa</option>
                <option value="Asiento">Asiento / Silla</option>
                <option value="Barra">Barra / Bar</option>
                <option value="Cabina">Cabina</option>
                <option value="Zona">Zona</option>
                <option value="Habitación">Habitación</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="qr-prefix">Prefijo del número</label>
              <input type="text" id="qr-prefix" class="input input-md" value="" placeholder="Ej. A, B, VIP, Sin prefijo..." />
            </div>
            <div class="form-group" style="align-self: end;">
              <button class="btn btn-primary btn-md" id="btn-generate-qr-2" style="width: 100%;">⚡ Generar Códigos</button>
            </div>
          </div>

          <!-- Generated URL Preview -->
          <div style="margin-top: var(--space-4); padding: var(--space-3); background: var(--color-bg-tertiary); border-radius: var(--radius-md); border: 1px solid var(--color-border);">
            <label class="form-label" style="font-size: 0.75rem;">URL base del menú (destino de los QR)</label>
            <div style="display: flex; align-items: center; gap: var(--space-2); margin-top: 4px;">
              <code id="qr-base-url-display" style="font-size: 0.75rem; color: var(--color-accent); word-break: break-all; flex: 1;"></code>
              <button class="btn btn-secondary btn-sm" id="btn-copy-base-url">📋 Copiar</button>
            </div>
          </div>
        </div>

        <!-- QR Codes Grid -->
        <div id="qr-grid-container">
          <div class="card p-10 text-center" style="min-height: 300px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-3);">
            <div style="font-size: 3rem;">📱</div>
            <p class="text-secondary">Configura el número de mesas y presiona <strong>Generar Códigos</strong> para obtener tus QR.</p>
          </div>
        </div>
      `
    });
  }

  async mount() {
    const element = this.layout.mount();

    // Display base URL
    const urlDisplay = element.querySelector('#qr-base-url-display');
    if (urlDisplay) {
      urlDisplay.textContent = this.baseMenuUrl + '[número]';
    }

    // Load QR library from CDN dynamically
    await this.loadQRLibrary();

    this.afterMount();
    return element;
  }

  afterMount() {
    // Copy base URL button
    const copyBaseBtn = this.layout.$('#btn-copy-base-url');
    if (copyBaseBtn) {
      copyBaseBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(this.baseMenuUrl + '1')
          .then(() => NotificationService.success('URL base copiada al portapapeles.'))
          .catch(() => NotificationService.error('No se pudo copiar la URL.'));
      });
    }

    // Generate buttons
    const generateBtns = [
      this.layout.$('#btn-generate-qr'),
      this.layout.$('#btn-generate-qr-2')
    ];
    generateBtns.forEach(btn => {
      if (btn) {
        btn.addEventListener('click', () => this.generateQRCodes());
      }
    });

    // Print all button
    const printBtn = this.layout.$('#btn-print-all');
    if (printBtn) {
      printBtn.addEventListener('click', () => this.printAllQR());
    }
  }

  /**
   * Dynamically loads the qrcode-generator library from CDN
   */
  async loadQRLibrary() {
    return new Promise((resolve) => {
      if (window.qrcode) {
        this.state.qrLibLoaded = true;
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      script.onload = () => {
        this.state.qrLibLoaded = true;
        resolve();
      };
      script.onerror = () => {
        // Fallback to alternative CDN
        const script2 = document.createElement('script');
        script2.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
        script2.onload = () => {
          this.state.qrLibLoaded = true;
          resolve();
        };
        script2.onerror = () => resolve(); // continue without library
        document.head.appendChild(script2);
      };
      document.head.appendChild(script);
    });
  }

  /**
   * Generates QR code canvas elements for each table/seat
   */
  generateQRCodes() {
    const countInput = this.layout.$('#qr-table-count');
    const typeInput = this.layout.$('#qr-table-type');
    const prefixInput = this.layout.$('#qr-prefix');
    const gridContainer = this.layout.$('#qr-grid-container');

    if (!countInput || !gridContainer) return;

    const count = Math.min(parseInt(countInput.value) || 10, 200);
    const tableType = typeInput ? typeInput.value : 'Mesa';
    const prefix = prefixInput ? prefixInput.value.trim() : '';

    // Build grid HTML shell
    let gridHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--space-4);" id="qr-cards-grid">
    `;

    for (let i = 1; i <= count; i++) {
      const label = `${tableType} ${prefix}${i}`;
      const url = `${this.baseMenuUrl}${prefix}${i}`;
      gridHTML += `
        <div class="card p-4 text-center hover-lift" style="display: flex; flex-direction: column; align-items: center; gap: var(--space-2);">
          <div id="qr-canvas-${i}" style="width: 160px; height: 160px; display: flex; align-items: center; justify-content: center; background: white; border-radius: var(--radius-sm); overflow: hidden;"></div>
          <h4 style="font-weight: 700; font-size: 1rem; margin: 0;">${label}</h4>
          <p style="font-size: 0.65rem; color: var(--color-text-tertiary); word-break: break-all; margin: 0;">${url}</p>
          <button class="btn btn-secondary btn-sm" style="width: 100%;" onclick="navigator.clipboard.writeText('${url}').then(()=>alert('URL copiada: ${label}'))">📋 Copiar URL</button>
        </div>
      `;
    }

    gridHTML += `</div>`;

    // Inject the grid shell
    gridContainer.innerHTML = gridHTML;

    // Now inject QR codes into each placeholder
    setTimeout(() => {
      for (let i = 1; i <= count; i++) {
        const placeholder = this.layout.$(`#qr-canvas-${i}`);
        if (!placeholder) continue;

        const url = `${this.baseMenuUrl}${prefix}${i}`;
        this.renderQRCode(placeholder, url);
      }
    }, 50);

    NotificationService.success(`${count} códigos QR generados para "${tableType}".`);
  }

  /**
   * Render a QR code into a given DOM container
   * @param {HTMLElement} container 
   * @param {string} url 
   */
  renderQRCode(container, url) {
    try {
      if (window.QRCode) {
        // QRCodeJS library
        new window.QRCode(container, {
          text: url,
          width: 160,
          height: 160,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.M
        });
      } else if (window.QRCodeSVG) {
        // SVG fallback
        container.innerHTML = window.QRCodeSVG(url);
      } else {
        // Text fallback showing truncated URL if library didn't load
        container.innerHTML = `
          <div style="padding: 8px; font-size: 0.6rem; word-break: break-all; color: #555; text-align: center; height: 100%; display: flex; align-items: center;">
            <span>${url.replace(window.location.origin, '...')}</span>
          </div>
        `;
      }
    } catch (e) {
      container.innerHTML = '<div style="color: red; font-size: 0.65rem;">Error QR</div>';
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
            width: 200px;
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
      document.body.removeChild(printArea);
    }, 1000);
  }

  unmount() {
    this.layout.unmount();
    super.unmount();
  }
}
