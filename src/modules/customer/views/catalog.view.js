import { Component } from '../../../core/component.js';
import { FirestoreService } from '../../../services/firestore.service.js';

export class PublicCatalogView extends Component {
  constructor(params = {}) {
    super(params);
    // Double-protection: decode in case router didn't (e.g. spaces as %20, accented chars)
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
      sortBy: 'recent', // recent, price-asc, price-desc, promo
      favorites: JSON.parse(localStorage.getItem(`ua_favs_${this.companyId}`) || '[]')
    };

    this.listeners = [];
  }

  mount() {
    const root = document.createElement('div');
    root.className = 'public-catalog-root';
    this.element = root;

    this.loadCatalogData(root);
    return root;
  }

  loadCatalogData(root) {
    if (!this.companyId) {
      root.innerHTML = `<div class="pub-container text-center py-10"><p>Negocio no especificado.</p></div>`;
      return;
    }

    // 1. Record visit count and device stats (once per load)
    this.recordVisitorStats();

    // 2. Listen to Company local info
    const infoListener = FirestoreService.listenToPathRaw(`${this.companyId}/informacion_local`, (info) => {
      this.state.info = info || {};
      this.checkDataLoaded(root);
    });
    this.listeners.push(infoListener);

    // 3. Listen to Catalog config settings
    const configListener = FirestoreService.listenToPathRaw(`configuracion_catalogo/${this.companyId}`, (config) => {
      this.state.config = config || {};
      this.checkDataLoaded(root);
    });
    this.listeners.push(configListener);

    // 4. Listen to products list
    const productsListener = FirestoreService.listenToPath(`${this.companyId}/productos`, (products) => {
      this.state.products = products || [];
      
      // Extract unique categories
      const uniqueCats = ['Todos', ...new Set(this.state.products.map(p => p.category).filter(Boolean))];
      this.state.categories = uniqueCats;

      this.checkDataLoaded(root);
    });
    this.listeners.push(productsListener);
  }

  recordVisitorStats() {
    try {
      // 1. Increment total visits
      FirestoreService.incrementPathValue(`${this.companyId}/estadisticas/visitas/conteo`, 1);

      // 2. Increment device visits
      let device = 'desktop';
      const width = window.innerWidth;
      if (width <= 480) {
        device = 'mobile';
      } else if (width <= 1024) {
        device = 'tablet';
      }
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
    const { info, config, products } = this.state;
    // We consider data loaded once we have listened to info and config (even if empty) and products
    if (info !== null && config !== null) {
      this.state.loading = false;
      this.applyCatalogStyles(root);
      this.renderCatalog(root);
    }
  }

  applyCatalogStyles(root) {
    const cfg = this.state.config || {};
    const primaryColor = cfg.colors?.primary || '#7c75ff';
    
    // Set custom accent color variable
    root.style.setProperty('--pub-primary', primaryColor);

    // Apply light mode class if configured
    if (cfg.theme === 'light') {
      root.classList.add('light-mode');
    } else {
      root.classList.remove('light-mode');
    }

    // Set page body font family
    if (cfg.typography) {
      root.style.fontFamily = `'${cfg.typography}', sans-serif`;
    }
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

    const logoHTML = logoURL 
      ? `<img src="${logoURL}" class="pub-logo" alt="${companyName} Logo" />` 
      : `<span class="pub-logo-fallback">${companyName[0]?.toUpperCase() || 'U'}</span>`;

    // Filter section order or load default template
    root.innerHTML = `
      <!-- Cover & Header -->
      <div class="pub-hero" style="border-radius:0;">
        <div style="position:relative;">
          ${coverURL ? `<img src="${coverURL}" class="pub-cover" alt="${companyName} Banner" />` : `<div class="pub-cover"></div>`}
        </div>
        <div class="pub-profile-overlay pub-container" style="border-radius:0; background: rgba(0, 0, 0, 0.65);">
          <div class="pub-logo-wrapper">
            ${logoHTML}
          </div>
          <div class="pub-info-block">
            <h1 class="pub-name">${companyName}</h1>
            <div class="pub-meta-row mt-2" style="font-size:0.85rem; opacity:0.9;">
              ${info.direccion ? `<span class="pub-meta-item">📍 ${info.direccion}</span>` : ''}
              ${info.telefono ? `<span class="pub-meta-item">📞 ${info.telefono}</span>` : ''}
              ${info.horario ? `<span class="pub-meta-item">⏰ ${info.horario}</span>` : ''}
            </div>
          </div>
          
          <!-- Socials Button Bar -->
          <div class="pub-social-bar">
            ${socials.whatsapp ? `<a href="https://wa.me/${socials.whatsapp}" target="_blank" class="pub-social-btn btn-whatsapp-click">💬</a>` : ''}
            ${socials.telegram ? `<a href="https://t.me/${socials.telegram}" target="_blank" class="pub-social-btn btn-social-click">✈️</a>` : ''}
            ${socials.facebook ? `<a href="https://facebook.com/${socials.facebook}" target="_blank" class="pub-social-btn btn-social-click">📘</a>` : ''}
            ${socials.instagram ? `<a href="https://instagram.com/${socials.instagram}" target="_blank" class="pub-social-btn btn-social-click">📷</a>` : ''}
            ${socials.tiktok ? `<a href="https://tiktok.com/@${socials.tiktok}" target="_blank" class="pub-social-btn btn-social-click">🎵</a>` : ''}
            ${socials.website ? `<a href="${socials.website}" target="_blank" class="pub-social-btn btn-social-click">🔗</a>` : ''}
          </div>
        </div>
      </div>

      <!-- Toolbar & Grid -->
      <main class="pub-container flex-grow">
        <!-- Search bar -->
        <div class="card p-4 mb-4" style="background:var(--pub-surface); border-color:var(--pub-border);">
          <div class="inv-toolbar" style="margin-bottom:0;">
            <div class="inv-search" style="flex-grow: 1;">
              <span class="inv-search-icon">🔍</span>
              <input type="text" id="pub-search" class="input input-md" style="background:var(--pub-bg); border-color:var(--pub-border); color:var(--pub-text);" placeholder="Buscar productos por nombre, SKU, marca..." value="${this.state.searchQuery}" />
            </div>
            
            <select id="pub-sort" class="inv-filter-select" style="background:var(--pub-bg); border-color:var(--pub-border); color:var(--pub-text);">
              <option value="recent" ${this.state.sortBy === 'recent' ? 'selected' : ''}>Más recientes</option>
              <option value="price-asc" ${this.state.sortBy === 'price-asc' ? 'selected' : ''}>Menor precio</option>
              <option value="price-desc" ${this.state.sortBy === 'price-desc' ? 'selected' : ''}>Mayor precio</option>
              <option value="promo" ${this.state.sortBy === 'promo' ? 'selected' : ''}>En oferta / Promociones</option>
            </select>
          </div>
        </div>

        <!-- Categories Pill Carrusel -->
        <div class="pub-category-carousel">
          ${this.state.categories.map(cat => `
            <button class="pub-cat-pill ${this.state.activeCategory === cat ? 'active' : ''}" data-category="${cat}">
              ${cat}
            </button>
          `).join('')}
        </div>

        <!-- Products Grid -->
        <div class="pub-grid" id="pub-products-grid">
          <!-- Dynamically filtered products -->
        </div>

        <!-- Service Request Form (shown when business has serviceRequests enabled) -->
        <div id="pub-service-request-section"></div>
      </main>

      <!-- Minimal footer -->
      <footer style="text-align:center; padding:var(--space-6); font-size:0.75rem; color:var(--pub-text-sec); border-top:1px solid var(--pub-border); margin-top:var(--space-8);">
        <p>&copy; ${new Date().getFullYear()} ${companyName}. Creado con Ultra Administrador.</p>
      </footer>
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

    // Detect service sub-type from businessType string
    const typeLC = businessType.toLowerCase();
    const isCarpinteria = typeLC.includes('carpintería') || typeLC.includes('carpinteria') || typeLC.includes('mueble') || typeLC.includes('madera');
    const isCamaras = typeLC.includes('cámara') || typeLC.includes('camara') || typeLC.includes('seguridad') || typeLC.includes('vigilancia');

    const extraFields = isCarpinteria ? `
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-3);">
        <div>
          <label style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px; color:var(--pub-text);">Medidas (ancho x alto x largo)</label>
          <input type="text" id="req-medidas" class="input input-md" style="background:var(--pub-bg); border-color:var(--pub-border); color:var(--pub-text); width:100%;" placeholder="Ej. 2m x 1.5m x 0.5m" />
        </div>
        <div>
          <label style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px; color:var(--pub-text);">Material</label>
          <input type="text" id="req-material" class="input input-md" style="background:var(--pub-bg); border-color:var(--pub-border); color:var(--pub-text); width:100%;" placeholder="Ej. MDF, Pino, Cedro" />
        </div>
        <div>
          <label style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px; color:var(--pub-text);">Color o Acabado</label>
          <input type="text" id="req-color" class="input input-md" style="background:var(--pub-bg); border-color:var(--pub-border); color:var(--pub-text); width:100%;" placeholder="Ej. Blanco mate, Roble" />
        </div>
      </div>
    ` : isCamaras ? `
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-3);">
        <div>
          <label style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px; color:var(--pub-text);">Teléfono de contacto</label>
          <input type="tel" id="req-telefono" class="input input-md" style="background:var(--pub-bg); border-color:var(--pub-border); color:var(--pub-text); width:100%;" placeholder="Ej. +505 8888-1234" />
        </div>
        <div>
          <label style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px; color:var(--pub-text);">Ubicación / Dirección</label>
          <input type="text" id="req-ubicacion" class="input input-md" style="background:var(--pub-bg); border-color:var(--pub-border); color:var(--pub-text); width:100%;" placeholder="Ej. Calle Principal, Casa #12" />
        </div>
        <div>
          <label style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px; color:var(--pub-text);">Número de cámaras</label>
          <input type="number" id="req-num-camaras" class="input input-md" style="background:var(--pub-bg); border-color:var(--pub-border); color:var(--pub-text); width:100%;" placeholder="Ej. 4" min="1" />
        </div>
      </div>
    ` : '';

    section.innerHTML = `
      <div style="margin-top: var(--space-8); padding: var(--space-6); background: var(--pub-surface); border: 1px solid var(--pub-border); border-radius: var(--radius-xl);">
        <h2 style="font-size: 1.3rem; font-weight: 700; color: var(--pub-text); margin-bottom: var(--space-2);">
          ${isCarpinteria ? '🪵 Solicitar Trabajo de Carpintería' : isCamaras ? '📷 Solicitar Instalación de Cámaras' : '📋 Solicitar Cotización'}
        </h2>
        <p style="font-size: 0.85rem; color: var(--pub-text-sec); margin-bottom: var(--space-4);">
          Llena el formulario y nos comunicaremos contigo a la brevedad para coordinar los detalles.
        </p>

        <form id="pub-service-request-form" style="display:flex; flex-direction:column; gap: var(--space-3);">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
            <div>
              <label style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px; color:var(--pub-text);">Tu nombre *</label>
              <input type="text" id="req-client-name" class="input input-md" style="background:var(--pub-bg); border-color:var(--pub-border); color:var(--pub-text); width:100%;" placeholder="Nombre completo" required />
            </div>
            <div>
              <label style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px; color:var(--pub-text);">Correo electrónico</label>
              <input type="email" id="req-client-email" class="input input-md" style="background:var(--pub-bg); border-color:var(--pub-border); color:var(--pub-text); width:100%;" placeholder="tu@correo.com" />
            </div>
          </div>

          ${extraFields}

          <div>
            <label style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px; color:var(--pub-text);">Descripción del trabajo *</label>
            <textarea id="req-description" class="input" style="background:var(--pub-bg); border-color:var(--pub-border); color:var(--pub-text); width:100%; min-height:90px; padding: var(--space-3); resize:vertical;" placeholder="Descríbenos qué necesitas con el mayor detalle posible..." required></textarea>
          </div>

          <div id="pub-req-feedback" style="display:none; font-size:0.85rem; padding: var(--space-2) var(--space-3); border-radius: var(--radius-md);"></div>

          <button type="submit" id="pub-req-submit-btn" style="background: var(--pub-primary, #7c75ff); color: white; border: none; border-radius: var(--radius-md); padding: var(--space-3) var(--space-5); font-size: 0.9rem; font-weight: 600; cursor: pointer; align-self: flex-start; transition: opacity 0.2s;">
            Enviar Solicitud ✉️
          </button>
        </form>
      </div>
    `;

    // Bind form submission
    const form = section.querySelector('#pub-service-request-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = section.querySelector('#pub-req-submit-btn');
        const feedback = section.querySelector('#pub-req-feedback');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Enviando...'; }

        const payload = {
          clientName: section.querySelector('#req-client-name')?.value.trim() || '',
          clientEmail: section.querySelector('#req-client-email')?.value.trim() || '',
          description: section.querySelector('#req-description')?.value.trim() || '',
          businessType,
          status: 'PENDIENTE',
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
            feedback.style.background = '#10b98122';
            feedback.style.color = '#10b981';
            feedback.style.border = '1px solid #10b98144';
            feedback.textContent = '✅ ¡Solicitud enviada! Nos pondremos en contacto contigo pronto.';
          }
          form.reset();
        } catch (err) {
          console.error('[CatalogView] Error sending service request:', err);
          if (feedback) {
            feedback.style.display = 'block';
            feedback.style.background = '#ef444422';
            feedback.style.color = '#ef4444';
            feedback.style.border = '1px solid #ef444444';
            feedback.textContent = 'Error al enviar la solicitud. Por favor intenta de nuevo.';
          }
        } finally {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Enviar Solicitud ✉️'; }
        }
      });
    }
  }

  bindEvents(root) {
    // 1. Search filter
    const searchInput = root.querySelector('#pub-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.state.searchQuery = e.target.value.toLowerCase();
        this.renderProducts(root);
      });
    }

    // 2. Sort select
    const sortSelect = root.querySelector('#pub-sort');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.state.sortBy = e.target.value;
        this.renderProducts(root);
      });
    }

    // 3. Category pills
    root.querySelectorAll('.pub-cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        root.querySelectorAll('.pub-cat-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.activeCategory = btn.getAttribute('data-category');
        this.renderProducts(root);
      });
    });

    // 4. Click stats click triggers
    root.querySelectorAll('.btn-whatsapp-click').forEach(el => {
      el.addEventListener('click', () => this.recordClick('whatsapp'));
    });
    root.querySelectorAll('.btn-social-click').forEach(el => {
      el.addEventListener('click', () => this.recordClick('redes_sociales'));
    });

    // 5. Grid events delegation
    const grid = root.querySelector('#pub-products-grid');
    if (grid) {
      grid.addEventListener('click', (e) => {
        // Toggle Favorites list
        const favBtn = e.target.closest('.pub-fav-btn');
        if (favBtn) {
          e.stopPropagation();
          const prodId = favBtn.getAttribute('data-id');
          this.toggleFavorite(prodId, favBtn);
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
      NotificationService.success('Removido de tus favoritos.');
    } else {
      favs.push(prodId);
      buttonEl.classList.add('active');
      buttonEl.innerHTML = '♥';
      NotificationService.success('Añadido a tus favoritos.');
    }
    this.state.favorites = favs;
    localStorage.setItem(`ua_favs_${this.companyId}`, JSON.stringify(favs));
  }

  renderProducts(root) {
    const grid = root.querySelector('#pub-products-grid');
    if (!grid) return;

    const { products, activeCategory, searchQuery, sortBy, favorites } = this.state;

    // Filter
    let filtered = products.filter(p => {
      const matchesCategory = activeCategory === 'Todos' || p.category === activeCategory;
      const matchesSearch = !searchQuery || 
        (p.name || '').toLowerCase().includes(searchQuery) ||
        (p.sku || '').toLowerCase().includes(searchQuery) ||
        (p.brand || '').toLowerCase().includes(searchQuery) ||
        (p.category || '').toLowerCase().includes(searchQuery);
      return matchesCategory && matchesSearch;
    });

    // Sort
    if (sortBy === 'price-asc') {
      filtered.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    } else if (sortBy === 'price-desc') {
      filtered.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    } else if (sortBy === 'promo') {
      // Products with previous price / discount first
      filtered.sort((a, b) => {
        const aHasPromo = !!a.oldPrice || !!a.discount;
        const bHasPromo = !!b.oldPrice || !!b.discount;
        return (bHasPromo ? 1 : 0) - (aHasPromo ? 1 : 0);
      });
    } else {
      // Default: recent (updatedAt desc)
      filtered.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    }

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1;" class="inv-empty">
          <div class="inv-empty-icon">📦</div>
          <p class="inv-empty-title">No se encontraron productos</p>
          <p class="inv-empty-desc text-secondary">Prueba con otra palabra de búsqueda o categoría.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(p => {
      const isFav = favorites.includes(p.id);
      const mainPrice = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(p.price || 0);
      
      // Only show old price / promo if explicitly flagged
      const hasPromo = p.onSale === true && p.oldPrice;
      const oldPriceFormatted = hasPromo
        ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(p.oldPrice)
        : '';

      const isOutOfStock = Number(p.stock || 0) === 0;

      // Image: use stored URL, else show a branded gradient placeholder
      const imgHTML = p.image
        ? `<img src="${p.image}" class="pub-card-img" alt="${p.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
           <div class="pub-card-img-placeholder" style="display:none;">📦</div>`
        : `<div class="pub-card-img-placeholder">📦</div>`;

      // Use encoded companyId in URLs to maintain valid hash routing
      const encodedCompanyId = encodeURIComponent(this.companyId);

      return `
        <div class="pub-card">
          <div class="pub-card-img-wrapper">
            ${imgHTML}
            
            <div class="pub-card-badges">
              ${hasPromo ? `<span class="pub-badge-promo">Oferta</span>` : ''}
              ${isOutOfStock ? `<span class="pub-badge-promo" style="background:#ef4444;">Agotado</span>` : ''}
            </div>

            <button class="pub-fav-btn ${isFav ? 'active' : ''}" data-id="${p.id}" title="Favorito">
              ${isFav ? '♥' : '♡'}
            </button>
          </div>

          <div class="pub-card-body">
            <h4 class="pub-card-name">${p.name}</h4>
            ${p.description ? `<p class="pub-card-desc">${p.description}</p>` : ''}
            
            <div class="pub-card-footer">
              <div class="pub-price-group">
                ${hasPromo ? `<span class="pub-price-old">${oldPriceFormatted}</span>` : ''}
                <span class="pub-price-main">${mainPrice}</span>
              </div>
              <a href="#/${encodedCompanyId}/producto/${p.id}" class="pub-view-btn" style="text-decoration:none;">
                Ver Detalle
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
