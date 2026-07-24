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
import { FirestoreService } from './services/firestore.service.js';
import { AnimationService } from './services/animation.service.js';
import { GeolocationService } from './services/geolocation.service.js';
import { AppearanceService } from './services/appearance.service.js';

class App {
  constructor() {
    this.router = null;
  }

  /**
   * Main application initializer. Called once when the DOM is ready.
   */
  async init() {
    // 1. Apply saved theme fallback immediately (prevents flash before Firebase loads)
    const fallbackTheme = localStorage.getItem('theme') || APP_CONFIG.defaultTheme;
    document.body.classList.add(fallbackTheme);

    // 2. Register service worker for PWA capabilities
    this.registerServiceWorker();

    // 3. Show loading indicator while Firebase resolves session
    this.showLoadingScreen();

    // 4. Wait for Firebase Auth to determine current session state.
    //    This replaces the unreliable localStorage cache approach.
    //    onAuthStateChanged fires once immediately with the current user or null.
    await new Promise((resolve) => {
      AuthService.watchAuthState(async (userSession) => {
        if (userSession) {
          console.log('[App] 🔒 Firebase session restored for:', userSession.email);
          if (userSession.companyId && userSession.companyId !== 'global') {
            try {
              const companyInfo = await FirestoreService.getCompanyInfo(userSession.companyId);
              if (companyInfo) {
                GlobalStore.set({ currentCompany: companyInfo });
                console.log('[App] 🏢 Company info restored:', companyInfo.name);
              }
            } catch (err) {
              console.warn('[App] Failed to restore company info:', err.message);
            }
          }
          // Check GPS tracking prompt / auto-resume for employees
          GeolocationService.checkAndPromptGPS();
          
          // Start notifications listener
          this.startNotificationsListener(userSession);
        } else {
          console.log('[App] 🔓 No active Firebase session — showing login.');
          if (this.notificationsUnsubscribe) {
            this.notificationsUnsubscribe();
            this.notificationsUnsubscribe = null;
          }
        }
        resolve();
      });
    });

    // 5. Purge old local-DB cache keys — all data now lives in Firebase RTDB
    this.clearLocalDbCache();

    // 6. Load and apply global appearance config from Firebase (colors, theme, fonts)
    await AppearanceService.loadAndApply();

    // 7. Remove loading screen, initialize smooth scroll and SPA router
    this.hideLoadingScreen();
    AnimationService.initGlobalScroll();
    this.router = new Router(ROUTES, 'app');

    console.log(`[App] ✅ ${APP_CONFIG.name} v${APP_CONFIG.version} initialized.`);
  }

  /**
   * Listens for incoming real-time notifications in Firebase and displays them as Toast alerts.
   */
  startNotificationsListener(userSession) {
    if (this.notificationsUnsubscribe) {
      this.notificationsUnsubscribe();
      this.notificationsUnsubscribe = null;
    }

    import('./config/firebase.config.js').then(({ db }) => {
      import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js').then(({ ref, onValue }) => {
        if (!db || !userSession.companyId) return;

        const path = `${userSession.companyId}/notifications`;
        const notificationsRef = ref(db, path);
        
        let initialLoad = true;
        this.notificationsUnsubscribe = onValue(notificationsRef, (snapshot) => {
          if (!snapshot.exists()) return;
          const data = snapshot.val();
          
          if (initialLoad) {
            initialLoad = false;
            return;
          }

          const notifs = Object.keys(data).map(k => ({ id: k, ...data[k] }));
          if (notifs.length === 0) return;
          
          notifs.sort((a, b) => b.timestamp - a.timestamp);
          const newest = notifs[0];

          const isOwner = userSession.role === 'OWNER' || userSession.role === 'MANAGER';
          const matchUser = newest.toUid === userSession.uid || (newest.toUid === 'OWNER' && isOwner);
          const isRecent = (Date.now() - newest.timestamp) < 5000;

          if (matchUser && isRecent && !newest.read) {
            import('./services/notification.service.js').then(({ NotificationService }) => {
              NotificationService.show(newest.message, 'info', 5000);
            });
          }
        });
      });
    });
  }

  /**
   * Remove all legacy localStorage keys that used to store local DB data.
   * Since the app now exclusively uses Firebase Realtime Database, these keys
   * are obsolete and should be wiped on every startup to avoid stale state.
   */
  clearLocalDbCache() {
    const legacyKeys = [
      'ua_users',
      'ua_dynamic_users',
      'ua_companies',
      'ua_branches',
      'ua_employees',
      'ua_session',
      'ua_current_user',
    ];
    legacyKeys.forEach(key => {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        console.log(`[App] 🗑️ Caché local eliminado: ${key}`);
      }
    });

    // Also purge CacheService localStorage keys (prefixed with cache_)
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('cache_'))
        .forEach(key => {
          localStorage.removeItem(key);
          console.log(`[App] 🗑️ Caché de servicio eliminado: ${key}`);
        });
    } catch (e) {
      console.warn('[App] No se pudieron limpiar las claves cache_ de localStorage:', e);
    }

    console.log('[App] ✅ Limpieza de caché local completada.');
  }

  /**
   * @deprecated Use AppearanceService.loadAndApply() instead.
   * Kept as a stub for backwards compatibility.
   */
  applyTheme() {
    // Now handled by AppearanceService.loadAndApply() in init()
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
