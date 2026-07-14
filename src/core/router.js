/**
 * @file router.js
 * @description Hash-based Single Page Application (SPA) Router with route guards and middleware execution.
 */

export class Router {
  constructor(routes, rootElementId = 'app') {
    this.routes = routes;
    this.rootElement = document.getElementById(rootElementId);
    this.currentRoute = null;
    this.currentViewInstance = null;

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
    let hashPath = window.location.hash.slice(1) || '/';
    
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
    if (!canAccess) {
      // Middleware handles redirection, stop execution here
      return;
    }

    // Clean up previous view instance
    if (this.currentViewInstance && typeof this.currentViewInstance.unmount === 'function') {
      this.currentViewInstance.unmount();
    }

    // Initialize and render new View component
    try {
      const params = this.getRouteParams(hashPath, route.path);
      const ViewClass = route.view;
      
      this.currentViewInstance = new ViewClass(params);
      
      if (this.rootElement) {
        this.rootElement.innerHTML = '';
        const renderedElement = await this.currentViewInstance.mount();
        if (renderedElement instanceof HTMLElement) {
          this.rootElement.appendChild(renderedElement);
        } else {
          this.rootElement.innerHTML = this.currentViewInstance.render();
        }
      }
    } catch (error) {
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
    return new RegExp('^' + path.replace(/\//g, '\\/').replace(/:\w+/g, '(.+)') + '$');
  }

  /**
   * Extract parameterized variables from the active path.
   * @param {string} hashPath 
   * @param {string} routePathPattern 
   */
  getRouteParams(hashPath, routePathPattern) {
    const values = hashPath.match(this.pathToRegex(routePathPattern));
    const keys = [...routePathPattern.matchAll(/:(\w+)/g)].map(result => result[1]);
    
    const params = {};
    if (values) {
      keys.forEach((key, index) => {
        params[key] = values[index + 1];
      });
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
