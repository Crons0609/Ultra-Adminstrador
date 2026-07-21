/**
 * @file menu.view.js
 * @description Vista del menú digital para el cliente, accedida via código QR.
 * Soporta selección de tipo de cuenta, Happy Hour automático para bares y consulta de consumo acumulado en vivo.
 */

import { Component } from '../../../core/component.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { Modal } from '../../../components/ui/modal.js';
import { getBusinessCategory } from '../../../config/business-types.config.js';

export class MenuView extends Component {
  constructor(params = {}) {
    super(params);
    try {
      let rawId = params.companyId || sessionStorage.getItem('ua_customer_companyId') || '';
      if (rawId.includes('%EF%BF%BD')) {
        rawId = rawId.replace(/%EF%BF%BD/gi, '');
      }
      this.companyId = decodeURIComponent(rawId);
    } catch (_) {
      this.companyId = params.companyId || sessionStorage.getItem('ua_customer_companyId') || '';
    }
    this.branchId = params.branchId || sessionStorage.getItem('ua_customer_branchId') || 'main';
    this.tableId = params.tableId || sessionStorage.getItem('ua_customer_tableId') || '';

    // Default tableId fallback
    if (!this.tableId) this.tableId = 'general';
    if (this.companyId) sessionStorage.setItem('ua_customer_companyId', this.companyId);
    if (this.branchId) sessionStorage.setItem('ua_customer_branchId', this.branchId);
    if (this.tableId) sessionStorage.setItem('ua_customer_tableId', this.tableId);

    // Auto-default accountType for non-restaurant scans or general locations
    let savedAccountType = sessionStorage.getItem('ua_customer_accountType');
    if (!savedAccountType && (this.tableId === 'general' || this.tableId.includes('zona') || this.tableId.includes('habitacion'))) {
      savedAccountType = 'CONJUNTA';
      sessionStorage.setItem('ua_customer_accountType', 'CONJUNTA');
    }

    this.state = {
      accountType: savedAccountType || '', // 'CONJUNTA' | 'SEPARADO'
      clientName: sessionStorage.getItem('ua_customer_clientName') || '',
      products: [],
      categories: [],
      orders: [],
      promotions: [],
      activeCategory: 'Todos',
      searchQuery: '',
      loading: true,
      info: null,
      cart: JSON.parse(sessionStorage.getItem('ua_customer_cart') || '[]'),
    };

    this.listeners = [];
  }

  mount() {
    const root = document.createElement('div');
    root.className = 'public-catalog-root';
    this.element = root;

    if (!this.companyId) {
      root.innerHTML = `
        <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px;">
          <div class="card p-8 text-center" style="max-width: 400px; border-top: 4px solid var(--color-danger);">
            <div style="font-size: 3rem; margin-bottom: 15px;">⚠️</div>
            <h3 class="font-bold text-lg">Código QR Inválido</h3>
            <p class="text-xs text-secondary mt-2">
              El enlace de acceso es incorrecto o está incompleto. Por favor escanea el código QR del establecimiento nuevamente.
            </p>
          </div>
        </div>
      `;
      return root;
    }

    if (!this.state.accountType) {
      this.renderSetupScreen(root);
    } else {
      this.loadMenuData(root);
    }

    return root;
  }

