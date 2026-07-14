/**
 * @file sidebar.js
 * @description Sidebar navigation component dynamically built matching user roles menus.
 */

import { Component } from '../../core/component.js';
import { GlobalStore } from '../../core/state.js';

export class Sidebar extends Component {
  constructor(props = {}) {
    super(props);
    this.state = GlobalStore.getState();
  }

  getMenuItems(role) {
    // Dynamic sidebar menus matching client demands
    const menus = {
      SUPER_ADMIN: [
        { label: 'Empresas', path: '#/super-admin/companies', icon: '🏢' },
        { label: 'Planes', path: '#/super-admin/plans', icon: '💳' },
        { label: 'Monitoreo', path: '#/super-admin/monitoring', icon: '📊' },
        { label: 'Facturación', path: '#/super-admin/billing', icon: '📝' },
        { label: 'Logs', path: '#/super-admin/logs', icon: '📋' },
        { label: 'Ajustes', path: '#/super-admin/settings', icon: '⚙️' }
      ],
      OWNER: [
        { label: 'Finanzas', path: '#/owner/finance', icon: '💰' },
        { label: 'Gastos', path: '#/owner/expenses', icon: '📉' },
        { label: 'Proyecciones', path: '#/owner/projections', icon: '📈' },
        { label: 'Balance Gral.', path: '#/owner/balance', icon: '⚖️' }
      ],
      MANAGER: [
        { label: 'Dashboard', path: '#/manager/dashboard', icon: '📊' },
        { label: 'Reportes', path: '#/manager/reports', icon: '📋' },
        { label: 'Empleados', path: '#/manager/employees', icon: '👥' },
        { label: 'Inventario', path: '#/inventory/products', icon: '📦' }
      ],
      CASHIER: [
        { label: 'Punto de Venta', path: '#/cashier/pos', icon: '🖥️' },
        { label: 'Pagos', path: '#/cashier/payments', icon: '💳' },
        { label: 'Caja Chica', path: '#/cashier/cash-register', icon: '🪙' },
        { label: 'Facturación', path: '#/cashier/invoices', icon: '🧾' }
      ],
      WAITER: [
        { label: 'Mesas', path: '#/waiter/tables', icon: '🍽️' },
        { label: 'Pedidos', path: '#/waiter/orders', icon: '📝' }
      ],
      KITCHEN: [
        { label: 'Kitchen Display', path: '#/kitchen/kds', icon: '🍳' },
        { label: 'Estadísticas', path: '#/kitchen/stats', icon: '📊' }
      ]
    };

    return menus[role] || [];
  }

  render() {
    const { currentUser, activeRole } = this.state;
    const role = activeRole || (currentUser ? currentUser.role : '');
    const menuItems = this.getMenuItems(role);
    const companyName = this.state.currentCompany ? this.state.currentCompany.name : 'Ultra Admin';

    let menuHTML = '';
    const currentHash = window.location.hash;
    
    menuItems.forEach(item => {
      const activeClass = currentHash.startsWith(item.path) ? 'active' : '';
      menuHTML += `
        <a href="${item.path}" class="sidebar-item ${activeClass}">
          <span class="sidebar-icon">${item.icon}</span>
          <span>${item.label}</span>
        </a>
      `;
    });

    return `
      <aside class="sidebar">
        <div class="sidebar-logo">
          <span>${companyName}</span>
        </div>
        <nav class="sidebar-menu">
          ${menuHTML}
        </nav>
        <div class="sidebar-footer">
          <div class="user-avatar">${currentUser ? currentUser.displayName[0] : 'U'}</div>
          <div class="d-flex flex-column overflow-hidden">
            <span class="font-medium text-sm truncate text-primary">${currentUser ? currentUser.displayName : 'Cargando...'}</span>
            <span class="text-xs text-secondary truncate">${role}</span>
          </div>
        </div>
      </aside>
    `;
  }
}
