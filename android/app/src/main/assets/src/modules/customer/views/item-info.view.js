import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { db } from '../../../config/firebase.config.js';
import { ref, get, update, push, set } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { TimeService } from '../../../services/time.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { FirestoreService } from '../../../services/firestore.service.js';

export class ItemInfoView extends Component {
  constructor(params = {}) {
    super(params);

    this.companyId = params.companyId || '';
    this.itemId = params.itemId || '';

    this.state = {
      loading: true,
      item: null,
      company: null,
      qrSettings: {},
      error: null,
      redirectTimeout: null,
      countdown: 3,
      redirectCancelled: false,
      submittingRequest: false,
      requestMotive: '',
      requestSuccess: false
    };

    this.layout = new PageLayout({
      title: 'Identificación de Artículo',
      subtitle: 'Consulta de especificaciones, póliza de garantía y soporte de servicio técnico.',
      hideHeader: true, // We want a clean public portal experience without sidebars/headers
      contentHTML: `
        <div id="item-info-portal-container" style="min-height: 100vh; background: var(--color-bg-primary); display: flex; align-items: center; justify-content: center; padding: 20px;">
          <div class="card p-8 animate-fade-in" id="portal-card" style="max-width: 550px; width: 100%; border: 1px solid var(--color-border); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4); background: var(--color-bg-secondary);">
            <div style="text-align: center; padding: 20px;">
              <span style="font-size: 2.5rem; display: block; animation: rotate 2s linear infinite;">⏳</span>
              <h3 class="font-bold text-lg mt-3">Consultando base de datos...</h3>
              <p class="text-secondary text-xs mt-1">Verificando identificador de producto único.</p>
            </div>
          </div>
        </div>
      `
    });
  }

  async mount() {
    const el = this.layout.mount();
    this.portalContainer = el.querySelector('#item-info-portal-container');
    
    await this.loadItemAndSettings();

    return el;
  }

  async loadItemAndSettings() {
    if (!db || !this.companyId || !this.itemId) {
      this.renderError('Identificador de negocio o de artículo no provisto.');
      return;
    }

    try {
      // 1. Fetch item data
      const itemSnap = await get(ref(db, `${this.companyId}/item_qrs/${this.itemId}`));
      if (!itemSnap.exists()) {
        this.renderError('El código QR escaneado no coincide con ningún artículo registrado en nuestro sistema.');
        return;
      }
      const item = itemSnap.val();
      this.state.item = item;

      // 2. Fetch company and QR settings
      const [compSnap, settingsSnap] = await Promise.all([
        get(ref(db, `companies/${this.companyId}`)),
        get(ref(db, `${this.companyId}/qr_settings`))
      ]);

      this.state.company = compSnap.exists() ? compSnap.val() : {};
      this.state.qrSettings = settingsSnap.exists() ? settingsSnap.val() : {};

      // 3. Register scan and increment metrics
      await this.registerQrScan();

      // 4. Handle Redirection check
      this.handleScanRedirect();

    } catch (err) {
      console.error(err);
      this.renderError(`Error al conectar con el servidor: ${err.message}`);
    }
  }

  async registerQrScan() {
    try {
      const item = this.state.item;
      // Increment count
      await update(ref(db, `${this.companyId}/item_qrs/${this.itemId}`), {
        scanCount: (item.scanCount || 0) + 1,
        lastScannedAt: Date.now()
      });

      // Save to scan_history
      const scanRef = push(ref(db, `${this.companyId}/scan_history`));
      await set(scanRef, {
        id: scanRef.key,
        itemId: this.itemId,
        productId: item.productId || '',
        productName: item.productName || '',
        serialNumber: item.serialNumber || '',
        scannedAt: Date.now(),
        device: navigator.userAgent || 'Desconocido',
        location: 'Aproximada (Navegador)'
      });

      // Audit Log
      await FirestoreService.logAudit({
        action: 'ITEM_QR_SCANNED',
        companyId: this.companyId,
        description: `Artículo "${item.productName}" (Serie: ${item.serialNumber || 'Sin serie'}, ID: ${this.itemId}) fue escaneado por un cliente.`
      });
    } catch(e) {
      console.warn('[ItemInfo] Scan tracking failed:', e.message);
    }
  }

