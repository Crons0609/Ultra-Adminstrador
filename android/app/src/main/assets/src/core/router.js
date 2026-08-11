/**
 * @file router.js
 * @description Hash-based Single Page Application (SPA) Router with route guards and middleware execution.
 */

import { AnimationService } from '../services/animation.service.js';

export class Router {
  constructor(routes, rootElementId = 'app') {
    this.routes = routes;
    this.rootElement = document.getElementById(rootElementId);
    this.currentRoute = null;
    this.currentViewInstance = null;
    this._navId = 0; // Navigation guard counter — increments on every route change

    // Listen to hash change events
    window.addEventListener('hashchange', () => this.handleRouteChange());
 
    // Execute initial route resolution immediately
    this.handleRouteChange();
  }

  /**
   * Navigate programmatically to a hash path.
   * @param {string} path - Hash path, e.g., '/dashboard' or '/login'
   */
  navigate(path) {
    window.location.hash = path;
  }

  /**
   * Route change handler. Resolves path, processes middleware, and mounts views.
   */
  async handleRouteChange() {
    // Navigation guard: each call gets a unique ID.
    // If a newer navigation starts before this one finishes, this one aborts.
    const navId = ++this._navId;

    const rawHash = window.location.hash.slice(1) || '/';
    // Strip query strings (e.g. /login?email=foo -> /login) to prevent query params from corrupting route regex matching
    const hashPath = rawHash.split('?')[0] || '/';
    
    // Simple dynamic parameter parsing (e.g. /customer/menu/:companyId/:branchId/:tableId)
    const route = this.matchRoute(hashPath);

    if (!route) {
      console.warn(`Route not found for: ${hashPath}. Redirecting to /`);
      this.navigate('/');
      return;
    }

    this.currentRoute = route;

    // Execute middleware chain (Auth guards, roles validations)
    const canAccess = await this.executeMiddlewares(route);

    // Abort if a newer navigation has started since we awaited
    if (navId !== this._navId) return;

    if (!canAccess) {
      // Middleware handles redirection, stop execution here
      return;
    }

    // Clean up any orphaned modal overlays left in the DOM and reset body scroll lock
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');

    // Check if the DOM already contains the persistent app container shell
    const existingContainer = this.rootElement ? this.rootElement.querySelector('.app-container') : null;
    const existingMainContent = existingContainer ? existingContainer.querySelector('.main-content') : null;

    try {
      const params = this.getRouteParams(rawHash, route.path);
      const ViewClass = route.view;
      const newViewInstance = new ViewClass(params);

      // Mount the new view component
      const renderedElement = await newViewInstance.mount();

      // Abort if another navigation started while mounting
      if (navId !== this._navId) {
        if (typeof newViewInstance.unmount === 'function') newViewInstance.unmount();
        return;
      }

      // Unmount previous view instance safely
      if (this.currentViewInstance && typeof this.currentViewInstance.unmount === 'function') {
        this.currentViewInstance.unmount();
      }
      this.currentViewInstance = newViewInstance;

      if (this.rootElement) {
        let newContentEl = null;

        if (renderedElement instanceof HTMLElement) {
          newContentEl = renderedElement;
        } else {
          const tempWrapper = document.createElement('div');
          tempWrapper.innerHTML = newViewInstance.render();
          newContentEl = tempWrapper.firstElementChild || tempWrapper;
        }

        const newAppContainer = newContentEl.classList.contains('app-container')
          ? newContentEl
          : newContentEl.querySelector('.app-container');

        // Persistent AppShell layout swapping — keeps Sidebar & Header 100% stable
        if (existingContainer && existingMainContent && newAppContainer) {
          const newMainContent = newAppContainer.querySelector('.main-content');
          const newPageBody = newMainContent ? newMainContent.querySelector('.page-body') : null;
          const currentPageBody = existingMainContent.querySelector('.page-body');

          if (newPageBody && currentPageBody) {
            // Swap ONLY the inner page body content — Sidebar & Header stay untouched
            currentPageBody.replaceWith(newPageBody);
            AnimationService.animatePageEntrance(newPageBody);
          } else if (newMainContent) {
            existingMainContent.replaceWith(newMainContent);
            AnimationService.animatePageEntrance(newMainContent);
          } else {
            this.rootElement.innerHTML = '';
            this.rootElement.appendChild(newContentEl);
            AnimationService.animatePageEntrance(newContentEl);
          }
        } else {
          // Standard full view mount for non-shell routes (e.g. /login)
          this.rootElement.innerHTML = '';
          this.rootElement.appendChild(newContentEl);
          AnimationService.animatePageEntrance(newContentEl);
        }

        // Reset scroll position on main content area
        try {
          window.scrollTo(0, 0);
          const mainContentEl = document.querySelector('.main-content');
          if (mainContentEl) mainContentEl.scrollTop = 0;
        } catch (_) {}
      }
    } catch (error) {
      if (navId !== this._navId) return; // Ignore errors from superseded navigations
      console.error('Error mounting route view:', error);
      // Fallback to error route or display generic error layout
      if (this.rootElement) {
        this.rootElement.innerHTML = `<div class="p-6 text-center text-danger"><h2>Error al cargar la página</h2><p>${error.message}</p></div>`;
      }
    }
  }

  /**
   * Match current hash path against registered route regex rules.
   * @param {string} hashPath 
   */
  matchRoute(hashPath) {
    return this.routes.find(route => {
      const routeRegex = this.pathToRegex(route.path);
      return routeRegex.test(hashPath);
    });
  }

  /**
   * Convert route path pattern into a regex selector.
   * @param {string} path 
   */
  pathToRegex(path) {
    return new RegExp('^' + path.replace(/\//g, '\\/').replace(/:\w+/g, '([^\/]+)') + '$');
  }

  /**
   * Extract parameterized variables from the active path.
   * @param {string} rawHash 
   * @param {string} routePathPattern 
   */
  getRouteParams(rawHash, routePathPattern) {
    const [hashPath, queryString] = (rawHash || '/').split('?');
    const values = hashPath.match(this.pathToRegex(routePathPattern));
    const keys = [...routePathPattern.matchAll(/:(\w+)/g)].map(result => result[1]);
    
    const params = {};
    if (values) {
      keys.forEach((key, index) => {
        try {
          params[key] = decodeURIComponent(values[index + 1]);
        } catch (_) {
          params[key] = values[index + 1];
        }
      });
    }

    if (queryString) {
      try {
        const searchParams = new URLSearchParams(queryString);
        params.queryParams = Object.fromEntries(searchParams.entries());
      } catch (_) {}
    }

    return params;
  }

  /**
   * Execute sequence of middlewares configured for this route path.
   * @param {Object} route 
   * @returns {Promise<boolean>} Resolves to true if allowed, false if redirected.
   */
  async executeMiddlewares(route) {
    if (!route.middlewares || route.middlewares.length === 0) {
      return true;
    }

    for (const middleware of route.middlewares) {
      const isAllowed = await middleware(route, this);
      if (!isAllowed) {
        return false;
      }
    }
    return true;
  }
}
