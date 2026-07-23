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
    const cleanEmail = (email || '').toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ñ/g, 'n');

    console.log('[AuthService] 🔑 Signing in:', cleanEmail);

    if (!auth) {
      throw new Error('Servicio de autenticación no disponible.');
    }

    try {
      const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
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
      if (!userProfile && cleanEmail === SUPER_ADMIN_EMAIL) {
        userProfile = { ...SUPER_ADMIN_PROFILE };
        // Persist SuperAdmin profile to RTDB if it doesn't exist yet
        if (db) {
          set(ref(db, `users/${firebaseUser.uid}`), {
            ...userProfile,
            uid: firebaseUser.uid,
            email: cleanEmail,
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
        branchId: userProfile.branchId || 'main',
        permissions: userProfile.permissions || {}
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
    const cleanEmail = (email || '').toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ñ/g, 'n');

    console.log('[AuthService] 👤 Creating new user:', cleanEmail, '| Role:', profileData.role);

    if (!auth) {
      throw new Error('Servicio de autenticación no disponible.');
    }

    // ── Check if the email already exists in /users and belongs to a deleted company ──
    // NOTE: We do NOT use queryGlobal+filters here because _applyFilters uses strict ===
    // equality (case-sensitive), which misses emails stored with different casing (e.g.
    // "Angy@ghost.com" vs "angy@ghost.com"). Instead we filter manually with toLowerCase().

    if (db) {
      try {
        console.log('[AuthService] 🔍 Verificando si el correo ya existe en /users...', cleanEmail);
        const usersSnap = await get(ref(db, 'users'));
        let existingUser = null;
        if (usersSnap.exists()) {
          usersSnap.forEach(snap => {
            const val = snap.val();
            if ((val?.email || '').toLowerCase().trim() === cleanEmail) {
              existingUser = { id: snap.key, ...val };
            }
          });
        }

        if (existingUser) {
          const oldCompanyId = existingUser.companyId;
          const orphanUid = existingUser.id || existingUser.uid;
          console.log(`[AuthService] 📋 Perfil existente encontrado. UID: ${orphanUid}, companyId: ${oldCompanyId}`);

          // ── Scenario A: company was deleted entirely ──
          let companyExists = false;
          let employeeStillRegistered = false;

          if (oldCompanyId && oldCompanyId !== 'global') {
            const companySnap = await get(ref(db, `companies/${oldCompanyId}`));
            companyExists = companySnap.exists();
            console.log(`[AuthService] 🏢 ¿companies/${oldCompanyId} existe?`, companyExists);

            if (companyExists) {
              // ── Scenario B: company exists but check if employee still belongs to it ──
              const empSnap = await get(ref(db, `${oldCompanyId}/employees/${orphanUid}`));
              employeeStillRegistered = empSnap.exists();
              console.log(`[AuthService] 👤 ¿Empleado aún registrado en ${oldCompanyId}/employees/${orphanUid}?`, employeeStillRegistered);
            }
          } else if (oldCompanyId === 'global') {
            companyExists = true;
            employeeStillRegistered = true;
          }

          // Re-link if: (A) company deleted, OR (B) employee was individually removed from the company
          const shouldRelink = !companyExists || !employeeStillRegistered;
          console.log(`[AuthService] 🔄 ¿Re-vincular usuario?`, shouldRelink, '| companyExists:', companyExists, '| employeeStillRegistered:', employeeStillRegistered);

          if (shouldRelink) {
            const profilePayload = {
              uid: orphanUid,
              email: cleanEmail,
              displayName: profileData.displayName || cleanEmail,
              role: profileData.role,
              customRole: profileData.customRole || '',
              companyId: profileData.companyId || 'global',
              branchId: profileData.branchId || 'main',
              createdAt: existingUser.createdAt || Date.now(),
              createdAtLocal: existingUser.createdAtLocal || TimeService.timestamp(),
              updatedAt: Date.now(),
              updatedAtLocal: TimeService.timestamp()
            };

            // 1. Actualizar /users/{uid}
            await set(ref(db, `users/${orphanUid}`), profilePayload);

            // 2. Dual-write a la nueva empresa
            const newCompanyId = profileData.companyId;
            if (newCompanyId && newCompanyId !== 'global') {
              await FirestoreService.addEmployeeToCompany(newCompanyId, orphanUid, {
                displayName: profileData.displayName || cleanEmail,
                email: cleanEmail,
                role: profileData.role,
                customRole: profileData.customRole || '',
                branchId: profileData.branchId || 'main'
              });
              if (profileData.role === 'OWNER' || profileData.role === 'MANAGER') {
                await FirestoreService.updateCompanyInfo(newCompanyId, { ownerId: orphanUid });
              }
            }

            console.log(`[AuthService] ✅ Usuario re-vinculado: ${cleanEmail} (UID: ${orphanUid}) → empresa ${newCompanyId}`);
            return orphanUid;
          } else {
            console.log(`[AuthService] ⛔ El correo ${cleanEmail} sigue activo en la empresa ${oldCompanyId}. No se puede re-vincular.`);
          }
        } else {
          console.log(`[AuthService] ℹ️ No se encontró perfil en /users para: ${cleanEmail}. Proceder con creación normal.`);
        }
      } catch (orphanErr) {
        console.warn('[AuthService] ⚠️ Error en verificación de usuarios huérfanos:', orphanErr.message, orphanErr);
      }
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
      const credential = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, password);
      const newUser = credential.user;
      const newUid = newUser.uid;
      console.log('[AuthService] ✅ Firebase Auth user created. UID:', newUid);

      // ── Step 2: Get ID token from the new user ──────────────────────────
      const idToken = await newUser.getIdToken();

      // ── Step 3: Build profile payload ──────────────────────────────────────
      const profilePayload = {
        uid: newUid,
        email: cleanEmail,
        displayName: profileData.displayName || cleanEmail,
        role: profileData.role,
        customRole: profileData.customRole || '',
        companyId: profileData.companyId || 'global',
        branchId: profileData.branchId || 'main',
        permissions: profileData.permissions || {},
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
            displayName: profileData.displayName || cleanEmail,
            email: cleanEmail,
            role: profileData.role,
            customRole: profileData.customRole || '',
            branchId: profileData.branchId || 'main',
            permissions: profileData.permissions || {}
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
    const cleanEmail = (email || '').toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ñ/g, 'n');
    console.log('[AuthService] 📧 Password reset sent to:', cleanEmail);

    if (auth) {
      await sendPasswordResetEmail(auth, cleanEmail);
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
            branchId: userProfile.branchId || 'main',
            permissions: userProfile.permissions || {}
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
   * Updates a user's password in Firebase RTDB /users/{uid} and /companies/{companyId}/ownerPassword.
   */
  static async updateUserStoredPassword(uid, newPassword, companyId = null) {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('La contraseña debe tener al menos 6 caracteres.');
    }
    if (db) {
      const userUpdates = {
        storedPassword: newPassword,
        updatedAt: serverTimestamp(),
        updatedAtLocal: TimeService.timestamp()
      };
      await update(ref(db, `users/${uid}`), userUpdates);

      if (companyId && companyId !== 'global') {
        await update(ref(db, `companies/${companyId}`), {
          ownerPassword: newPassword,
          updatedAt: serverTimestamp()
        }).catch(e => console.warn('[AuthService] Could not update company ownerPassword:', e.message));

        await update(ref(db, `${companyId}/employees/${uid}`), {
          storedPassword: newPassword
        }).catch(() => {});
      }
    }
    return true;
  }

  /**
   * Downloads a full 1-to-1 JSON backup of Firebase Realtime Database.
   * Restricted exclusively to Programmer / Super Admin role.
   */
  static async downloadDatabaseBackup() {
    if (!db) throw new Error('Base de datos no inicializada.');

    const currentUser = GlobalStore.getState().currentUser || {};
    const isSuperAdmin = currentUser.role === 'SUPER_ADMIN' || GlobalStore.getState().activeRole === 'SUPER_ADMIN';
    if (!isSuperAdmin) {
      throw new Error('Acceso denegado: Esta función es exclusiva de los programadores/SuperAdmin.');
    }

    console.log('[AuthService] 📥 Generando copia de seguridad 1:1 de Firebase...');
    const rootSnap = await get(ref(db));
    if (!rootSnap.exists()) {
      throw new Error('La base de datos se encuentra vacía o no retornó datos.');
    }

    const data = rootSnap.val();
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_ultraadmin_firebase_1+1_${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log('[AuthService] ✅ Copia de seguridad descargada exitosamente.');
    return true;
  }

  /**
   * Purges all non-Super-Admin users, companies, inventory, sales, orders, and test data
   * from Firebase RTDB while leaving Programmer / Super Admin accounts intact.
   * Emits live progress events via progressCallback and logs audit trail for production launch tracking.
   * 
   * @param {Function} [progressCallback] - Optional callback (stage, percent, message)
   */
  static async purgeAllTestDataExceptSuperAdmin(progressCallback = null) {
    if (!db) throw new Error('Base de datos no inicializada.');

    const currentUser = GlobalStore.getState().currentUser || {};
    const activeRole = GlobalStore.getState().activeRole;
    const isSuperAdmin = currentUser.role === 'SUPER_ADMIN' || activeRole === 'SUPER_ADMIN';
    if (!isSuperAdmin) {
      throw new Error('Acceso denegado: Operación de reinicio reservada exclusivamente para Programadores.');
    }

    const reportProgress = (stage, percent, msg) => {
      console.log(`[AuthService Purge] [${percent}%] ${stage}: ${msg}`);
      if (typeof progressCallback === 'function') {
        try { progressCallback(stage, percent, msg); } catch (_) {}
      }
    };

    reportProgress('Iniciando', 5, 'Verificando credenciales de Programador y preparando estructura de purga...');

    const updates = {};
    let deletedUsersCount = 0;
    let keptProgrammersCount = 0;
    let deletedCompaniesCount = 0;

    const collectionCounts = {
      clientes: 0,
      empleados: 0,
      negocios: 0,
      productos: 0,
      categorias: 0,
      pedidos: 0,
      mesas: 0,
      codigos_qr: 0,
      promociones: 0,
      notificaciones: 0,
      configuraciones: 0,
      cajas: 0,
      otros_registros: 0
    };

    // 1. Scan /users — Keep ONLY users with role === 'SUPER_ADMIN' or programmer emails
    reportProgress('Usuarios', 15, 'Escaneando cuentas de usuario y protegiendo accesos de Programadores...');
    try {
      const usersSnap = await get(ref(db, 'users'));
      if (usersSnap.exists()) {
        const users = usersSnap.val();
        Object.entries(users).forEach(([uid, profile]) => {
          const isProg = profile?.role === 'SUPER_ADMIN' ||
                         profile?.email === SUPER_ADMIN_EMAIL ||
                         (profile?.email || '').toLowerCase() === SUPER_ADMIN_EMAIL ||
                         profile?.uid === currentUser.uid;

          if (isProg) {
            keptProgrammersCount++;
          } else {
            updates[`users/${uid}`] = null;
            deletedUsersCount++;
            const role = (profile?.role || '').toUpperCase();
            if (role === 'CUSTOMER') {
              collectionCounts.clientes++;
            } else {
              collectionCounts.empleados++;
            }
          }
        });
      }
    } catch (e) {
      console.warn('[AuthService] Purge scan /users error:', e.message);
    }

    // 2. Scan /companies — Delete all companies EXCEPT companies/global
    reportProgress('Empresas', 30, 'Escaneando empresas y locales de prueba...');
    try {
      const compSnap = await get(ref(db, 'companies'));
      if (compSnap.exists()) {
        const comps = compSnap.val();
        Object.entries(comps).forEach(([companyId, companyData]) => {
          if (companyId !== 'global') {
            updates[`companies/${companyId}`] = null;
            updates[companyId] = null;
            deletedCompaniesCount++;
            collectionCounts.negocios++;

            // Count inner collections if present
            if (companyData) {
              if (companyData.productos || companyData.products) {
                collectionCounts.productos += Object.keys(companyData.productos || companyData.products || {}).length;
              }
              if (companyData.categorias || companyData.categories) {
                collectionCounts.categorias += Object.keys(companyData.categorias || companyData.categories || {}).length;
              }
              if (companyData.pedidos || companyData.ordenes || companyData.orders) {
                collectionCounts.pedidos += Object.keys(companyData.pedidos || companyData.ordenes || companyData.orders || {}).length;
              }
              if (companyData.mesas || companyData.tables) {
                collectionCounts.mesas += Object.keys(companyData.mesas || companyData.tables || {}).length;
              }
              if (companyData.qr_codes || companyData.qrs) {
                collectionCounts.codigos_qr += Object.keys(companyData.qr_codes || companyData.qrs || {}).length;
              }
              if (companyData.promociones || companyData.promotions) {
                collectionCounts.promociones += Object.keys(companyData.promociones || companyData.promotions || {}).length;
              }
              if (companyData.config || companyData.configuracion) {
                collectionCounts.configuraciones++;
              }
            }
          }
        });
      }
    } catch (e) {
      console.warn('[AuthService] Purge scan /companies error:', e.message);
    }

    // 3. Known operational & transactional tenant collection paths to wipe
    reportProgress('Colecciones', 55, 'Contando y preparando eliminación de nodos operacionales...');
    const tenantPathsMap = {
      pedidos: ['pedidos', 'ordenes', 'invoices'],
      productos: ['productos', 'ingredientes', 'catalogo_config', 'configuracion_catalogo'],
      mesas: ['mesas'],
      codigos_qr: ['qr_codes', 'scan_history'],
      promociones: ['promotions'],
      notificaciones: ['whatsapp_chats', 'whatsapp_logs', 'whatsapp_broadcasts', 'whatsapp_broadcast_logs', 'whatsapp_templates', 'telegram_campaigns', 'telegram_conversations', 'telegram_logs', 'telegram_subscribers'],
      cajas: ['cajas', 'pagos', 'expenses', 'purchases', 'accounts_payable', 'accounts_receivable', 'accounts_receivable_history', 'credit_payments', 'credits', 'credit_mora_log'],
      otros_registros: ['appointments', 'assets', 'basic_services', 'command_logs', 'payment_reminder_logs', 'payment_reminders', 'projections', 'recurring_clients', 'rentals', 'service_requests', 'supplier_payments', 'supplier_reminder_logs', 'supplier_reminders', 'suppliers', 'tools', 'vehicles']
    };

    for (const [cat, paths] of Object.entries(tenantPathsMap)) {
      for (const path of paths) {
        updates[path] = null;
        try {
          const snap = await get(ref(db, path));
          if (snap.exists()) {
            const count = Object.keys(snap.val() || {}).length;
            collectionCounts[cat] = (collectionCounts[cat] || 0) + count;
          }
        } catch (_) {}
      }
    }

    // 4. Dynamic scan of root level nodes to catch any leftover test structures (and wipe test audit_logs)
    reportProgress('Escaner Global', 75, 'Realizando barrido dinámico y limpiezas de registros de auditoría de prueba...');
    updates['audit_logs'] = null;
    try {
      const rootSnap = await get(ref(db));
      if (rootSnap.exists()) {
        const rootData = rootSnap.val();
        Object.keys(rootData).forEach(key => {
          if (key !== 'users' && key !== 'companies') {
            updates[key] = null;
          }
        });
      }
    } catch (e) {
      console.warn('[AuthService] Purge root scan error:', e.message);
    }

    const totalNodesToUpdate = Object.keys(updates).length;
    reportProgress('Eliminando', 85, `Ejecutando borrado masivo en Firebase (${totalNodesToUpdate} nodos clave)...`);

    if (totalNodesToUpdate > 0) {
      await update(ref(db), updates);
    }

    // 5. Create audit log for production launch reset
    reportProgress('Auditoría', 95, 'Registrando log de auditoría del Reinicio de Producción...');
    const auditData = {
      action: 'PRODUCTION_RESET',
      programmerEmail: currentUser.email || SUPER_ADMIN_EMAIL,
      programmerUid: currentUser.uid || 'system',
      programmerName: currentUser.displayName || 'Programador',
      timestamp: Date.now(),
      isoDate: new Date().toISOString(),
      details: `Reinicio para producción completado con éxito por ${currentUser.email || SUPER_ADMIN_EMAIL}. Se eliminaron ${deletedUsersCount} cuentas de prueba, ${deletedCompaniesCount} empresas. Cuentas de programador intactas: ${keptProgrammersCount}. Total nodos purgados: ${totalNodesToUpdate}.`,
      status: 'ÉXITO',
      metadata: {
        deletedUsersCount,
        deletedCompaniesCount,
        keptProgrammersCount,
        totalNodesWiped: totalNodesToUpdate,
        collectionCounts
      }
    };

    try {
      const auditLogRef = push(ref(db, 'audit_logs'));
      await set(auditLogRef, auditData);
    } catch (auditErr) {
      console.warn('[AuthService] No se pudo guardar el log de auditoría post-purga:', auditErr.message);
    }

    GlobalStore.set({ companies: [] });
    reportProgress('Completado', 100, '🎉 ¡Reinicio para Producción finalizado con éxito! La plataforma está limpia.');

    return {
      success: true,
      deletedUsersCount,
      deletedCompaniesCount,
      keptProgrammersCount,
      totalNodesWiped: totalNodesToUpdate,
      collectionCounts,
      timestamp: auditData.isoDate,
      programmerEmail: auditData.programmerEmail
    };
  }

  /**
   * Fetches all registered users from /users and resolves company names.
   * Exclusive for Programmer / Super Admin role.
   */
  static async getAllUsersWithCompanies() {
    if (!db) throw new Error('Base de datos no inicializada.');

    const usersSnap = await get(ref(db, 'users'));
    const companiesSnap = await get(ref(db, 'companies'));

    const companiesMap = {};
    if (companiesSnap.exists()) {
      companiesSnap.forEach(snap => {
        const val = snap.val();
        companiesMap[snap.key] = val?.informacion_local?.nombre || val?.name || snap.key;
      });
    }
    companiesMap['global'] = 'SaaS Global (Administración)';

    const userList = [];
    if (usersSnap.exists()) {
      usersSnap.forEach(snap => {
        const uid = snap.key;
        const val = snap.val() || {};
        const companyId = val.companyId || 'global';
        userList.push({
          uid,
          displayName: val.displayName || 'Usuario sin nombre',
          email: val.email || 'Sin correo',
          role: val.role || 'CUSTOMER',
          customRole: val.customRole || '',
          companyId,
          companyName: companiesMap[companyId] || companyId,
          branchId: val.branchId || 'main',
          status: val.status || (val.disabled ? 'DISABLED' : 'ACTIVE'),
          phone: val.phone || val.telefono || '',
          photoURL: val.photoURL || val.foto || '',
          createdAt: val.createdAt || val.createdAtLocal || null,
          lastLoginAt: val.lastLoginAt || val.lastLogin || null,
          storedPassword: val.storedPassword || '',
          permissions: val.permissions || {}
        });
      });
    }

    return userList;
  }

  /**
   * Updates any user profile from Programmer Dashboard with audit logging.
   */
  static async adminUpdateUserProfile(targetUid, payload) {
    if (!db) throw new Error('Base de datos no inicializada.');

    const currentUser = GlobalStore.getState().currentUser || {};
    const updates = {};
    const timestamp = Date.now();

    const userUpdates = {
      displayName: payload.displayName,
      email: payload.email,
      role: payload.role,
      companyId: payload.companyId || 'global',
      branchId: payload.branchId || 'main',
      status: payload.status || 'ACTIVE',
      phone: payload.phone || '',
      photoURL: payload.photoURL || '',
      updatedAt: timestamp
    };

    if (payload.customRole !== undefined) userUpdates.customRole = payload.customRole;

    updates[`users/${targetUid}`] = userUpdates;

    // Synchronize company employee reference if belongs to a specific company
    if (payload.companyId && payload.companyId !== 'global') {
      updates[`${payload.companyId}/employees/${targetUid}`] = {
        uid: targetUid,
        displayName: payload.displayName,
        email: payload.email,
        role: payload.role,
        status: payload.status || 'ACTIVE',
        updatedAt: timestamp
      };
    }

    await update(ref(db), updates);

    // Write audit log
    try {
      const auditRef = push(ref(db, 'audit_logs'));
      await set(auditRef, {
        action: 'ADMIN_UPDATE_USER',
        programmerEmail: currentUser.email || 'superadmin@ultraadmin.com',
        programmerUid: currentUser.uid || 'system',
        targetUid,
        targetEmail: payload.email,
        timestamp,
        isoDate: new Date().toISOString(),
        details: `Perfil de usuario ${payload.email} actualizado por el programador. Nuevo rol: ${payload.role}, Empresa: ${payload.companyId}.`,
        metadata: userUpdates
      });
    } catch (e) {
      console.warn('[AuthService] Audit log write failed:', e);
    }

    return true;
  }

  /**
   * Admin method to reset or change a user's password with audit logging.
   */
  static async adminUpdateUserPassword(targetUid, targetEmail, newPassword) {
    if (!db) throw new Error('Base de datos no inicializada.');

    const currentUser = GlobalStore.getState().currentUser || {};
    const timestamp = Date.now();

    await update(ref(db, `users/${targetUid}`), {
      storedPassword: newPassword,
      updatedAt: timestamp
    });

    try {
      const auditRef = push(ref(db, 'audit_logs'));
      await set(auditRef, {
        action: 'ADMIN_RESET_PASSWORD',
        programmerEmail: currentUser.email || 'superadmin@ultraadmin.com',
        programmerUid: currentUser.uid || 'system',
        targetUid,
        targetEmail,
        timestamp,
        isoDate: new Date().toISOString(),
        details: `Contraseña restablecida por el programador para el usuario ${targetEmail}.`
      });
    } catch (e) {
      console.warn('[AuthService] Audit log write failed:', e);
    }

    return true;
  }

  /**
   * Admin method to change user status (ACTIVE, SUSPENDED, DISABLED).
   */
  static async adminSetUserStatus(targetUid, targetEmail, newStatus) {
    if (!db) throw new Error('Base de datos no inicializada.');

    const currentUser = GlobalStore.getState().currentUser || {};
    const timestamp = Date.now();

    await update(ref(db, `users/${targetUid}`), {
      status: newStatus,
      disabled: newStatus === 'DISABLED' || newStatus === 'SUSPENDED',
      updatedAt: timestamp
    });

    try {
      const auditRef = push(ref(db, 'audit_logs'));
      await set(auditRef, {
        action: 'ADMIN_CHANGE_USER_STATUS',
        programmerEmail: currentUser.email || 'superadmin@ultraadmin.com',
        programmerUid: currentUser.uid || 'system',
        targetUid,
        targetEmail,
        newStatus,
        timestamp,
        isoDate: new Date().toISOString(),
        details: `Estado de cuenta de ${targetEmail} cambiado a ${newStatus} por el programador.`
      });
    } catch (e) {
      console.warn('[AuthService] Audit log write failed:', e);
    }

    return true;
  }

  /**
   * Admin method to permanently delete a user account.
   */
  static async adminDeleteUserAccount(targetUid, targetEmail, companyId) {
    if (!db) throw new Error('Base de datos no inicializada.');

    const currentUser = GlobalStore.getState().currentUser || {};
    const timestamp = Date.now();
    const updates = {};

    updates[`users/${targetUid}`] = null;
    if (companyId && companyId !== 'global') {
      updates[`${companyId}/employees/${targetUid}`] = null;
    }

    await update(ref(db), updates);

    try {
      const auditRef = push(ref(db, 'audit_logs'));
      await set(auditRef, {
        action: 'ADMIN_DELETE_USER',
        programmerEmail: currentUser.email || 'superadmin@ultraadmin.com',
        programmerUid: currentUser.uid || 'system',
        targetUid,
        targetEmail,
        timestamp,
        isoDate: new Date().toISOString(),
        details: `Cuenta de usuario ${targetEmail} (${targetUid}) eliminada por el programador.`
      });
    } catch (e) {
      console.warn('[AuthService] Audit log write failed:', e);
    }

    return true;
  }
}


