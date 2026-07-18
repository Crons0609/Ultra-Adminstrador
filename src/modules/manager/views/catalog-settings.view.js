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
      activeTab: 'customize', // customize or stats
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

    if (btnCust && btnStats) {
      btnCust.addEventListener('click', () => {
        this.state.activeTab = 'customize';
        btnCust.classList.add('active');
        btnStats.classList.remove('active');
        this.renderTabContent(root);
      });

      btnStats.addEventListener('click', () => {
        this.state.activeTab = 'stats';
        btnStats.classList.add('active');
        btnCust.classList.remove('active');
        this.renderTabContent(root);
      });
    }
  }

  subscribeToData(element) {
    try {
      // 1. Listen to catalog settings config
      const configListener = FirestoreService.listenToPathRaw(`${this.companyId}/configuracion_catalogo`, (config) => {
        this.state.config = config || {};
        if (this.state.activeTab === 'customize') {
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
              <label class="form-label" for="cat-website">Sitio Web Externo (URL completo)</label>
              <input type="url" id="cat-website" class="input input-md" placeholder="https://www.minegocio.com" value="${cfg.socials?.website || ''}" />
            </div>
          </div>

          <hr style="border:0; border-top:1px solid var(--color-border); margin: var(--space-3) 0;" />
          <h3 class="text-lg font-semibold mb-2">Ajustes Adicionales de la Página</h3>

          <div style="display:flex; flex-direction:column; gap:12px;">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer;">
              <input type="checkbox" id="cat-enable-reviews" ${cfg.enableReviews !== false ? 'checked' : ''} style="accent-color: var(--color-accent);" />
              <span>Habilitar Calificaciones y Comentarios de Clientes</span>
            </label>
          </div>

          <div class="mt-4" style="display:flex; justify-content:flex-end;">
            <button type="submit" class="btn btn-primary" id="btn-save-cust">Guardar Cambios</button>
          </div>
        </form>
      `;

      // Color picker input synchronization
      const colorInput = container.querySelector('#cat-primary-color');
      if (colorInput) {
        colorInput.addEventListener('input', (e) => {
          colorInput.nextElementSibling.textContent = e.target.value;
        });
      }

      const form = container.querySelector('#customize-catalog-form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveCustomization();
      });

    } else {
      // Statistics view
      const stats = this.state.stats || {};
      const visits = stats.visitas?.conteo || 0;
      const wsClicks = stats.clics?.whatsapp || 0;
      const callClicks = stats.clics?.llamadas || 0;
      const socClicks = stats.clics?.redes_sociales || 0;

      // Top products vistos
      const viewEntries = Object.entries(stats.productos_vistos || {});
      const productsList = this.state.products;

      const topViewsHTML = viewEntries.length > 0 ? viewEntries
        .map(([id, count]) => {
          const p = productsList.find(prod => prod.id === id);
          return { name: p ? p.name : `Producto ID: ${id.slice(-4)}`, count: Number(count) };
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
