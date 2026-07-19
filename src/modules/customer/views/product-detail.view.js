import { Component } from '../../../core/component.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';

export class PublicProductDetailView extends Component {
  constructor(params = {}) {
    super(params);
    this.companyId = params.companyId || '';
    this.productId = params.productId || '';

    this.state = {
      loading: true,
      info: null,
      config: null,
      product: null,
      reviews: [],
      activeImage: ''
    };

    this.listeners = [];
  }

  mount() {
    const root = document.createElement('div');
    root.className = 'public-catalog-root';
    this.element = root;

    this.loadProductData(root);
    return root;
  }

  loadProductData(root) {
    if (!this.companyId || !this.productId) {
      root.innerHTML = `<div class="pub-container text-center py-10"><p>Parámetros no especificados.</p></div>`;
      return;
    }

    // 1. Increment product view counter in stats
    try {
      FirestoreService.incrementPathValue(`${this.companyId}/estadisticas/productos_vistos/${this.productId}`, 1);
    } catch (e) {
      console.warn('[ProductDetailView] Failed to record product view stat:', e);
    }

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

    // 4. Listen to specific product details
    const productListener = FirestoreService.listenToPathRaw(`${this.companyId}/productos/${this.productId}`, (product) => {
      this.state.product = product || null;
      if (product && !this.state.activeImage) {
        this.state.activeImage = product.image || '';
      }
      this.checkDataLoaded(root);
    });
    this.listeners.push(productListener);

    // 5. Listen to reviews for this product
    const reviewsListener = FirestoreService.listenToPath(`${this.companyId}/reviews/${this.productId}`, (reviews) => {
      this.state.reviews = reviews || [];
      this.renderReviewsSection(root);
    });
    this.listeners.push(reviewsListener);
  }

  checkDataLoaded(root) {
    const { info, config, product } = this.state;
    if (info !== null && config !== null && product !== undefined) {
      this.state.loading = false;
      this.applyCatalogStyles(root);
      this.renderProductDetail(root);
    }
  }

  applyCatalogStyles(root) {
    const cfg = this.state.config || {};
    const primaryColor = cfg.colors?.primary || '#7c75ff';
    root.style.setProperty('--pub-primary', primaryColor);

    if (cfg.theme === 'light') {
      root.classList.add('light-mode');
    } else {
      root.classList.remove('light-mode');
    }

    if (cfg.typography) {
      root.style.fontFamily = `'${cfg.typography}', sans-serif`;
    }
  }

  renderProductDetail(root) {
    const p = this.state.product;
    const info = this.state.info || {};
    const cfg = this.state.config || {};

    if (!p) {
      root.innerHTML = `
        <div class="pub-container text-center py-10" style="color:var(--pub-text);">
          <h2>Producto no encontrado</h2>
          <p class="text-secondary mt-2">El artículo solicitado ha sido removido del catálogo o no existe.</p>
          <a href="#/${this.companyId}" class="btn btn-primary btn-sm mt-4" style="text-decoration:none;">Volver al catálogo</a>
        </div>
      `;
      return;
    }

    const companyName = info.nombre || this.companyId.replace(/-/g, ' ');
    const mainPrice = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(p.price || 0);

    const oldPrice = p.price * 1.25;
    const oldPriceFormatted = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(oldPrice);
    const hasPromo = p.stock % 2 === 0;

    // QR Code generation URL
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(window.location.href)}&color=7c75ff`;

    // Prefilled WhatsApp message
    const msgText = encodeURIComponent(`Hola, estoy interesado en el producto "${p.name}" con precio ${mainPrice} en ${companyName}. ¿Tienen disponibilidad?`);
    const waUrl = cfg.socials?.whatsapp 
      ? `https://wa.me/${cfg.socials.whatsapp}?text=${msgText}`
      : `https://wa.me/5215500000000?text=${msgText}`; // Demo default fallback

