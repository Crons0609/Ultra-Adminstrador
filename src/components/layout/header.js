/**
 * @file header.js
 * @description Premium top header bar with notifications, breadcrumb, theme toggle, and user menu.
 */

import { Component } from '../../core/component.js';
import { GlobalStore } from '../../core/state.js';
import { AuthService } from '../../services/auth.service.js';
import { TimeService } from '../../services/time.service.js';

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

      <!-- Mobile sidebar overlay -->
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
    `;
  }

  afterMount() {
    // 1. Sidebar toggle
    const toggleBtn = this.$('#sidebar-toggle-btn');
    const overlay = this.$('#sidebar-overlay');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const sidebar = document.getElementById('main-sidebar');
        if (sidebar) sidebar.classList.toggle('open');
        if (overlay) overlay.classList.toggle('active');
      });
    }
    if (overlay) {
      overlay.addEventListener('click', () => {
        const sidebar = document.getElementById('main-sidebar');
        if (sidebar) sidebar.classList.remove('open');
        overlay.classList.remove('active');
      });
    }

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
  }

  unmount() {
    if (this._clockInterval) clearInterval(this._clockInterval);
    if (this._hashHandler) window.removeEventListener('hashchange', this._hashHandler);
    super.unmount();
  }
}
