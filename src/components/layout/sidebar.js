/**
 * @file sidebar.js
 * @description Premium sidebar navigation with grouped sections, company branding, and role-based menus.
 * Module visibility is automatically determined by the company's business type via getModuleGuards().
 */

import { Component } from '../../core/component.js';
import { GlobalStore } from '../../core/state.js';
import { AuthService } from '../../services/auth.service.js';
import { getModuleGuards } from '../../config/business-types.config.js';

export class Sidebar extends Component {
  constructor(props = {}) {
    super(props);
    this.state = GlobalStore.getState();
  }

  getMenuConfig(role) {
    const { currentCompany } = GlobalStore.getState();
    const cfg = currentCompany?.config || {};

    // Compute automatic guards from business type, then merge with super-admin cfg overrides.
    // cfg values take precedence (super-admin can force-enable a module even if the rubro doesn't have it).
    const autoGuards = getModuleGuards(currentCompany?.businessType || '');
    const guards = { ...autoGuards, ...cfg };

    // Helper: build menu items filtered by their module guard
    const guardedItem = (label, path, icon, guard = true) => guard ? [{ label, path, icon }] : [];

    // Common SVG icons shorthand
    const icons = {
      dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
      employees: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
      inventory: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
      qr: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/><rect x="3" y="16" width="5" height="5"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>`,
      globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
      reports: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>`,
      kds: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
      car: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="6" rx="1"/><path d="M5 9l1.5-4h11L19 9"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/></svg>`,
      calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
      inbox: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
      tag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
      finance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
      expenses: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
      balance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><path d="m3 12 9-9 9 9"/><path d="M5 20a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8H5z"/></svg>`,
      projections: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
      assets: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="12" rx="2"/><line x1="2" y1="20" x2="22" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/></svg>`,
      tools: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
      supplies: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12M12 3v11M9 12h6M5 21h14c1 0 2-1 2-2L16 8V3H8v5L3 19c0 1 2-1 2-2z"/></svg>`,
      history: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    };

    const menus = {
      SUPER_ADMIN: {
        groups: [
          {
            label: 'Plataforma',
            items: [
              { label: 'Empresas', path: '#/super-admin/companies', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>` },
              { label: 'Monitoreo', path: '#/super-admin/monitoring', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>` },
              { label: 'Planes', path: '#/super-admin/plans', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>` },
              { label: 'Facturación', path: '#/super-admin/billing', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>` },
            ]
          },
          {
            label: 'Sistema',
            items: [
              { label: 'Logs', path: '#/super-admin/logs', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>` },
              { label: 'Ajustes', path: '#/super-admin/settings', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>` },
            ]
          }
        ]
      },
      OWNER: {
        groups: [
          {
            label: 'General',
            items: [
              { label: 'Dashboard', path: '#/manager/dashboard', icon: icons.dashboard },
              { label: 'Empleados', path: '#/manager/employees', icon: icons.employees },
              ...guardedItem('Inventario', '#/inventory/products', icons.inventory, guards.showInventory),
              ...guardedItem('Activos y Equipos', '#/manager/assets', icons.assets, guards.showAssets),
              ...guardedItem('Vehículos', '#/manager/vehicles', icons.car, guards.enableVehiclesCatalog),
              ...guardedItem('Herramientas', '#/manager/tools', icons.tools, guards.showTools),
              ...guardedItem('Insumos', '#/manager/supplies', icons.supplies, guards.showSupplies),
              ...guardedItem('Historial Escaneos', '#/manager/scan-history', icons.history, guards.showScanHistory),
              ...guardedItem('Códigos QR', '#/manager/qr-codes', icons.qr, guards.enableQR),
              ...guardedItem('Solicitudes', '#/manager/service-requests', icons.inbox, guards.enableServiceRequests),
              ...guardedItem('Alquileres', '#/manager/rentals', icons.calendar, guards.enableRentals),
              ...guardedItem('Citas', '#/manager/appointments', icons.calendar, guards.enableAppointments),
              ...guardedItem('Precios Especiales', '#/manager/pricing', icons.tag, guards.enableEmployeePricing),
              { label: 'Página Pública', path: '#/manager/catalog-settings', icon: icons.globe },
            ]
          },
          {
            label: 'Finanzas',
            items: [
              { label: 'Control Financiero', path: '#/owner/finance', icon: icons.finance },
              { label: 'Gastos', path: '#/owner/expenses', icon: icons.expenses },
              { label: 'Balance General', path: '#/owner/balance', icon: icons.balance },
              { label: 'Proyecciones', path: '#/owner/projections', icon: icons.projections },
            ]
          }
        ]
      },
      MANAGER: {
        groups: [
          {
            label: 'Operaciones',
            items: [
              { label: 'Dashboard', path: '#/manager/dashboard', icon: icons.dashboard },
              { label: 'Empleados', path: '#/manager/employees', icon: icons.employees },
              ...guardedItem('Inventario', '#/inventory/products', icons.inventory, guards.showInventory),
              ...guardedItem('Activos y Equipos', '#/manager/assets', icons.assets, guards.showAssets),
              ...guardedItem('Vehículos', '#/manager/vehicles', icons.car, guards.enableVehiclesCatalog),
              ...guardedItem('Herramientas', '#/manager/tools', icons.tools, guards.showTools),
              ...guardedItem('Insumos', '#/manager/supplies', icons.supplies, guards.showSupplies),
              ...guardedItem('Historial Escaneos', '#/manager/scan-history', icons.history, guards.showScanHistory),
              ...guardedItem('Códigos QR', '#/manager/qr-codes', icons.qr, guards.enableQR),
              ...guardedItem('Solicitudes', '#/manager/service-requests', icons.inbox, guards.enableServiceRequests),
              ...guardedItem('Alquileres', '#/manager/rentals', icons.calendar, guards.enableRentals),
              ...guardedItem('Citas', '#/manager/appointments', icons.calendar, guards.enableAppointments),
              ...guardedItem('Precios Especiales', '#/manager/pricing', icons.tag, guards.enableEmployeePricing),
              { label: 'Reportes', path: '#/manager/reports', icon: icons.reports },
              { label: 'Página Pública', path: '#/manager/catalog-settings', icon: icons.globe },
            ]
          }
        ]
      },
      CASHIER: {
        groups: [
          {
            label: 'Caja',
            items: [
              { label: 'Punto de Venta', path: '#/cashier/pos', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>` },
              { label: 'Pagos', path: '#/cashier/payments', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>` },
              { label: 'Caja Chica', path: '#/cashier/cash-register', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>` },
              { label: 'Arqueo de Caja', path: '#/cashier/arqueo', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>` },
              { label: 'Promociones', path: '#/cashier/promotions', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>` },
              { label: 'Facturación', path: '#/cashier/invoices', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>` },
            ]
          }
        ]
      },
      WAITER: {
        groups: [
          {
            label: 'Servicio',
            items: [
              { label: 'Mesas', path: '#/waiter/tables', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>` },
              { label: 'Mis Pedidos', path: '#/waiter/orders', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>` },
            ]
          }
        ]
      },
      KITCHEN: {
        groups: [
          {
            label: 'Cocina',
            items: [
              { label: 'KDS – Comandas', path: '#/kitchen/kds', icon: icons.kds },
              { label: 'Estadísticas', path: '#/kitchen/stats', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>` },
            ]
          }
        ]
      }
    };

    return menus[role] || { groups: [] };
  }

  getRoleLabel(role) {
    const labels = {
      SUPER_ADMIN: 'Super Administrador',
      OWNER: 'Dueño',
      MANAGER: 'Gerente',
      CASHIER: 'Cajero',
      WAITER: 'Mesero',
      KITCHEN: 'Cocina',
    };
    return labels[role] || role;
  }

  getRoleBadgeColor(role) {
    const colors = {
      SUPER_ADMIN: '#7c75ff',
      OWNER: '#f59e0b',
      MANAGER: '#34d399',
      CASHIER: '#60a5fa',
      WAITER: '#f472b6',
      KITCHEN: '#fb923c',
    };
    return colors[role] || '#8b8c94';
  }

  render() {
    const { currentUser, activeRole, currentCompany } = this.state;
    const role = activeRole || (currentUser ? currentUser.role : '');
    const menuConfig = this.getMenuConfig(role);
    const currentHash = window.location.hash;

    const companyName = currentCompany
      ? (currentCompany.name || currentCompany.id || 'Mi Negocio')
      : (role === 'SUPER_ADMIN' ? 'Ultra Admin' : 'Mi Negocio');

    const companyInitial = companyName[0]?.toUpperCase() || 'U';
    const roleLabel = this.getRoleLabel(role);
    const roleColor = this.getRoleBadgeColor(role);

    // Build grouped menu HTML
    let menuHTML = '';
    menuConfig.groups.forEach(group => {
      menuHTML += `<div class="sidebar-group">`;
      menuHTML += `<span class="sidebar-group-label">${group.label}</span>`;
      group.items.forEach(item => {
        const isActive = currentHash === item.path || currentHash.startsWith(item.path + '/');
        menuHTML += `
          <a href="${item.path}" class="sidebar-item${isActive ? ' active' : ''}" title="${item.label}">
            <span class="sidebar-icon">${item.icon}</span>
            <span class="sidebar-item-label">${item.label}</span>
            ${isActive ? '<span class="sidebar-active-indicator"></span>' : ''}
          </a>
        `;
      });
      menuHTML += `</div>`;
    });

    const userName = currentUser ? currentUser.displayName : 'Cargando...';
    const userInitial = userName ? userName[0].toUpperCase() : 'U';
    const userEmail = currentUser ? currentUser.email : '';

    return `
      <aside class="sidebar" id="main-sidebar">
        <!-- Logo / Company Branding -->
        <div class="sidebar-brand">
          <div class="sidebar-brand-avatar" style="background: linear-gradient(135deg, ${roleColor}22, ${roleColor}44); border: 1px solid ${roleColor}55; color: ${roleColor};">
            ${companyInitial}
          </div>
          <div class="sidebar-brand-info">
            <span class="sidebar-brand-name">${companyName}</span>
            <span class="sidebar-brand-sub" style="color: ${roleColor};">${roleLabel}</span>
          </div>
        </div>

        <!-- Navigation Groups -->
        <nav class="sidebar-menu" id="sidebar-nav">
          ${menuHTML}
        </nav>

        <!-- User Profile Footer -->
        <div class="sidebar-footer">
          <div class="sidebar-user-avatar" style="background: linear-gradient(135deg, ${roleColor}33, ${roleColor}66);">
            ${userInitial}
          </div>
          <div class="sidebar-user-info">
            <span class="sidebar-user-name">${userName}</span>
            <span class="sidebar-user-email">${userEmail}</span>
          </div>
          <button class="sidebar-logout-btn" id="sidebar-logout-btn" title="Cerrar sesión">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16,17 21,12 16,7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </aside>
    `;
  }

  afterMount() {
    // Logout button
    const logoutBtn = this.$('#sidebar-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        if (confirm('¿Seguro que deseas cerrar sesión?')) {
          await AuthService.logout();
          window.location.hash = '#/login';
        }
      });
    }

    // Re-render active state on hash change
    this._hashHandler = () => {
      const items = this.element?.querySelectorAll('.sidebar-item');
      const hash = window.location.hash;
      items?.forEach(el => {
        const href = el.getAttribute('href');
        if (hash === href || hash.startsWith(href + '/')) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      });
    };
    window.addEventListener('hashchange', this._hashHandler);
  }

  unmount() {
    if (this._hashHandler) {
      window.removeEventListener('hashchange', this._hashHandler);
    }
    super.unmount();
  }
}
