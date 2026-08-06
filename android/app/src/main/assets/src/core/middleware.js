/**
 * @file middleware.js
 * @description General SPA middleware route guards to protect paths based on authentication and roles.
 */

import { GlobalStore } from './state.js';
import { getBusinessCategory, getModuleGuards } from '../config/business-types.config.js';
import { getModuleByPath, isModuleEnabled } from '../config/modules.config.js';

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
    const userRole = (state.activeRole || state.currentUser?.role || '').toUpperCase().trim();

    // Super Admin bypasses all module restrictions
    if (userRole === 'SUPER_ADMIN') return true;

    const company = state.currentCompany;
    if (!company) return true; // Allow if company not loaded yet

    if (!isModuleEnabled(company, moduleId)) {
      console.warn(`[moduleGuard] Access Denied: Module '${moduleId}' is disabled for company '${company.id}'.`);
      // Show notification if service is available
      try {
        const { NotificationService } = await import('../services/notification.service.js');
        NotificationService.error(`Módulo no disponible: Este módulo no ha sido contratado para "${company.name}".`);
      } catch (_) {}

      redirectUserDashboard(userRole, router);
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
    const userRole = (state.activeRole || state.currentUser?.role || '').toUpperCase().trim();
    if (userRole === 'SUPER_ADMIN') return true;

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
      redirectUserDashboard(userRole, router);
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
    const userRole = (state.activeRole || currentUser.role || '').toUpperCase().trim();
    const company = state.currentCompany;
    const path = route.path || '';

    // SUPER_ADMIN bypasses ALL guards — full access always
    if (userRole === 'SUPER_ADMIN') {
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

      if (path === '/manager/appointments' && !guards.enableAppointments) {
        console.warn(`Access Denied: Appointments are disabled for this business type.`);
        redirectUserDashboard(userRole, router);
        return false;
      }
    }

    // SUPER_ADMIN bypasses ALL guards — full access always
    if (userRole === 'SUPER_ADMIN') {
      return true;
    }

    // Check company status / subscription
    if (company && userRole !== 'SUPER_ADMIN') {
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

    if (!allowedRoles.includes(userRole)) {
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
  const currentHash = window.location.hash || '#/';
  let targetPath = '';

  switch (role) {
    case 'SUPER_ADMIN':
      targetPath = '/super-admin/companies';
      break;
    case 'OWNER':
      targetPath = '/owner/finance';
      break;
    case 'MANAGER':
      targetPath = '/manager/dashboard';
      break;
    case 'CASHIER':
      targetPath = '/cashier/pos';
      break;
    case 'WAITER':
      try {
        const companyObj = GlobalStore.getState().currentCompany;
        const categoryObj = getBusinessCategory(companyObj?.businessType || '');
        if (categoryObj === 'GASTRONOMIA' || categoryObj === 'BAR_DISCOTECA') {
          targetPath = '/waiter/tables';
        } else {
          targetPath = '/waiter/client-assignments';
        }
      } catch (err) {
        targetPath = '/waiter/tables';
      }
      break;
    case 'KITCHEN':
      targetPath = '/kitchen/kds';
      break;
    case 'CUSTOMER':
      targetPath = '/customer/menu';
      break;
    default:
      targetPath = '/login';
  }

  // Prevent infinite redirection loops if we are already at the target path
  if (currentHash === `#${targetPath}` || (currentHash === '#/' && targetPath === '/')) {
    console.warn(`[middleware] Already at ${targetPath}, stopping redirection loop.`);
    return;
  }

  router.navigate(targetPath);
}