  // 1. Initial screen: choose account type (joint or separate)
  renderSetupScreen(root) {
    root.innerHTML = `
      <style>
        .setup-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-4);
          background: linear-gradient(135deg, var(--pub-bg), var(--pub-surface));
        }
        .setup-card {
          width: 100%;
          max-width: 440px;
          background: var(--pub-surface);
          border: 1px solid var(--pub-border);
          border-radius: 16px;
          padding: var(--space-6);
          box-shadow: var(--shadow-lg);
          display: flex;
          flex-direction: column;
          gap: var(--space-5);
        }
        .option-button {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--pub-border);
          border-radius: 12px;
          padding: var(--space-4);
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          text-align: left;
        }
        .option-button:hover, .option-button.active {
          background: rgba(124, 117, 255, 0.08);
          border-color: var(--pub-primary);
          transform: translateY(-2px);
        }
        .option-icon {
          font-size: 2rem;
          background: rgba(255,255,255,0.04);
          width: 50px;
          height: 50px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .option-title {
          font-weight: 700;
          font-size: 0.95rem;
          color: var(--pub-text);
        }
        .option-desc {
          font-size: 0.78rem;
          color: var(--pub-text-sec);
          margin-top: 2px;
        }
        .name-input-group {
          display: none;
          flex-direction: column;
          gap: 6px;
          animation: slideDown 0.3s ease;
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      </style>

      <div class="setup-container">
        <div class="setup-card animate-slide-up">
          <div class="text-center">
            <span style="font-size: 3rem;">🍽️</span>
            <h2 class="font-bold mt-2" style="font-size: 1.4rem; color: var(--pub-text);">¡Bienvenidos!</h2>
            <p class="text-xs text-secondary mt-1">Mesa/VIP ${this.tableId.replace('mesa-', '')} · Configura tu servicio</p>
          </div>

          <div>
            <label class="form-label" style="font-size: 0.82rem; margin-bottom: var(--space-2); display:block; font-weight:600;">¿Cómo desean ordenar la cuenta?</label>
            <div class="d-flex flex-column gap-3">
              <button class="option-button" id="opt-conjunta">
                <div class="option-icon">🤝</div>
                <div>
                  <div class="option-title">Cuenta Conjunta</div>
                  <div class="option-desc">Una sola cuenta para toda la mesa</div>
                </div>
              </button>
              <button class="option-button" id="opt-separado">
                <div class="option-icon">👤</div>
                <div>
                  <div class="option-title">Cuentas por Separado</div>
                  <div class="option-desc">Cada comensal ordena y paga lo suyo</div>
                </div>
              </button>
            </div>
          </div>

          <div class="name-input-group" id="name-group">
            <label class="form-label" for="client-name-input" style="font-size: 0.82rem; font-weight:600;">Tu Nombre o Asiento *</label>
            <input type="text" id="client-name-input" class="input input-md" placeholder="Ej. Juan - Asiento 1" style="background:var(--pub-surface); color:var(--pub-text); border-color:var(--pub-border);" />
          </div>

          <button class="btn btn-primary w-full py-3 font-semibold" id="btn-start-menu" style="background:var(--pub-primary); border:none; border-radius:10px;">
            Ingresar al Menú Digital
          </button>
        </div>
      </div>
    `;

    const btnConjunta = root.querySelector('#opt-conjunta');
    const btnSeparado = root.querySelector('#opt-separado');
    const nameGroup = root.querySelector('#name-group');
    const inputName = root.querySelector('#client-name-input');
    const btnStart = root.querySelector('#btn-start-menu');

    let selectedType = 'CONJUNTA';
    btnConjunta.classList.add('active');

    btnConjunta.addEventListener('click', () => {
      selectedType = 'CONJUNTA';
      btnConjunta.classList.add('active');
      btnSeparado.classList.remove('active');
      nameGroup.style.display = 'none';
      btnStart.disabled = false;
    });

    btnSeparado.addEventListener('click', () => {
      selectedType = 'SEPARADO';
      btnSeparado.classList.add('active');
      btnConjunta.classList.remove('active');
      nameGroup.style.display = 'flex';
      inputName.focus();
      this.validateForm(selectedType, inputName.value, btnStart);
    });

    inputName.addEventListener('input', () => {
      this.validateForm(selectedType, inputName.value, btnStart);
    });

    btnStart.addEventListener('click', () => {
      const nameVal = inputName.value.trim();
      sessionStorage.setItem('ua_customer_accountType', selectedType);
      sessionStorage.setItem('ua_customer_clientName', selectedType === 'SEPARADO' ? nameVal : '');
      this.state.accountType = selectedType;
      this.state.clientName = selectedType === 'SEPARADO' ? nameVal : '';
      this.loadMenuData(root);
    });
  }