    root.innerHTML = `
      <!-- Simple Back Header -->
      <header style="background:var(--pub-surface); border-bottom:1px solid var(--pub-border); sticky:top; z-index:90;">
        <div class="pub-container d-flex justify-content-between align-items-center" style="height:60px; padding:0 var(--space-4);">
          <a href="#/${this.companyId}" class="text-primary font-semibold d-flex align-items-center gap-2" style="text-decoration:none; font-size:0.875rem;">
            ⬅️ Volver a ${companyName}
          </a>
          <span class="text-xs text-secondary font-mono">${p.sku || 'SKU/Código'}</span>
        </div>
      </header>

      <!-- Main Columns Grid -->
      <main class="pub-container pub-detail-wrapper" style="color:var(--pub-text); margin-top:var(--space-6);">
        <!-- Column 1: Image Gallery & QR -->
        <div class="pub-gallery-container">
          <div class="pub-gallery-main-wrapper">
            <img src="${this.state.activeImage || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800'}" class="pub-gallery-main" id="gallery-main-img" alt="${p.name}" />
          </div>

          <!-- Dummy Gallery Thumbnails -->
          <div class="pub-gallery-thumbs">
            <div class="pub-gallery-thumb active"><img src="${p.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500'}" /></div>
            <div class="pub-gallery-thumb"><img src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500" /></div>
            <div class="pub-gallery-thumb"><img src="https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=500" /></div>
          </div>

          <!-- QR Code Info Box -->
          <div class="card p-4 mt-4" style="background:var(--pub-surface); border-color:var(--pub-border); display:flex; flex-direction:row; align-items:center; gap:var(--space-4);">
            <img src="${qrUrl}" style="width:90px; height:90px; border-radius:var(--radius-md); background:white; padding:4px;" alt="QR Code" />
            <div>
              <h5 class="font-semibold text-sm mb-1">Escanea el código</h5>
              <p class="text-xs text-secondary mb-2">Comparte este artículo con tus amigos o ábrelo en tu teléfono.</p>
              <a href="${qrUrl}" download="qr-producto.png" target="_blank" class="btn btn-secondary btn-xs" style="text-decoration:none; padding:2px 8px; font-size:0.65rem;">💾 Descargar QR</a>
            </div>
          </div>
        </div>

        <!-- Column 2: Information and Purchasing -->
        <div class="pub-detail-info">
          <div>
            <span class="badge" style="background-color: var(--pub-primary); color: white; padding: 2px 8px; border-radius: var(--radius-sm); font-size: 0.7rem; text-transform: uppercase;">
              ${p.category || 'Otros'}
            </span>
            <h1 style="font-size:2rem; font-weight:800; margin: 10px 0 6px 0; font-family:var(--font-display); line-height:1.2;">${p.name}</h1>
          </div>

          <!-- Price Tag Section -->
          <div style="padding:var(--space-4); background:var(--pub-surface); border:1px solid var(--pub-border); border-radius:var(--pub-radius);">
            <div style="display:flex; align-items:baseline; gap:10px;">
              <span style="font-size:2.25rem; font-weight:800; color:var(--pub-primary); font-family:var(--font-display);">${mainPrice}</span>
              ${hasPromo ? `<span style="font-size:1.1rem; text-decoration:line-through; color:var(--pub-text-sec);">${oldPriceFormatted}</span>` : ''}
            </div>
            
            <div class="d-flex align-items-center gap-3 mt-3">
              <!-- Stock level warning badge -->
              ${Number(p.stock || 0) === 0 
                ? `<span class="stock-badge stock-out">⚠️ Agotado</span>` 
                : (Number(p.stock || 0) <= Number(p.minStock || 0) 
                  ? `<span class="stock-badge stock-low">⚠️ Pocas unidades</span>` 
                  : `<span class="stock-badge stock-ok">✔️ Disponible</span>`)}
              
              <span class="text-xs text-secondary">${p.stock} unidades disponibles en almacén</span>
            </div>
          </div>

          <!-- Description Section -->
          <div>
            <h4 class="font-semibold text-sm mb-2">Descripción del Producto</h4>
            <p class="text-sm text-secondary" style="line-height:1.6;">
              ${p.description || 'Este artículo cuenta con los más altos estándares de calidad de la marca. No te quedes sin probar sus sabores e ingredientes premium seleccionados por expertos de la industria.'}
            </p>
          </div>

          <!-- Store Info Block: Location, Brand, Presentation, Nutrition -->
          ${(p.location || p.brand || p.presentation || p.nutritionInfo) ? `
            <div style="background: rgba(22,163,74,0.06); border: 1px solid rgba(22,163,74,0.18); border-radius: var(--pub-radius); padding: var(--space-4); display: flex; flex-direction: column; gap: 10px;">
              ${p.location ? `
                <div>
                  <span style="font-size:0.72rem; font-weight:700; text-transform:uppercase; color:#16a34a; letter-spacing:0.5px; display:block; margin-bottom:4px;">📍 Ubicación en Tienda</span>
                  <span class="text-sm font-semibold" style="color:var(--pub-text);">${p.location}</span>
                </div>
              ` : ''}
              ${(p.brand || p.presentation) ? `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; border-top: 1px solid rgba(22,163,74,0.12); padding-top: 10px;">
                  ${p.brand ? `
                    <div>
                      <span style="font-size:0.72rem; font-weight:700; text-transform:uppercase; color:#16a34a; letter-spacing:0.5px; display:block; margin-bottom:2px;">🏷️ Marca</span>
                      <span class="text-sm" style="color:var(--pub-text);">${p.brand}</span>
                    </div>
                  ` : ''}
                  ${p.presentation ? `
                    <div>
                      <span style="font-size:0.72rem; font-weight:700; text-transform:uppercase; color:#16a34a; letter-spacing:0.5px; display:block; margin-bottom:2px;">📦 Presentación</span>
                      <span class="text-sm" style="color:var(--pub-text);">${p.presentation}</span>
                    </div>
                  ` : ''}
                </div>
              ` : ''}
              ${p.nutritionInfo ? `
                <div style="border-top: 1px solid rgba(22,163,74,0.12); padding-top: 10px;">
                  <span style="font-size:0.72rem; font-weight:700; text-transform:uppercase; color:#16a34a; letter-spacing:0.5px; display:block; margin-bottom:4px;">🍽️ Información Nutricional</span>
                  <p class="text-xs text-secondary" style="line-height:1.5; white-space: pre-line;">${p.nutritionInfo}</p>
                </div>
              ` : ''}
            </div>
          ` : ''}

          <!-- Call to Actions -->
          <div class="d-flex flex-column gap-3 mt-2">
            <a href="${waUrl}" target="_blank" class="btn btn-primary btn-md btn-detail-wa-click" style="text-decoration:none; display:flex; align-items:center; justify-content:center; gap:8px; font-weight:700; font-size:0.95rem; height:46px;">
              💬 Consultar y Pedir por WhatsApp
            </a>
            
            <button class="btn btn-secondary btn-md btn-copy-link" style="display:flex; align-items:center; justify-content:center; gap:8px; font-size:0.875rem; height:40px;">
              🔗 Copiar enlace de este producto
            </button>
          </div>

          <!-- Social Share Icons bar -->
          <div style="display:flex; align-items:center; gap:12px; margin-top:10px;">
            <span class="text-xs text-secondary">Compartir en:</span>
            <div class="pub-social-bar">
              <a href="https://wa.me/?text=${encodeURIComponent(window.location.href)}" target="_blank" class="pub-social-btn" style="width:30px; height:30px; font-size:0.75rem;">💬</a>
              <a href="https://facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}" target="_blank" class="pub-social-btn" style="width:30px; height:30px; font-size:0.75rem;">📘</a>
              <a href="https://t.me/share/url?url=${encodeURIComponent(window.location.href)}" target="_blank" class="pub-social-btn" style="width:30px; height:30px; font-size:0.75rem;">✈️</a>
            </div>
          </div>
        </div>
      </main>

      <!-- Customer Reviews list / add reviews -->
      <section class="pub-container mt-8" id="reviews-section" style="color:var(--pub-text); border-top:1px solid var(--pub-border); padding-top:var(--space-6);">
        <!-- Dynamically rendered reviews section -->
      </section>
    `;

