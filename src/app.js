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
import { OfflineSyncService } from './services/offline-sync.service.js';
import { LocalStorageDBService } from './services/local-storage-db.service.js';
import { DataPrefetchService } from './services/data-prefetch.service.js';
import { BranchService } from './services/branch.service.js';

class App {
  constructor() {
    this.router = null;
  }

  /**
   * Main application initializer. Called once when the DOM is ready.
   */
  async init() {
    // 1. Show loading indicator and activate failsafe timer immediately
    this.showLoadingScreen();

    // 2. Apply saved theme fallback immediately (prevents flash before Firebase loads)
    const fallbackTheme = localStorage.getItem('theme') || APP_CONFIG.defaultTheme;
    document.body.classList.add(fallbackTheme);

    // 3. Register service worker for PWA capabilities
    this.registerServiceWorker();

    // 4. Initialize IndexedDB offline database and offline sync service FIRST so offline sessions can be loaded
    try {
      await LocalStorageDBService.getDB();
      await OfflineSyncService.init();
    } catch (dbErr) {
      console.warn('[App] Offline DB initialization warning:', dbErr);
    }

    // 5. Wait for Firebase Auth or IndexedDB to determine current session state with a strict 3.5s timeout.
    await new Promise((resolve) => {
      const failsafe = setTimeout(() => {
        console.warn('[App] ⚠️ Session restoration timeout — proceeding offline.');
        resolve();
      }, 3500);

      AuthService.watchAuthState(async (userSession) => {
        clearTimeout(failsafe);
        if (userSession) {
          console.log('[App] 🔒 User session restored for:', userSession.email);
          if (userSession.companyId && userSession.companyId !== 'global') {
            try {
              const companyInfo = await FirestoreService.getCompanyInfo(userSession.companyId);
              if (companyInfo) {
                GlobalStore.set({ currentCompany: companyInfo });
                console.log('[App] 🏢 Company info restored:', companyInfo.name);
              }
            } catch (err) {
              console.warn('[App] Failed to restore company info from network/cache:', err.message);
            }

            // Start real-time company modules & settings listener
            this.startCompanyRealtimeListener(userSession);

            // Initialize Multi-Branch listener so globalStore.branches / selectedBranchId are ready
            BranchService.initBranchListener();
          }
          // Check GPS tracking prompt / auto-resume for employees
          GeolocationService.checkAndPromptGPS();
          
          // Start notifications listener
          this.startNotificationsListener(userSession);
        } else {
          console.log('[App] 🔓 No active user session — showing login.');
          if (this.notificationsUnsubscribe) {
            this.notificationsUnsubscribe();
            this.notificationsUnsubscribe = null;
          }
          if (this.companyUnsubscribe) {
            this.companyUnsubscribe();
            this.companyUnsubscribe = null;
          }
        }
        resolve();
      });
    });

    // 6. Purge old legacy localStorage keys
    this.clearLocalDbCache();

    // 7. Trigger background prefetch for company data if logged in
    if (GlobalStore.getState().currentUser) {
      DataPrefetchService.prefetchCompanyData();
    }

    // 8. Load and apply global appearance config with timeout fallback (max 1.5s)
    try {
      await Promise.race([
        AppearanceService.loadAndApply(),
        new Promise(r => setTimeout(r, 1500))
      ]);
    } catch (e) {
      console.warn('[App] Could not load appearance config on boot:', e);
    }

    // 9. Remove loading screen, initialize smooth scroll and SPA router
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
   * Listens for real-time changes to the current company configuration and modules in Firebase RTDB.
   * Dynamically updates GlobalStore.set({ currentCompany }) so the Sidebar and routes update instantly.
   */
  startCompanyRealtimeListener(userSession) {
    if (this.companyUnsubscribe) {
      this.companyUnsubscribe();
      this.companyUnsubscribe = null;
    }

    if (!userSession || !userSession.companyId || userSession.companyId === 'global') return;

    import('./config/firebase.config.js').then(({ db }) => {
      import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js').then(({ ref, onValue }) => {
        if (!db) return;

        const companyRef = ref(db, `companies/${userSession.companyId}`);
        this.companyUnsubscribe = onValue(companyRef, async (snapshot) => {
          if (!snapshot.exists()) return;
          try {
            const companyInfo = await FirestoreService.getCompanyInfo(userSession.companyId);
            if (companyInfo) {
              GlobalStore.set({ currentCompany: companyInfo });
              console.log('[App] 🔄 Real-time company configuration & modules updated:', companyInfo.name);
            }
          } catch (err) {
            console.warn('[App] Realtime company update check failed:', err.message);
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
        .then(reg => {
          console.log('[App] Service Worker registered:', reg.scope);
          reg.update().catch(() => {});
        })
        .catch(err => console.warn('[App] Service Worker registration failed:', err));
    }
  }

  /**
   * Show a full-screen loading overlay ONLY on initial cold start.
   * If the app is already loaded or reloaded, returns immediately so content stays intact.
   */
  showLoadingScreen() {
    if (sessionStorage.getItem('ua_app_loaded') === 'true') {
      return;
    }
    if (document.getElementById('app-loader')) return;
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
      <img src="/assets/logo_ultra_administrador.png" 
           alt="Ultra Administrador" 
           onerror="if(!this.dataset.tried){this.dataset.tried='1';this.src='assets/logo_ultra_administrador.png';}else if(this.dataset.tried==='1'){this.dataset.tried='2';this.src='logo_ultra_administrador.png';}else if(this.dataset.tried==='2'){this.dataset.tried='3';this.src='/logo_ultra_administrador.png';}" 
           style="width: 76px; height: 76px; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(139,92,246,0.35)); margin-bottom: 8px;" />
      <div style="
        width: 44px; height: 44px;
        border: 3px solid rgba(139,92,246,0.25);
        border-top-color: #8b5cf6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      "></div>
      <div style="text-align: center;">
        <p style="font-size: 1rem; font-weight: 700; color: #fff; margin: 0 0 2px;">Ultra Administrador</p>
        <p style="font-size: 0.75rem; color: rgba(255,255,255,0.45); margin: 0;">Un producto de ProLine System</p>
      </div>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    `;
    document.body.appendChild(loader);

    // Failsafe: forcibly hide loading screen after 4 seconds to guarantee the app opens offline
    setTimeout(() => {
      this.hideLoadingScreen();
    }, 4000);
  }

  /**
   * Remove the loading overlay with a smooth fade-out and mark app as loaded.
   */
  hideLoadingScreen() {
    sessionStorage.setItem('ua_app_loaded', 'true');
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