  validateForm(type, name, btn) {
    if (type === 'CONJUNTA') {
      btn.disabled = false;
    } else if (type === 'SEPARADO') {
      btn.disabled = name.trim().length < 2;
    }
  }

  // 2. Load digital menu data (products, local info, and active orders for consumption)
  loadMenuData(root) {
    this.renderSkeleton(root);

    const activeId = this.companyId;
    const sanitizedId = FirestoreService.sanitiseKey(activeId);

    const startListeners = (targetId) => {
      // Fetch local profile
      const infoUnsub = FirestoreService.listenToPathRaw(`${targetId}/informacion_local`, (info) => {
        if (!info && targetId !== sanitizedId && sanitizedId) {
          startListeners(sanitizedId);
          return;
        }
        this.state.info = info || {};
        this.checkDataLoaded(root);
      });
      this.listeners.push(infoUnsub);

      // Fetch products
      const prodUnsub = FirestoreService.listenToPath(`${targetId}/productos`, (products) => {
        this.state.products = (products || []).filter(p => {
          if (p.isActive === false) return false;
          // Only hide items if trackStock is explicitly enabled and stock is 0
          if (p.trackStock === true && typeof p.stock === 'number' && p.stock <= 0) return false;
          return true;
        });
        this.state.categories = ['Todos', ...new Set(this.state.products.map(p => p.category).filter(Boolean))];
        this.state.loading = false;
        this.checkDataLoaded(root);
      });
      this.listeners.push(prodUnsub);

      // Fetch active orders to calculate cumulative consumption (ruta tenant correcta)
      const ordersUnsub = FirestoreService.listenToPathRaw(`${targetId}/orders`, (orders) => {
        this.state.orders = orders ? Object.entries(orders).map(([id, o]) => ({ id, ...o })) : [];
        this.renderMenu(root);
      });
      this.listeners.push(ordersUnsub);

      // Fetch active promotions for this company
      const promoUnsub = FirestoreService.listenToPath(`${targetId}/promociones`, (promos) => {
        const now = Date.now();
        const today = new Date();
        const isoDay = today.getDay(); // 0=Dom, 6=Sáb
        this.state.promotions = (promos || []).filter(p => {
          if (p.isActive === false) return false;
          if (p.expiresAt && p.expiresAt < now) return false;
          if (p.type === 'FIN_SEMANA' && isoDay !== 0 && isoDay !== 6) return false;
          if (p.type === 'LOTE' && (p.loteCantidad === 0)) return false;
          return true;
        });
        this.renderMenu(root);
      });
      this.listeners.push(promoUnsub);
    };

    startListeners(activeId);
  }

  checkDataLoaded(root) {
    if (this.state.info !== null && !this.state.loading) {
      this.renderMenu(root);
    }
  }

  renderSkeleton(root) {
    root.innerHTML = `
      <div class="pub-skeleton-hero"></div>
      <div class="pub-container" style="margin-top: var(--space-6);">
        <div class="pub-skeleton-toolbar"></div>
        <div class="pub-skeleton-chips">
          ${Array.from({ length: 4 }).map(() => '<div class="pub-skeleton-chip"></div>').join('')}
        </div>
        <div class="pub-grid">
          ${Array.from({ length: 6 }).map(() => `
            <div class="pub-skeleton-card">
              <div class="pub-skeleton-card-img"></div>
              <div class="pub-skeleton-card-body">
                <div class="pub-skeleton-line" style="width:70%"></div>
                <div class="pub-skeleton-line" style="width:40%"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  renderMenu(root) {
    const info = this.state.info || {};
    const companyName = info.nombre || this.companyId.replace(/-/g, ' ');
    const logoURL = info.logo || '';
    const hours = info.horario || 'Abierto hoy';

    // Business type category detection
    const category = getBusinessCategory(info.businessType || '');
    const isBar = category === 'BAR_DISCOTECA';
    const isServices = category === 'SERVICIOS_PERSONALIZADOS';

    // Apply specific nocturnal custom styles if it's a bar/club
    if (isBar) {
      root.style.setProperty('--pub-primary', '#a855f7'); // Neon Purple
      root.style.setProperty('--pub-bg', '#09090b'); // Dark Vibe
      root.style.setProperty('--pub-surface', '#121217'); // Dark Card
      root.style.setProperty('--pub-border', '#221e2f');
      root.style.setProperty('--pub-text', '#fafafa');
      root.style.setProperty('--pub-text-sec', '#9ca3af');
    }

    const logoHTML = logoURL
      ? `<img src="${logoURL}" class="pub-logo" alt="${companyName} Logo" />`
      : `<span class="pub-logo-fallback" style="${isBar ? 'background:#a855f7; color:#fff;' : ''}">${companyName[0]?.toUpperCase() || 'R'}</span>`;

    // Filter products
    const query = this.state.searchQuery.toLowerCase();
    const filtered = this.state.products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(query) || (p.description || '').toLowerCase().includes(query);
      const matchesCategory = this.state.activeCategory === 'Todos' || p.category === this.state.activeCategory;
      return matchesSearch && matchesCategory;
    });