    this.bindEvents(root);
    this.renderReviewsSection(root);
  }

  bindEvents(root) {
    // 1. Image thumbnails switcher
    root.querySelectorAll('.pub-gallery-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => {
        root.querySelectorAll('.pub-gallery-thumb').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
        
        const newSrc = thumb.querySelector('img').getAttribute('src');
        const mainImg = root.querySelector('#gallery-main-img');
        if (mainImg) mainImg.setAttribute('src', newSrc);
      });
    });

    // 2. Click WhatsApp analytics trigger
    const waBtn = root.querySelector('.btn-detail-wa-click');
    if (waBtn) {
      waBtn.addEventListener('click', () => {
        try {
          FirestoreService.incrementPathValue(`${this.companyId}/estadisticas/clics/whatsapp`, 1);
        } catch (e) {
          console.warn('[ProductDetailView] WhatsApp stat error:', e);
        }
      });
    }

    // 3. Copy Link to clipboard
    const copyBtn = root.querySelector('.btn-copy-link');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(window.location.href);
        NotificationService.success('Enlace de producto copiado al portapapeles.');
      });
    }
  }

  renderReviewsSection(root) {
    const section = root.querySelector('#reviews-section');
    if (!section) return;

    const cfg = this.state.config || {};
    if (cfg.enableReviews === false) {
      section.innerHTML = '';
      return;
    }

    const { reviews } = this.state;
    const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + Number(r.rating || 5), 0) / reviews.length).toFixed(1) : '5.0';

    const reviewsListHTML = reviews.length > 0 ? reviews.map(r => `
      <div class="review-card">
        <div class="d-flex justify-content-between align-items-center">
          <strong style="font-size:0.875rem;">👤 ${r.name || 'Cliente Anónimo'}</strong>
          <span class="review-stars">${'★'.repeat(r.rating || 5)}${'☆'.repeat(5 - (r.rating || 5))}</span>
        </div>
        <p class="text-xs text-secondary mt-1" style="font-size:0.75rem;">${new Date(r.date || Date.now()).toLocaleDateString()}</p>
        <p class="text-sm mt-2" style="line-height:1.4;">${r.comment || ''}</p>
      </div>
    `).join('') : '<p class="text-xs text-secondary text-center py-4">No hay calificaciones todavía. ¡Sé el primero en dejar una opinión!</p>';

    section.innerHTML = `
      <div class="grid-responsive">
        <!-- Reviews List -->
        <div class="col-8">
          <div class="d-flex justify-content-between align-items-center mb-4">
            <h3 class="text-lg font-semibold">Valoraciones de Clientes</h3>
            <span class="text-sm font-bold text-warning">⭐️ ${avgRating} / 5 (${reviews.length} opiniones)</span>
          </div>
          <div class="d-flex flex-column gap-3">
            ${reviewsListHTML}
          </div>
        </div>

        <!-- Add Review Form -->
        <div class="col-4">
          <div class="card p-5" style="background:var(--pub-surface); border-color:var(--pub-border);">
            <h3 class="text-md font-semibold mb-3">Deja tu opinión</h3>
            <form id="add-review-form" class="d-flex flex-column gap-3">
              <div class="form-group">
                <label class="form-label" style="font-size:0.75rem;" for="rev-name">Tu nombre</label>
                <input type="text" id="rev-name" class="input input-sm" style="background:var(--pub-bg); border-color:var(--pub-border); color:var(--pub-text);" placeholder="Ej. Ana L." required />
              </div>

              <div class="form-group">
                <label class="form-label" style="font-size:0.75rem;" for="rev-rating">Calificación</label>
                <select id="rev-rating" class="input input-sm" style="background:var(--pub-bg); border-color:var(--pub-border); color:var(--pub-text); padding:0 var(--space-2);">
                  <option value="5">⭐⭐⭐⭐⭐ Excelente</option>
                  <option value="4">⭐⭐⭐⭐ Muy bueno</option>
                  <option value="3">⭐⭐⭐ Aceptable</option>
                  <option value="2">⭐⭐ Regular</option>
                  <option value="1">⭐ Deficiente</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" style="font-size:0.75rem;" for="rev-comment">Comentario</label>
                <textarea id="rev-comment" class="input" style="background:var(--pub-bg); border-color:var(--pub-border); color:var(--pub-text); height:80px; padding:var(--space-2); font-size:0.8rem;" placeholder="Cuéntanos tu experiencia con este producto..." required></textarea>
              </div>

              <button type="submit" class="btn btn-primary btn-sm" id="btn-submit-review">Enviar Calificación</button>
            </form>
          </div>
        </div>
      </div>
    `;

    // Bind submit review event
    const form = section.querySelector('#add-review-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitReview(form);
      });
    }
  }

  async submitReview(form) {
    const name = form.querySelector('#rev-name').value.trim();
    const rating = Number(form.querySelector('#rev-rating').value);
    const comment = form.querySelector('#rev-comment').value.trim();
    const submitBtn = form.querySelector('#btn-submit-review');

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';
    }

    try {
      await FirestoreService.create(`${this.companyId}/reviews/${this.productId}`, {
        name,
        rating,
        comment,
        date: Date.now()
      });

      NotificationService.success('Tu opinión ha sido registrada con éxito.');
      form.reset();
    } catch (err) {
      console.error('[ProductDetailView] Error submitting review:', err);
      alert(`Error al registrar tu reseña: ${err.message}`);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar Calificación';
      }
    }
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    super.unmount();
  }
}
