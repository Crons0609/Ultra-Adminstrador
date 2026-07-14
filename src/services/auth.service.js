/**
 * @file auth.service.js
 * @description Authentication service interface layer mapping to Firebase Auth (Phase 3 logic).
 */

import { GlobalStore } from '../core/state.js';

export class AuthService {
  /**
   * Login user with email and password.
   * @param {string} email 
   * @param {string} password 
   * @returns {Promise<Object>} User data session
   */
  static async login(email, password) {
    // Placeholder login interface. Real firebase integration in Phase 3.
    console.log('[AuthService] Attempting login for:', email);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // Simple test simulation to let routes mount in dev mode
    if (email === 'admin@admin.com') {
      const mockUser = {
        uid: 'admin-123',
        email: 'admin@admin.com',
        displayName: 'Gerente General',
        role: 'MANAGER',
        companyId: 'company-test',
        branchId: 'branch-test'
      };
      
      GlobalStore.set({
        currentUser: mockUser,
        activeRole: 'MANAGER',
        isAuthenticated: true
      });
      return mockUser;
    } else if (email === 'super@admin.com') {
      const mockUser = {
        uid: 'super-123',
        email: 'super@admin.com',
        displayName: 'Super Admin',
        role: 'SUPER_ADMIN',
        companyId: 'global',
        branchId: 'global'
      };
      
      GlobalStore.set({
        currentUser: mockUser,
        activeRole: 'SUPER_ADMIN',
        isAuthenticated: true
      });
      return mockUser;
    }
    
    throw new Error('auth/user-not-found');
  }

  /**
   * Log out active user session.
   */
  static async logout() {
    console.log('[AuthService] Logging out user');
    await new Promise(resolve => setTimeout(resolve, 300));
    
    GlobalStore.set({
      currentUser: null,
      activeRole: null,
      isAuthenticated: false
    });
  }

  /**
   * Send recovery email for password resets.
   * @param {string} email 
   */
  static async sendPasswordReset(email) {
    console.log('[AuthService] Password reset sent to:', email);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
