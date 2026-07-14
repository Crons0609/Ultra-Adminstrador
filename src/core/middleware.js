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

    // 2. Validate role scope
    const state = GlobalStore.getState();
    const userRole = state.activeRole || (state.currentUser && state.currentUser.role);

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
      router.navigate('/super-admin/dashboard');
      break;
    case 'OWNER':
      router.navigate('/owner/dashboard');
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
