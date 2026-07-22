/**
 * @file header.js
 * @description Premium top header bar with notifications, breadcrumb, theme toggle, and user menu.
 */

import { Component } from '../../core/component.js';
import { GlobalStore } from '../../core/state.js';
import { AuthService } from '../../services/auth.service.js';
import { TimeService } from '../../services/time.service.js';
import { BarcodeScannerService } from '../../services/barcode-scanner.service.js';
import { BarcodeRegistryService } from '../../services/barcode-registry.service.js';
import { GeolocationService } from '../../services/geolocation.service.js';
import { NotificationService } from '../../services/notification.service.js';

export class Header extends Component {
  constructor(props = {}) {
    super(props);
    this.state = GlobalStore.getState();
  }

  getCurrentPageTitle() {
    const hash = window.location.hash;
    const pages = {
      '#/manager/dashboard': 'Dashboard',
      '#/owner/finance': 'Control Financiero',
      '#/owner/expenses': 'Gastos Operativos',
      '#/owner/balance': 'Balance General',
      '#/owner/projections': 'Proyecciones',
      '#/manager/employees': 'Empleados',
      '#/manager/qr-codes': 'Códigos QR',
      '#/manager/pricing': 'Precios Especiales',
      '#/manager/reports': 'Reportes',
      '#/inventory/products': 'Inventario',
      '#/super-admin/companies': 'Empresas',
      '#/super-admin/monitoring': 'Monitoreo',
      '#/super-admin/plans': 'Planes',
      '#/super-admin/billing': 'Facturación',
      '#/super-admin/logs': 'Logs del Sistema',
      '#/super-admin/settings': 'Ajustes',
      '#/cashier/pos': 'Punto de Venta',
      '#/cashier/payments': 'Pagos',
      '#/cashier/cash-register': 'Caja Chica',
      '#/cashier/invoices': 'Facturación',
      '#/waiter/tables': 'Mesas',
      '#/waiter/orders': 'Pedidos',
      '#/kitchen/kds': 'Kitchen Display',
      '#/kitchen/stats': 'Estadísticas de Cocina',
    };
    for (const [path, title] of Object.entries(pages)) {
      if (hash === path || hash.startsWith(path + '/')) return title;
    }
    return 'Panel de Control';
  }

  getGreeting() {
    const hour = TimeService.getHour();
    if (hour < 12) return 'Buenos días';
    if (hour < 18) return 'Buenas tardes';
    return 'Buenas noches';
  }

  render() {
    const { currentUser } = this.state;
    const pageTitle = this.getCurrentPageTitle();
    const greeting = this.getGreeting();
    const userName = currentUser ? currentUser.displayName.split(' ')[0] : 'Usuario';
    const userInitial = userName[0]?.toUpperCase() || 'U';

    return `
      <header class="header" id="main-header">
        <div class="header-left">
          <!-- Hamburger for mobile -->
          <button class="menu-toggle" id="sidebar-toggle-btn" aria-label="Abrir menú">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>

          <!-- Breadcrumb / Page Title -->
          <div class="header-breadcrumb">
            <span class="header-greeting">${greeting}, ${userName}</span>
            <span class="header-divider">·</span>
            <span class="header-page-title" id="header-page-title">${pageTitle}</span>
          </div>
        </div>

        <div class="header-right">
          <!-- Real-time Clock -->
          <div class="header-clock" id="header-clock"></div>

          <!-- Theme Switcher -->
          <button class="header-action" id="theme-toggle-btn" title="Cambiar tema" aria-label="Cambiar tema">
            <svg id="icon-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
            <svg id="icon-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" style="display:none">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          </button>

          <!-- Global Barcode Scanner Toggle -->
          <button class="scanner-toggle-btn" id="global-scanner-toggle-btn" title="Activar Escáner Global (Ctrl+B)">
            <div class="scanner-toggle-dot"></div>
            <span>📊 Escáner</span>
            <kbd class="scanner-toggle-kbd">Ctrl+B</kbd>
          </button>

          <!-- GPS Location Toggle (For Employees) -->
          ${currentUser && ['WAITER', 'CASHIER', 'KITCHEN'].includes(currentUser.role) ? `
            <button class="gps-header-btn ${GeolocationService.watchId ? 'active' : 'inactive'}" id="header-gps-btn" title="${GeolocationService.watchId ? 'Seguimiento GPS Activo (Clic para detener)' : 'Seguimiento GPS Inactivo (Clic para activar)'}">
              <span class="gps-dot"></span>
              <span id="header-gps-text">${GeolocationService.watchId ? 'GPS Activo' : 'Activar GPS'}</span>
            </button>
          ` : ''}

          <!-- User Profile Chip -->
          <div class="header-user-chip" id="header-user-chip">
            <div class="header-user-avatar">${userInitial}</div>
            <span class="header-user-name">${userName}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="opacity: 0.5">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </div>
      </header>
    `;
  }

