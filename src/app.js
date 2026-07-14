/**
 * @file app.js
 * @description Application bootstrap entry point.
 *
 * Responsibilities:
 * 1. Apply saved theme preference
 * 2. Register Service Worker for PWA
 * 3. Wait for Firebase Auth to resolve session (replaces localStorage hack)
 * 4. Initialize the SPA Router once session is determined
 */

import { Router } from './core/router.js';
import { ROUTES } from './config/routes.config.js';
import { GlobalStore } from './core/state.js';
import { APP_CONFIG } from './config/app.config.js';
import { AuthService } from './services/auth.service.js';
import { AnimationService } from './services/animation.service.js';

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

    // 3. Show loading indicator while Firebase resolves session
    this.showLoadingScreen();

    // 4. Wait for Firebase Auth to determine current session state.
    //    This replaces the unreliable localStorage cache approach.
    //    onAuthStateChanged fires once immediately with the current user or null.
    await new Promise((resolve) => {
      AuthService.watchAuthState((userSession) => {
        if (userSession) {
          console.log('[App] 🔒 Firebase session restored for:', userSession.email);
        } else {
          console.log('[App] 🔓 No active Firebase session — showing login.');
        }
        resolve();
      });
    });

    // 5. Remove loading screen, initialize smooth scroll and SPA router
    this.hideLoadingScreen();
    AnimationService.initGlobalScroll();
    this.router = new Router(ROUTES, 'app');

    console.log(`[App] ✅ ${APP_CONFIG.name} v${APP_CONFIG.version} initialized.`);
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
   * Show a full-screen loading overlay while Firebase initializes.
   * Prevents the login page from flashing briefly before session is known.
   */
  showLoadingScreen() {
    const loader = document.createElement('div');
    loader.id = 'app-loader';
    loader.style.cssText = `
      position: fixed; inset: 0;
      background: var(--color-bg-primary, #0a0a0b);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 16px; z-index: 9999;
      color: var(--color-text-primary, #f8fafc);
      font-family: 'Inter', sans-serif;
    `;
    loader.innerHTML = `
      <div style="
        width: 48px; height: 48px;
        border: 3px solid rgba(139,92,246,0.3);
        border-top-color: #8b5cf6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      "></div>
      <p style="font-size: 0.9rem; color: rgba(255,255,255,0.5);">Cargando Ultra Administrador...</p>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    `;
    document.body.appendChild(loader);
  }

  /**
   * Remove the loading overlay with a smooth fade-out.
   */
  hideLoadingScreen() {
    const loader = document.getElementById('app-loader');
    if (loader) {
      loader.style.transition = 'opacity 0.3s ease';
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 350);
    }
  }
}

// Bootstrap when DOM is ready
const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());

// Export for debugging in dev console
window.__ultraAdmin = app;
