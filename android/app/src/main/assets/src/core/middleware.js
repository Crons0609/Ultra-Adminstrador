/**
 * @file middleware.js
 * @description General SPA middleware route guards to protect paths based on authentication and roles.
 */

import { GlobalStore } from './state.js';
import { getBusinessCategory, getModuleGuards } from '../config/business-types.config.js';
import { getModuleByPath, isModuleEnabled } from '../config/modules.config.js';

/**
 * Helper to check if a given role or email corresponds to a Programmer/SuperAdmin user.
 * Normalizes all valid programmer role aliases (SUPER_ADMIN, SUPERADMIN, PROGRAMMER, PROGRAMADOR, DEV, DEVELOPER).
 * @param {string} role 
 * @param {string} [email]
 * @returns {boolean}
 */
export function isProgrammerRole(role, email = '') {
  const norm = (role || '').toUpperCase().trim();
  const mail = (email || '').toLowerCase().trim();
  return (
    norm === 'SUPER_ADMIN' ||
    norm === 'SUPERADMIN' ||
    norm === 'PROGRAMMER' ||
    norm === 'PROGRAMADOR' ||
    norm === 'DEV' ||
    norm === 'DEVELOPER' ||
    mail === 'superadmin@ultraadmin.com'
  );
}

/**
 * Authentication Middleware: Verify user is logged in.
 * @param {Object} route 
 * @param {Router} router 
 * @returns {boolean}
 */
export async function authGuard(route, router) {
  const state = GlobalStore.getState();
  if (!state.isAuthenticated) {
    console.warn('Access Denied: Unauthenticated. Redirecting to /login');
    router.navigate('/login');
    return false;
  }
  return true;
}

/**
 * Module Guard: Validates that the module associated to this route is enabled for the company.
 * MUST be used in roleGuard middleware chain or as a standalone middleware.
 * @param {string} moduleId - The MODULE_REGISTRY id (e.g. 'expenses', 'inventory')
 * @returns {Function} Middleware function
 */
export function moduleGuard(moduleId) {
  return async (route, router) => {
    const authenticated = await authGuard(route, router);
    if (!authenticated) return false;

    const state = GlobalStore.getState();
    const currentUser = state.currentUser || {};
    const rawRole = state.activeRole || currentUser.role || '';

    // Super Admin / Programmer bypasses all module restrictions
    if (isProgrammerRole(rawRole, currentUser.email)) {
      return true;
    }

    const company = state.currentCompany;
    if (!company) return true; // Allow if company not loaded yet

    if (!isModuleEnabled(company, moduleId)) {
      console.warn(`[moduleGuard] Access Denied: Module '${moduleId}' is disabled for company '${company.id}'.`);
      try {
        const { NotificationService } = await import('../services/notification.service.js');
        NotificationService.error(`Módulo no disponible: Este módulo no ha sido contratado para "${company.name}".`);
      } catch (_) {}

      redirectUserDashboard(rawRole, router);
      return false;
    }

    return true;
  };
}

/**
 * Auto-detect module from route path and enforce module guard dynamically.
 * Used in roleGuard when a route has a path that maps to a MODULE_REGISTRY entry.
 * @returns {Function} Middleware function
 */
export function autoModuleGuard() {
  return async (route, router) => {
    const authenticated = await authGuard(route, router);
    if (!authenticated) return false;

    const state = GlobalStore.getState();
    const currentUser = state.currentUser || {};
    const rawRole = state.activeRole || currentUser.role || '';

    if (isProgrammerRole(rawRole, currentUser.email)) {
      return true;
    }

    const company = state.currentCompany;
    if (!company) return true;

    const path = route.path || '';
    const moduleDef = getModuleByPath(path);
    if (!moduleDef) return true; // Route not in MODULE_REGISTRY — allow

    if (!isModuleEnabled(company, moduleDef.id)) {
      console.warn(`[autoModuleGuard] Access Denied: Module '${moduleDef.id}' disabled for '${company.id}'.`);
      try {
        const { NotificationService } = await import('../services/notification.service.js');
        NotificationService.error(`Módulo no disponible: "${moduleDef.name}" no está habilitado para este negocio.`);
      } catch (_) {}
      redirectUserDashboard(rawRole, router);
      return false;
    }

    return true;
  };
}

/**
 * Role-Based Middleware: Check if current active user role is authorized.
 * @param {Array<string>} allowedRoles 
 * @returns {Function} Middleware function
 */