  handleScanRedirect() {
    const item = this.state.item;
    const settings = this.state.qrSettings || {};
    const redirectType = settings.defaultRedirect || 'landing';

    // Auto redirection applies ONLY if product is NOT sold
    if (item.status !== 'Vendido' && redirectType !== 'landing') {
      const targetUrl = this.getRedirectUrl(redirectType);
      if (targetUrl) {
        this.startRedirectionCountdown(targetUrl);
        return;
      }
    }

    // Otherwise, render details directly
    this.state.loading = false;
    this.renderDetails();
  }

  getRedirectUrl(type) {
    const s = this.state.qrSettings || {};
    const companyInfo = this.state.company?.informacion_local || {};
    const cPhone = companyInfo.telefono || '';
    const cleanPhone = cPhone.replace(/[^\d+]/g, '');

    switch (type) {
      case 'web': return s.webUrl || '';
      case 'catalog': return `${window.location.origin}/#/customer/menu/${this.companyId}/main`;
      case 'support': return s.supportUrl || '';
      case 'warranty': return s.warrantyUrl || '';
      case 'custom': return s.customUrl || '';
      case 'whatsapp': 
        if (!cleanPhone) return '';
        const msg = encodeURIComponent(`Hola, acabo de escanear el QR del producto "${this.state.item.productName}" (Serie: ${this.state.item.serialNumber || '—'}). Necesito consultar con ventas.`);
        return `https://wa.me/${cleanPhone.replace('+', '')}?text=${msg}`;
      default: return '';
    }
  }

  startRedirectionCountdown(url) {
    this.state.loading = false;
    this.portalContainer.innerHTML = `
      <div class="card p-8 animate-fade-in" style="max-width: 500px; width: 100%; text-align: center; border: 1px solid var(--color-border); background: var(--color-bg-secondary);">
        <div style="font-size: 3.5rem; display:block; margin-bottom: 12px;">🗺️</div>
        <h3 class="font-bold text-lg">Redirigiendo al sitio del negocio...</h3>
        <p class="text-secondary text-xs mt-2">
          El propietario ha configurado este código QR para enviarte a su portal oficial de manera automática.
        </p>
        
        <div style="font-size: 2.5rem; font-weight: 800; color: var(--color-accent); margin: 20px 0;" id="countdown-number">3</div>
        
        <button class="btn btn-secondary btn-sm w-100" id="btn-cancel-redirect">
          Cancelar y Ver Ficha de Producto
        </button>
      </div>
    `;

    this.portalContainer.querySelector('#btn-cancel-redirect')?.addEventListener('click', () => {
      this.cancelRedirection();
    });

    this.state.countdown = 3;
    const interval = setInterval(() => {
      if (this.state.redirectCancelled) {
        clearInterval(interval);
        return;
      }
      this.state.countdown--;
      const elNum = this.portalContainer.querySelector('#countdown-number');
      if (elNum) elNum.textContent = this.state.countdown;

      if (this.state.countdown <= 0) {
        clearInterval(interval);
        window.location.href = url;
      }
    }, 1000);
  }

  cancelRedirection() {
    this.state.redirectCancelled = true;
    this.renderDetails();
  }

