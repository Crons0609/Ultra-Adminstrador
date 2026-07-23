/**
 * @file middleware.js
 * @description General SPA middleware route guards to protect paths based on authentication and roles.
 */

import { GlobalStore } from './state.js';
import { getBusinessCategory, getModuleGuards } from '../config/business-types.config.js';

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
    const userRole = state.activeRole || currentUser.role;
    const company = state.currentCompany;
    const path = route.path || '';

    // Business type category guards validation
    if (company && userRole !== 'SUPER_ADMIN') {
      const category = getBusinessCategory(company.businessType || '');
      const guards = getModuleGuards(company.businessType || '');
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

    if (userRole === 'SUPER_ADMIN' || userRole === 'OWNER') {
      if (userRole !== 'SUPER_ADMIN') {
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
        }
      }
      return true;
    }

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
  switch (role) {
    case 'SUPER_ADMIN':
      router.navigate('/super-admin/companies');
      break;
    case 'OWNER':
      router.navigate('/owner/finance');
      break;
    case 'MANAGER':
      router.navigate('/manager/dashboard');
      break;
    case 'CASHIER':
      router.navigate('/cashier/pos');
      break;
    case 'WAITER':
      try {
        const companyObj = GlobalStore.getState().currentCompany;
        const categoryObj = getBusinessCategory(companyObj?.businessType || '');
        if (categoryObj === 'GASTRONOMIA' || categoryObj === 'BAR_DISCOTECA') {
          router.navigate('/waiter/tables');
        } else {
          router.navigate('/waiter/client-assignments');
        }
      } catch (err) {
        router.navigate('/waiter/tables');
      }
      break;
    case 'KITCHEN':
      router.navigate('/kitchen/kds');
      break;
    case 'CUSTOMER':
      router.navigate('/customer/menu');
      break;
    default:
      router.navigate('/login');
  }
}