export function roleGuard(allowedRoles) {
  return async (route, router) => {
    // 1. Ensure user is logged in
    const authenticated = await authGuard(route, router);
    if (!authenticated) return false;

    const state = GlobalStore.getState();
    const currentUser = state.currentUser || {};
    const rawRole = state.activeRole || currentUser.role || '';
    const userRole = (rawRole || '').toUpperCase().trim();
    const company = state.currentCompany;
    const path = route.path || '';

    const isSuperAdmin = isProgrammerRole(userRole, currentUser.email);

    // SUPER_ADMIN / PROGRAMMER bypasses ALL guards — full access always
    if (isSuperAdmin) {
      return true;
    }

    // Business type category guards validation
    if (company) {
      const bType = company.businessType || company.rubro || company.type || company.category || company.name || '';
      const category = getBusinessCategory(bType);
      const guards = getModuleGuards(bType);
      const isRestaurant = (category === 'GASTRONOMIA' || category === 'BAR_DISCOTECA');

      if (!isRestaurant && ['/kitchen/kds', '/kitchen/stats', '/waiter/tables', '/waiter/orders'].includes(path)) {
        console.warn(`Access Denied: Route '${path}' is restricted to Gastronomy businesses.`);
        redirectUserDashboard(userRole, router);
        return false;
      }

      if ((path === '/waiter/client-assignments' || path === '/owner/client-assignments') && !guards.enableServiceRequests) {
        console.warn(`Access Denied: Client assignments are disabled for this business type.`);
        redirectUserDashboard(userRole, router);
        return false;
      }

      if ((path === '/manager/vehicles' || path === '/manager/rentals') && !guards.enableRentals && !guards.enableVehiclesCatalog) {
        console.warn(`Access Denied: Rentals are disabled for this business type.`);
        redirectUserDashboard(userRole, router);
        return false;
      }
    }

    // Check company status / subscription
    if (company) {
      const isFaltaPago = company.status === 'FALTA_PAGO' || company.status === 'INACTIVO' || company.status === 'SUSPENDIDO';
      const isExpired = company.subscriptionExpiresAt && (new Date(company.subscriptionExpiresAt) < new Date().setHours(0,0,0,0));
      
      if (isFaltaPago || isExpired) {
        console.warn(`Access Denied: Company '${company.name}' is expired or inactive.`);
        alert(`Acceso Suspendido: La suscripción de "${company.name}" ha vencido o se encuentra inactiva. Por favor, contacte al administrador.`);
        
        const { AuthService } = await import('../services/auth.service.js');
        await AuthService.logout();
        router.navigate('/login');
        return false;
      }

      // Check if module associated with this route path is enabled for this company
      const moduleDef = getModuleByPath(path);
      if (moduleDef && !isModuleEnabled(company, moduleDef.id)) {
        console.warn(`[roleGuard/moduleGuard] Module '${moduleDef.id}' is disabled for '${company.id}'.`);
        try {
          const { NotificationService } = await import('../services/notification.service.js');
          NotificationService.error(`Módulo no disponible: "${moduleDef.name}" no está habilitado para este negocio.`);
        } catch (_) {}
        redirectUserDashboard(userRole, router);
        return false;
      }
    }

    const permissions = currentUser.permissions || {};

    if (path.startsWith('/waiter/')) {
      if (permissions.tomar_pedidos === true) return true;
    }
    if (path.startsWith('/cashier/')) {
      if (permissions.administrar_caja === true || permissions.cobrar_pedidos === true) return true;
    }
    if (path.startsWith('/inventory/')) {
      if (permissions.gestionar_inventario === true || permissions.gestionar_productos === true) return true;
    }
    if (path.startsWith('/manager/')) {
      if (permissions.ver_reportes === true || permissions.administrar_empleados === true) return true;
    }

    const normAllowed = allowedRoles.map(r => (r || '').toUpperCase().trim());
    if (!normAllowed.includes(userRole)) {
      console.error(`Access Denied: Role '${userRole}' or required permissions not allowed on '${route.path}'.`);
      
      // Redirect to correct dashboard according to the user's role
      redirectUserDashboard(userRole, router);
      return false;
    }

    return true;
  };
}

/**
 * Redirect user to their respective entry dashboard base paths.
 * @param {string} role 
 * @param {Router} router 
 */
export function redirectUserDashboard(role, router) {
  const state = GlobalStore.getState();
  const currentUser = state.currentUser || {};
  const normRole = (role || currentUser.role || '').toUpperCase().trim();
  const rawHash = (window.location.hash || '').slice(1) || '/';
  const currentHashPath = rawHash.split('?')[0] || '/';

  let targetPath = '/login';

  if (isProgrammerRole(normRole, currentUser.email)) {
    targetPath = '/super-admin/companies';
  } else if (normRole === 'OWNER') {
    targetPath = '/owner/dashboard';
  } else if (normRole === 'MANAGER') {
    targetPath = '/manager/dashboard';
  } else if (normRole === 'CASHIER') {
    targetPath = '/cashier/pos';
  } else if (normRole === 'WAITER') {
    try {
      const companyObj = state.currentCompany;
      const categoryObj = getBusinessCategory(companyObj?.businessType || '');
      targetPath = (categoryObj === 'GASTRONOMIA' || categoryObj === 'BAR_DISCOTECA')
        ? '/waiter/tables'
        : '/waiter/client-assignments';
    } catch (_) {
      targetPath = '/waiter/tables';
    }
  } else if (normRole === 'KITCHEN') {
    targetPath = '/kitchen/kds';
  } else if (normRole === 'CUSTOMER') {
    targetPath = '/customer/menu';
  }

  // Prevent infinite redirect loops if targetPath matches current route
  if (currentHashPath === targetPath || currentHashPath.startsWith(targetPath)) {
    if (targetPath !== '/login') {
      console.warn(`[redirectUserDashboard] Prevented infinite redirect loop for '${normRole}' at '${currentHashPath}'.`);
    } else {
      console.warn(`[redirectUserDashboard] Prevented infinite redirect loop at /login.`);
    }
    return;
  }

  router.navigate(targetPath);
}
