import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Chart } from '../../../components/data/chart.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { TimeService } from '../../../services/time.service.js';

export class CatalogSettingsView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || '';

    this.state = {
      activeTab: 'customize', // customize | stats | whatsapp
      config: null,
      stats: null,
      products: []
    };

    // Device distribution chart
    this.chart = new Chart({
      type: 'bar',
      labels: ['Móvil', 'Tablet', 'Computadora'],
      datasets: [
        { label: 'Visitas', data: [0, 0, 0], color: '#7c75ff' }
      ]
    });

    this.layout = new PageLayout({
      title: 'Configuración de Página Pública',
      subtitle: 'Personaliza el diseño de tu catálogo digital público y mide el interés de tus clientes.',
      actionHTML: `
        <a id="lnk-visit-public" href="#/${this.companyId}" target="_blank" class="btn btn-secondary btn-sm" style="text-decoration:none; display:inline-flex; align-items:center; gap:8px;">
          🌐 Ver Página Pública
        </a>
      `,
      contentHTML: `
        <!-- Tabs Selector -->
        <div class="settings-tabs">
          <button class="settings-tab-btn active" id="tab-customize">🎨 Personalización</button>
          <button class="settings-tab-btn" id="tab-stats">📊 Estadísticas de Tráfico</button>
          <button class="settings-tab-btn" id="tab-whatsapp">💬 Integración API WhatsApp</button>
        </div>

        <div id="settings-tab-content">
          <!-- Dynamically populated -->
        </div>
      `
    });

    this.listeners = [];
  }

  mount() {
    const element = this.layout.mount();
    this.afterMount(element);
    this.subscribeToData(element);
    this.renderTabContent(element);
    return element;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    const btnCust = root.querySelector('#tab-customize');
    const btnStats = root.querySelector('#tab-stats');
    const btnWA = root.querySelector('#tab-whatsapp');

    if (btnCust && btnStats && btnWA) {
      btnCust.addEventListener('click', () => {
        this.state.activeTab = 'customize';
        btnCust.classList.add('active');
        btnStats.classList.remove('active');
        btnWA.classList.remove('active');
        this.renderTabContent(root);
      });

      btnStats.addEventListener('click', () => {
        this.state.activeTab = 'stats';
        btnStats.classList.add('active');
        btnCust.classList.remove('active');
        btnWA.classList.remove('active');
        this.renderTabContent(root);
      });

      btnWA.addEventListener('click', () => {
        this.state.activeTab = 'whatsapp';
        btnWA.classList.add('active');
        btnCust.classList.remove('active');
        btnStats.classList.remove('active');
        this.renderTabContent(root);
      });
    }
  }

  subscribeToData(element) {
    try {
      // 1. Listen to catalog settings config
      const configListener = FirestoreService.listenToPathRaw(`configuracion_catalogo/${this.companyId}`, (config) => {
        this.state.config = config || {};
        if (this.state.activeTab === 'customize' || this.state.activeTab === 'whatsapp') {
          this.renderTabContent(element || this.layout.element);
        }
      });
      this.listeners.push(configListener);

      // 2. Listen to statistics
      const statsListener = FirestoreService.listenToTenant('estadisticas', (stats) => {
        this.state.stats = stats || {};
        if (this.state.activeTab === 'stats') {
          this.renderTabContent(element || this.layout.element);
          this.updateStatsChart();
        }
      });
      this.listeners.push(statsListener);

      // 3. Listen to products to resolve product names in views
      const productsListener = FirestoreService.listenToTenant('productos', (products) => {
        this.state.products = products || [];
        if (this.state.activeTab === 'stats') {
          this.renderTabContent(element || this.layout.element);
        }
      });
      this.listeners.push(productsListener);

    } catch (e) {
      console.warn('[CatalogSettingsView] RTDB listening error:', e.message);
    }
  }

  renderTabContent(element) {
    const container = element.querySelector('#settings-tab-content');
    if (!container) return;

    if (this.state.activeTab === 'customize') {
      const cfg = this.state.config || {};
      container.innerHTML = `
        <form id="customize-catalog-form" class="card p-5 animate-fade-in" style="display:flex; flex-direction:column; gap:var(--space-4); color:var(--color-text-primary);">
          <h3 class="text-lg font-semibold mb-2">Identidad Visual</h3>
          
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-4);">
            <div class="form-group">
              <label class="form-label" for="cat-theme">Tema de Color Base</label>
              <select id="cat-theme" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
                <option value="dark" ${cfg.theme === 'dark' ? 'selected' : ''}>Modo Oscuro Premium (Recomendado)</option>
                <option value="light" ${cfg.theme === 'light' ? 'selected' : ''}>Modo Claro Limpio</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="cat-primary-color">Color de Acento (Botones, Destacados)</label>
              <div style="display:flex; gap:8px; align-items:center;">
                <input type="color" id="cat-primary-color" style="border:none; background:none; cursor:pointer; width:40px; height:40px; padding:0;" value="${cfg.colors?.primary || '#7c75ff'}" />
                <span class="text-xs text-secondary" style="font-family:monospace;">${cfg.colors?.primary || '#7c75ff'}</span>
              </div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-4);">
            <div class="form-group">
              <label class="form-label" for="cat-secondary-color">Color secundario</label>
              <input type="color" id="cat-secondary-color" style="border:none; background:none; cursor:pointer; width:40px; height:40px; padding:0;" value="${cfg.colors?.secondary || '#16a34a'}" />
            </div>
            <div class="form-group">
              <label class="form-label" for="cat-background-color">Color de fondo</label>
              <input type="color" id="cat-background-color" style="border:none; background:none; cursor:pointer; width:40px; height:40px; padding:0;" value="${cfg.colors?.background || '#0f172a'}" />
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-4);">
            <div class="form-group">
              <label class="form-label" for="cat-logo">URL de Logotipo (Cuadrado)</label>
              <input type="url" id="cat-logo" class="input input-md" placeholder="https://ejemplo.com/mi-logo.png" value="${cfg.logo || ''}" />
            </div>
            <div class="form-group">
              <label class="form-label" for="cat-cover">URL de Imagen de Portada (Banner superior)</label>
              <input type="url" id="cat-cover" class="input input-md" placeholder="https://ejemplo.com/portada.jpg" value="${cfg.cover || ''}" />
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-4);">
            <div class="form-group">
              <label class="form-label" for="cat-gallery">Galería (URLs separadas por coma)</label>
              <input type="text" id="cat-gallery" class="input input-md" value="${(cfg.gallery || []).join(', ')}" />
            </div>
            <div class="form-group">
              <label class="form-label" for="cat-video">Video promocional</label>
              <input type="url" id="cat-video" class="input input-md" value="${cfg.video || ''}" />
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-4);">
            <div class="form-group">
              <label class="form-label" for="cat-font">Tipografía</label>
              <input type="text" id="cat-font" class="input input-md" value="${cfg.typography || ''}" />
            </div>
            <div class="form-group">
              <label class="form-label" for="cat-favicon">Favicon</label>
              <input type="url" id="cat-favicon" class="input input-md" value="${cfg.favicon || ''}" />
            </div>
          </div>

          <hr style="border:0; border-top:1px solid var(--color-border); margin: var(--space-3) 0;" />
          <h3 class="text-lg font-semibold mb-2">Redes Sociales y Enlaces de Contacto</h3>
          
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-4);">
            <div class="form-group">
              <label class="form-label" for="cat-whatsapp">Teléfono de WhatsApp (Formato internacional, Ej: 5215512345678)</label>
              <input type="text" id="cat-whatsapp" class="input input-md" placeholder="Sin símbolos +, sólo números" value="${cfg.socials?.whatsapp || ''}" />
            </div>
            <div class="form-group">
              <label class="form-label" for="cat-telegram">Usuario de Telegram (Sin @)</label>
              <input type="text" id="cat-telegram" class="input input-md" placeholder="mi_negocio_tg" value="${cfg.socials?.telegram || ''}" />
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-4);">
            <div class="form-group">
              <label class="form-label" for="cat-contact">Información de contacto</label>
              <textarea id="cat-contact" class="input input-md" style="height:70px; padding:var(--space-2); resize:vertical;">${cfg.contactInfo || ''}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label" for="cat-hours">Horarios</label>
              <textarea id="cat-hours" class="input input-md" style="height:70px; padding:var(--space-2); resize:vertical;">${cfg.hours || ''}</textarea>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-4);">
            <div class="form-group">
              <label class="form-label" for="cat-seo-title">Título SEO</label>
              <input type="text" id="cat-seo-title" class="input input-md" value="${cfg.seo?.title || ''}" />
            </div>
            <div class="form-group">
              <label class="form-label" for="cat-seo-description">Descripción SEO</label>
              <input type="text" id="cat-seo-description" class="input input-md" value="${cfg.seo?.description || ''}" />
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-4);">
            <div class="form-group">
              <label class="form-label" for="cat-facebook">Facebook username o página</label>
              <input type="text" id="cat-facebook" class="input input-md" placeholder="minegocio" value="${cfg.socials?.facebook || ''}" />
            </div>
            <div class="form-group">
              <label class="form-label" for="cat-instagram">Instagram username (Sin @)</label>
              <input type="text" id="cat-instagram" class="input input-md" placeholder="minegocio" value="${cfg.socials?.instagram || ''}" />
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-4);">
            <div class="form-group">
              <label class="form-label" for="cat-tiktok">TikTok username (Sin @)</label>
              <input type="text" id="cat-tiktok" class="input input-md" placeholder="minegocio" value="${cfg.socials?.tiktok || ''}" />
            </div>
            <div class="form-group">
              <label class="form-label" for="cat-website">Sitio web oficial</label>
              <input type="url" id="cat-website" class="input input-md" placeholder="https://minegocio.com" value="${cfg.socials?.website || ''}" />
            </div>
          </div>

          <div class="form-group">
            <label class="d-flex align-items-center gap-2 font-medium" style="cursor:pointer;">
              <input type="checkbox" id="cat-enable-reviews" ${cfg.enableReviews ? 'checked' : ''} style="accent-color: var(--color-accent);" />
              <span>Habilitar opiniones y calificaciones de clientes en productos</span>
            </label>
          </div>

          <button type="button" class="btn btn-primary btn-md align-self-end mt-4" id="btn-save-cust" style="padding: 0 var(--space-4);">
            Guardar Cambios
          </button>
        </form>
      `;

      const saveBtn = container.querySelector('#btn-save-cust');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => this.saveCustomization());
      }

    } else if (this.state.activeTab === 'stats') {
      const stats = this.state.stats || {};
      const visits = stats.visitas?.total || 0;
      const wsClicks = stats.clics?.whatsapp || 0;
      const callClicks = stats.clics?.telefono || 0;

      const socialMediaKeys = ['facebook', 'instagram', 'tiktok', 'website', 'telegram'];
      const socClicks = socialMediaKeys.reduce((acc, k) => acc + ((stats.clics && stats.clics[k]) || 0), 0);

      const topViewsHTML = this.state.stats?.productosVistos 
        ? Object.entries(this.state.stats.productosVistos)
        .map(([id, count]) => {
          const prod = this.state.products.find(p => p.id === id);
          return { name: prod ? prod.name : `Prod #${id}`, count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(item => `
          <div class="d-flex justify-content-between align-items-center" style="padding:var(--space-2) 0; border-bottom:1px solid var(--color-border); font-size:0.875rem;">
            <span>${item.name}</span>
            <strong class="text-primary">${item.count} vistas</strong>
          </div>
        `).join('') : '<p class="text-xs text-secondary text-center py-4">No hay productos vistos registrados.</p>';

      container.innerHTML = `
        <div class="grid-stats animate-fade-in">
          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Visitas Totales</span>
              <div class="kpi-icon kpi-icon-accent">📈</div>
            </div>
            <h3 class="kpi-value">${visits}</h3>
            <span class="text-xs text-secondary">Personas que abrieron la página</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Clics de WhatsApp</span>
              <div class="kpi-icon kpi-icon-success">💬</div>
            </div>
            <h3 class="kpi-value text-success">${wsClicks}</h3>
            <span class="text-xs text-secondary">Consultas por mensajería</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Consultas Telefónicas</span>
              <div class="kpi-icon kpi-icon-warning">📞</div>
            </div>
            <h3 class="kpi-value text-warning">${callClicks}</h3>
            <span class="text-xs text-secondary">Intentos de llamadas de clientes</span>
          </div>

          <div class="kpi-card hover-lift">
            <div class="kpi-card-header">
              <span class="kpi-label">Visitas a Redes</span>
              <div class="kpi-icon kpi-icon-info">🌐</div>
            </div>
            <h3 class="kpi-value text-info">${socClicks}</h3>
            <span class="text-xs text-secondary">Clics en perfiles sociales</span>
          </div>
        </div>

        <div class="grid-responsive mt-6">
          <div class="col-8 card p-5">
            <h3 class="text-lg font-semibold mb-4">Dispositivos de los Clientes</h3>
            <div id="stats-device-chart" style="width: 100%; height: 260px;"></div>
          </div>
          <div class="col-4 card p-5">
            <h3 class="text-lg font-semibold mb-4">Productos más vistos</h3>
            <div class="d-flex flex-column gap-2">
              ${topViewsHTML}
            </div>
          </div>
        </div>
      `;

      // Inject device chart
      const chartContainer = container.querySelector('#stats-device-chart');
      if (chartContainer) {
        chartContainer.appendChild(this.chart.mount());
        this.updateStatsChart();
      }

    } else if (this.state.activeTab === 'whatsapp') {
      const { currentCompany } = GlobalStore.getState();
      const isWhatsAppEnabled = currentCompany?.config?.enableWhatsApp === true;

      if (!isWhatsAppEnabled) {
        container.innerHTML = `
          <div class="card p-6 text-center animate-fade-in" style="display:flex; flex-direction:column; align-items:center; gap:var(--space-4); max-width:600px; margin: 2rem auto; color: var(--color-text-primary);">
            <div style="font-size: 4rem;">🔒</div>
            <h3 class="text-xl font-bold">WhatsApp API Premium Requerido</h3>
            <p class="text-secondary" style="line-height:1.6; font-size:0.9rem;">
              La integración con la API de WhatsApp (envío de recibos de cobro automáticos, notificaciones de comandas en tiempo real y alertas de inventario) es una función adicional que requiere la activación de la licencia por el Administrador.
            </p>
            <div style="background:var(--color-bg-secondary); border:1px solid var(--color-border); padding: 12px; border-radius: var(--radius-md); font-size:0.8rem; color:var(--color-text-secondary); text-align:left; width: 100%;">
              🌟 <strong>Ventajas de activar la API de WhatsApp:</strong>
              <ul style="margin: 6px 0 0; padding-left: 20px; line-height:1.5;">
                <li>Envío directo de comprobantes de crédito ("sistema de crédito").</li>
                <li>Notificaciones de cobro automáticas según el día de pago.</li>
                <li>Reportes automáticos de cierre de caja directos a tu celular.</li>
              </ul>
            </div>
            <button class="btn btn-primary btn-md mt-2" id="btn-upgrade-wa" type="button">Solicitar Activación de WhatsApp API</button>
          </div>
        `;
        container.querySelector('#btn-upgrade-wa')?.addEventListener('click', () => {
          alert('Ponte en contacto con soporte escribiendo a soporte@ultraadmin.com para actualizar tu plan a Premium.');
        });
        return;
      }

      const cfg = this.state.config || {};
      const api = cfg.whatsappApi || {};
      const templates = api.templates || {};

      const webhookUrl = `${window.location.origin}/webhook/whatsapp/${this.companyId}`;

      container.innerHTML = `
        <div class="grid-responsive animate-fade-in" style="color:var(--color-text-primary); display: grid; grid-template-columns: 1.2fr 1fr; gap: var(--space-5);">
          
          <!-- Left Column: Settings -->
          <div class="d-flex flex-column gap-4">
            
            <!-- Credentials Card -->
            <form id="whatsapp-config-form" class="card p-5 d-flex flex-column gap-3">
              <h3 class="text-md font-bold mb-2">🔑 Credenciales de Conexión</h3>
              
              <div class="form-group">
                <label class="form-label" for="wa-provider">Proveedor del API de WhatsApp</label>
                <select id="wa-provider" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
                  <option value="META" ${api.provider === 'META' ? 'selected' : ''}>Meta Cloud API (Oficial y Directo)</option>
                  <option value="TWILIO" ${api.provider === 'TWILIO' ? 'selected' : ''}>Twilio Messaging API Gateway</option>
                  <option value="EMULATOR" ${api.provider === 'EMULATOR' || !api.provider ? 'selected' : ''}>Emulador de Desarrollo (Mock)</option>
                </select>
              </div>

              <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">
                <div class="form-group">
                  <label class="form-label" for="wa-phone-id">Phone Number ID</label>
                  <input type="text" id="wa-phone-id" class="input input-md" placeholder="Ej. 108876251299" value="${api.phoneNumberId || ''}" />
                </div>
                <div class="form-group">
                  <label class="form-label" for="wa-account-id">WABA Account ID</label>
                  <input type="text" id="wa-account-id" class="input input-md" placeholder="Ej. 103212874112" value="${api.businessAccountId || ''}" />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="wa-token">Access Token de WhatsApp API (System User)</label>
                <div style="position:relative; display:flex; align-items:center;">
                  <input type="password" id="wa-token" class="input input-md" style="padding-right:40px;" placeholder="EAAGb..." value="${api.accessToken || ''}" />
                  <button type="button" id="btn-toggle-wa-token" style="position:absolute; right:10px; border:none; background:none; color:var(--color-text-secondary); cursor:pointer; font-size:1.1rem;">👁️</button>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Webhook Endpoint de Entrada (Configuración en Meta/Twilio)</label>
                <input type="text" class="input input-md" value="${webhookUrl}" readonly style="opacity:0.7; font-family:monospace; font-size:0.8rem;" />
              </div>

              <button type="button" class="btn btn-primary btn-sm align-self-end mt-2" id="btn-save-wa">Guardar Configuración API</button>
            </form>

            <!-- Templates Card -->
            <div class="card p-5 d-flex flex-column gap-3">
              <h3 class="text-md font-bold mb-2">📋 Plantillas de Mensajes</h3>
              <p class="text-secondary text-xs" style="margin:0;">Configura las variables utilizando <code>{{cliente}}</code>, <code>{{monto}}</code>, <code>{{interes}}</code>, <code>{{cuota}}</code>, <code>{{vencimiento}}</code>, <code>{{url}}</code>.</p>
              
              <div class="form-group">
                <label class="form-label" for="wa-tmpl-credit">Mensaje de Generación de Crédito (CREDIT_RECEIPT)</label>
                <textarea id="wa-tmpl-credit" class="input input-md" style="height:70px; padding:var(--space-2); font-size:0.8rem; resize:vertical;">${templates.CREDIT_RECEIPT || 'Estimado(a) {{cliente}}, le notificamos la apertura de su crédito por un monto de {{monto}} al {{interes}}% de interés mensual. Cuota estimada: {{cuota}}. Próxima fecha de cobro: {{vencimiento}}. Gracias por su preferencia.'}</textarea>
              </div>

              <div class="form-group">
                <label class="form-label" for="wa-tmpl-order">Confirmación de Pedidos / Ventas (ORDER_CONFIRMATION)</label>
                <textarea id="wa-tmpl-order" class="input input-md" style="height:70px; padding:var(--space-2); font-size:0.8rem; resize:vertical;">${templates.ORDER_CONFIRMATION || '¡Hola {{cliente}}! Tu pedido en {{negocio}} ha sido confirmado. Monto total: {{monto}}. Método de pago: {{metodo}}. Estaremos actualizando el estado de tu entrega.'}</textarea>
              </div>

              <div class="form-group">
                <label class="form-label" for="wa-tmpl-promo">Envío de Promociones / Difusión (PROMOTION)</label>
                <textarea id="wa-tmpl-promo" class="input input-md" style="height:70px; padding:var(--space-2); font-size:0.8rem; resize:vertical;">${templates.PROMOTION || '¡Atención {{cliente}}! Tenemos promociones especiales en stock para ti hoy. Consulta nuestro catálogo en línea: {{url}}'}</textarea>
              </div>
            </div>

          </div>

          <!-- Right Column: Console & Logs -->
          <div class="d-flex flex-column gap-4" style="border-left: 1px solid var(--color-border); padding-left: var(--space-4);">
            
            <!-- Connection Console Tester -->
            <div class="card p-5 d-flex flex-column gap-3">
              <h3 class="text-md font-bold mb-1">🔌 Consola de Prueba de Conexión</h3>
              <p class="text-secondary text-xs" style="margin:0;">Envía un mensaje "Hello World" a tu celular para validar las credenciales configuradas.</p>
              
              <div class="form-group mt-2">
                <label class="form-label" for="wa-test-phone">Teléfono de Prueba (Ej: 5215512345678)</label>
                <div class="d-flex gap-2">
                  <input type="tel" id="wa-test-phone" class="input input-md" placeholder="5215512345678" style="flex:1;" />
                  <button class="btn btn-secondary btn-sm" id="btn-test-wa-conn" type="button" style="padding:0 var(--space-3);">Probar API</button>
                </div>
              </div>

              <!-- Dev Interactive Terminal logs -->
              <div id="wa-test-terminal" class="p-3" style="display:none; background:#0f172a; border: 1px solid var(--color-border); border-radius:var(--radius-md); font-family:monospace; font-size:0.75rem; white-space:pre-wrap; max-height:220px; overflow-y:auto; color:#a7f3d0; line-height:1.4;">
              </div>
            </div>

            <!-- Simulated live delivery log summary -->
            <div class="card p-5 d-flex flex-column gap-3">
              <h3 class="text-md font-bold">📡 Registro de Envíos del Establecimiento</h3>
              <div id="wa-logs-list" class="d-flex flex-column gap-2" style="max-height: 280px; overflow-y:auto; padding-right:4px;">
                <div class="text-center py-4 text-secondary text-xs">Cargando logs de envíos...</div>
              </div>
            </div>

          </div>
        </div>
      `;

      // Bind UI event listeners dynamically
      const btnToggle = container.querySelector('#btn-toggle-wa-token');
      const tokenInput = container.querySelector('#wa-token');
      if (btnToggle && tokenInput) {
        btnToggle.addEventListener('click', () => {
          const isSecret = tokenInput.type === 'password';
          tokenInput.type = isSecret ? 'text' : 'password';
          btnToggle.textContent = isSecret ? '🙈' : '👁️';
        });
      }

      container.querySelector('#btn-save-wa')?.addEventListener('click', () => this.saveWhatsAppConfig());
      container.querySelector('#btn-test-wa-conn')?.addEventListener('click', () => this.runWhatsAppTest());

      this.subscribeToWhatsAppLogs(container);
    }
  }

  async saveWhatsAppConfig() {
    const btn = this.layout.$('#btn-save-wa');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Guardando...';
    }

    const provider = this.layout.$('#wa-provider').value;
    const phoneNumberId = this.layout.$('#wa-phone-id').value.trim();
    const businessAccountId = this.layout.$('#wa-account-id').value.trim();
    const accessToken = this.layout.$('#wa-token').value.trim();

    const creditInvoice = this.layout.$('#wa-tmpl-credit').value.trim();
    const orderReceipt = this.layout.$('#wa-tmpl-order').value.trim();
    const promotion = this.layout.$('#wa-tmpl-promo').value.trim();

    const payload = {
      ...this.state.config,
      whatsappApi: {
        provider,
        phoneNumberId,
        businessAccountId,
        accessToken,
        templates: {
          CREDIT_RECEIPT: creditInvoice,
          ORDER_CONFIRMATION: orderReceipt,
          PROMOTION: promotion
        }
      },
      updatedAt: Date.now(),
      updatedAtLocal: TimeService.timestamp()
    };

    try {
      await FirestoreService.setGlobal(this.companyId, 'configuracion_catalogo', payload);
      NotificationService.success('Configuración de WhatsApp API guardada con éxito.');
    } catch (err) {
      console.error('[CatalogSettingsView] Error saving whatsapp config:', err);
      alert(`Error al guardar configuración: ${err.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Guardar Configuración API';
      }
    }
  }

  runWhatsAppTest() {
    const testPhoneInput = this.layout.$('#wa-test-phone');
    const testPhone = testPhoneInput ? testPhoneInput.value.trim() : '';

    if (!testPhone) {
      alert('Por favor ingresa un número de teléfono para enviar el mensaje de prueba.');
      return;
    }

    const settings = {
      provider: this.layout.$('#wa-provider').value,
      phoneNumberId: this.layout.$('#wa-phone-id').value.trim(),
      businessAccountId: this.layout.$('#wa-account-id').value.trim(),
      accessToken: this.layout.$('#wa-token').value.trim()
    };

    const terminal = this.layout.$('#wa-test-terminal');
    if (terminal) {
      terminal.style.display = 'block';
      terminal.innerHTML = `<span style="color:#7c75ff;">&gt; Iniciando prueba de handshake con pasarela ${settings.provider}...</span>\n`;
    }

    setTimeout(() => {
      import('../../../services/whatsapp.service.js').then(({ WhatsAppService }) => {
        const result = WhatsAppService.testConnection(settings, testPhone);
        if (terminal) {
          terminal.innerHTML += `<span style="color:#34d399;">&gt; Petición API POST enviada con éxito. Latencia: ${result.response.simulationMeta.latencyMs}ms</span>\n`;
          terminal.innerHTML += `<span style="color:#e2e8f0;">\n<strong>[HTTP REQUEST PAYLOAD]:</strong>\n${JSON.stringify(result.request, null, 2)}</span>\n`;
          terminal.innerHTML += `<span style="color:#e2e8f0;">\n<strong>[HTTP RESPONSE FROM GATEWAY]:</strong>\n${JSON.stringify(result.response, null, 2)}</span>\n`;
          terminal.scrollTop = terminal.scrollHeight;
        }
        NotificationService.success('Mensaje de prueba WhatsApp enviado (Simulado).');
      });
    }, 1200);
  }

  subscribeToWhatsAppLogs(container) {
    try {
      const logsListener = FirestoreService.listenToTenant('whatsapp_logs', (logs) => {
        const logsList = container.querySelector('#wa-logs-list');
        if (!logsList) return;

        const list = logs || [];
        if (list.length === 0) {
          logsList.innerHTML = `<div class="text-center py-4 text-secondary text-xs">No hay envíos registrados.</div>`;
          return;
        }

        // Sort by timestamp descending
        const sorted = [...list].sort((a, b) => b.timestamp - a.timestamp);

        logsList.innerHTML = sorted.map(log => `
          <div class="p-2" style="border-bottom: 1px solid var(--color-border); font-size: 0.75rem;">
            <div style="display:flex; justify-content:space-between; margin-bottom: 2px;">
              <span class="font-semibold text-primary">📞 ${log.to}</span>
              <span style="color:var(--color-success); font-weight:bold;">${log.status}</span>
            </div>
            <div class="text-secondary" style="font-size:0.7rem; line-height:1.3; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              ${log.messageContent || log.templateName}
            </div>
            <div class="text-secondary text-right" style="font-size:0.65rem; margin-top:2px;">
              ${new Date(log.timestamp).toLocaleString()} (${log.gateway})
            </div>
          </div>
        `).join('');
      });
      this.listeners.push(logsListener);
    } catch (e) {
      console.warn('[CatalogSettingsView] Logs listener error:', e.message);
    }
  }

  updateStatsChart() {
    const stats = this.state.stats || {};
    const mobile = stats.visitas?.dispositivos?.mobile || 0;
    const tablet = stats.visitas?.dispositivos?.tablet || 0;
    const desktop = stats.visitas?.dispositivos?.desktop || 0;

    this.chart.updateData(
      ['Móvil', 'Tablet', 'Computadora'],
      [
        { label: 'Visitas', data: [mobile, tablet, desktop], color: '#7c75ff' }
      ]
    );
  }

  async saveCustomization() {
    const btn = this.layout.$('#btn-save-cust');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Guardando...';
    }

    const theme = this.layout.$('#cat-theme').value;
    const primaryColor = this.layout.$('#cat-primary-color').value;
    const secondaryColor = this.layout.$('#cat-secondary-color')?.value || '#16a34a';
    const backgroundColor = this.layout.$('#cat-background-color')?.value || '#0f172a';
    const logo = this.layout.$('#cat-logo').value.trim();
    const cover = this.layout.$('#cat-cover').value.trim();
    const gallery = (this.layout.$('#cat-gallery')?.value || '').split(',').map(x => x.trim()).filter(Boolean);
    const video = this.layout.$('#cat-video')?.value.trim() || '';
    const typography = this.layout.$('#cat-font')?.value.trim() || '';
    const favicon = this.layout.$('#cat-favicon')?.value.trim() || '';
    const whatsapp = this.layout.$('#cat-whatsapp').value.trim();
    const telegram = this.layout.$('#cat-telegram').value.trim();
    const facebook = this.layout.$('#cat-facebook').value.trim();
    const instagram = this.layout.$('#cat-instagram').value.trim();
    const tiktok = this.layout.$('#cat-tiktok').value.trim();
    const website = this.layout.$('#cat-website').value.trim();
    const contactInfo = this.layout.$('#cat-contact')?.value.trim() || '';
    const hours = this.layout.$('#cat-hours')?.value.trim() || '';
    const seoTitle = this.layout.$('#cat-seo-title')?.value.trim() || '';
    const seoDescription = this.layout.$('#cat-seo-description')?.value.trim() || '';
    const enableReviews = this.layout.$('#cat-enable-reviews').checked;

    const payload = {
      theme,
      colors: {
        primary: primaryColor,
        secondary: secondaryColor,
        background: backgroundColor
      },
      logo,
      cover,
      gallery,
      video,
      typography,
      favicon,
      socials: {
        whatsapp,
        telegram,
        facebook,
        instagram,
        tiktok,
        website
      },
      contactInfo,
      hours,
      seo: {
        title: seoTitle,
        description: seoDescription
      },
      enableReviews,
      updatedAt: Date.now(),
      updatedAtLocal: TimeService.timestamp()
    };

    try {
      await FirestoreService.setGlobal(this.companyId, 'configuracion_catalogo', payload);
      NotificationService.success('Configuración de catálogo guardada con éxito.');
    } catch (err) {
      console.error('[CatalogSettingsView] Error saving config:', err);
      alert(`Error al guardar configuración: ${err.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Guardar Cambios';
      }
    }
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.chart.unmount();
    this.layout.unmount();
    super.unmount();
  }
}