    // Check Happy Hour schedule (e.g. 5:00 PM - 8:00 PM)
    const nowHour = new Date().getHours();
    const isHappyHour = isBar && (nowHour >= 17 && nowHour < 20);

    // Calculate cumulative consumption
    const activeConsumption = this.state.orders.filter(o => 
      o.tableId === this.tableId && 
      (this.state.accountType === 'SEPARADO' ? o.clientName === this.state.clientName : true) &&
      o.status !== 'COMPLETED' && 
      o.status !== 'CANCELADA'
    );
    const accumulatedTotal = activeConsumption.reduce((sum, o) => sum + Number(o.total || 0), 0);

    root.innerHTML = `
      <style>
        .floating-cart-bar {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          width: 92%;
          max-width: 540px;
          background: rgba(22, 22, 26, 0.92);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          padding: 14px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          z-index: 1000;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
          animation: floatIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes floatIn {
          from { opacity: 0; transform: translate(-50%, 20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .pub-menu-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: var(--space-4);
          padding-bottom: 120px;
        }
        .pub-menu-card {
          background: var(--pub-surface);
          border: 1px solid var(--pub-border);
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          height: 100%;
          position: relative;
        }
        .pub-menu-img-wrap {
          height: 160px;
          background: rgba(255,255,255,0.02);
          position: relative;
        }
        .pub-menu-img {
          width: 100%; height: 100%; object-fit: cover;
        }
        .pub-menu-img-fallback {
          font-size: 3rem; display: flex; align-items: center; justify-content: center; height: 100%;
        }
        .pub-menu-body {
          padding: var(--space-4);
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex-grow: 1;
        }
        .pub-menu-price-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: auto;
          padding-top: var(--space-3);
        }
        .vip-badge {
          background: #fbbf24;
          color: #000;
          font-size: 0.65rem;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 4px;
          margin-left: 6px;
        }
      </style>

      <!-- Minimal Hero -->
      <div class="pub-hero" style="border-radius:0;">
        <div class="pub-cover-container">
          <div class="pub-cover pub-cover-gradient" style="${isBar ? 'background: linear-gradient(135deg, #a855f7, #121217);' : ''}"></div>
          <div class="pub-cover-overlay"></div>
        </div>
        <div class="pub-profile-overlay pub-container">
          <div class="pub-logo-wrapper">${logoHTML}</div>
          <div class="pub-info-block">
            <h1 class="pub-name">${companyName}</h1>
            <div class="pub-meta-row">
              <span class="pub-meta-item">📍 ${isServices ? 'Ubicación: General' : `Mesa: ${this.tableId.replace('mesa-', '')}`}</span>
              <span class="pub-meta-item">⏱ ${hours}</span>
              <span class="pub-meta-item pub-account-badge">
                ● Cuenta: ${this.state.accountType === 'CONJUNTA' ? 'Conjunta' : `Separada (${this.state.clientName})`}
              </span>
            </div>
          </div>
          ${accumulatedTotal > 0 ? `
            <button class="btn btn-secondary btn-sm pub-consumption-btn" id="btn-view-consumption">
              🧾 Mi Consumo: $${accumulatedTotal.toFixed(2)}
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Main Body -->
      <main class="pub-container" style="margin-top: var(--space-4);">
        <!-- Search bar -->
        <div class="pub-toolbar">
          <div class="pub-search-wrap">
            <svg class="pub-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="menu-search" class="pub-search-input" placeholder="${isBar ? 'Buscar bebidas, tragos, snacks...' : (isServices ? 'Buscar productos o servicios...' : 'Buscar en el catálogo...')}" value="${this.state.searchQuery}" autocomplete="off" />
          </div>
        </div>

