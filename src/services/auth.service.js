/**
 * @file auth.service.js
 * @description Authentication service — Firebase Auth + Realtime Database.
 *
 * - Login: Firebase Auth → profile from /users/{uid}
 * - Create user: Firebase Auth (secondary app) → dual-write to /users/{uid} + /companies/{id}/employees/{uid}
 * - Logout: Firebase Auth signOut + clear GlobalStore
 * - Session restore: onAuthStateChanged → /users/{uid} profile lookup
 *
 * Super Admin (Programador) email: superadmin@ultraadmin.com
 */

import { auth, db } from '../config/firebase.config.js';
import { GlobalStore } from '../core/state.js';
import { FirestoreService } from './firestore.service.js';
import { TimeService } from './time.service.js';

// Firebase Auth modular imports (CDN v12.16.0)
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';

import {
  ref,
  get,
  set,
  update,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';

// ─── Super Admin Constants ────────────────────────────────────────────────────
const SUPER_ADMIN_EMAIL = 'superadmin@ultraadmin.com';
const SUPER_ADMIN_PROFILE = {
  displayName: 'Programador',
  role: 'SUPER_ADMIN',
  customRole: '',
  companyId: 'global',
  branchId: 'global'
};

export class AuthService {

  /**
   * Login with email and password using Firebase Auth.
   * Profile lookup: RTDB /users/{uid} → SuperAdmin fallback → error.
   *
   * @param {string} email
   * @param {string} password
   * @returns {Promise<Object>} User session object
   */
  static async login(email, password) {
    console.log('[AuthService] 🔑 Signing in:', email);

    if (!auth) {
      throw new Error('Servicio de autenticación no disponible.');
    }

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = credential.user;

      // ── Profile lookup: Realtime Database ─────────────────────────────────
      let userProfile = null;

      if (db) {
        try {
          const userRef = ref(db, `users/${firebaseUser.uid}`);
          const userDocSnap = await Promise.race([
            get(userRef),
            new Promise((_, reject) => setTimeout(() => reject(new Error('database-timeout')), 5000))
          ]);
          if (userDocSnap.exists()) {
            userProfile = userDocSnap.val();
          }
        } catch (dbErr) {
          console.warn('[AuthService] RTDB profile load failed:', dbErr.message);
        }
      }

      // ── Fallback: SuperAdmin detection by email ──────────────────────────
      if (!userProfile && email === SUPER_ADMIN_EMAIL) {
        userProfile = { ...SUPER_ADMIN_PROFILE };
        // Persist SuperAdmin profile to RTDB if it doesn't exist yet
        if (db) {
          set(ref(db, `users/${firebaseUser.uid}`), {
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

      // Validar si el negocio existe y no ha sido eliminado (excepto si es SUPER_ADMIN)
      if (userProfile.companyId && userProfile.companyId !== 'global' && db) {
        const companySnap = await get(ref(db, `companies/${userProfile.companyId}`));
        if (!companySnap.exists()) {
          throw new Error('El negocio asociado a esta cuenta ha sido desactivado,comunicate con soporte al cliente');
        }

        const companyMeta = companySnap.val() || {};
        if (companyMeta.status === 'ELIMINADO') {
          throw new Error('El negocio asociado a esta cuenta se encuentra desactivado');
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

      await FirestoreService.updatePath(`users/${firebaseUser.uid}`, {
        lastLoginAt: serverTimestamp(),
        lastLoginAtLocal: TimeService.timestamp()
      }).catch(e => console.warn('[AuthService] Could not save login audit time:', e.message));
      await FirestoreService.logAudit({
        action: 'LOGIN',
        companyId: userSession.companyId || 'global',
        description: `Inicio de sesión: ${firebaseUser.email}`
      }).catch(() => { });

      // Load company metadata
      if (userSession.companyId && userSession.companyId !== 'global') {
        try {
          const companyInfo = await FirestoreService.getCompanyInfo(userSession.companyId);
          if (companyInfo) {
            GlobalStore.set({ currentCompany: companyInfo });
          }
        } catch (e) {
          console.warn('[AuthService] Could not load company info after login:', e.message);
        }
      }

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
   * Creates a new Firebase Auth user using a secondary app instance,
   * then performs a dual-write:
   *   1. /users/{uid} — global user profile
   *   2. /companies/{companyId}/employees/{uid} — company-scoped employee record
   *
   * If the user is an OWNER, also updates /companies/{companyId}/info/ownerId.
   *
   * @param {string} email
   * @param {string} password
   * @param {Object} profileData - { displayName, role, customRole, companyId, branchId }
   * @returns {Promise<string>} The new user's UID
   */
  static async createUser(email, password, profileData) {
    console.log('[AuthService] 👤 Creating new user:', email, '| Role:', profileData.role);

    if (!auth) {
      throw new Error('Servicio de autenticación no disponible.');
    }

    // ─── Load secondary app modules ──────────────────────────────────────────
    const { initializeApp, deleteApp } = await import(
      'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js'
    );
    const { getAuth: getSecondaryAuth, createUserWithEmailAndPassword } = await import(
      'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js'
    );
    const { ref: dbRef, set: dbSet, serverTimestamp: dbServerTimestamp } = await import(
      'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js'
    );
    // ─────────────────────────────────────────────────────────────────────────

    const mainApp = auth.app;
    const projectId = mainApp.options.projectId;
    const secondaryAppName = `secondary-user-create-${Date.now()}`;
    let secondaryApp = null;

    try {
      secondaryApp = initializeApp(mainApp.options, secondaryAppName);
      const secondaryAuth = getSecondaryAuth(secondaryApp);

      // ── Step 1: Create user in Firebase Auth via secondary app ────────────
      const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const newUser = credential.user;
      const newUid = newUser.uid;
      console.log('[AuthService] ✅ Firebase Auth user created. UID:', newUid);

      // ── Step 2: Get ID token from the new user ──────────────────────────
      const idToken = await newUser.getIdToken();

      // ── Step 3: Build profile payload ──────────────────────────────────────
      const profilePayload = {
        uid: newUid,
        email: email,
        displayName: profileData.displayName || email,
        role: profileData.role,
        customRole: profileData.customRole || '',
        companyId: profileData.companyId || 'global',
        branchId: profileData.branchId || 'main',
        createdAt: Date.now(),
        createdAtLocal: TimeService.timestamp()
      };

      // ── Step 4: Write to /users/{uid} via REST API ──────────────────────
      const useEmulator = window.__useFirebaseEmulator === true;
      const rtdbUrl = useEmulator
        ? `http://localhost:9000/users/${newUid}.json?ns=${projectId}-default-rtdb&auth=${idToken}`
        : `https://${projectId}-default-rtdb.firebaseio.com/users/${newUid}.json?auth=${idToken}`;

      let restOk = false;
      try {
        const response = await Promise.race([
          fetch(rtdbUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profilePayload)
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('REST timeout')), 10000)
          )
        ]);

        if (response.ok) {
          console.log('[AuthService] ✅ /users/ profile saved via REST. UID:', newUid);
          restOk = true;
        } else {
          const errBody = await response.json().catch(() => ({}));
          console.warn('[AuthService] ⚠️ REST write failed:', response.status, errBody?.error?.message);
        }
      } catch (restErr) {
        console.warn('[AuthService] ⚠️ REST write exception:', restErr.message);
      }

      // SDK fallback for /users/{uid} if REST failed
      if (!restOk && db) {
        try {
          await dbSet(dbRef(db, `users/${newUid}`), {
            ...profilePayload,
            createdAt: dbServerTimestamp()
          });
          console.log('[AuthService] ✅ /users/ profile saved via SDK fallback. UID:', newUid);
        } catch (sdkErr) {
          console.warn('[AuthService] ⚠️ SDK fallback failed:', sdkErr.message);
        }
      }

      // ── Step 5: Dual-write to /companies/{companyId}/employees/{uid} ────
      const companyId = profileData.companyId;
      if (companyId && companyId !== 'global') {
        try {
          await FirestoreService.addEmployeeToCompany(companyId, newUid, {
            displayName: profileData.displayName || email,
            email: email,
            role: profileData.role,
            customRole: profileData.customRole || '',
            branchId: profileData.branchId || 'main'
          });
          console.log('[AuthService] ✅ Employee dual-write complete for company:', companyId);

          // If the user is an OWNER, set them as the company owner
          if (profileData.role === 'OWNER' || profileData.role === 'MANAGER') {
            try {
              await FirestoreService.updateCompanyInfo(companyId, { ownerId: newUid });
              console.log('[AuthService] ✅ Company ownerId set to:', newUid);
            } catch (ownerErr) {
              console.warn('[AuthService] ⚠️ Could not set ownerId:', ownerErr.message);
            }
          }
        } catch (empErr) {
          console.warn('[AuthService] ⚠️ Employee dual-write failed:', empErr.message);
        }
      }

      return newUid;

    } catch (authErr) {
      console.error('[AuthService] ❌ User creation failed:', authErr);

      // Translate Firebase Auth error codes to Spanish
      const code = authErr.code || '';
      if (code === 'auth/email-already-in-use') {
        throw new Error(`El correo "${email}" ya está registrado en el sistema. Usa otro correo o recupera la contraseña.`);
      }
      if (code === 'auth/invalid-email') {
        throw new Error('El formato del correo electrónico no es válido.');
      }
      if (code === 'auth/weak-password') {
        throw new Error('La contraseña es muy débil. Usa al menos 6 caracteres.');
      }
      if (code === 'auth/network-request-failed') {
        throw new Error('Sin conexión a internet. Verifica tu red e inténtalo de nuevo.');
      }
      throw authErr;

    } finally {
      if (secondaryApp) {
        await deleteApp(secondaryApp).catch(() => { });
      }
    }
  }

  /**
   * Log out the current Firebase Auth user.
   */
  static async logout() {
    console.log('[AuthService] 🚪 Signing out...');

    // Clean up all real-time listeners
    const currentUser = GlobalStore.getState().currentUser;
    if (currentUser?.uid) {
      await FirestoreService.updatePath(`users/${currentUser.uid}`, {
        lastLogoutAt: serverTimestamp(),
        lastLogoutAtLocal: TimeService.timestamp()
      }).catch(() => { });
      await FirestoreService.logAudit({
        action: 'LOGOUT',
        companyId: currentUser.companyId || 'global',
        description: `Cierre de sesión: ${currentUser.email || currentUser.uid}`
      }).catch(() => { });
    }

    // Clean up all real-time listeners
    FirestoreService.unsubscribeAll();

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

        // 1. Try Realtime Database
        if (db) {
          try {
            const userRef = ref(db, `users/${firebaseUser.uid}`);
            const snap = await Promise.race([
              get(userRef),
              new Promise((_, reject) => setTimeout(() => reject(new Error('database-timeout')), 4000))
            ]);
            if (snap.exists()) {
              userProfile = snap.val();
            }
          } catch (e) {
            console.warn('[AuthService] RTDB session restore failed:', e.message);
          }
        }

        // 2. SuperAdmin fallback
        if (!userProfile && firebaseUser.email === SUPER_ADMIN_EMAIL) {
          userProfile = { ...SUPER_ADMIN_PROFILE };
        }

        if (userProfile) {
          // Validar si el negocio existe y no ha sido eliminado (excepto si es SUPER_ADMIN)
          if (userProfile.companyId && userProfile.companyId !== 'global' && db) {
            try {
              const companySnap = await get(ref(db, `companies/${userProfile.companyId}`));
              if (!companySnap.exists() || (companySnap.val() && companySnap.val().status === 'ELIMINADO')) {
                console.warn('[AuthService] Company deleted or trashed. Blocking session.');
                GlobalStore.set({ currentUser: null, activeRole: null, isAuthenticated: false });
                clearTimeout(timeout);
                resolve(null);
                return;
              }
            } catch (err) {
              console.warn('[AuthService] Failed to verify company during restore:', err.message);
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
}
