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
   * Creates a new Firebase Auth user using a secondary app instance,
   * then writes the profile to Firestore via the REST API using the
   * new user's ID token — bypassing all SDK timing issues.
   *
   * Strategy:
   * 1. Create user in Firebase Auth via secondary app (CRITICAL)
   * 2. Get user's ID token immediately from the credential
   * 3. Write Firestore profile via REST API with that token (reliable)
   * 4. Cache profile in localStorage as permanent offline fallback
   *
   * @param {string} email
   * @param {string} password
   * @param {Object} profileData - { displayName, role, customRole, companyId, branchId }
   * @returns {Promise<string>} The new user's UID
   */
  static async createUser(email, password, profileData) {
    console.log('[AuthService] 👤 Creating new user:', email, '| Role:', profileData.role);

    if (!auth) {
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
    // ─────────────────────────────────────────────────────────────────────────

    const mainApp = auth.app;
    const projectId = mainApp.options.projectId; // 'super-administrador-df803'
    const secondaryAppName = `secondary-user-create-${Date.now()}`;
    let secondaryApp = null;

    try {
      secondaryApp = initializeApp(mainApp.options, secondaryAppName);
      const secondaryAuth = getSecondaryAuth(secondaryApp);

      // ── Step 1: Create user in Firebase Auth (CRITICAL) ───────────────────
      const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const newUser = credential.user;
      const newUid = newUser.uid;
      console.log('[AuthService] ✅ Firebase Auth user created. UID:', newUid);

      // ── Step 2: Get ID token from the new user immediately ────────────────
      // This token proves the new user is authenticated and allows Firestore writes.
      const idToken = await newUser.getIdToken();

      // ── Step 3: Write profile via Firestore REST API with ID token ────────
      // Using REST API instead of Firestore SDK avoids all timing/propagation
      // issues with the secondary app pattern. The ID token is immediately valid.
      const profilePayload = {
        fields: {
          uid:         { stringValue: newUid },
          email:       { stringValue: email },
          displayName: { stringValue: profileData.displayName || email },
          role:        { stringValue: profileData.role },
          customRole:  { stringValue: profileData.customRole || '' },
          companyId:   { stringValue: profileData.companyId || 'global' },
          branchId:    { stringValue: profileData.branchId || 'main' },
          createdAt:   { timestampValue: new Date().toISOString() }
        }
      };

      // Route to local emulator if detected at startup, otherwise production.
      const useEmulator = window.__useFirebaseEmulator === true;
      const firestoreUrl = useEmulator
        ? `http://localhost:8080/v1/projects/${projectId}/databases/(default)/documents/users/${newUid}`
        : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${newUid}`;
      console.log('[AuthService] Writing profile via REST ->', useEmulator ? 'EMULATOR' : 'PRODUCTION');


      const response = await Promise.race([
        fetch(firestoreUrl, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(profilePayload)
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('REST timeout')), 10000)
        )
      ]);

      if (response.ok) {
        console.log('[AuthService] ✅ Firestore profile saved via REST API. UID:', newUid);
      } else {
        const errBody = await response.json().catch(() => ({}));
        console.warn('[AuthService] ⚠️ Firestore REST write failed:', response.status, errBody?.error?.message);
      }

      // ── Step 4: Always cache locally as permanent offline fallback ─────────
      AuthService._cacheUserProfile(newUid, email, password, profileData);

      return newUid;

    } catch (authErr) {
      console.error('[AuthService] ❌ User creation failed:', authErr);
      throw authErr;

    } finally {
      if (secondaryApp) {
        await deleteApp(secondaryApp).catch(() => { });
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
      await signOut(auth).catch(() => { });
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