        <!-- Category Carousel -->
        <div class="pub-category-carousel" id="menu-cat-carousel" style="margin-bottom: var(--space-5);">
          ${this.state.categories.map(cat => `
            <button class="pub-cat-pill ${this.state.activeCategory === cat ? 'active' : ''}" data-category="${cat}">
              ${cat}
            </button>
          `).join('')}
        </div>

        <!-- Products Grid -->
        <div class="pub-menu-grid">
          ${filtered.length === 0 ? `
            <div class="text-center py-10 w-full text-secondary" style="grid-column: 1 / -1;">
              <p>No se encontraron productos o servicios en esta categoría.</p>
            </div>
          ` : filtered.map(p => {
            const hasImage = p.image && p.image.startsWith('http');
            const desc = p.description || (isServices ? 'Servicio / Producto de alta calidad.' : (isBar ? 'Preparado con ingredientes premium en barra.' : 'Producto disponible para pedido.'));
            
            // Happy Hour promotion calculations
            let price = Number(p.price || 0);
            let oldPriceHTML = '';
            let happyHourBadge = '';

            const isDrink = ['cóctel', 'cócteles', 'cerveza', 'cervezas', 'bebidas alcohólicas', 'licor', 'licores', 'tragos', 'bebidas'].some(c => (p.category || '').toLowerCase().includes(c));

            if (isHappyHour && isDrink) {
              const oldPrice = price;
              price = oldPrice * 0.80; // 20% Discount
              oldPriceHTML = `<span style="text-decoration: line-through; color: var(--pub-text-sec); font-size: 0.8rem; margin-right:6px;">$${oldPrice.toFixed(2)}</span>`;
              happyHourBadge = `<span style="position: absolute; top: 10px; left: 10px; background: #a855f7; color: #fff; font-size: 0.65rem; font-weight: 800; padding: 4px 8px; border-radius: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.4); z-index:2;">🎉 Happy Hour 20% OFF</span>`;
            }

            // ── Active Promotions overlay (from promociones collection) ───────
            // Match by productId or global (no productId) promotions
            const activePromo = this.state.promotions.find(pr =>
              !pr.productId || pr.productId === p.id
            );
            let promoBadge = '';
            p._promoSoldOut = false;
            if (activePromo && !happyHourBadge) {
              const disc = Number(activePromo.discount || 0);
              if (disc > 0) {
                const oldP = price;
                price = oldP * (1 - disc / 100);
                oldPriceHTML = `<span style="text-decoration:line-through;color:var(--pub-text-sec);font-size:0.8rem;margin-right:6px;">$${oldP.toFixed(2)}</span>`;
              }
              const promoColors = { DIA: '#fbbf24', SEMANA: '#34d399', FIN_SEMANA: '#818cf8', LOTE: '#fb923c' };
              const promoIcons  = { DIA: '📅', SEMANA: '📆', FIN_SEMANA: '🎉', LOTE: '📦' };
              const pColor = promoColors[activePromo.type] || '#7c75ff';
              const pIcon  = promoIcons[activePromo.type]  || '🏷️';
              promoBadge = `<span style="position:absolute;top:10px;left:10px;background:${pColor};color:#000;font-size:0.62rem;font-weight:800;padding:4px 8px;border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,0.35);z-index:2;">${pIcon} ${disc}% OFF</span>`;
              // Mark LOTE as sold out if stock exhausted
              if (activePromo.type === 'LOTE' && (activePromo.loteCantidad ?? 1) <= 0) {
                p._promoSoldOut = true;
                promoBadge = `<span style="position:absolute;top:10px;left:10px;background:#f87171;color:#fff;font-size:0.62rem;font-weight:800;padding:4px 8px;border-radius:4px;z-index:2;">📦 Agotado</span>`;
              }
            }

            return `
              <div class="pub-menu-card animate-slide-up">
                ${happyHourBadge}
                ${promoBadge}
                <div class="pub-menu-img-wrap">
                  ${hasImage ? `<img src="${p.image}" class="pub-menu-img" alt="${p.name}"/>` : `<div class="pub-menu-img-fallback" style="${isBar ? 'color:#a855f7;' : ''}">🍹</div>`}
                </div>
                <div class="pub-menu-body">
                  <h4 class="font-bold text-sm" style="color:var(--pub-text);">${p.name}</h4>
                  <p class="text-xs" style="color:var(--pub-text-sec); line-height:1.4;">${desc}</p>
                  <div class="pub-menu-price-row">
                    <div>
                      ${oldPriceHTML}
                      <strong class="text-md" style="color:var(--pub-primary); font-size:1.05rem;">$${price.toFixed(2)}</strong>
                    </div>
                    <button class="btn btn-secondary btn-xs btn-add-item" data-id="${p.id}"
                      style="border-radius:6px; padding:6px 12px; font-weight:600; ${isBar ? 'border-color:var(--pub-border);' : ''} ${p._promoSoldOut ? 'opacity:0.45;cursor:not-allowed;' : ''}"
                      ${p._promoSoldOut ? 'disabled' : ''}>
                      ${p._promoSoldOut ? '❌ Agotado' : '+ Agregar'}
                    </button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </main>

      <!-- Floating Cart Panel -->
      ${this.renderFloatingCart()}
    `;

    this.bindMenuEvents(root);
  }

  renderFloatingCart() {
    if (this.state.cart.length === 0) return '';
    const totalQty = this.state.cart.reduce((sum, item) => sum + item.qty, 0);
    const totalPrice = this.state.cart.reduce((sum, item) => sum + item.total, 0);

    return `
      <div class="floating-cart-bar">
        <div>
          <div style="color:#fff; font-weight:700; font-size:0.95rem;">${totalQty} items agregados</div>
          <div style="color:var(--pub-primary); font-weight:800; font-size:1.1rem; margin-top:2px;">$${totalPrice.toFixed(2)}</div>
        </div>
        <button class="btn btn-primary btn-sm px-6 font-semibold" id="btn-view-cart" style="background:var(--pub-primary); border:none; border-radius:8px;">
          Ver Carrito 🛒
        </button>
      </div>
    `;
  }

  bindMenuEvents(root) {
    // Search
    root.querySelector('#menu-search')?.addEventListener('input', (e) => {
      this.state.searchQuery = e.target.value;
      this.renderMenu(root);
    });

    // Category chips
    root.querySelector('#menu-cat-carousel')?.addEventListener('click', (e) => {
      const pill = e.target.closest('.pub-cat-pill');
      if (pill) {
        this.state.activeCategory = pill.getAttribute('data-category');
        this.renderMenu(root);
      }
    });

    // Add to cart delegation
    root.querySelector('.pub-menu-grid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-add-item');
      if (btn) {
        const prodId = btn.getAttribute('data-id');
        this.addToCart(prodId);
      }
    });

    // View cart action
    root.querySelector('#btn-view-cart')?.addEventListener('click', () => {
      window.location.hash = '/customer/cart';
    });

    // View cumulative consumption modal
    root.querySelector('#btn-view-consumption')?.addEventListener('click', () => {
      this.openConsumptionModal();
    });
  }