  afterMount() {
    // Check and auto-resume or prompt employee for GPS tracking
    GeolocationService.checkAndPromptGPS();

    // 1. Sidebar toggle — supports both mobile slide-in and desktop rail collapse
    const toggleBtn = this.$('#sidebar-toggle-btn');
    const isMobile  = () => window.innerWidth <= 768;

    // ── Create mobile overlay (appended to body so it covers full screen) ──
    // The component only mounts firstElementChild, so we cannot rely on the
    // render() template for this — it must be created programmatically.
    let overlay = document.getElementById('sidebar-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sidebar-overlay';
      overlay.className = 'sidebar-overlay';
      document.body.appendChild(overlay);
    }
    this._overlay = overlay;

    // Helper: close mobile sidebar
    const closeMobileSidebar = () => {
      const sidebar = document.getElementById('main-sidebar');
      if (sidebar) sidebar.classList.remove('open');
      overlay.classList.remove('active');
    };

    // Restore saved desktop collapse preference
    const savedCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    if (!isMobile() && savedCollapsed) {
      const sidebar = document.getElementById('main-sidebar');
      if (sidebar) sidebar.classList.add('collapsed');
      document.body.classList.add('sidebar-collapsed');
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const sidebar = document.getElementById('main-sidebar');
        if (!sidebar) return;

        if (isMobile()) {
          // Mobile: slide sidebar in/out with overlay
          const isOpen = sidebar.classList.toggle('open');
          overlay.classList.toggle('active', isOpen);
        } else {
          // Desktop: collapse to rail / expand back
          const isCollapsed = sidebar.classList.toggle('collapsed');
          document.body.classList.toggle('sidebar-collapsed', isCollapsed);
          localStorage.setItem('sidebar-collapsed', isCollapsed);
        }
      });
    }

    // Clicking overlay closes the mobile sidebar
    overlay.addEventListener('click', closeMobileSidebar);

    // Tapping any sidebar nav link on mobile should also close the sidebar
    this._sidebarNavHandler = (e) => {
      if (isMobile() && e.target.closest('.sidebar-item')) {
        closeMobileSidebar();
      }
    };
    document.addEventListener('click', this._sidebarNavHandler);

    // 2. Theme switcher
    const themeBtn = this.$('#theme-toggle-btn');
    const iconDark = this.$('#icon-dark');
    const iconLight = this.$('#icon-light');
    const updateThemeIcon = () => {
      const isDark = document.body.classList.contains('theme-dark');
      if (iconDark) iconDark.style.display = isDark ? 'block' : 'none';
      if (iconLight) iconLight.style.display = isDark ? 'none' : 'block';
    };
    updateThemeIcon();
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const body = document.body;
        if (body.classList.contains('theme-dark')) {
          body.classList.replace('theme-dark', 'theme-light');
          localStorage.setItem('theme', 'theme-light');
        } else {
          body.classList.replace('theme-light', 'theme-dark');
          localStorage.setItem('theme', 'theme-dark');
        }
        updateThemeIcon();
      });
    }

    // 3. Real-time clock
    const clockEl = this.$('#header-clock');
    const updateClock = () => {
      if (clockEl) {
        clockEl.textContent = `${TimeService.formatTime()} NI`;
      }
    };
    updateClock();
    this._clockInterval = setInterval(updateClock, 1000);

    // 4. Update page title on hash change
    this._hashHandler = () => {
      const titleEl = this.$('#header-page-title');
      if (titleEl) titleEl.textContent = this.getCurrentPageTitle();
    };
    window.addEventListener('hashchange', this._hashHandler);

    // 5. User chip — logout dropdown on click
    const userChip = this.$('#header-user-chip');
    if (userChip) {
      userChip.addEventListener('click', async () => {
        if (confirm('¿Seguro que deseas cerrar sesión?')) {
          await AuthService.logout();
          window.location.hash = '#/login';
        }
      });
    }

    // 5b. GPS Toggle Button Handler
    const gpsBtn = this.$('#header-gps-btn');
    const gpsText = this.$('#header-gps-text');

    const updateGpsUI = (isActive) => {
      if (!gpsBtn) return;
      if (isActive) {
        gpsBtn.classList.add('active');
        gpsBtn.classList.remove('inactive');
        gpsBtn.title = 'Seguimiento GPS Activo (Clic para detener)';
        if (gpsText) gpsText.textContent = 'GPS Activo';
      } else {
        gpsBtn.classList.remove('active');
        gpsBtn.classList.add('inactive');
        gpsBtn.title = 'Seguimiento GPS Inactivo (Clic para activar)';
        if (gpsText) gpsText.textContent = 'Activar GPS';
      }
    };

    if (gpsBtn) {
      gpsBtn.addEventListener('click', () => {
        if (GeolocationService.watchId) {
          if (confirm('¿Deseas detener el seguimiento GPS de tu ubicación laboral?')) {
            GeolocationService.stopTracking();
            localStorage.setItem('ua_gps_enabled', 'false');
            updateGpsUI(false);
            NotificationService.success('Seguimiento GPS detenido.');
          }
        } else {
          let notified = false;
          GeolocationService.startTracking({
            status: 'DISPONIBLE',
            onUpdate: () => {
              updateGpsUI(true);
              if (!notified) {
                NotificationService.success('📍 Ubicación GPS activada correctamente.');
                notified = true;
              }
            },
            onError: (err) => {
              NotificationService.error(err.message || 'No se pudo obtener la ubicación GPS.');
            }
          });
          localStorage.setItem('ua_gps_enabled', 'true');
        }
      });
    }

    this._gpsChangeHandler = (e) => {
      updateGpsUI(e.detail?.active);
    };
    window.addEventListener('ua_gps_changed', this._gpsChangeHandler);

    // 6. Global Barcode Scanner setup
    const scannerToggleBtn = this.$('#global-scanner-toggle-btn');
    
    const updateScannerUI = () => {
      const active = BarcodeScannerService.isGlobalActive();
      if (scannerToggleBtn) {
        if (active) {
          scannerToggleBtn.classList.add('scanner-active');
        } else {
          scannerToggleBtn.classList.remove('scanner-active');
        }
      }
    };

    const toggleScanner = () => {
      const newState = BarcodeScannerService.toggleGlobal((code, format) => {
        this.showGlobalScanOverlay(code, format);
      });
      updateScannerUI();
      if (newState) {
        NotificationService.info('Escáner global activado. Listo para recibir códigos.');
      } else {
        NotificationService.info('Escáner global desactivado.');
      }
    };

    if (scannerToggleBtn) {
      scannerToggleBtn.addEventListener('click', () => {
        toggleScanner();
      });
    }

    // Key shortcut listener (Ctrl+B)
    this._kbdHandler = (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleScanner();
      }
    };
    window.addEventListener('keydown', this._kbdHandler);

    // Initial state sync
    updateScannerUI();
  }

  showGlobalScanOverlay(code, format) {
    const existing = document.getElementById('global-scan-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'global-scan-overlay';
    overlay.className = 'global-scanner-overlay';

    overlay.innerHTML = `
      <div class="global-scanner-panel">
        <div class="global-scanner-header">
          <h3 class="global-scanner-title">
            <span>📊</span> Código Detectado
          </h3>
          <button class="global-scanner-close" id="global-scan-overlay-close">&times;</button>
        </div>
        <div style="font-size: 0.85rem; color: var(--color-text-secondary); font-family: monospace; margin-bottom: var(--space-3);">
          Código: <span class="scan-code-badge">${code}</span> (${format})
        </div>
        <div id="global-scan-result-container">
          <div style="display:flex; justify-content:center; padding: 20px; align-items:center; gap: 8px;">
            <div class="barcode-pulse" style="width:12px;height:12px;"></div>
            <span style="font-size:0.8rem; color:var(--color-text-secondary);">Buscando en la base de datos...</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector('#global-scan-overlay-close');
    closeBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    BarcodeRegistryService.findItemByCode(code).then(result => {
      const container = overlay.querySelector('#global-scan-result-container');
      if (!container) return;

      if (result) {
        const { item, type } = result;
        const label = BarcodeRegistryService.getTypeLabel(type);
        const icon = BarcodeRegistryService.getTypeIcon(type);
        const name = item.name || `${item.brand || ''} ${item.model || ''}`.trim() || 'Elemento';

        let extraHTML = '';
        if (type === 'producto' || type === 'insumo') {
          extraHTML = `
            <div style="margin-top: 8px; font-size: 0.85rem;">
              <strong>Stock:</strong> ${item.stock} ${item.unit || 'uds'} | 
              <strong>Costo:</strong> ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.cost || item.purchasePrice || 0)}
            </div>
          `;
        } else if (type === 'vehiculo') {
          extraHTML = `
            <div style="margin-top: 8px; font-size: 0.85rem;">
              <strong>Placa:</strong> ${item.plate} | 
              <strong>Estado:</strong> ${item.status || 'Disponible'}
            </div>
          `;
        }

        container.innerHTML = `
          <div class="global-scanner-result global-scanner-result-found">
            <div class="global-scanner-item-name">${name}</div>
            <div class="global-scanner-item-meta">
              <span class="scan-type-badge scan-type-${type}">${icon} ${label}</span>
            </div>
            ${extraHTML}
            <div class="global-scanner-actions">
              <button class="btn btn-primary btn-sm" id="global-scan-btn-view">Ver Detalles</button>
              <button class="btn btn-secondary btn-sm" id="global-scan-btn-close">Cerrar</button>
            </div>
          </div>
        `;

        overlay.querySelector('#global-scan-btn-close').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#global-scan-btn-view').addEventListener('click', () => {
          overlay.remove();
          if (type === 'producto') {
            window.location.hash = '#/inventory/products';
          } else if (type === 'vehiculo') {
            window.location.hash = '#/manager/vehicles';
          } else if (type === 'activo') {
            window.location.hash = '#/manager/assets';
          } else if (type === 'herramienta') {
            window.location.hash = '#/manager/tools';
          } else if (type === 'insumo') {
            window.location.hash = '#/manager/supplies';
          }
        });
      } else {
        container.innerHTML = `
          <div class="global-scanner-result global-scanner-result-notfound">
            <div style="font-weight:600; margin-bottom:8px; font-size:0.9rem;">Código no registrado</div>
            <p style="font-size:0.8rem; color:var(--color-text-secondary); margin-bottom:12px;">
              El código "${code}" no está vinculado a ningún producto o activo registrado.
            </p>
            <div class="global-scanner-actions">
              <button class="btn btn-primary btn-sm" id="global-scan-btn-reg-prod">Registrar Producto</button>
              <button class="btn btn-secondary btn-sm" id="global-scan-btn-close">Cerrar</button>
            </div>
          </div>
        `;
        overlay.querySelector('#global-scan-btn-close').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#global-scan-btn-reg-prod').addEventListener('click', () => {
          overlay.remove();
          window.location.hash = '#/inventory/products';
        });
      }
    }).catch(err => {
      const container = overlay.querySelector('#global-scan-result-container');
      if (container) {
        container.innerHTML = `<div class="text-danger" style="font-size:0.8rem;">Error: ${err.message}</div>`;
      }
    });
  }

  unmount() {
    if (this._clockInterval) clearInterval(this._clockInterval);
    if (this._hashHandler) window.removeEventListener('hashchange', this._hashHandler);
    if (this._kbdHandler) window.removeEventListener('keydown', this._kbdHandler);
    if (this._gpsChangeHandler) window.removeEventListener('ua_gps_changed', this._gpsChangeHandler);
    if (this._sidebarNavHandler) document.removeEventListener('click', this._sidebarNavHandler);
    // Remove the programmatic overlay from body
    if (this._overlay && this._overlay.parentNode) this._overlay.remove();
    BarcodeScannerService.detachGlobal();
    super.unmount();
  }
}
