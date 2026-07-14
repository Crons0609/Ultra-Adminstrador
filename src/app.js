/**
 * @file app.js
 * @description Application bootstrap entry point.
 * 
 * Responsibilities:
 * 1. Apply saved theme preference
 * 2. Register Service Worker for PWA
 * 3. Initialize the SPA Router with all routes
 * 4. Restore user session if previously authenticated
 */

import { Router } from './core/router.js';
import { ROUTES } from './config/routes.config.js';
import { GlobalStore } from './core/state.js';
import { APP_CONFIG } from './config/app.config.js';

class App {
  constructor() {
    this.router = null;
  }

  /**
   * Main application initializer. Called once when the DOM is ready.
   */
  async init() {
    // 1. Apply saved theme or default
    this.applyTheme();

    // 2. Register service worker for PWA capabilities
    this.registerServiceWorker();

    // 3. Restore persisted session from localStorage
    this.restoreSession();

    // 4. Initialize SPA router
    this.router = new Router(ROUTES, 'app');

    console.log(`[App] ${APP_CONFIG.name} v${APP_CONFIG.version} initialized.`);
  }

  /**
   * Apply saved theme from localStorage or fall back to APP_CONFIG.defaultTheme.
   */
  applyTheme() {
    const savedTheme = localStorage.getItem('theme') || APP_CONFIG.defaultTheme;
    document.body.classList.add(savedTheme);
  }

  /**
   * Register the PWA service worker if the browser supports it.
   */
  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(reg => console.log('[App] Service Worker registered:', reg.scope))
        .catch(err => console.warn('[App] Service Worker registration failed:', err));
    }
  }

  /**
   * Attempt to restore a previously authenticated session from localStorage cache.
   * Full Firebase session persistence will be implemented in Phase 3.
   */
  restoreSession() {
    try {
      const cachedUser = localStorage.getItem('ua_session');
      if (cachedUser) {
        const user = JSON.parse(cachedUser);
        GlobalStore.set({
          currentUser: user,
          activeRole: user.role,
          isAuthenticated: true
        });
        console.log('[App] Session restored for:', user.email);
      }
    } catch (e) {
      localStorage.removeItem('ua_session');
    }
  }
}

// Bootstrap when DOM is ready
const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());

// Export for debugging in dev console
window.__ultraAdmin = app;