  openConsumptionModal() {
    const activeOrders = this.state.orders.filter(o => 
      o.tableId === this.tableId && 
      (this.state.accountType === 'SEPARADO' ? o.clientName === this.state.clientName : true) &&
      o.status !== 'COMPLETED' && 
      o.status !== 'CANCELADA'
    );

    const total = activeOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

    const bodyHTML = `
      <div class="d-flex flex-column gap-3" style="max-height: 60vh; overflow-y: auto; color: var(--pub-text);">
        <h4 class="font-bold text-sm mb-2" style="border-bottom:1px solid var(--pub-border); padding-bottom:8px;">Consumo Acumulado — Mesa ${this.tableId.replace('mesa-', '')}</h4>
        
        ${activeOrders.map(o => {
          const itemsHTML = (o.items || []).map(i => `
            <div class="d-flex justify-content-between text-xs py-1" style="color:var(--pub-text-sec);">
              <span>${i.qty}x ${i.name}</span>
              <span>$${Number(i.total || 0).toFixed(2)}</span>
            </div>
          `).join('');

          return `
            <div class="p-3 mb-2" style="background: rgba(255,255,255,0.01); border: 1px solid var(--pub-border); border-radius:8px;">
              <div class="d-flex justify-content-between font-bold text-xs mb-2">
                <span>Pedido #${o.id.slice(-6).toUpperCase()}</span>
                <span class="badge" style="background:#fb923c22; color:#fb923c; font-size:0.65rem;">${o.status}</span>
              </div>
              ${itemsHTML}
              <div class="d-flex justify-content-between text-xs font-bold mt-2" style="border-top: 1px dotted var(--pub-border); padding-top:4px;">
                <span>Subtotal Pedido</span>
                <span style="color:var(--pub-primary);">$${Number(o.total || 0).toFixed(2)}</span>
              </div>
            </div>
          `;
        }).join('')}

        <div class="d-flex justify-content-between font-bold text-md mt-3" style="border-top: 1px solid var(--pub-border); padding-top:10px; font-size:1.1rem;">
          <span>Consumo Total Parcial:</span>
          <span style="color:var(--pub-primary); font-size:1.25rem;">$${total.toFixed(2)}</span>
        </div>
      </div>
    `;

    const consumptionModal = new Modal({
      title: '🧾 Mi Consumo Acumulado',
      bodyHTML,
      footerHTML: `<button class="btn btn-secondary btn-sm" id="btn-cons-close">Cerrar</button>`
    });

    document.body.appendChild(consumptionModal.mount());
    consumptionModal.$('#btn-cons-close').addEventListener('click', () => consumptionModal.close());
  }

