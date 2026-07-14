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
   * Falls back gracefully if Firestore is temporarily offline.
   *
   * @param {string} email
   * @param {string} password
   * @returns {Promise<Object>} User session object
   */
  static async login(email, password) {
    console.log('[AuthService] 🔑 Signing in with Firebase Auth:', email);

    // Allow demo SuperAdmin without Firebase (local-only fallback)
    if (!auth) {
      if (email === 'super@admin.com') {
        return AuthService._mockSuperAdminLogin();
      }
      // Check local dynamic users (offline fallback)
      return AuthService._localLogin(email, password);
    }

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = credential.user;

      // Load user profile from Firestore (with timeout safety)
      let userProfile = null;
      if (db) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          // Race between Firestore read and a 5-second timeout
          const userDocSnap = await Promise.race([
            getDoc(userDocRef),
            new Promise((_, reject) => setTimeout(() => reject(new Error('firestore-timeout')), 5000))
          ]);

          if (userDocSnap.exists()) {
            userProfile = userDocSnap.data();
          }
        } catch (firestoreErr) {
          console.warn('[AuthService] Firestore profile load failed, using email detection:', firestoreErr.message);
        }
      }

      // If Firestore profile is missing, detect role from email
      if (!userProfile) {
        if (email === 'super@admin.com') {
          userProfile = {
            displayName: 'Super Administrador',
            role: 'SUPER_ADMIN',
            customRole: '',
            companyId: 'global',
            branchId: 'global'
          };
          // Try to save to Firestore asynchronously (don't block login)
          if (db) {
            const userDocRef = doc(db, 'users', firebaseUser.uid);
            setDoc(userDocRef, {
              ...userProfile,
              uid: firebaseUser.uid,
              email: email,
              createdAt: serverTimestamp()
            }).catch(e => console.warn('[AuthService] Could not save SuperAdmin profile:', e.message));
          }
        } else {
          throw new Error('Tu perfil de usuario no está registrado en la base de datos. Contacta al administrador.');
        }
      }

      const userSession = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: userProfile.displayName || firebaseUser.displayName || 'Usuario',
        role: userProfile.role,
        customRole: userProfile.customRole || '',
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
      console.error('[AuthService] ❌ Login error:', error.code || '', error.message);

      // Map Firebase Auth error codes to friendly Spanish messages
      const code = error.code || '';
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-email'
      ) {
        throw new Error('Credenciales inválidas. Revisa tu correo y contraseña.');
      }
      if (code === 'auth/too-many-requests') {
        throw new Error('Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.');
      }
      if (code === 'auth/network-request-failed') {
        throw new Error('Sin conexión a internet. Verifica tu red y vuelve a intentar.');
      }
      throw error;
    }
  }

  /**
   * Try to log in from locally cached dynamic users (offline fallback).
   * @private
   */
  static _localLogin(email, password) {
    const dynamicUsers = JSON.parse(localStorage.getItem('ua_dynamic_users') || '[]');
    const user = dynamicUsers.find(u => u.email === email && u.password === password);

    if (!user) {
      throw new Error('Credenciales inválidas. Revisa tu correo y contraseña.');
    }

    const userSession = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email,
      role: user.role,
      customRole: user.customRole || '',
      companyId: user.companyId,
      branchId: user.branchId || 'main'
    };

    GlobalStore.set({
      currentUser: userSession,
      activeRole: userSession.role,
      isAuthenticated: true
    });

    return userSession;
  }

  /**
   * Creates a new Firebase Auth user using a secondary app instance
   * to avoid signing out the current user (e.g. SuperAdmin).
   *
   * @param {string} email
   * @param {string} password
   * @param {Object} profileData - { displayName, role, customRole, companyId, branchId }
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
        customRole: profileData.customRole || '',
        companyId: profileData.companyId,
        branchId: profileData.branchId || 'main'
      });
      localStorage.setItem('ua_dynamic_users', JSON.stringify(dynamicUsers));
      console.log('[AuthService] ⚠️ Firebase not available — saved to localStorage.');
      return uid;
    }

    // Use secondary Firebase App to create user WITHOUT signing out the current user
    const { initializeApp, deleteApp } = await import(
      'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js'
    );
    const { getAuth: getSecondaryAuth, createUserWithEmailAndPassword } = await import(
      'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js'
    );
    const { getFirestore: getSecondaryFirestore, doc: secondaryDoc, setDoc: secondarySetDoc, serverTimestamp: secondaryTimestamp } = await import(
      'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js'
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

      // ── CRITICAL FIX ──────────────────────────────────────────────────────
      // Use the SECONDARY app's Firestore instance (where the new user IS
      // authenticated) instead of the primary app's db (which has no active
      // session when called from the login page). Without this, Firestore
      // security rules reject the write silently and the button hangs forever.
      // ─────────────────────────────────────────────────────────────────────
      const secondaryDb = getSecondaryFirestore(secondaryApp);
      const userDocRef  = secondaryDoc(secondaryDb, 'users', newUid);

      // Write profile with a 10-second timeout so we never block forever
      await Promise.race([
        secondarySetDoc(userDocRef, {
          uid: newUid,
          email: email,
          displayName: profileData.displayName,
          role: profileData.role,
          customRole: profileData.customRole || '',
          companyId: profileData.companyId,
          branchId: profileData.branchId || 'main',
          createdAt: secondaryTimestamp()
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Firestore write timeout — revisa las reglas de seguridad.')), 10000)
        )
      ]);

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
      await signOut(auth).catch(() => {});
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
   * Set up a Firebase Auth state observer with a safety timeout.
   * Automatically restores sessions on page reload.
   * Never hangs — resolves within 6 seconds at most.
   *
   * @param {Function} onUserReady - Called once with user session or null
   */
  static watchAuthState(onUserReady) {
    let resolved = false;

    const resolve = (session) => {
      if (resolved) return;
      resolved = true;
      onUserReady(session);
    };

    // Safety net: if Firebase Auth takes too long, unblock the app
    const timeout = setTimeout(() => {
      console.warn('[AuthService] ⚠️ Auth state timeout — proceeding without session.');
      resolve(null);
    }, 6000);

    if (!auth) {
      clearTimeout(timeout);
      resolve(null);
      return;
    }

    onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        // No user is signed in
        GlobalStore.set({ currentUser: null, activeRole: null, isAuthenticated: false });
        clearTimeout(timeout);
        resolve(null);
        return;
      }

      // User is signed in — try to load their profile from Firestore
      try {
        let userProfile = null;

        if (db) {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          // 4-second timeout on Firestore read so we never hang
          const snap = await Promise.race([
            getDoc(userDocRef),
            new Promise((_, reject) => setTimeout(() => reject(new Error('firestore-timeout')), 4000))
          ]);

          if (snap.exists()) {
            userProfile = snap.data();
          }
        }

        // Fallback: detect SuperAdmin from email if profile not found
        if (!userProfile && firebaseUser.email === 'super@admin.com') {
          userProfile = {
            displayName: 'Super Administrador',
            role: 'SUPER_ADMIN',
            customRole: '',
            companyId: 'global',
            branchId: 'global'
          };
        }

        if (userProfile) {
          const userSession = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: userProfile.displayName || firebaseUser.displayName || 'Usuario',
            role: userProfile.role,
            customRole: userProfile.customRole || '',
            companyId: userProfile.companyId,
            branchId: userProfile.branchId || 'main'
          };

          GlobalStore.set({
            currentUser: userSession,
            activeRole: userSession.role,
            isAuthenticated: true
          });

          clearTimeout(timeout);
          resolve(userSession);
        } else {
          // User in Auth but profile not in Firestore — treat as unauthenticated
          // Do NOT sign out here — user may just need to re-login to create their profile
          GlobalStore.set({ currentUser: null, activeRole: null, isAuthenticated: false });
          clearTimeout(timeout);
          resolve(null);
        }

      } catch (e) {
        console.warn('[AuthService] Could not load Firestore profile during session restore:', e.message);
        // If Firestore is offline, still let the user proceed if email is recognized
        if (firebaseUser.email === 'super@admin.com') {
          const fallbackSession = AuthService._mockSuperAdminLogin();
          clearTimeout(timeout);
          resolve(fallbackSession);
        } else {
          GlobalStore.set({ currentUser: null, activeRole: null, isAuthenticated: false });
          clearTimeout(timeout);
          resolve(null);
        }
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
      customRole: '',
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
