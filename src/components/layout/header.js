/**
 * @file header.js
 * @description Header layout component handling responsive triggers and theme switches.
 */

import { Component } from '../../core/component.js';
import { GlobalStore } from '../../core/state.js';
import { AuthService } from '../../services/auth.service.js';

export class Header extends Component {
  constructor(props = {}) {
    super(props);
    this.state = GlobalStore.getState();
  }

  render() {
    const { currentUser } = this.state;
    const branchName = this.state.currentBranch ? this.state.currentBranch.name : 'Sucursal';

    return `
      <header class="header">
        <div class="header-left">
          <button class="menu-toggle" id="sidebar-toggle-btn">☰</button>
          <span class="text-secondary font-medium text-sm">${branchName}</span>
        </div>
        <div class="header-right">
          <!-- Theme Switcher Button -->
          <button class="header-action" id="theme-toggle-btn" title="Cambiar tema">🌓</button>
          
          <!-- Logout Button -->
          <button class="header-action" id="logout-btn" title="Cerrar sesión">🚪</button>
        </div>
      </header>
    `;
  }

  afterMount() {
    // 1. Sidebar toggler logic
    const toggleBtn = this.$('#sidebar-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
          sidebar.classList.toggle('open');
        }
      });
    }

    // 2. Theme switcher logic
    const themeBtn = this.$('#theme-toggle-btn');
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
      });
    }

    // 3. Logout action
    const logoutBtn = this.$('#logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        if (confirm('¿Seguro que desea cerrar sesión?')) {
          await AuthService.logout();
          window.location.hash = '#/login';
        }
      });
    }
  }
}
