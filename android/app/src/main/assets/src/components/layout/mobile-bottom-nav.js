/**
 * @file mobile-bottom-nav.js
 * @description Native-like 5-button bottom navigation bar and action sheets system for Android WebView.
 *              Adapts dynamically to company modules, user roles, permissions, and contextual route.
 *              Supports per-user tab personalization via MobileNavConfigService (Firebase RTDB).
 */

import { Component } from '../../core/component.js';
import { GlobalStore } from '../../core/state.js';
import { MODULE_REGISTRY, isModuleEnabled } from '../../config/modules.config.js';
import { NotificationService } from '../../services/notification.service.js';
import { MobileNavConfigService, NAV_TAB_CATALOG, DEFAULT_NAV_TABS } from '../../services/mobile-nav-config.service.js';
import { db } from '../../config/firebase.config.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';

export class MobileBottomNav extends Component {
  constructor(props = {}) {
    super(props);
    this.state = {
      activeSheet: null, // null | 'actions' | 'create' | 'notifications' | 'more'
      unreadNotificationsCount: 0,
      notifications: [],
      activeTabs: [...DEFAULT_NAV_TABS] // Ordered list of up to 5 tab IDs
    };
  }

  /** Gets the primary dashboard path for the current active role */
  getHomePath() {
    const { currentUser, activeRole } = GlobalStore.getState();
    const role = activeRole || (currentUser ? currentUser.role : '');

    switch (role) {
      case 'SUPER_ADMIN': return '#/super-admin/companies';
      case 'CASHIER':     return '#/cashier/pos';
      case 'WAITER':      return '#/waiter/tables';
      case 'KITCHEN':     return '#/kitchen/kds';
      case 'OWNER':
      case 'MANAGER':
      default:            return '#/manager/dashboard';
    }
  }

  /** Detects current route and returns contextual quick creation option */
  getContextualCreateAction() {
    const hash = window.location.hash || '';
    const { currentCompany, currentUser, activeRole } = GlobalStore.getState();
    const role = activeRole || currentUser?.role || '';

    if (hash.includes('/inventory') || hash.includes('/products')) {
      return { id: 'product', title: 'Nuevo Producto', icon: '📦', path: '#/inventory/products' };
    }
    if (hash.includes('/employees')) {
      return { id: 'employee', title: 'Nuevo Empleado', icon: '👨‍💼', path: '#/manager/employees' };
    }
    if (hash.includes('/expenses')) {
      return { id: 'expense', title: 'Registrar Gasto', icon: '💰', path: '#/owner/expenses' };
    }
    if (hash.includes('/invoices') || hash.includes('/pos')) {
      return { id: 'pos', title: 'Nueva Venta', icon: '💵', path: '#/cashier/pos' };
    }
    if (hash.includes('/waiter') || hash.includes('/tables')) {
      return { id: 'order', title: 'Nuevo Pedido', icon: '🛒', path: '#/waiter/orders' };
    }
    if (hash.includes('/qr-codes')) {
      return { id: 'qr', title: 'Generar Código QR', icon: '🔳', path: '#/manager/qr-codes' };
    }
    if (hash.includes('/calendar')) {
      return { id: 'event', title: 'Nuevo Evento', icon: '📅', path: '#/calendar/work-calendar' };
    }
    if (hash.includes('/recruitment') || hash.includes('/hr')) {
      return { id: 'hr', title: 'Nueva Vacante RH', icon: '👤', path: '#/hr/recruitment' };
    }
    return null;
  }

