/**
 * @file middleware.js
 * @description General SPA middleware route guards to protect paths based on authentication and roles.
 */

import { GlobalStore } from './state.js';

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
    const userRole = state.activeRole || (state.currentUser && state.currentUser.role);

    if (userRole !== 'SUPER_ADMIN') {
      const company = state.currentCompany;
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

    if (!allowedRoles.includes(userRole)) {
      console.error(`Access Denied: Role '${userRole}' not allowed on '${route.path}'.`);
      
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
      router.navigate('/waiter/tables');
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