  renderDetails() {
    const item = this.state.item;
    const company = this.state.company || {};
    const settings = this.state.qrSettings || {};
    const companyInfo = company.informacion_local || {};
    const cleanPhone = (companyInfo.telefono || '').replace(/[^\d+]/g, '');

    const isSold = item.status === 'Vendido';
    const hasWarranty = item.warrantyExpiresAt;
    
    let warrantyBadgeHTML = '';
    let warrantyTimerHTML = '';

    if (isSold) {
      if (hasWarranty) {
        const expTime = new Date(item.warrantyExpiresAt).getTime();
        const remainDays = Math.ceil((expTime - Date.now()) / (1000 * 60 * 60 * 24));

        if (remainDays > 0) {
          warrantyBadgeHTML = `<span class="badge" style="background:rgba(16,185,129,0.15); color:#34d399; font-weight:700; font-size:0.8rem; border:1px solid rgba(16,185,129,0.3);">🟢 Garantía Activa</span>`;
          warrantyTimerHTML = `
            <div style="font-size:0.75rem; color:var(--color-text-secondary); margin-top:4px;">
              Vence el <strong>${TimeService.formatDate(expTime)}</strong> (${remainDays} días restantes).
            </div>
          `;
        } else {
          warrantyBadgeHTML = `<span class="badge" style="background:rgba(239,68,68,0.15); color:#f87171; font-weight:700; font-size:0.8rem; border:1px solid rgba(239,68,68,0.3);">🔴 Garantía Vencida</span>`;
          warrantyTimerHTML = `
            <div style="font-size:0.75rem; color:var(--color-text-secondary); margin-top:4px;">
              Expiró el <strong>${TimeService.formatDate(expTime)}</strong>.
            </div>
          `;
        }
      } else {
        warrantyBadgeHTML = `<span class="badge" style="background:rgba(156,163,175,0.15); color:#9ca3af; font-weight:700; font-size:0.8rem; border:1px solid rgba(156,163,175,0.3);">⚪ Sin Garantía Registrada</span>`;
      }
    }

    const stateBadgeHTML = {
      Disponible: `<span class="badge" style="background:rgba(16,185,129,0.1); color:#34d399;">Disponible</span>`,
      'En exhibición': `<span class="badge" style="background:rgba(59,130,246,0.1); color:#60a5fa;">En Exhibición</span>`,
      'En reparación': `<span class="badge" style="background:rgba(245,158,11,0.1); color:#fbbf24;">En Reparación</span>`,
      Devuelto: `<span class="badge" style="background:rgba(156,163,175,0.1); color:#9ca3af;">Devuelto</span>`,
      Vendido: `<span class="badge" style="background:rgba(139,92,246,0.1); color:#a78bfa;">Vendido</span>`
    }[item.status] || `<span class="badge">${item.status}</span>`;

    // FAQ list config
    const faqHTML = settings.faqContent
      ? `
        <div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:12px; margin-top:8px;">
          <h4 class="font-bold text-xs uppercase tracking-wider mb-2" style="color:var(--color-accent);">Manuales y Preguntas Frecuentes</h4>
          <div style="font-size:0.78rem; color:var(--color-text-secondary); line-height:1.5; white-space:pre-line;">
            ${settings.faqContent}
          </div>
        </div>
      `
      : '';

    // Service History logic
    let historyTimelineHTML = '';
    if (isSold && settings.showServiceHistoryToClient === true) {
      const history = item.service_history ? Object.values(item.service_history) : [];
      if (history.length > 0) {
        const historyList = history
          .sort((a, b) => b.date - a.date)
          .map(h => `
            <div style="display:flex; gap:10px; font-size:0.75rem; border-left:2px solid var(--color-border); padding-left:12px; margin-left:6px; position:relative; padding-bottom:10px;">
              <span style="position:absolute; left:-5px; top:4px; width:8px; height:8px; border-radius:50%; background:var(--color-accent);"></span>
              <div>
                <strong style="color:var(--color-text-primary);">${TimeService.formatDate(h.date)}</strong> — ${h.type || 'Servicio'}
                <div style="color:var(--color-text-secondary); font-size:0.7rem; margin-top:2px;">${h.description}</div>
              </div>
            </div>
          `).join('');

        historyTimelineHTML = `
          <div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:12px; margin-top:8px;">
            <h4 class="font-bold text-xs uppercase tracking-wider mb-3" style="color:var(--color-accent);">🔧 Historial de Servicios del Artículo</h4>
            <div style="display:flex; flex-direction:column; gap:4px;">
              ${historyList}
            </div>
          </div>
        `;
      }
    }

    // Call / Contact CTAs
    const msg = encodeURIComponent(`Hola soporte, solicito asistencia para mi artículo "${item.productName}" (Serie: ${item.serialNumber || '—'}).`);
    const whatsappBtnHTML = cleanPhone 
      ? `<a class="btn btn-secondary w-100" href="https://wa.me/${cleanPhone.replace('+', '')}?text=${msg}" target="_blank" rel="noopener" style="background:#25d366; color:#fff; font-weight:700; border:none; display:flex; align-items:center; justify-content:center; gap:8px;">
          💬 Soporte por WhatsApp
         </a>`
      : '';

    this.portalContainer.innerHTML = `
      <div class="card p-6 animate-fade-in" style="max-width: 550px; width: 100%; border: 1px solid var(--color-border); background: var(--color-bg-secondary);">
        
        <!-- Header Brand Info -->
        <div style="display:flex; align-items:center; gap:12px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:12px; margin-bottom:12px;">
          ${companyInfo.logo 
            ? `<img src="${companyInfo.logo}" alt="Logo" style="width:45px;height:45px;border-radius:6px;object-fit:cover;" />` 
            : `<div style="width:45px;height:45px;border-radius:6px;background:var(--color-bg-tertiary);display:flex;align-items:center;justify-content:center;font-size:1.5rem;">🏢</div>`
          }
          <div>
            <h3 class="font-bold text-md" style="margin:0; color:var(--color-text-primary);">${companyInfo.nombre || company.name || 'Negocio Oficial'}</h3>
            <span class="text-secondary" style="font-size:0.7rem;">Soporte Técnico Autorizado</span>
          </div>
        </div>

        <!-- Product Presentation -->
        <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:14px; border-radius:8px; display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <strong style="font-size:1.1rem; color:var(--color-text-primary);">${item.productName}</strong>
              <span class="text-secondary" style="font-size:0.75rem; display:block; margin-top:2px;">Marca: ${item.brand || '—'} ${item.model ? `· Modelo: ${item.model}` : ''}</span>
            </div>
            <div>
              ${stateBadgeHTML}
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; border-top:1px solid rgba(255,255,255,0.03); padding-top:8px; font-size:0.75rem; font-family:monospace; color:var(--color-text-secondary);">
            <div>SKU: <strong style="color:var(--color-text-primary);">${item.sku || '—'}</strong></div>
            <div>Serie: <strong style="color:var(--color-text-primary);">${item.serialNumber || 'Sin serie'}</strong></div>
          </div>
        </div>

        <!-- Warranty Section (Vendido only) -->
        ${isSold ? `
          <div style="background:rgba(255,255,255,0.01); border:1px solid rgba(255,255,255,0.03); padding:12px; border-radius:8px; margin-bottom:12px;">
            <strong style="font-size:0.78rem; color:var(--color-text-primary); display:block; margin-bottom:4px;">🛡️ Cobertura de Garantía:</strong>
            ${warrantyBadgeHTML}
            ${warrantyTimerHTML}
          </div>
        ` : ''}

        <!-- Interactive timeline -->
        ${historyTimelineHTML}

        <!-- FAQ and Manuals -->
        ${faqHTML}

        <!-- Action CTAs -->
        <div style="display:flex; flex-direction:column; gap:8px; margin-top:16px; border-top:1px solid rgba(255,255,255,0.05); padding-top:12px;">
          ${isSold ? `
            <button class="btn btn-primary w-100" id="btn-request-service">🔧 Solicitar Reparación / Soporte</button>
            ${whatsappBtnHTML}
          ` : `
            <a class="btn btn-primary w-100" href="#/customer/menu/${this.companyId}/main">🛍️ Comprar / Consultar Catálogo</a>
          `}
        </div>

        <!-- Form overlay request (Vendido only) -->
        <div id="service-request-form-overlay" style="display:none; border-top:1px dashed rgba(255,255,255,0.1); padding-top:12px; margin-top:12px;">
          <h4 class="font-bold text-xs uppercase tracking-wider mb-2" style="color:var(--color-accent);">Reportar Falla o Solicitar Servicio</h4>
          
          <div id="service-form-status-container">
            <div class="form-group" style="margin-bottom:8px;">
              <label class="form-label" for="inp-service-desc">Describe el inconveniente o avería <span class="form-label-required"></span></label>
              <textarea id="inp-service-desc" class="input input-md" style="height:70px; padding:8px; font-size:0.75rem;" placeholder="Ej. El compresor no enciende y emite un pitido..." required></textarea>
            </div>
            <div style="display:flex; justify-content:space-between; gap:6px;">
              <button class="btn btn-secondary btn-xs" id="btn-close-service-form">Cancelar</button>
              <button class="btn btn-primary btn-xs" id="btn-submit-service-form">Enviar Solicitud</button>
            </div>
          </div>
        </div>

      </div>
    `;

    // Bind request repair button
    if (isSold) {
      const overlay = this.portalContainer.querySelector('#service-request-form-overlay');
      const reqBtn = this.portalContainer.querySelector('#btn-request-service');
      const closeBtn = this.portalContainer.querySelector('#btn-close-service-form');
      const submitFormBtn = this.portalContainer.querySelector('#btn-submit-service-form');

      reqBtn?.addEventListener('click', () => {
        overlay.style.display = 'block';
        reqBtn.style.display = 'none';
        overlay.scrollIntoView({ behavior: 'smooth' });
      });

      closeBtn?.addEventListener('click', () => {
        overlay.style.display = 'none';
        reqBtn.style.display = 'block';
      });

      submitFormBtn?.addEventListener('click', async () => {
        const descInput = this.portalContainer.querySelector('#inp-service-desc');
        const description = descInput ? descInput.value.trim() : '';

        if (!description) {
          alert('Por favor describe la falla.');
          return;
        }

        submitFormBtn.disabled = true;
        submitFormBtn.textContent = 'Enviando...';

        try {
          const serviceId = await FirestoreService.createPublicServiceRequest(this.companyId, {
            itemId: this.itemId,
            productId: item.productId || '',
            productName: item.productName,
            sku: item.sku || '',
            serialNumber: item.serialNumber || 'Sin serie',
            description: `[Reporte QR] ${description}`,
            priority: 'Media',
            status: 'PENDIENTE',
            source: 'QR_TAG'
          });

          // Log Audit
          await FirestoreService.logAudit({
            action: 'ITEM_SERVICE_REQUESTED',
            companyId: this.companyId,
            description: `Se registró una solicitud de servicio técnico pública para el artículo "${item.productName}" (Serie: ${item.serialNumber || '—'}, ID de solicitud: ${serviceId}).`
          });

          // Display success state inside form overlay
          this.portalContainer.querySelector('#service-form-status-container').innerHTML = `
            <div style="text-align:center; padding:10px 0; color:#34d399; font-size:0.78rem;">
              🎉 Solicitud enviada correctamente con el folio <strong>${serviceId.substring(0,8).toUpperCase()}</strong>. Un asesor te contactará pronto.
            </div>
          `;

          setTimeout(() => {
            overlay.style.display = 'none';
            reqBtn.style.display = 'block';
          }, 3500);

        } catch (e) {
          console.error(e);
          alert('Error al enviar la solicitud: ' + e.message);
          submitFormBtn.disabled = false;
          submitFormBtn.textContent = 'Enviar Solicitud';
        }
      });
    }
  }

  renderError(msg) {
    this.portalContainer.innerHTML = `
      <div class="card p-8 text-center animate-fade-in" style="max-width: 500px; width: 100%; border: 1px solid rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.02);">
        <div style="font-size: 3.5rem; display:block; margin-bottom: 12px;">⚠️</div>
        <h3 class="font-bold text-lg" style="color:var(--color-error);">Código QR No Encontrado</h3>
        <p class="text-secondary text-sm mt-2">
          ${msg}
        </p>
        <div style="margin-top: 20px; border-top:1px solid rgba(255,255,255,0.05); padding-top:12px;">
          <a class="btn btn-secondary btn-sm" href="#/login">Ir al Portal de Acceso</a>
        </div>
      </div>
    `;
  }

  unmount() {
    this.layout.unmount();
    super.unmount();
  }
}