  /** Gets filtered list of quick actions based on role and enabled company modules */
  getQuickActions() {
    const { currentCompany, currentUser, activeRole } = GlobalStore.getState();
    const role = activeRole || currentUser?.role || 'OWNER';

    const actions = [
      {
        id: 'scan-invoice',
        title: 'Escanear Factura',
        sub: 'Lectura rápida con IA/OCR',
        icon: '📷',
        path: '#/owner/invoice-ocr',
        allowed: ['OWNER', 'MANAGER'],
        module: 'invoiceScanner'
      },
      {
        id: 'qr-gen',
        title: 'Generar QR',
        sub: 'Mesas y catálogo digital',
        icon: '🔳',
        path: '#/manager/qr-codes',
        allowed: ['OWNER', 'MANAGER'],
        module: 'qrCodes'
      },
      {
        id: 'new-sale',
        title: 'Nueva Venta',
        sub: 'Abrir Punto de Venta POS',
        icon: '💵',
        path: '#/cashier/pos',
        allowed: ['OWNER', 'MANAGER', 'CASHIER']
      },
      {
        id: 'record-expense',
        title: 'Registrar Gasto',
        sub: 'Salida de caja rápida',
        icon: '💰',
        path: '#/owner/expenses',
        allowed: ['OWNER'],
        module: 'expenses'
      },
      {
        id: 'client-credit',
        title: 'Cobrar Fiado / Crédito',
        sub: 'Cuentas por cobrar',
        icon: '💳',
        path: '#/owner/accounts-receivable',
        allowed: ['OWNER', 'MANAGER'],
        module: 'accountsReceivable'
      },
      {
        id: 'whatsapp-hub',
        title: 'WhatsApp Negocio',
        sub: 'Centro de mensajería',
        icon: '💬',
        path: '#/owner/whatsapp',
        allowed: ['OWNER', 'MANAGER'],
        module: 'whatsappAutomation'
      },
      {
        id: 'work-calendar',
        title: 'Calendario y Permisos',
        sub: 'Turnos y ausencias',
        icon: '📅',
        path: '#/calendar/work-calendar',
        allowed: ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'],
        module: 'workCalendar'
      },
      {
        id: 'data-migration',
        title: 'Importar/Exportar Excel',
        sub: 'Migración masiva',
        icon: '📤',
        path: '#/owner/migration',
        allowed: ['OWNER'],
        module: 'migration'
      }
    ];

    return actions.filter(act => {
      if (!act.allowed.includes(role)) return false;
      if (act.module && !isModuleEnabled(currentCompany, act.module)) return false;
      return true;
    });
  }

  /** Gets filtered list of creation options for the "+" Create menu */
  getCreateOptions() {
    const { currentCompany, currentUser, activeRole } = GlobalStore.getState();
    const role = activeRole || currentUser?.role || 'OWNER';

    const options = [
      {
        title: 'Nuevo Producto',
        sub: 'Agregar al inventario',
        icon: '📦',
        path: '#/inventory/products',
        allowed: ['OWNER', 'MANAGER'],
        module: 'inventory'
      },
      {
        title: 'Nueva Venta',
        sub: 'Iniciar cobro en POS',
        icon: '💵',
        path: '#/cashier/pos',
        allowed: ['OWNER', 'MANAGER', 'CASHIER']
      },
      {
        title: 'Nuevo Pedido / Comanda',
        sub: 'Tomar orden de cliente',
        icon: '🛒',
        path: '#/waiter/orders',
        allowed: ['OWNER', 'MANAGER', 'WAITER']
      },
      {
        title: 'Registrar Gasto',
        sub: 'Salida de dinero',
        icon: '💰',
        path: '#/owner/expenses',
        allowed: ['OWNER'],
        module: 'expenses'
      },
      {
        title: 'Nuevo Empleado',
        sub: 'Crear usuario y rol',
        icon: '👨‍💼',
        path: '#/manager/employees',
        allowed: ['OWNER', 'MANAGER'],
        module: 'employees'
      },
      {
        title: 'Nueva Factura',
        sub: 'Emitir documento de venta',
        icon: '🧾',
        path: '#/cashier/invoices',
        allowed: ['OWNER', 'MANAGER', 'CASHIER']
      },
      {
        title: 'Nuevo Evento / Permiso',
        sub: 'Agendar en calendario',
        icon: '📅',
        path: '#/calendar/work-calendar',
        allowed: ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'],
        module: 'workCalendar'
      },
      {
        title: 'Publicar Vacante RH',
        sub: 'Bolsa de trabajo con QR',
        icon: '👤',
        path: '#/hr/recruitment',
        allowed: ['OWNER', 'MANAGER'],
        module: 'hrRecruitment'
      }
    ];

    return options.filter(opt => {
      if (!opt.allowed.includes(role)) return false;
      if (opt.module && !isModuleEnabled(currentCompany, opt.module)) return false;
      return true;
    });
  }

