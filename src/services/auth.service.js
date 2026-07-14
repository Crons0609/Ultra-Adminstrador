/**
 * @file auth.service.js
 * @description Authentication service — Firebase Auth integration.
 *
 * Uses real Firebase Auth for login, logout, and password reset.
 * User roles are stored in Firestore under the 'users' collection.
 * Falls back to localStorage profile cache if Firestore rules are strict.
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
   * Profile lookup order: Firestore → localStorage cache → email detection.
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
      return AuthService._localLogin(email, password);
    }

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = credential.user;

      // ── Profile lookup: Firestore first, then localStorage cache ──────────
      let userProfile = null;

      if (db) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDocSnap = await Promise.race([
            getDoc(userDocRef),
            new Promise((_, reject) => setTimeout(() => reject(new Error('firestore-timeout')), 5000))
          ]);
          if (userDocSnap.exists()) {
            userProfile = userDocSnap.data();
          }
        } catch (firestoreErr) {
          console.warn('[AuthService] Firestore profile load failed — trying cache:', firestoreErr.message);
        }
      }

      // ── Fallback 1: localStorage profile cache (populated on createUser) ──
      if (!userProfile) {
        const profileCache = JSON.parse(localStorage.getItem('ua_profile_cache') || '{}');
        if (profileCache[firebaseUser.uid]) {
          userProfile = profileCache[firebaseUser.uid];
          console.log('[AuthService] 📦 Profile loaded from localStorage cache.');
          // Async: try to write it back to Firestore now (user is authenticated)
          if (db) {
            setDoc(doc(db, 'users', firebaseUser.uid), {
              ...userProfile,
              createdAt: serverTimestamp()
            }).then(() => {
              console.log('[AuthService] ☁️ Profile synced to Firestore from cache.');
            }).catch(e => console.warn('[AuthService] Could not sync profile:', e.message));
          }
        }
      }

      // ── Fallback 2: dynamic users list ─────────────────────────────────────
      if (!userProfile) {
        const dynamicUsers = JSON.parse(localStorage.getItem('ua_dynamic_users') || '[]');
        const localUser = dynamicUsers.find(u => u.email === email);
        if (localUser) {
          userProfile = localUser;
          console.log('[AuthService] 📦 Profile loaded from ua_dynamic_users cache.');
        }
      }

      // ── Fallback 3: SuperAdmin detection by email ──────────────────────────
      if (!userProfile && email === 'super@admin.com') {
        userProfile = {
          displayName: 'Super Administrador',
          role: 'SUPER_ADMIN',
          customRole: '',
          companyId: 'global',
          branchId: 'global'
        };
        if (db) {
          setDoc(doc(db, 'users', firebaseUser.uid), {
            ...userProfile,
            uid: firebaseUser.uid,
            email,
            createdAt: serverTimestamp()
          }).catch(e => console.warn('[AuthService] Could not save SuperAdmin profile:', e.message));
        }
      }

      if (!userProfile) {
        throw new Error('Tu perfil de usuario no está registrado. Contacta al administrador.');
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
   * Strategy:
   * 1. Create user in Firebase Auth via secondary app (CRITICAL - always required)
   * 2. Cache profile in localStorage immediately (guarantees login works)
   * 3. Try Firestore write via secondary app (best-effort, no failure if blocked)
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
      const uid = `local-${Date.now()}`;
      AuthService._cacheUserProfile(uid, email, password, profileData);
      console.log('[AuthService] ⚠️ Firebase not available — saved to localStorage only.');
      return uid;
    }

    // ─── Load secondary app modules ──────────────────────────────────────────
    const { initializeApp, deleteApp } = await import(
      'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js'
    );
    const { getAuth: getSecondaryAuth, createUserWithEmailAndPassword } = await import(
      'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js'
    );
    const {
      getFirestore: getSecondaryFirestore,
      doc: secondaryDoc,
      setDoc: secondarySetDoc,
      serverTimestamp: secondaryTimestamp
    } = await import(
      'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js'
    );
    // ─────────────────────────────────────────────────────────────────────────

    const mainApp = auth.app;
    const secondaryAppName = `secondary-user-create-${Date.now()}`;
    let secondaryApp = null;

    try {
      secondaryApp = initializeApp(mainApp.options, secondaryAppName);
      const secondaryAuth = getSecondaryAuth(secondaryApp);

      // ── Step 1: Create user in Firebase Auth (CRITICAL) ───────────────────
      const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const newUid = credential.user.uid;
      console.log('[AuthService] ✅ Firebase Auth user created. UID:', newUid);

      // ── Step 2: Cache profile in localStorage immediately ─────────────────
      // This guarantees login works even if Firestore write is blocked.
      AuthService._cacheUserProfile(newUid, email, password, profileData);

      // ── Step 3: Write profile to Firestore (best-effort, no throw) ───────
      // Uses secondary app's Firestore where the new user IS authenticated.
      // If Firestore rules block the write, we log a warning but do NOT fail —
      // the user CAN log in using the localStorage cache above.
      try {
        const secondaryDb = getSecondaryFirestore(secondaryApp);
        const userDocRef = secondaryDoc(secondaryDb, 'users', newUid);

        await Promise.race([
          secondarySetDoc(userDocRef, {
            uid: newUid,
            email,
            displayName: profileData.displayName,
            role: profileData.role,
            customRole: profileData.customRole || '',
            companyId: profileData.companyId,
            branchId: profileData.branchId || 'main',
            createdAt: secondaryTimestamp()
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('firestore-timeout')), 8000)
          )
        ]);
        console.log('[AuthService] ✅ Firestore profile saved. UID:', newUid);
      } catch (firestoreErr) {
        console.warn(
          '[AuthService] ⚠️ Firestore write blocked (security rules). ' +
          'Account created in Auth + localStorage cache. Update Firestore rules to persist permanently.',
          firestoreErr.message
        );
      }

      return newUid;

    } catch (authErr) {
      // Firebase Auth creation failed — this is a real error
      console.error('[AuthService] ❌ Firebase Auth user creation failed:', authErr);
      throw authErr;

    } finally {
      if (secondaryApp) {
        await deleteApp(secondaryApp).catch(() => {});
      }
    }
  }

  /**
   * Save user profile to both ua_profile_cache and ua_dynamic_users in localStorage.
   * @private
   */
  static _cacheUserProfile(uid, email, password, profileData) {
    const entry = {
      uid,
      email,
      password,
      displayName: profileData.displayName,
      role: profileData.role,
      customRole: profileData.customRole || '',
      companyId: profileData.companyId,
      branchId: profileData.branchId || 'main'
    };

    // Profile cache keyed by UID
    const profileCache = JSON.parse(localStorage.getItem('ua_profile_cache') || '{}');
    profileCache[uid] = entry;
    localStorage.setItem('ua_profile_cache', JSON.stringify(profileCache));

    // Dynamic users list (for password-based local login)
    const dynamicUsers = JSON.parse(localStorage.getItem('ua_dynamic_users') || '[]');
    const idx = dynamicUsers.findIndex(u => u.email === email);
    if (idx >= 0) dynamicUsers[idx] = entry;
    else dynamicUsers.push(entry);
    localStorage.setItem('ua_dynamic_users', JSON.stringify(dynamicUsers));

    console.log('[AuthService] 💾 Profile cached in localStorage for:', email);
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
        GlobalStore.set({ currentUser: null, activeRole: null, isAuthenticated: false });
        clearTimeout(timeout);
        resolve(null);
        return;
      }

      // User is signed in — try to load their profile
      try {
        let userProfile = null;

        // 1. Try Firestore
        if (db) {
          try {
            const userDocRef = doc(db, 'users', firebaseUser.uid);
            const snap = await Promise.race([
              getDoc(userDocRef),
              new Promise((_, reject) => setTimeout(() => reject(new Error('firestore-timeout')), 4000))
            ]);
            if (snap.exists()) {
              userProfile = snap.data();
            }
          } catch (e) {
            console.warn('[AuthService] Firestore session restore failed:', e.message);
          }
        }

        // 2. localStorage profile cache
        if (!userProfile) {
          const profileCache = JSON.parse(localStorage.getItem('ua_profile_cache') || '{}');
          if (profileCache[firebaseUser.uid]) {
            userProfile = profileCache[firebaseUser.uid];
            console.log('[AuthService] 📦 Session restored from localStorage cache.');
          }
        }

        // 3. Dynamic users list
        if (!userProfile) {
          const dynamicUsers = JSON.parse(localStorage.getItem('ua_dynamic_users') || '[]');
          const localUser = dynamicUsers.find(u => u.uid === firebaseUser.uid || u.email === firebaseUser.email);
          if (localUser) userProfile = localUser;
        }

        // 4. SuperAdmin fallback
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
          GlobalStore.set({ currentUser: null, activeRole: null, isAuthenticated: false });
          clearTimeout(timeout);
          resolve(null);
        }

      } catch (e) {
        console.warn('[AuthService] Session restore error:', e.message);
        GlobalStore.set({ currentUser: null, activeRole: null, isAuthenticated: false });
        clearTimeout(timeout);
        resolve(null);
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
