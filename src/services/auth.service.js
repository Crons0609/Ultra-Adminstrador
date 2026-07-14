/**
 * @file auth.service.js
 * @description Authentication service — Firebase Auth integration.
 *
 * Uses real Firebase Auth for login, logout, and password reset.
 * User roles are stored in Firestore under the 'users' collection.
 */

import { auth, db } from '../config/firebase.config.js';
import { GlobalStore } from '../core/state.js';

// Firebase Auth & Firestore modular imports (CDN v12.16.0)
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

export class AuthService {

  /**
   * Login with email and password using Firebase Auth.
   * After auth, loads user profile (role, companyId) from Firestore.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<Object>} User session object
   */
  static async login(email, password) {
    console.log('[AuthService] 🔑 Signing in with Firebase Auth:', email);

    // Allow demo SuperAdmin without Firebase
    if (email === 'super@admin.com' && !db) {
      return AuthService._mockSuperAdminLogin();
    }

    // Real Firebase Auth sign-in
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = credential.user;

      // Load user profile from Firestore
      let userProfile = null;
      if (db) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          userProfile = userDocSnap.data();
        } else {
          // Profile not in Firestore — check if it's the superadmin by email
          if (email === 'super@admin.com') {
            userProfile = {
              displayName: 'Super Administrador',
              role: 'SUPER_ADMIN',
              companyId: 'global',
              branchId: 'global'
            };
            // Save profile to Firestore for future logins
            await setDoc(userDocRef, {
              ...userProfile,
              email: email,
              createdAt: serverTimestamp()
            });
          } else {
            throw new Error('auth/profile-not-found');
          }
        }
      } else {
        // Firebase offline — use demo data
        if (email === 'super@admin.com') {
          return AuthService._mockSuperAdminLogin();
        }
        throw new Error('auth/firebase-not-available');
      }

      const userSession = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: userProfile.displayName || firebaseUser.displayName || 'Usuario',
        role: userProfile.role,
        companyId: userProfile.companyId,
        branchId: userProfile.branchId || 'main'
      };

      GlobalStore.set({
        currentUser: userSession,
        activeRole: userSession.role,
        isAuthenticated: true
      });

      console.log('[AuthService] ✅ Login exitoso:', email, '| Rol:', userSession.role);
      return userSession;

    } catch (error) {
      console.error('[AuthService] ❌ Login error:', error.code, error.message);
      // Re-throw with user-friendly message
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        throw new Error('Credenciales inválidas. Revisa tu correo y contraseña.');
      }
      throw error;
    }
  }

  /**
   * Creates a new Firebase Auth user using a secondary app instance
   * to avoid signing out the current user (e.g. SuperAdmin).
   *
   * @param {string} email
   * @param {string} password
   * @param {Object} profileData - { displayName, role, companyId, branchId }
   * @returns {Promise<string>} The new user's UID
   */
  static async createUser(email, password, profileData) {
    console.log('[AuthService] 👤 Creating new user:', email, '| Role:', profileData.role);

    if (!db || !auth) {
      // Fallback: save to localStorage for offline/demo use
      const dynamicUsers = JSON.parse(localStorage.getItem('ua_dynamic_users') || '[]');
      const uid = `local-${Date.now()}`;
      dynamicUsers.push({
        uid,
        email,
        password,
        displayName: profileData.displayName,
        role: profileData.role,
        companyId: profileData.companyId,
        branchId: profileData.branchId || 'main'
      });
      localStorage.setItem('ua_dynamic_users', JSON.stringify(dynamicUsers));
      console.log('[AuthService] ⚠️ Firebase not available — saved to localStorage.');
      return uid;
    }

    // Use secondary Firebase App to create user WITHOUT signing out the current user
    const { initializeApp, getApp, deleteApp } = await import(
      'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js'
    );
    const { getAuth: getSecondaryAuth, createUserWithEmailAndPassword } = await import(
      'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js'
    );

    // Get the main app's config to initialize a secondary instance
    const mainApp = auth.app;
    const secondaryAppName = `secondary-user-create-${Date.now()}`;
    let secondaryApp = null;

    try {
      secondaryApp = initializeApp(mainApp.options, secondaryAppName);
      const secondaryAuth = getSecondaryAuth(secondaryApp);

      // Create the user in the secondary app (doesn't affect primary session)
      const credential = await createUserWithEmailAndPassword(
        secondaryAuth,
        email,
        password
      );

      const newUid = credential.user.uid;

      // Save the user profile to Firestore with their role and companyId
      const userDocRef = doc(db, 'users', newUid);
      await setDoc(userDocRef, {
        uid: newUid,
        email: email,
        displayName: profileData.displayName,
        role: profileData.role,
        companyId: profileData.companyId,
        branchId: profileData.branchId || 'main',
        createdAt: serverTimestamp()
      });

      console.log('[AuthService] ✅ User created in Firebase Auth + Firestore:', email, '| UID:', newUid);
      return newUid;

    } finally {
      // Always clean up the secondary app
      if (secondaryApp) {
        await deleteApp(secondaryApp).catch(() => {});
      }
    }
  }

  /**
   * Log out the current Firebase Auth user.
   */
  static async logout() {
    console.log('[AuthService] 🚪 Signing out...');

    if (auth) {
      await signOut(auth);
    }

    GlobalStore.set({
      currentUser: null,
      activeRole: null,
      isAuthenticated: false
    });

    console.log('[AuthService] ✅ Signed out successfully.');
  }

  /**
   * Send a Firebase password reset email.
   * @param {string} email
   */
  static async sendPasswordReset(email) {
    console.log('[AuthService] 📧 Password reset sent to:', email);

    if (auth) {
      await sendPasswordResetEmail(auth, email);
    }
  }

  /**
   * Set up a Firebase Auth state observer. Automatically restores sessions
   * on page reload without needing localStorage caching.
   * @param {Function} onUserReady - Called with user session or null
   */
  static watchAuthState(onUserReady) {
    if (!auth) {
      onUserReady(null);
      return;
    }

    onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const profile = userDocSnap.data();
            const userSession = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: profile.displayName || firebaseUser.displayName || 'Usuario',
              role: profile.role,
              companyId: profile.companyId,
              branchId: profile.branchId || 'main'
            };

            GlobalStore.set({
              currentUser: userSession,
              activeRole: userSession.role,
              isAuthenticated: true
            });

            onUserReady(userSession);
          } else {
            // User exists in Auth but not in Firestore — sign out for safety
            await signOut(auth);
            onUserReady(null);
          }
        } catch (e) {
          console.error('[AuthService] Error loading user profile:', e);
          onUserReady(null);
        }
      } else {
        // No user signed in
        GlobalStore.set({
          currentUser: null,
          activeRole: null,
          isAuthenticated: false
        });
        onUserReady(null);
      }
    });
  }

  /**
   * Internal mock for SuperAdmin demo when Firebase is unavailable
   * @private
   */
  static _mockSuperAdminLogin() {
    const mockUser = {
      uid: 'super-admin-local',
      email: 'super@admin.com',
      displayName: 'Super Administrador',
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
}
