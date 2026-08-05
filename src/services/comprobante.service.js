/**
 * @file comprobante.service.js
 * @description Servicio centralizado para la generación, almacenamiento, edición e impresión
 * de Comprobantes de Pago (Tickets/Facturas) con Número Único e Inmutable.
 */

import { FirestoreService } from './firestore.service.js';
import { LocalStorageDBService } from './local-storage-db.service.js';
import { OfflineSyncService } from './offline-sync.service.js';
import { NotificationService } from './notification.service.js';
import { TimeService } from './time.service.js';
import { GlobalStore } from '../core/state.js';

export class ComprobanteService {

  /**
   * Genera un número de comprobante único e inalterable.
   * Formato: FAC-YYYYMMDD-XXXX (ej: FAC-20260805-4819)
   */
  static generateNumeroComprobante() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const randomSeq = Math.floor(1000 + Math.random() * 9000);
    return `FAC-${yyyy}${mm}${dd}-${randomSeq}`;
  }

  /**
   * Crea y guarda un comprobante de pago vinculado a una venta.
   */
  static async createComprobante(companyId, salePayload) {
    const numeroComprobante = salePayload.numeroComprobante || this.generateNumeroComprobante();
    const comprobanteId = `comp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const company = GlobalStore.getState().currentCompany || {};

    const comprobante = {
      id: comprobanteId,
      numeroComprobante, // 🔒 Inmutable
      ventaId: salePayload.ventaId || `venta_${Date.now()}`,
      fecha: Date.now(),
      fechaFormateada: TimeService.formatDateTime(new Date()),
      empresa: {
        nombre: company.name || 'Ultra Administrador S.A.',
        ruc: company.taxId || company.ruc || 'J03100000000',
        direccion: company.address || company.location?.address || 'Nicaragua',
        telefono: company.phone || ''
      },
      cliente: {
        nombre: salePayload.clientName || 'Cliente General / Consumidor Final',
        documento: salePayload.clientTaxId || 'C/F',
        direccion: salePayload.clientAddress || '',
        telefono: salePayload.clientPhone || ''
      },
      vendedor: salePayload.sellerName || 'Cajero',
      metodoPago: salePayload.paymentMethod || 'EFECTIVO',
      items: (salePayload.items || []).map(item => ({
        productId: item.productId,
        name: item.name,
        price: Number(item.price || 0), // 🔒 Predefinido
        qty: Number(item.qty || 1),
        total: Number(item.total || 0)
      })),
      subtotal: Number(salePayload.subtotal || 0),
      tax: Number(salePayload.tax || 0),
      total: Number(salePayload.total || 0),
      montoPagado: Number(salePayload.amountPaid || salePayload.total || 0),
      cambio: Number(salePayload.change || 0),
      notas: salePayload.notas || '¡Gracias por su compra! Vuelva pronto.',
      tipoComprobante: 'Factura / Ticket de Venta',
      createdAt: Date.now()
    };

    // Save to RTDB and IndexedDB
    try {
      await FirestoreService.create('comprobantes', comprobante);
      await LocalStorageDBService.setCache(`${companyId}/comprobantes/${comprobanteId}`, comprobante);
    } catch (e) {
      console.warn('[ComprobanteService] Direct DB save failed, queuing offline:', e.message);
      await OfflineSyncService.write('set', `${companyId}/comprobantes/${comprobanteId}`, comprobante, 'Comprobante de Pago');
    }

    return comprobante;
  }

  /**
   * Actualiza únicamente la información modificable del cliente y notas.
   * El número de comprobante y precios de productos permanecen estrictamente inalterados.
   */
  static async updateComprobanteCliente(companyId, comprobanteId, clientData) {
    if (!comprobanteId) return null;

    const updates = {
      'cliente/nombre': clientData.nombre || 'Cliente General',
      'cliente/documento': clientData.documento || 'C/F',
      'cliente/direccion': clientData.direccion || '',
      'cliente/telefono': clientData.telefono || '',
      notas: clientData.notas || '',
      updatedAt: Date.now()
    };

    try {
      await FirestoreService.update('comprobantes', comprobanteId, updates);
      NotificationService.success('✅ Datos del comprobante actualizados correctamente.');
      return true;
    } catch (e) {
      console.error('[ComprobanteService] Error updating comprobante:', e);
      NotificationService.error('Error al actualizar datos del comprobante.');
      return false;
    }
  }

  /**
   * Despliega la ventana modal de Comprobante de Pago con vista previa del ticket,
   * decisión de impresión y campos editables para cliente/notas.
   */
  static showReceiptModal({ comprobante, isEditable = true, onClosed }) {
    // Remove existing modal if any
    const existing = document.getElementById('comprobante-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'comprobante-modal-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(5px);
      -webkit-backdrop-filter: blur(5px);
      z-index: 99999;
      display: flex; align-items: center; justify-content: center;
      padding: 16px;
      animation: ua-notif-fade-in 0.2s ease both;
    `;

    const itemsRows = (comprobante.items || []).map(i => `
      <tr>
        <td style="padding: 6px 4px; text-align: left; font-size: 12px; font-weight: 600; color: #1e293b;">
          ${i.name}
          <div style="font-size: 10px; color: #64748b;">Coste predefinido: $${Number(i.price).toFixed(2)} 🔒</div>
        </td>
        <td style="padding: 6px 4px; text-align: center; font-size: 12px; font-weight: 700; color: #334155;">
          ${i.qty}
        </td>
        <td style="padding: 6px 4px; text-align: right; font-size: 12px; font-weight: 700; color: #059669;">
          $${Number(i.total).toFixed(2)}
        </td>
      </tr>
    `).join('');

    overlay.innerHTML = `
      <div style="
        background: #ffffff;
        color: #0f172a;
        width: 100%; max-width: 460px;
        max-height: 90vh;
        border-radius: 16px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        display: flex; flex-direction: column;
        overflow: hidden;
        font-family: 'Inter', system-ui, sans-serif;
      ">
        <!-- Modal Top Bar -->
        <div style="
          background: #1e293b; color: #ffffff;
          padding: 14px 20px;
          display: flex; align-items: center; justify-content: space-between;
        ">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">🧾</span>
            <span style="font-weight: 700; font-size: 15px;">Comprobante de Pago Generado</span>
          </div>
          <button id="btn-close-receipt-modal" style="
            background: transparent; border: none; color: #94a3b8;
            font-size: 22px; cursor: pointer; line-height: 1; padding: 0 4px;
          ">&times;</button>
        </div>

        <!-- Printable / Scrollable Ticket Body -->
        <div id="printable-receipt-area" style="
          flex: 1; overflow-y: auto; padding: 20px;
          background: #f8fafc;
        ">
          <!-- Ticket Header -->
          <div style="text-align: center; border-bottom: 2px dashed #cbd5e1; padding-bottom: 12px; margin-bottom: 14px;">
            <h2 style="font-size: 18px; font-weight: 800; margin: 0; color: #0f172a;">${comprobante.empresa?.nombre || 'ESTABLECIMIENTO'}</h2>
            <p style="font-size: 11px; color: #64748b; margin: 2px 0 0;">RUC / NIT: ${comprobante.empresa?.ruc || 'N/A'}</p>
            <p style="font-size: 11px; color: #64748b; margin: 2px 0 0;">${comprobante.empresa?.direccion || ''}</p>

            <!-- Locked Receipt Number Badge -->
            <div style="
              margin-top: 10px; display: inline-flex; align-items: center; gap: 6px;
              background: #e2e8f0; border: 1px solid #cbd5e1;
              padding: 4px 12px; border-radius: 20px;
            ">
              <span style="font-size: 11px;">🔒</span>
              <span style="font-size: 12px; font-weight: 800; color: #334155; letter-spacing: 0.5px;">
                Nº: ${comprobante.numeroComprobante}
              </span>
              <span style="font-size: 9px; background: #cbd5e1; color: #475569; padding: 1px 5px; border-radius: 4px; font-weight: 700;">INMUTABLE</span>
            </div>
            <p style="font-size: 10px; color: #94a3b8; margin: 4px 0 0;">${comprobante.fechaFormateada || ''} · Vendedor: ${comprobante.vendedor || 'Cajero'}</p>
          </div>

          <!-- Customer Info Form (Editable section) -->
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-bottom: 14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">
                ✏️ Datos del Cliente (Modificables)
              </span>
              <span style="font-size: 10px; color: #10b981; font-weight: 600;">Se guarda en BD</span>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
              <div>
                <label style="font-size: 10px; font-weight: 600; color: #64748b; display: block; margin-bottom: 2px;">Cliente / Razón Social:</label>
                <input type="text" id="rcpt-client-name" value="${comprobante.cliente?.nombre || ''}" placeholder="Nombre del cliente" style="
                  width: 100%; padding: 5px 8px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box;
                " ${!isEditable ? 'disabled' : ''} />
              </div>
              <div>
                <label style="font-size: 10px; font-weight: 600; color: #64748b; display: block; margin-bottom: 2px;">RUC / Cédula / Doc:</label>
                <input type="text" id="rcpt-client-doc" value="${comprobante.cliente?.documento || ''}" placeholder="C/F o RUC" style="
                  width: 100%; padding: 5px 8px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box;
                " ${!isEditable ? 'disabled' : ''} />
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
              <div>
                <label style="font-size: 10px; font-weight: 600; color: #64748b; display: block; margin-bottom: 2px;">Dirección:</label>
                <input type="text" id="rcpt-client-dir" value="${comprobante.cliente?.direccion || ''}" placeholder="Dirección del cliente" style="
                  width: 100%; padding: 5px 8px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box;
                " ${!isEditable ? 'disabled' : ''} />
              </div>
              <div>
                <label style="font-size: 10px; font-weight: 600; color: #64748b; display: block; margin-bottom: 2px;">Teléfono:</label>
                <input type="text" id="rcpt-client-phone" value="${comprobante.cliente?.telefono || ''}" placeholder="Teléfono" style="
                  width: 100%; padding: 5px 8px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box;
                " ${!isEditable ? 'disabled' : ''} />
              </div>
            </div>

            <div>
              <label style="font-size: 10px; font-weight: 600; color: #64748b; display: block; margin-bottom: 2px;">Notas u Observaciones:</label>
              <input type="text" id="rcpt-client-notes" value="${comprobante.notas || ''}" placeholder="Notas del comprobante" style="
                width: 100%; padding: 5px 8px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box;
              " ${!isEditable ? 'disabled' : ''} />
            </div>
          </div>

          <!-- Product Details Table (Readonly Predefined Prices) -->
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-bottom: 14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
              <span style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">
                📦 Detalle de Venta
              </span>
              <span style="font-size: 10px; color: #64748b; font-weight: 600;">🔒 Costes Predefinidos</span>
            </div>

            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <th style="text-align: left; padding: 4px; font-size: 11px; color: #64748b;">Producto</th>
                  <th style="text-align: center; padding: 4px; font-size: 11px; color: #64748b;">Cant.</th>
                  <th style="text-align: right; padding: 4px; font-size: 11px; color: #64748b;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRows}
              </tbody>
            </table>
          </div>

          <!-- Financial Summary -->
          <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: #475569; margin-bottom: 4px;">
              <span>Subtotal:</span>
              <span style="font-weight: 600;">$${Number(comprobante.subtotal).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: #475569; margin-bottom: 6px;">
              <span>IVA (15%):</span>
              <span style="font-weight: 600;">$${Number(comprobante.tax).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 800; color: #0f172a; border-top: 1px solid #cbd5e1; padding-top: 6px; margin-bottom: 6px;">
              <span>TOTAL A PAGAR:</span>
              <span style="color: #059669;">$${Number(comprobante.total).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: #64748b;">
              <span>Método de Pago: <strong>${comprobante.metodoPago}</strong></span>
              ${comprobante.metodoPago === 'EFECTIVO' ? `<span>Cambio: <strong style="color:#059669;">$${Number(comprobante.cambio).toFixed(2)}</strong></span>` : ''}
            </div>
          </div>
        </div>

        <!-- Modal Action Footer -->
        <div style="
          background: #ffffff; border-top: 1px solid #e2e8f0;
          padding: 14px 20px;
          display: flex; gap: 10px; align-items: center; justify-content: flex-end;
          flex-wrap: wrap;
        ">
          ${isEditable ? `
            <button id="btn-save-receipt-changes" style="
              background: #0284c7; color: #ffffff; border: none;
              padding: 9px 16px; border-radius: 8px; font-weight: 700;
              font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px;
            ">
              💾 Guardar Datos Cliente
            </button>
          ` : ''}
          <button id="btn-print-receipt-action" style="
            background: #10b981; color: #ffffff; border: none;
            padding: 9px 18px; border-radius: 8px; font-weight: 700;
            font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
          ">
            🖨️ Imprimir Comprobante
          </button>
          <button id="btn-close-receipt-action" style="
            background: #64748b; color: #ffffff; border: none;
            padding: 9px 16px; border-radius: 8px; font-weight: 600;
            font-size: 12px; cursor: pointer;
          ">
            ❌ Cerrar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeAll = () => {
      overlay.remove();
      if (typeof onClosed === 'function') onClosed();
    };

    overlay.querySelector('#btn-close-receipt-modal')?.addEventListener('click', closeAll);
    overlay.querySelector('#btn-close-receipt-action')?.addEventListener('click', closeAll);

    // Print action trigger
    overlay.querySelector('#btn-print-receipt-action')?.addEventListener('click', () => {
      this.printReceipt(comprobante);
    });

    // Save changes trigger
    overlay.querySelector('#btn-save-receipt-changes')?.addEventListener('click', async () => {
      const clientName = overlay.querySelector('#rcpt-client-name')?.value.trim();
      const clientDoc  = overlay.querySelector('#rcpt-client-doc')?.value.trim();
      const clientDir  = overlay.querySelector('#rcpt-client-dir')?.value.trim();
      const clientPhone= overlay.querySelector('#rcpt-client-phone')?.value.trim();
      const notes      = overlay.querySelector('#rcpt-client-notes')?.value.trim();

      const { currentUser } = GlobalStore.getState();
      const companyId = currentUser?.companyId || '';

      comprobante.cliente = {
        nombre: clientName || 'Cliente General',
        documento: clientDoc || 'C/F',
        direccion: clientDir || '',
        telefono: clientPhone || ''
      };
      comprobante.notas = notes || '';

      if (companyId && comprobante.id) {
        await this.updateComprobanteCliente(companyId, comprobante.id, comprobante.cliente);
      }
    });
  }

  /**
   * Genera una impresión en formato ticket térmico (80mm) limpia sin alterar la SPA.
   */
  static printReceipt(comprobante) {
    const printFrame = document.createElement('iframe');
    printFrame.style.cssText = 'position:fixed; top:-9999px; left:-9999px; width:0; height:0; border:none;';
    document.body.appendChild(printFrame);

    const itemsHTML = (comprobante.items || []).map(i => `
      <tr>
        <td style="padding: 2px 0;">${i.name}<br/><small style="font-size:9px;">${i.qty} x $${Number(i.price).toFixed(2)}</small></td>
        <td style="text-align: right; vertical-align: top; padding: 2px 0;">$${Number(i.total).toFixed(2)}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Comprobante ${comprobante.numeroComprobante}</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          body {
            font-family: 'Courier New', Courier, monospace;
            width: 76mm; margin: 0 auto; padding: 10px 5px;
            font-size: 11px; color: #000; background: #fff;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          .dashed-line { border-bottom: 1px dashed #000; margin: 6px 0; }
          table { width: 100%; border-collapse: collapse; }
        </style>
      </head>
      <body>
        <div class="text-center">
          <div class="bold" style="font-size:14px;">${comprobante.empresa?.nombre || 'ESTABLECIMIENTO'}</div>
          <div>RUC / NIT: ${comprobante.empresa?.ruc || 'N/A'}</div>
          <div>${comprobante.empresa?.direccion || ''}</div>
          <div class="dashed-line"></div>
          <div class="bold" style="font-size:12px;">COMPROBANTE DE PAGO</div>
          <div class="bold">Nº: ${comprobante.numeroComprobante}</div>
          <div>${comprobante.fechaFormateada || ''}</div>
          <div>Cajero: ${comprobante.vendedor || ''}</div>
        </div>

        <div class="dashed-line"></div>
        <div>
          <div><span class="bold">Cliente:</span> ${comprobante.cliente?.nombre || 'Consumidor Final'}</div>
          ${comprobante.cliente?.documento ? `<div><span class="bold">RUC/Doc:</span> ${comprobante.cliente.documento}</div>` : ''}
          ${comprobante.cliente?.direccion ? `<div><span class="bold">Dirección:</span> ${comprobante.cliente.direccion}</div>` : ''}
        </div>
        <div class="dashed-line"></div>

        <table>
          <thead>
            <tr style="border-bottom: 1px dashed #000;">
              <th style="text-align: left;">DESCRIPCIÓN</th>
              <th style="text-align: right;">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <div class="dashed-line"></div>
        <table>
          <tr>
            <td>Subtotal:</td>
            <td class="text-right">$${Number(comprobante.subtotal).toFixed(2)}</td>
          </tr>
          <tr>
            <td>IVA (15%):</td>
            <td class="text-right">$${Number(comprobante.tax).toFixed(2)}</td>
          </tr>
          <tr class="bold" style="font-size:13px;">
            <td>TOTAL A PAGAR:</td>
            <td class="text-right">$${Number(comprobante.total).toFixed(2)}</td>
          </tr>
          <tr>
            <td>Forma de Pago:</td>
            <td class="text-right">${comprobante.metodoPago}</td>
          </tr>
          ${comprobante.metodoPago === 'EFECTIVO' ? `
            <tr>
              <td>Recibido:</td>
              <td class="text-right">$${Number(comprobante.montoPagado).toFixed(2)}</td>
            </tr>
            <tr>
              <td>Cambio:</td>
              <td class="text-right">$${Number(comprobante.cambio).toFixed(2)}</td>
            </tr>
          ` : ''}
        </table>

        <div class="dashed-line"></div>
        <div class="text-center" style="margin-top:10px;">
          <div>${comprobante.notas || '¡Gracias por su compra!'}</div>
          <div style="font-size:9px; margin-top:6px; color:#555;">Ultra Administrador SaaS</div>
        </div>

        <script>
          window.onload = () => {
            window.print();
            setTimeout(() => window.frameElement.remove(), 1000);
          };
        </script>
      </body>
      </html>
    `;

    const doc = printFrame.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();
  }
}
