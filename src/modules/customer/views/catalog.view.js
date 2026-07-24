import { Component } from '../../../core/component.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { getBusinessCategory } from '../../../config/business-types.config.js';
import { AppearanceService } from '../../../services/appearance.service.js';

export class PublicCatalogView extends Component {
  constructor(params = {}) {
    super(params);
    try {
      this.companyId = decodeURIComponent(params.companyId || '');
    } catch (_) {
      this.companyId = params.companyId || '';
    }

    this.state = {
      loading: true,
      info: null,
      config: null,
      products: [],
      categories: [],
      activeCategory: 'Todos',
      searchQuery: '',
      sortBy: 'recent',
      favorites: JSON.parse(localStorage.getItem(`ua_favs_${this.companyId}`) || '[]'),
      showOutOfStock: false, // Tiendas: ocultar agotados por defecto
      businessCategory: 'OTROS',
    };

    this.listeners = [];
  }

  mount() {
    const root = document.createElement('div');
    root.className = 'public-catalog-root';
    this.element = root;

    this._renderSkeleton(root);
    this.loadCatalogData(root);
    return root;
  }

  _renderSkeleton(root) {
    root.innerHTML = `
      <div class="pub-skeleton-hero"></div>
      <div class="pub-container" style="margin-top: var(--space-6);">
        <div class="pub-skeleton-toolbar"></div>
        <div class="pub-skeleton-chips">
          ${Array.from({ length: 5 }).map(() => '<div class="pub-skeleton-chip"></div>').join('')}
        </div>
        <div class="pub-grid">
          ${Array.from({ length: 8 }).map(() => `
            <div class="pub-skeleton-card">
              <div class="pub-skeleton-card-img"></div>
              <div class="pub-skeleton-card-body">
                <div class="pub-skeleton-line" style="width:75%"></div>
                <div class="pub-skeleton-line" style="width:55%"></div>
                <div class="pub-skeleton-line" style="width:35%"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  loadCatalogData(root) {
    if (!this.companyId) {
      root.innerHTML = `<div class="pub-container text-center py-10"><p>Negocio no especificado.</p></div>`;
      return;
    }

    this.recordVisitorStats();

    const infoListener = FirestoreService.listenToPathRaw(`${this.companyId}/informacion_local`, (info) => {
      this.state.info = info || {};
      this.checkDataLoaded(root);
    });
    this.listeners.push(infoListener);

    const configListener = FirestoreService.listenToPathRaw(`configuracion_catalogo/${this.companyId}`, (config) => {
      this.state.config = config || {};
      this.checkDataLoaded(root);
    });
    this.listeners.push(configListener);

    const productsListener = FirestoreService.listenToPath(`${this.companyId}/productos`, (products) => {
      this.state.products = products || [];
      const uniqueCats = ['Todos', ...new Set(this.state.products.map(p => p.category).filter(Boolean))];
      this.state.categories = uniqueCats;
      this.checkDataLoaded(root);
    });
    this.listeners.push(productsListener);
  }

  recordVisitorStats() {
    try {
      FirestoreService.incrementPathValue(`${this.companyId}/estadisticas/visitas/conteo`, 1);
      let device = 'desktop';
      const width = window.innerWidth;
      if (width <= 480) device = 'mobile';
      else if (width <= 1024) device = 'tablet';
      FirestoreService.incrementPathValue(`${this.companyId}/estadisticas/visitas/dispositivos/${device}`, 1);
    } catch (e) {
      console.warn('[CatalogView] Failed to record stats:', e);
    }
  }

  recordClick(statName) {
    try {
      FirestoreService.incrementPathValue(`${this.companyId}/estadisticas/clics/${statName}`, 1);
    } catch (e) {
      console.warn('[CatalogView] Failed to record click stat:', e);
    }
  }

  checkDataLoaded(root) {
    const { info, config } = this.state;
    if (info !== null && config !== null) {
      // Classify the business category from the loaded info
      const businessType = info.businessType || '';
      this.state.businessCategory = getBusinessCategory(businessType);

      // Tiendas/Supermercados: default sort by promo to show offers first
      if (this.state.businessCategory === 'SUPERMERCADO_TIENDA' && this.state.sortBy === 'recent') {
        this.state.sortBy = 'promo';
      }

      this.state.loading = false;
      this.applyCatalogStyles(root);
      this.renderCatalog(root);
    }
  }

  async applyCatalogStyles(root) {
    const cfg = this.state.config || {};
    const isStore = this.state.businessCategory === 'SUPERMERCADO_TIENDA';

    // 1. Apply theme chosen by Business Owner
    try {
      const companyAppearance = await FirestoreService.getCompanyConfig(this.companyId);
      if (companyAppearance) {
        AppearanceService.applyToPublicCatalog(root, companyAppearance);
        return;
      }
    } catch (e) {
      console.warn('[CatalogView] Could not load company appearance config:', e);
    }

    // 2. Fallback to catalog config colors
    const primaryColor = cfg.colors?.primary || (isStore ? '#16a34a' : '#7c75ff');
    root.style.setProperty('--pub-primary', primaryColor);
    if (cfg.colors?.secondary) root.style.setProperty('--pub-secondary-accent', cfg.colors.secondary);
    if (cfg.colors?.background) root.style.setProperty('--pub-bg', cfg.colors.background);
    if (cfg.theme === 'light') root.classList.add('light-mode');
    else root.classList.remove('light-mode');
    if (cfg.typography) root.style.fontFamily = `'${cfg.typography}', sans-serif`;
  }

  renderCatalog(root) {
    const info = this.state.info || {};
    const cfg = this.state.config || {};

    let decodedId = this.companyId;
    try { decodedId = decodeURIComponent(this.companyId); } catch (_) {}
    const companyName = info.nombre || decodedId.replace(/-/g, ' ');
    const logoURL = cfg.logo || info.logo || '';
    const coverURL = cfg.cover || '';
    const socials = cfg.socials || {};
    const contactInfo = cfg.contactInfo || info.telefono || '';
    const hours = cfg.hours || info.horario || '';
    const address = info.direccion || '';

    const logoHTML = logoURL
      ? `<img src="${logoURL}" class="pub-logo" alt="${companyName} Logo" />`
      : `<span class="pub-logo-fallback">${companyName[0]?.toUpperCase() || 'U'}</span>`;

    const socialLinks = [
      socials.whatsapp ? `<a href="https://wa.me/${socials.whatsapp}" target="_blank" rel="noopener" class="pub-social-btn btn-whatsapp-click" title="WhatsApp"><svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></a>` : '',
      socials.instagram ? `<a href="https://instagram.com/${socials.instagram}" target="_blank" rel="noopener" class="pub-social-btn btn-social-click" title="Instagram"><svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg></a>` : '',
      socials.facebook ? `<a href="https://facebook.com/${socials.facebook}" target="_blank" rel="noopener" class="pub-social-btn btn-social-click" title="Facebook"><svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a>` : '',
      socials.tiktok ? `<a href="https://tiktok.com/@${socials.tiktok}" target="_blank" rel="noopener" class="pub-social-btn btn-social-click" title="TikTok"><svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg></a>` : '',
      socials.website ? `<a href="${socials.website}" target="_blank" rel="noopener" class="pub-social-btn btn-social-click" title="Sitio web"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></a>` : '',
    ].filter(Boolean).join('');

    root.innerHTML = `
      <!-- Hero -->
      <div class="pub-hero" style="border-radius:0; position:relative; overflow:hidden;">
        <div class="pub-cover-container">
          ${coverURL ? `<img src="${coverURL}" class="pub-cover" alt="${companyName}" />` : `<div class="pub-cover pub-cover-gradient"></div>`}
          <div class="pub-cover-overlay"></div>
        </div>
        <div class="pub-profile-overlay pub-container">
          <div class="pub-logo-wrapper">${logoHTML}</div>
          <div class="pub-info-block">
            <h1 class="pub-name">${companyName}</h1>
            <div class="pub-meta-row">
              ${address ? `<span class="pub-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${address}</span>` : ''}
              ${contactInfo ? `<span class="pub-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12 19.79 19.79 0 0 1 1.92 3.38 2 2 0 0 1 3.89 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6.29 6.29l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> ${contactInfo}</span>` : ''}
              ${hours ? `<span class="pub-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${hours}</span>` : ''}
            </div>
          </div>
          ${socialLinks ? `<div class="pub-social-bar">${socialLinks}</div>` : ''}
        </div>
      </div>

      <!-- Main -->
      <main class="pub-container flex-grow" style="padding-top:var(--space-5);">
        <!-- Search + Sort -->
        <div class="pub-toolbar">
          <div class="pub-search-wrap">
            <svg class="pub-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="pub-search" class="pub-search-input" placeholder="${this.state.businessCategory === 'SUPERMERCADO_TIENDA' ? 'Busca por nombre, marca o pasillo...' : 'Buscar por nombre, SKU, marca…'}" value="${this.state.searchQuery}" autocomplete="off" />
          </div>
          <select id="pub-sort" class="pub-sort-select">
            <option value="recent" ${this.state.sortBy === 'recent' ? 'selected' : ''}>Más recientes</option>
            <option value="price-asc" ${this.state.sortBy === 'price-asc' ? 'selected' : ''}>Menor precio</option>
            <option value="price-desc" ${this.state.sortBy === 'price-desc' ? 'selected' : ''}>Mayor precio</option>
            <option value="promo" ${this.state.sortBy === 'promo' ? 'selected' : ''}>En oferta</option>
          </select>
          ${this.state.businessCategory === 'SUPERMERCADO_TIENDA' ? `
            <button id="pub-toggle-stock" class="pub-cat-pill" style="white-space:nowrap; flex-shrink:0; font-size:0.75rem;">
              ${this.state.showOutOfStock ? '📦 Ocultar agotados' : '🔍 Ver agotados'}
            </button>
          ` : ''}
        </div>

        <!-- Category Chips -->
        <div class="pub-category-carousel" id="pub-cat-carousel" role="tablist" aria-label="Filtrar por categoría">
          ${this.state.categories.map(cat => `
            <button class="pub-cat-pill ${this.state.activeCategory === cat ? 'active' : ''}"
              data-category="${cat}" role="tab" aria-selected="${this.state.activeCategory === cat}">
              ${cat}
            </button>
          `).join('')}
        </div>

        <!-- Products Grid -->
        <div class="pub-grid animate-fade-in" id="pub-products-grid" aria-live="polite"></div>

        <!-- Service Request -->
        <div id="pub-service-request-section"></div>
      </main>

      <!-- Footer -->
      <footer class="pub-footer">
        <p>&copy; ${new Date().getFullYear()} ${companyName} &mdash; Creado con Ultra Administrador.</p>
      </footer>

      <!-- Floating WhatsApp -->
      ${socials.whatsapp ? `
        <a href="https://wa.me/${socials.whatsapp}" target="_blank" rel="noopener"
          class="pub-float-wa btn-whatsapp-click" title="Contactar por WhatsApp" aria-label="WhatsApp">
          <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        </a>
      ` : ''}
    `;

    this.bindEvents(root);
    this.renderProducts(root);
    this.renderServiceRequestSection(root);
  }

  renderServiceRequestSection(root) {
    const cfg = this.state.info?.configuracion || {};
    const businessType = this.state.info?.businessType || '';
    if (!cfg.enableServiceRequests) return;

    const section = root.querySelector('#pub-service-request-section');
    if (!section) return;

    const typeLC = businessType.toLowerCase();
    const isCarpinteria = typeLC.includes('carpintería') || typeLC.includes('carpinteria') || typeLC.includes('mueble') || typeLC.includes('madera');
    const isCamaras = typeLC.includes('cámara') || typeLC.includes('camara') || typeLC.includes('seguridad') || typeLC.includes('vigilancia');

    const extraFields = isCarpinteria ? `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--space-3);">
        <div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;color:var(--pub-text);">Medidas (ancho x alto x largo)</label>
          <input type="text" id="req-medidas" class="pub-form-input" placeholder="Ej. 2m x 1.5m x 0.5m" /></div>
        <div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;color:var(--pub-text);">Material</label>
          <input type="text" id="req-material" class="pub-form-input" placeholder="Ej. MDF, Pino, Cedro" /></div>
        <div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;color:var(--pub-text);">Color o Acabado</label>
          <input type="text" id="req-color" class="pub-form-input" placeholder="Ej. Blanco mate, Roble" /></div>
      </div>
    ` : isCamaras ? `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--space-3);">
        <div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;color:var(--pub-text);">Teléfono de contacto</label>
          <input type="tel" id="req-telefono" class="pub-form-input" placeholder="Ej. +505 8888-1234" /></div>
        <div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;color:var(--pub-text);">Ubicación / Dirección</label>
          <input type="text" id="req-ubicacion" class="pub-form-input" placeholder="Ej. Calle Principal #12" /></div>
        <div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;color:var(--pub-text);">N.º de cámaras</label>
          <input type="number" id="req-num-camaras" class="pub-form-input" placeholder="Ej. 4" min="1" /></div>
      </div>
    ` : '';

    section.innerHTML = `
      <div class="pub-service-card">
        <h2 class="pub-section-title">
          ${isCarpinteria ? '🪵 Solicitar Trabajo de Carpintería' : isCamaras ? '📷 Solicitar Instalación de Cámaras' : '📋 Solicitar Cotización'}
        </h2>
        <p style="font-size:0.85rem;color:var(--pub-text-sec);margin-bottom:var(--space-4);">
          Llena el formulario y nos comunicaremos contigo a la brevedad.
        </p>
        <form id="pub-service-request-form" style="display:flex;flex-direction:column;gap:var(--space-3);">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:var(--space-3);">
            <div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;color:var(--pub-text);">Tu nombre *</label>
              <input type="text" id="req-client-name" class="pub-form-input" placeholder="Nombre completo" required /></div>
            <div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;color:var(--pub-text);">Correo electrónico</label>
              <input type="email" id="req-client-email" class="pub-form-input" placeholder="tu@correo.com" /></div>
          </div>
          ${extraFields}
          <div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;color:var(--pub-text);">Descripción del trabajo *</label>
            <textarea id="req-description" class="pub-form-input" style="min-height:90px;resize:vertical;" placeholder="Descríbenos qué necesitas…" required></textarea>
          </div>
          <div id="pub-req-feedback" style="display:none;font-size:0.85rem;padding:var(--space-2) var(--space-3);border-radius:var(--radius-md);"></div>
          <button type="submit" id="pub-req-submit-btn" class="pub-submit-btn">Enviar Solicitud ✉️</button>
        </form>
      </div>
    `;

    const form = section.querySelector('#pub-service-request-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = section.querySelector('#pub-req-submit-btn');
        const feedback = section.querySelector('#pub-req-feedback');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Enviando…'; }

        const payload = {
          clientName: section.querySelector('#req-client-name')?.value.trim() || '',
          clientEmail: section.querySelector('#req-client-email')?.value.trim() || '',
          description: section.querySelector('#req-description')?.value.trim() || '',
          businessType, status: 'PENDIENTE',
          createdAtLocal: new Date().toISOString()
        };
        if (isCarpinteria) {
          payload.serviceType = 'carpinteria';
          payload.medidas = section.querySelector('#req-medidas')?.value.trim() || '';
          payload.material = section.querySelector('#req-material')?.value.trim() || '';
          payload.color = section.querySelector('#req-color')?.value.trim() || '';
        } else if (isCamaras) {
          payload.serviceType = 'camaras';
          payload.telefono = section.querySelector('#req-telefono')?.value.trim() || '';
          payload.ubicacion = section.querySelector('#req-ubicacion')?.value.trim() || '';
          payload.numeroCamaras = section.querySelector('#req-num-camaras')?.value || '';
        }

        try {
          await FirestoreService.createPublicServiceRequest(this.companyId, payload);
          if (feedback) {
            feedback.style.display = 'block';
            Object.assign(feedback.style, { background: '#10b98120', color: '#10b981', border: '1px solid #10b98140' });
            feedback.textContent = '✅ ¡Solicitud enviada! Nos pondremos en contacto pronto.';
          }
          form.reset();
        } catch (err) {
          if (feedback) {
            feedback.style.display = 'block';
            Object.assign(feedback.style, { background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440' });
            feedback.textContent = 'Error al enviar. Intenta de nuevo.';
          }
        } finally {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Enviar Solicitud ✉️'; }
        }
      });
    }
  }

  bindEvents(root) {
    const searchInput = root.querySelector('#pub-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.state.searchQuery = e.target.value.toLowerCase();
        this.renderProducts(root);
      });
    }

    const sortSelect = root.querySelector('#pub-sort');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.state.sortBy = e.target.value;
        this.renderProducts(root);
      });
    }

    root.querySelectorAll('.pub-cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        root.querySelectorAll('.pub-cat-pill').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        this.state.activeCategory = btn.getAttribute('data-category');
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        this.renderProducts(root);
      });
    });

    root.querySelectorAll('.btn-whatsapp-click').forEach(el => {
      el.addEventListener('click', () => this.recordClick('whatsapp'));
    });
    root.querySelectorAll('.btn-social-click').forEach(el => {
      el.addEventListener('click', () => this.recordClick('redes_sociales'));
    });

    // Toggle out-of-stock visibility (stores only)
    const toggleStockBtn = root.querySelector('#pub-toggle-stock');
    if (toggleStockBtn) {
      toggleStockBtn.addEventListener('click', () => {
        this.state.showOutOfStock = !this.state.showOutOfStock;
        toggleStockBtn.textContent = this.state.showOutOfStock ? '\ud83d\udce6 Ocultar agotados' : '\ud83d\udd0d Ver agotados';
        this.renderProducts(root);
      });
    }

    const grid = root.querySelector('#pub-products-grid');
    if (grid) {
      grid.addEventListener('click', (e) => {
        const favBtn = e.target.closest('.pub-fav-btn');
        if (favBtn) {
          e.stopPropagation();
          this.toggleFavorite(favBtn.getAttribute('data-id'), favBtn);
        }
      });
    }
  }

  toggleFavorite(prodId, buttonEl) {
    let favs = [...this.state.favorites];
    const idx = favs.indexOf(prodId);
    if (idx > -1) {
      favs.splice(idx, 1);
      buttonEl.classList.remove('active');
      buttonEl.innerHTML = '♡';
    } else {
      favs.push(prodId);
      buttonEl.classList.add('active');
      buttonEl.innerHTML = '♥';
    }
    this.state.favorites = favs;
    localStorage.setItem(`ua_favs_${this.companyId}`, JSON.stringify(favs));
  }

  renderProducts(root) {
    const grid = root.querySelector('#pub-products-grid');
    if (!grid) return;

    const { products, activeCategory, searchQuery, sortBy, favorites, showOutOfStock, businessCategory } = this.state;
    const isStore = businessCategory === 'SUPERMERCADO_TIENDA';

    let filtered = products.filter(p => {
      const matchesCategory = activeCategory === 'Todos' || p.category === activeCategory;
      const matchesSearch = !searchQuery ||
        (p.name || '').toLowerCase().includes(searchQuery) ||
        (p.sku || '').toLowerCase().includes(searchQuery) ||
        (p.brand || '').toLowerCase().includes(searchQuery) ||
        (p.location || '').toLowerCase().includes(searchQuery) ||
        (p.category || '').toLowerCase().includes(searchQuery);

      // Stores: hide out-of-stock products unless toggle is ON
      const stockOk = !isStore || showOutOfStock || Number(p.stock || 0) > 0;

      return matchesCategory && matchesSearch && stockOk;
    });

    if (sortBy === 'price-asc') filtered.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    else if (sortBy === 'price-desc') filtered.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    else if (sortBy === 'promo') filtered.sort((a, b) => ((!!b.oldPrice || !!b.discount) ? 1 : 0) - ((!!a.oldPrice || !!a.discount) ? 1 : 0));
    else filtered.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="pub-empty-state" style="grid-column:1/-1;">
          <div class="pub-empty-icon">
            <svg viewBox="0 0 64 64" fill="none" width="72" height="72">
              <circle cx="32" cy="32" r="30" stroke="var(--pub-border)" stroke-width="2"/>
              <path d="M20 24h24M20 32h16M20 40h10" stroke="var(--pub-text-sec)" stroke-width="2" stroke-linecap="round"/>
              <circle cx="46" cy="42" r="8" fill="var(--pub-surface)" stroke="var(--pub-border)" stroke-width="2"/>
              <path d="M43 42h6M46 39v6" stroke="var(--pub-text-sec)" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </div>
          <p class="pub-empty-title">Sin resultados</p>
          <p class="pub-empty-desc">No encontramos productos con esa búsqueda.<br>Prueba con otro término o categoría.</p>
        </div>
      `;
      return;
    }

    const fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
    const encodedCompanyId = encodeURIComponent(this.companyId);

    grid.innerHTML = filtered.map((p, idx) => {
      const isFav = favorites.includes(p.id);
      const mainPrice = fmt.format(p.price || 0);
      const hasPromo = p.onSale === true && p.oldPrice;
      const oldPriceFmt = hasPromo ? fmt.format(p.oldPrice) : '';
      const discount = hasPromo ? Math.round((1 - (p.price / p.oldPrice)) * 100) : 0;
      const isOutOfStock = Number(p.stock || 0) === 0;

      const imgHTML = p.image
        ? `<img src="${p.image}" class="pub-card-img" alt="${p.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
           <div class="pub-card-img-placeholder" style="display:none;">📦</div>`
        : `<div class="pub-card-img-placeholder">📦</div>`;

      // Location badge for stores
      const locationBadge = (isStore && p.location)
        ? `<span style="display:inline-flex; align-items:center; gap:3px; font-size:0.65rem; font-weight:600; background:rgba(22,163,74,0.15); color:#16a34a; border:1px solid rgba(22,163,74,0.25); border-radius:4px; padding:2px 6px; margin-bottom:4px;">📍 ${p.location}</span>`
        : '';

      return `
        <div class="pub-card" style="animation-delay:${Math.min(idx * 40, 400)}ms;">
          <a href="#/${encodedCompanyId}/producto/${p.id}" class="pub-card-img-wrapper" aria-label="Ver ${p.name}">
            ${imgHTML}
            <div class="pub-card-badges">
              ${hasPromo ? `<span class="pub-badge pub-badge-promo">-${discount}%</span>` : ''}
              ${isOutOfStock ? `<span class="pub-badge pub-badge-out">Agotado</span>` : ''}
            </div>
            ${isOutOfStock ? `<div class="pub-card-out-overlay"><span>Sin Stock</span></div>` : ''}
            <button class="pub-fav-btn ${isFav ? 'active' : ''}" data-id="${p.id}"
              title="${isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}"
              aria-label="${isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}">
              ${isFav ? '♥' : '♡'}
            </button>
          </a>
          <div class="pub-card-body">
            ${locationBadge}
            ${p.brand ? `<span class="pub-card-brand">${p.brand}</span>` : ''}
            <h4 class="pub-card-name">${p.name}</h4>
            ${p.presentation ? `<span class="text-xs text-secondary" style="margin-bottom:4px; display:block;">${p.presentation}</span>` : ''}
            ${p.description ? `<p class="pub-card-desc">${p.description}</p>` : ''}
            <div class="pub-card-footer">
              <div class="pub-price-group">
                ${hasPromo ? `<span class="pub-price-old">${oldPriceFmt}</span>` : ''}
                <span class="pub-price-main" style="color:var(--pub-primary);">${mainPrice}</span>
              </div>
              <a href="#/${encodedCompanyId}/producto/${p.id}" class="pub-view-btn" style="text-decoration:none;"
                aria-label="Ver detalle de ${p.name}">
                Ver más
              </a>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    super.unmount();
  }
}