  addToCart(prodId) {
    const prod = this.state.products.find(p => p.id === prodId);
    if (!prod) return;

    // Check Happy Hour schedule
    const category = getBusinessCategory(this.state.info?.businessType || '');
    const isBar = category === 'BAR_DISCOTECA';
    const nowHour = new Date().getHours();
    const isHappyHour = isBar && (nowHour >= 17 && nowHour < 20);
    const isDrink = ['cóctel', 'cócteles', 'cerveza', 'cervezas', 'bebidas alcohólicas', 'licor', 'licores', 'tragos', 'bebidas'].some(c => (prod.category || '').toLowerCase().includes(c));

    let price = Number(prod.price || 0);
    if (isHappyHour && isDrink) {
      price = price * 0.80; // 20% discount
    }

    const existing = this.state.cart.find(item => item.productId === prodId);
    if (existing) {
      existing.qty++;
      existing.total = existing.qty * existing.price;
    } else {
      this.state.cart.push({
        productId: prodId,
        name: prod.name,
        price: price,
        qty: 1,
        total: price,
      });
    }

    sessionStorage.setItem('ua_customer_cart', JSON.stringify(this.state.cart));
    NotificationService.success(`Agregado: ${prod.name}`);
    this.renderMenu(this.element);
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    super.unmount();
  }
}