  /** Gets filtered list of modules for the "Más" menu */
  getMoreModules() {
    const { currentCompany, currentUser, activeRole } = GlobalStore.getState();
    const role = activeRole || currentUser?.role || 'OWNER';

    const enabledModules = MODULE_REGISTRY.filter(m =>
      m.allowedRoles.includes(role) && isModuleEnabled(currentCompany, m.id)
    );

    return enabledModules;
  }

  // ─── Render Methods ──────────────────────────────────────────────────────────

  /** Renders a single nav tab button based on its catalog definition */
  _renderTabButton(tabDef, isActive, badgeHTML = '') {
    if (!tabDef) return '';

    const isCreate = tabDef.id === 'create';

    if (isCreate) {
      const contextualAction = this.getContextualCreateAction();
      return `
        <button class="mbn-item mbn-item--create ${isActive ? 'active' : ''}"
          data-mbn-tab="${tabDef.id}" title="${tabDef.description}">
          <span class="mbn-icon-wrapper">
            ${tabDef.icon}
          </span>
          <span>${contextualAction ? contextualAction.title.replace('Nuevo ', '').replace('Registrar ', '') : 'Crear'}</span>
        </button>`;
    }

    return `
      <button class="mbn-item ${isActive ? 'active' : ''}"
        data-mbn-tab="${tabDef.id}" title="${tabDef.description}">
        <span class="mbn-icon">${tabDef.icon}</span>
        ${badgeHTML}
        <span>${tabDef.label}</span>
      </button>`;
  }

  render() {
    const { activeSheet, unreadNotificationsCount, activeTabs } = this.state;
    const currentHash = window.location.hash || '';
    const homePath = this.getHomePath();
    const isHomeActive = currentHash === homePath || (homePath !== '#/' && currentHash.startsWith(homePath));

    const badgeHTML = unreadNotificationsCount > 0
      ? `<span class="mbn-badge">${unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}</span>`
      : '';

    // Render each configured tab in user-defined order
    const tabsHTML = activeTabs.map(tabId => {
      const tabDef = MobileNavConfigService.getTabById(tabId);
      if (!tabDef) return '';

      let isActive = false;
      if (tabId === 'home') {
        isActive = isHomeActive;
      } else if (tabId === 'actions' || tabId === 'create' || tabId === 'notifications' || tabId === 'more') {
        isActive = activeSheet === tabId.replace('sheet:', '');
      } else {
        // Direct navigate tab — check if current hash matches
        const path = tabDef.action.replace('navigate:', '');
        const cleanPath = path.replace('#', '');
        isActive = currentHash.includes(cleanPath.replace('#/', ''));
      }

      const badge = tabId === 'notifications' ? badgeHTML : '';
      return this._renderTabButton(tabDef, isActive, badge);
    }).join('');

    return `
      <div class="mobile-bottom-nav-root">
        <!-- BOTTOM NAVIGATION BAR -->
        <nav class="mobile-bottom-nav" id="mobile-bottom-nav">
          ${tabsHTML}
        </nav>

        <!-- BOTTOM SHEETS / ACTION PANELS OVERLAY -->
        <div class="mbn-overlay ${activeSheet ? 'active' : ''}" id="mbn-overlay">
          <div class="mbn-sheet" id="mbn-sheet">
            <div class="mbn-sheet-handle"></div>
            ${this._renderSheetContent()}
          </div>
        </div>
      </div>
    `;
  }

  /** Renders the inner HTML content of the active bottom sheet modal */
  _renderSheetContent() {
    const { activeSheet } = this.state;
    if (!activeSheet) return '';

    if (activeSheet === 'actions') {
      const actions = this.getQuickActions();
      const cardsHTML = actions.map(act => `
        <a href="${act.path}" class="mbn-action-card" data-mbn-navigate="${act.path}">
          <span class="mbn-action-icon">${act.icon}</span>
          <div class="mbn-action-info">
            <span class="mbn-action-title">${act.title}</span>
            <span class="mbn-action-sub">${act.sub}</span>
          </div>
        </a>
      `).join('');

      return `
        <div class="mbn-sheet-header">
          <span class="mbn-sheet-title">⚡ Acciones Rápidas</span>
          <button class="mbn-sheet-close" data-mbn-close>✕</button>
        </div>
        <div class="mbn-actions-grid">
          ${cardsHTML || '<p style="grid-column:1/-1; text-align:center; color:var(--color-text-tertiary); font-size:0.85rem; padding:16px;">No hay acciones disponibles para tu rol.</p>'}
        </div>
      `;
    }

    if (activeSheet === 'create') {
      const contextual = this.getContextualCreateAction();
      const options = this.getCreateOptions();

      let sortedOptions = [...options];
      if (contextual) {
        sortedOptions = sortedOptions.filter(o => o.path !== contextual.path);
        sortedOptions.unshift({ ...contextual, sub: 'Acción rápida sugerida aquí' });
      }

      const cardsHTML = sortedOptions.map((opt, i) => `
        <a href="${opt.path}" class="mbn-action-card" data-mbn-navigate="${opt.path}" style="${i === 0 && contextual ? 'border-color:var(--color-accent); background:rgba(99,102,241,0.08);' : ''}">
          <span class="mbn-action-icon">${opt.icon}</span>
          <div class="mbn-action-info">
            <span class="mbn-action-title">${opt.title}</span>
            <span class="mbn-action-sub">${opt.sub}</span>
          </div>
        </a>
      `).join('');

      return `
        <div class="mbn-sheet-header">
          <span class="mbn-sheet-title">➕ ¿Qué quieres crear?</span>
          <button class="mbn-sheet-close" data-mbn-close>✕</button>
        </div>
        <div class="mbn-actions-grid">
          ${cardsHTML}
        </div>
      `;
    }

    if (activeSheet === 'notifications') {
      const { notifications } = this.state;
      let notifsHTML = '';

      if (notifications.length === 0) {
        notifsHTML = `
          <div style="text-align:center; padding:24px 12px; color:var(--color-text-tertiary);">
            <div style="font-size:2rem; margin-bottom:8px;">🔔</div>
            <p style="font-size:0.88rem; font-weight:600;">No hay notificaciones pendientes</p>
            <p style="font-size:0.75rem; margin-top:4px;">Tu negocio está al día.</p>
          </div>`;
      } else {
        notifsHTML = notifications.map(n => `
          <div class="mbn-notif-item">
            <span class="mbn-notif-icon">${n.icon || '📩'}</span>
            <div class="mbn-notif-content">
              <span class="mbn-notif-title">${n.title || 'Aviso del Sistema'}</span>
              <p class="mbn-notif-desc">${n.message || n.text || ''}</p>
              <span class="mbn-notif-time">${n.time || 'Hace un momento'}</span>
            </div>
          </div>
        `).join('');
      }

      return `
        <div class="mbn-sheet-header">
          <span class="mbn-sheet-title">🔔 Centro de Avisos</span>
          <button class="mbn-sheet-close" data-mbn-close>✕</button>
        </div>
        <div class="mbn-notif-list">
          ${notifsHTML}
        </div>
      `;
    }

    if (activeSheet === 'more') {
      const modules = this.getMoreModules();
      const cardsHTML = modules.map(m => `
        <a href="${m.path}" class="mbn-action-card" data-mbn-navigate="${m.path}">
          <span class="mbn-action-icon">${m.icon}</span>
          <div class="mbn-action-info">
            <span class="mbn-action-title">${m.name}</span>
            <span class="mbn-action-sub">${m.description}</span>
          </div>
        </a>
      `).join('');

      return `
        <div class="mbn-sheet-header">
          <span class="mbn-sheet-title">☰ Módulos Disponibles</span>
          <button class="mbn-sheet-close" data-mbn-close>✕</button>
        </div>
        <div class="mbn-actions-grid">
          ${cardsHTML}
        </div>
      `;
    }

    return '';
  }

  // ─── Lifecycle & Event Handlers ──────────────────────────────────────────────

  afterMount() {
    const root = this.element;
    const nav = this.$('#mobile-bottom-nav');

    // 1. Load user's personalized tab config from RTDB
    const { currentUser } = GlobalStore.getState();
    if (currentUser?.uid) {
      MobileNavConfigService.load(currentUser.uid).then(tabs => {
        if (JSON.stringify(tabs) !== JSON.stringify(this.state.activeTabs)) {
          this.setState({ activeTabs: tabs });
        }
      });
    }

    // 2. Delegate all clicks within component element
    if (root && !root.dataset.eventsBound) {
      root.dataset.eventsBound = 'true';
      root.addEventListener('click', (e) => {
        // A. Tab buttons click
        const tabBtn = e.target.closest('[data-mbn-tab]');
        if (tabBtn) {
          e.preventDefault();
          const tabId = tabBtn.getAttribute('data-mbn-tab');
          const tabDef = MobileNavConfigService.getTabById(tabId);
          if (!tabDef) return;

          if (tabDef.action === 'home') {
            this.closeSheet();
            const homePath = this.getHomePath();
            if (window.location.hash !== homePath) {
              window.location.hash = homePath;
            }
            return;
          }

          if (tabDef.action.startsWith('sheet:')) {
            const sheetName = tabDef.action.replace('sheet:', '');
            if (this.state.activeSheet === sheetName) {
              this.closeSheet();
            } else {
              this.openSheet(sheetName);
            }
            return;
          }

          if (tabDef.action.startsWith('navigate:')) {
            const path = tabDef.action.replace('navigate:', '');
            this.closeSheet();
            window.location.hash = path;
            return;
          }
          return;
        }

        // B. Action cards navigation inside bottom sheet
        const navCard = e.target.closest('[data-mbn-navigate]');
        if (navCard) {
          this.closeSheet();
          const path = navCard.getAttribute('data-mbn-navigate');
          if (path && window.location.hash !== path) {
            window.location.hash = path;
          }
          return;
        }

        // C. Close sheet overlay or close button click
        const overlay = this.$('#mbn-overlay');
        if (overlay && (e.target === overlay || e.target.closest('[data-mbn-close]'))) {
          this.closeSheet();
          return;
        }
      });
    }

    // 3. Mobile Web Keyboard & Input Focus Detection
    const handleInputFocus = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) && e.target.type !== 'checkbox' && e.target.type !== 'radio') {
        const currentNav = this.$('#mobile-bottom-nav');
        if (currentNav) currentNav.classList.add('mbn-hidden');
      }
    };

    const handleInputBlur = () => {
      const currentNav = this.$('#mobile-bottom-nav');
      if (currentNav) currentNav.classList.remove('mbn-hidden');
    };

    document.addEventListener('focusin', handleInputFocus);
    document.addEventListener('focusout', handleInputBlur);
    this._focusCleanup = () => {
      document.removeEventListener('focusin', handleInputFocus);
      document.removeEventListener('focusout', handleInputBlur);
    };

    if (window.visualViewport) {
      this._viewportHandler = () => {
        const isKeyboardOpen = window.visualViewport.height < window.innerHeight * 0.75;
        const currentNav = this.$('#mobile-bottom-nav');
        if (currentNav) {
          currentNav.classList.toggle('mbn-hidden', isKeyboardOpen);
        }
      };
      window.visualViewport.addEventListener('resize', this._viewportHandler);
    }

    // 4. Back Button Intercept for Mobile Web & Android
    this._popstateHandler = () => {
      if (this.state.activeSheet) {
        this.closeSheet();
      }
    };
    window.addEventListener('popstate', this._popstateHandler);

    // 5. Listen to Real-Time Notifications
    this.startNotificationsRealtimeListener();

    // 6. Subscribe to GlobalStore state changes
    this._unsubStore = GlobalStore.subscribe('activeRole', () => this.update());
    this._unsubCompany = GlobalStore.subscribe('currentCompany', () => this.update());

    // 7. Subscribe to mobileNavConfig changes from GlobalStore
    this._unsubNavConfig = GlobalStore.subscribe('mobileNavConfig', (tabs) => {
      if (Array.isArray(tabs)) {
        this.setState({ activeTabs: tabs });
      }
    });
  }

  _rerender() {
    if (this.el) {
      this.el.innerHTML = this.render();
    }
  }

  openSheet(sheetName) {
    this.state.activeSheet = sheetName;
    const overlay = this.$('#mbn-overlay');
    const sheet = this.$('#mbn-sheet');
    if (overlay && sheet) {
      sheet.innerHTML = `<div class="mbn-sheet-handle"></div>${this._renderSheetContent()}`;
      overlay.classList.add('active');
    }
    this._updateActiveTabUI();
  }

  closeSheet() {
    this.state.activeSheet = null;
    const overlay = this.$('#mbn-overlay');
    if (overlay) {
      overlay.classList.remove('active');
    }
    this._updateActiveTabUI();
  }

  _updateActiveTabUI() {
    const { activeSheet } = this.state;
    const currentHash = window.location.hash || '';
    const homePath = this.getHomePath();
    const isHomeActive = currentHash === homePath || (homePath !== '#/' && currentHash.startsWith(homePath));

    this.$$('[data-mbn-tab]').forEach(btn => {
      const tabId = btn.getAttribute('data-mbn-tab');
      let isActive = false;
      if (tabId === 'home') {
        isActive = isHomeActive && !activeSheet;
      } else if (['actions', 'create', 'notifications', 'more'].includes(tabId)) {
        isActive = activeSheet === tabId;
      } else {
        const tabDef = MobileNavConfigService.getTabById(tabId);
        if (tabDef && tabDef.action.startsWith('navigate:')) {
          const path = tabDef.action.replace('navigate:', '').replace('#', '');
          isActive = currentHash.includes(path.replace('#/', ''));
        }
      }
      btn.classList.toggle('active', isActive);
    });
  }

  /** Real-time listener for support & system notifications */
  startNotificationsRealtimeListener() {
    const { currentUser, currentCompany } = GlobalStore.getState();
    if (!currentUser) return;

    const sampleNotifs = [
      { id: '1', icon: '📢', title: 'Sistema Actualizado', message: 'Ultra Administrador versión móvil activa.', time: 'Hace 5 min' }
    ];

    if (currentCompany?.id && db) {
      const ticketsRef = ref(db, `support_tickets`);
      onValue(ticketsRef, (snap) => {
        let count = 0;
        const list = [...sampleNotifs];
        if (snap.exists()) {
          const tickets = snap.val();
          Object.values(tickets).forEach(t => {
            if (t.status === 'Pendiente') {
              count++;
              list.unshift({
                id: t.id || String(Math.random()),
                icon: '📩',
                title: `Solicitud: ${t.userName || 'Cliente'}`,
                message: t.message || 'Solicitud de soporte pendiente',
                time: 'Hoy'
              });
            }
          });
        }
        this.setState({
          unreadNotificationsCount: count,
          notifications: list
        });
      });
    } else {
      this.setState({ notifications: sampleNotifs, unreadNotificationsCount: 0 });
    }
  }

  unmount() {
    if (this._focusCleanup) this._focusCleanup();
    if (window.visualViewport && this._viewportHandler) {
      window.visualViewport.removeEventListener('resize', this._viewportHandler);
    }
    if (this._popstateHandler) {
      window.removeEventListener('popstate', this._popstateHandler);
    }
    if (this._unsubStore) this._unsubStore();
    if (this._unsubCompany) this._unsubCompany();
    if (this._unsubNavConfig) this._unsubNavConfig();
    super.unmount();
  }
}
