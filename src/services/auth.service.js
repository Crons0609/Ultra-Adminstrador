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
import { AppearanceService } from './appearance.service.js';
import { SavedAccountsService } from './saved-accounts.service.js';
import { LocalStorageDBService } from './local-storage-db.service.js';
import { PushNotificationsService } from './push-notifications.service.js';

// Firebase Auth modular imports (CDN v12.16.0)
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
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
      // ── Configurar persistencia de sesión explícitamente ANTES del login ───────
      await setPersistence(auth, browserLocalPersistence).catch((err) => {
        console.warn('[AuthService] No se pudo establecer persistencia antes del login:', err.message);
      });

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
        permissions: userProfile.permissions || {},
        phone: userProfile.phone || userProfile.telefono || '',
        personalInfo: userProfile.personalInfo || '',
        avatarImageId: userProfile.avatarImageId || '',
        photoURL: userProfile.photoURL || '',
        preferences: userProfile.preferences || {},
        expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000)
      };

      await LocalStorageDBService.setCache('user_session', userSession);
      await LocalStorageDBService.setUserSession(userSession);
      await LocalStorageDBService.setCache(`user_session_${firebaseUser.uid}`, userSession);
      await LocalStorageDBService.setCache(`users/${firebaseUser.uid}`, {
        ...userProfile,
        ...userSession
      });

      GlobalStore.set({
        currentUser: userSession,
        activeRole: userSession.role,
        isAuthenticated: true
      });

      // Initialize FCM Push Notifications for this device & user
      PushNotificationsService.init(userSession).catch(e => console.warn('[AuthService] Could not init push notifications:', e));

      AppearanceService.loadAndApply().catch(e => console.warn('[AuthService] Could not apply appearance on login:', e));

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

      // Auto-save this account to the profile switcher (no password stored here)
      const companyName = GlobalStore.getState()?.currentCompany?.name || '';
      SavedAccountsService.save(userSession, null, companyName);

      console.log('[AuthService] ✅ Login exitoso:', email, '| Rol:', userSession.role);
      return userSession;

    } catch (error) {
      console.warn('[AuthService] ⚠️ Primary Auth failed, checking RTDB fallback...', error.code || '', error.message);

      // ── Secondary authentication fallback: Check RTDB /users for storedPassword ──
      if (db) {
        try {
          const usersSnap = await get(ref(db, 'users'));
          if (usersSnap.exists()) {
            let matchedUid = null;
            let userProfile = null;

            usersSnap.forEach(snap => {
              const u = snap.val() || {};
              const userEmail = (u.email || '').toLowerCase().trim();
              if (userEmail === cleanEmail) {
                matchedUid = snap.key;
                userProfile = u;
              }
            });

            if (userProfile && (userProfile.storedPassword === password || userProfile.password === password)) {
              console.log('[AuthService] ✅ Fallback authentication successful via RTDB storedPassword for:', cleanEmail);

              // Validate company status if not SuperAdmin
              if (userProfile.companyId && userProfile.companyId !== 'global') {
                const companySnap = await get(ref(db, `companies/${userProfile.companyId}`));
                if (!companySnap.exists()) {
                  throw new Error('El negocio asociado a esta cuenta ha sido desactivado, comunícate con soporte al cliente');
                }
                const companyMeta = companySnap.val() || {};
                if (companyMeta.status === 'ELIMINADO') {
                  throw new Error('El negocio asociado a esta cuenta se encuentra desactivado');
                }
              }

              // Auto-unlock account & reset attempts
              await update(ref(db, `users/${matchedUid}`), {
                accountLocked: false,
                failedAttempts: 0,
                lockoutUntil: 0
              }).catch(() => {});

              try {
                localStorage.removeItem(`ultra_login_lockout_${cleanEmail}`);
              } catch (_) {}

              const userSession = {
                uid: matchedUid,
                email: userProfile.email || cleanEmail,
                displayName: userProfile.displayName || 'Usuario',
                role: userProfile.role || 'CUSTOMER',
                customRole: userProfile.customRole || '',
                companyId: userProfile.companyId || 'global',
                branchId: userProfile.branchId || 'main',
                permissions: userProfile.permissions || {}
              };

              GlobalStore.set({
                currentUser: userSession,
                activeRole: userSession.role,
                isAuthenticated: true
              });

              AppearanceService.loadAndApply().catch(e => console.warn('[AuthService] Could not apply appearance on login:', e));

              await FirestoreService.updatePath(`users/${matchedUid}`, {
                lastLoginAt: serverTimestamp(),
                lastLoginAtLocal: TimeService.timestamp()
              }).catch(() => {});

              await FirestoreService.logAudit({
                action: 'LOGIN',
                companyId: userSession.companyId || 'global',
                description: `Inicio de sesión (RTDB Sync): ${userSession.email}`
              }).catch(() => {});

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

              return userSession;
            }
          }
        } catch (fallbackErr) {
          if (fallbackErr.message && fallbackErr.message.includes('desactivado')) {
            throw fallbackErr;
          }
          console.warn('[AuthService] Fallback RTDB login check error:', fallbackErr.message);
        }
      }

      const code = error.code || '';
      if (
        code === 'auth/network-request-failed' ||
        !navigator.onLine ||
        error.message?.includes('network') ||
        error.message?.includes('fetch')
      ) {
        console.warn('[AuthService] 📴 Network unavailable during login. Attempting offline local authentication...');
        const cachedSession = (await LocalStorageDBService.getUserSession(cleanEmail)) ||
                              (await LocalStorageDBService.getCache('user_session'));

        if (cachedSession && (cachedSession.email || '').toLowerCase() === cleanEmail) {
          console.log('[AuthService] 🔓 Offline login successful for:', cleanEmail);
          GlobalStore.set({
            currentUser: cachedSession,
            activeRole: cachedSession.role,
            isAuthenticated: true
          });

          if (cachedSession.companyId && cachedSession.companyId !== 'global') {
            const cachedCompany = await LocalStorageDBService.getCache(`companies/${cachedSession.companyId}`);
            if (cachedCompany) {
              GlobalStore.set({ currentCompany: cachedCompany });
            }
          }

          AppearanceService.loadAndApply().catch(() => {});
          return cachedSession;
        }
        throw new Error('Sin conexión a internet. No se encontró un perfil guardado previamente en este dispositivo para iniciar sesión offline.');
      }

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
    const rawLowerEmail = (email || '').toLowerCase().trim();
    const cleanEmail = rawLowerEmail
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ñ/g, 'n');

    console.log('[AuthService] 👤 Creating new user:', cleanEmail, '| Role:', profileData.role);

    if (!auth) {
      throw new Error('Servicio de autenticación no disponible.');
    }

    // ── Check if the email already exists in /users and belongs to a deleted company ──
    if (db) {
      try {
        console.log('[AuthService] 🔍 Verificando si el correo ya existe en /users...', cleanEmail);
        const usersSnap = await get(ref(db, 'users'));
        let existingUser = null;
        if (usersSnap.exists()) {
          usersSnap.forEach(snap => {
            const val = snap.val();
            const valEmail = (val?.email || '').toLowerCase().trim();
            const normValEmail = valEmail.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ñ/g, 'n');
            if (valEmail === cleanEmail || valEmail === rawLowerEmail || normValEmail === cleanEmail) {
              existingUser = { id: snap.key, ...val };
            }
          });
        }

        if (existingUser) {
          const oldCompanyId = existingUser.companyId;
          const orphanUid = existingUser.id || existingUser.uid;
          console.log(`[AuthService] 📋 Perfil existente encontrado. UID: ${orphanUid}, companyId: ${oldCompanyId}`);

          // ── Scenario A: company was deleted or sent to trash ──
          let companyIsActive = false;
          let employeeStillRegistered = false;

          if (oldCompanyId && oldCompanyId !== 'global') {
            const companySnap = await get(ref(db, `companies/${oldCompanyId}`));
            if (companySnap.exists()) {
              const compData = companySnap.val() || {};
              const status = (compData.status || compData.config?.status || '').toUpperCase();
              if (status !== 'ELIMINADO') {
                companyIsActive = true;
              }
            }

            if (companyIsActive) {
              const empSnap = await get(ref(db, `${oldCompanyId}/employees/${orphanUid}`));
              employeeStillRegistered = empSnap.exists();
            }
          } else if (oldCompanyId === 'global') {
            companyIsActive = true;
            employeeStillRegistered = true;
          }

          // Re-link if: company is deleted/in trash, OR employee was removed from company
          const shouldRelink = !companyIsActive || !employeeStillRegistered;
          console.log(`[AuthService] 🔄 ¿Re-vincular usuario?`, shouldRelink, '| companyIsActive:', companyIsActive, '| employeeStillRegistered:', employeeStillRegistered);

          if (shouldRelink) {
            const profilePayload = {
              uid: orphanUid,
              email: cleanEmail,
              displayName: profileData.displayName || cleanEmail,
              role: profileData.role,
              customRole: profileData.customRole || '',
              companyId: profileData.companyId || 'global',
              branchId: profileData.branchId || 'main',
              permissions: profileData.permissions || {},
              storedPassword: password,
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
                branchId: profileData.branchId || 'main',
                permissions: profileData.permissions || {}
              });
              if (profileData.role === 'OWNER' || profileData.role === 'MANAGER') {
                await FirestoreService.updateCompanyInfo(newCompanyId, { ownerId: orphanUid }).catch(() => {});
              }
            }

            // Limpiar índices de eliminación
            const emailKey1 = cleanEmail.replace(/\./g, ',');
            const emailKey2 = rawLowerEmail.replace(/\./g, ',');
            await set(ref(db, `deleted_users_by_email/${emailKey1}`), null).catch(() => {});
            await set(ref(db, `deleted_users_by_email/${emailKey2}`), null).catch(() => {});

            console.log(`[AuthService] ✅ Usuario re-vinculado: ${cleanEmail} (UID: ${orphanUid}) → empresa ${newCompanyId}`);
            return orphanUid;
          } else {
            console.log(`[AuthService] ⛔ El correo ${cleanEmail} sigue activo en la empresa ${oldCompanyId}. No se puede re-vincular.`);
            throw new Error(`El correo "${email}" ya está registrado y activo en el sistema.`);
          }
        } else {
          console.log(`[AuthService] ℹ️ No se encontró perfil en /users para: ${cleanEmail}. Proceder con creación normal.`);
        }
      } catch (orphanErr) {
        if (orphanErr.message && orphanErr.message.includes('ya está registrado y activo')) {
          throw orphanErr;
        }
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

      const code = authErr.code || '';

      // ── Special case: email-already-in-use ────────────────────────────────
      // The Firebase Auth account already exists (was previously created but the
      // RTDB profile was deleted). Check the deleted_users_by_email index to try
      // to re-link the existing Auth UID to the new company without throwing.
      if (code === 'auth/email-already-in-use' && db) {
        console.log('[AuthService] 🔄 email-already-in-use: buscando UID para re-vincular cuenta...');
        try {
          const emailKeyClean = cleanEmail.replace(/\./g, ',');
          const emailKeyRaw = rawLowerEmail.replace(/\./g, ',');
          let orphanUid = null;

          // 1. Consultar índice deleted_users_by_email (con key limpia y raw)
          const indexSnapClean = await get(ref(db, `deleted_users_by_email/${emailKeyClean}`));
          if (indexSnapClean.exists()) {
            orphanUid = indexSnapClean.val()?.uid;
          } else {
            const indexSnapRaw = await get(ref(db, `deleted_users_by_email/${emailKeyRaw}`));
            if (indexSnapRaw.exists()) {
              orphanUid = indexSnapRaw.val()?.uid;
            }
          }

          // 2. Si no está en el índice, buscar en /users (case-insensitive)
          if (!orphanUid) {
            const usersSnap = await get(ref(db, 'users'));
            if (usersSnap.exists()) {
              usersSnap.forEach(snap => {
                const val = snap.val();
                const valEmail = (val?.email || '').toLowerCase().trim();
                const normValEmail = valEmail.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ñ/g, 'n');
                if (valEmail === cleanEmail || valEmail === rawLowerEmail || normValEmail === cleanEmail) {
                  orphanUid = snap.key;
                }
              });
            }
          }

          // 3. Si no está en /users, buscar en deleted_companies
          if (!orphanUid) {
            const deletedCompSnap = await get(ref(db, 'deleted_companies'));
            if (deletedCompSnap.exists()) {
              deletedCompSnap.forEach(snap => {
                const dc = snap.val() || {};
                const reg = dc.registry || {};
                if (reg.ownerEmail && (reg.ownerEmail.toLowerCase().trim() === cleanEmail || reg.ownerEmail.toLowerCase().trim() === rawLowerEmail) && reg.ownerId) {
                  orphanUid = reg.ownerId;
                }
              });
            }
          }

          // 4. Si aún no se encuentra, intentar sign-in en secondaryAuth con la contraseña recibida
          if (!orphanUid && secondaryAuth) {
            try {
              const { signInWithEmailAndPassword } = await import(
                'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js'
              );
              const cred = await signInWithEmailAndPassword(secondaryAuth, cleanEmail, password).catch(() => null);
              if (cred && cred.user) {
                orphanUid = cred.user.uid;
                console.log('[AuthService] ✅ UID obtenido vía signInWithEmailAndPassword:', orphanUid);
              }
            } catch (signInErr) {
              console.warn('[AuthService] ⚠️ Falló signIn en relink:', signInErr.message);
            }
          }

          if (orphanUid) {
            const newCompanyId = profileData.companyId;
            const profilePayload = {
              uid: orphanUid,
              email: cleanEmail,
              displayName: profileData.displayName || cleanEmail,
              role: profileData.role,
              customRole: profileData.customRole || '',
              companyId: newCompanyId || 'global',
              branchId: profileData.branchId || 'main',
              permissions: profileData.permissions || {},
              storedPassword: password,
              createdAt: Date.now(),
              createdAtLocal: TimeService.timestamp(),
              updatedAt: Date.now(),
              updatedAtLocal: TimeService.timestamp()
            };

            // Re-escribir /users/{uid} con el nuevo perfil de empresa
            await set(ref(db, `users/${orphanUid}`), profilePayload);

            // Dual-write: registrar en la nueva empresa como empleado
            if (newCompanyId && newCompanyId !== 'global') {
              await FirestoreService.addEmployeeToCompany(newCompanyId, orphanUid, {
                displayName: profileData.displayName || cleanEmail,
                email: cleanEmail,
                role: profileData.role,
                customRole: profileData.customRole || '',
                branchId: profileData.branchId || 'main',
                permissions: profileData.permissions || {}
              });

              if (profileData.role === 'OWNER' || profileData.role === 'MANAGER') {
                await FirestoreService.updateCompanyInfo(newCompanyId, { ownerId: orphanUid }).catch(() => {});
              }
            }

            // Limpiar los índices ya que fueron consumidos exitosamente
            await set(ref(db, `deleted_users_by_email/${emailKeyClean}`), null).catch(() => {});
            await set(ref(db, `deleted_users_by_email/${emailKeyRaw}`), null).catch(() => {});

            console.log(`[AuthService] ✅ Re-vinculación exitosa por email-already-in-use: ${cleanEmail} (UID: ${orphanUid}) → ${newCompanyId}`);
            return orphanUid;

          } else {
            console.warn('[AuthService] ⚠️ No se encontró UID en los índices ni por Auth.');
            throw new Error(`El correo "${email}" ya existía en Firebase Auth. Si pertenece a una empresa eliminada, por favor intenta de nuevo.`);
          }
        } catch (relinkErr) {
          if (relinkErr.message && (relinkErr.message.includes('ya está registrado') || relinkErr.message.includes('Firebase Auth'))) throw relinkErr;
          console.warn('[AuthService] ⚠️ Error durante re-vinculación por email-already-in-use:', relinkErr.message);
          throw relinkErr;
        }
      }

      // Translate remaining Firebase Auth error codes to Spanish
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

    const currentUser = GlobalStore.getState().currentUser;
    if (currentUser?.uid) {
      await PushNotificationsService.unregisterDevice(currentUser.uid).catch(() => {});
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

    // Clean up company cached data for security on explicit logout
    if (currentUser?.companyId) {
      await LocalStorageDBService.clearCompanyData(currentUser.companyId).catch(() => {});
    }
    await LocalStorageDBService.setCache('user_session', null).catch(() => {});

    // Clean up all real-time listeners
    FirestoreService.unsubscribeAll();

    if (auth) {
      await signOut(auth).catch(() => { });
    }

    GlobalStore.set({
      currentUser: null,
      currentCompany: null,
      activeRole: null,
      isAuthenticated: false
    });

    AppearanceService.loadAndApply().catch(e => console.warn('[AuthService] Could not reset appearance on logout:', e));

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
   * Automatically restores sessions on page reload, refresh, or offline restart.
   * Never hangs — resolves within 3.5 seconds at most.
   *
   * @param {Function} onUserReady - Called once with user session or null
   */
  static watchAuthState(onUserReady) {
    let resolved = false;

    GlobalStore.set({ authLoading: true });

    const resolve = (session) => {
      if (resolved) return;
      resolved = true;
      GlobalStore.set({ authLoading: false });
      onUserReady(session);
    };

    // Safety net: if Firebase Auth takes too long or is offline, unblock the app using cached session
    const timeout = setTimeout(async () => {
      console.warn('[AuthService] ⚠️ Auth state timeout — checking cached session for offline access.');
      const cachedSession = await LocalStorageDBService.getCache('user_session');
      if (cachedSession && (!cachedSession.expiresAt || Date.now() < cachedSession.expiresAt)) {
        console.log('[AuthService] 📴 Offline session restored from cache for:', cachedSession.email);
        const cachedProfile = (await LocalStorageDBService.getCache(`users/${cachedSession.uid}`)) || {};
        const fullSession = { ...cachedProfile, ...cachedSession };
        GlobalStore.set({
          currentUser: fullSession,
          activeRole: fullSession.role,
          isAuthenticated: true,
          authLoading: false
        });
        const cachedCompany = await LocalStorageDBService.getCache(`companies/${cachedSession.companyId}`);
        if (cachedCompany) {
          GlobalStore.set({ currentCompany: cachedCompany });
        }
        resolve(fullSession);
      } else {
        GlobalStore.set({ currentUser: null, activeRole: null, isAuthenticated: false, authLoading: false });
        resolve(null);
      }
    }, 3500);

    if (!auth) {
      clearTimeout(timeout);
      LocalStorageDBService.getCache('user_session').then(async (cachedSession) => {
        if (cachedSession && (!cachedSession.expiresAt || Date.now() < cachedSession.expiresAt)) {
          const cachedProfile = (await LocalStorageDBService.getCache(`users/${cachedSession.uid}`)) || {};
          const fullSession = { ...cachedProfile, ...cachedSession };
          GlobalStore.set({ currentUser: fullSession, activeRole: fullSession.role, isAuthenticated: true, authLoading: false });
          resolve(fullSession);
        } else {
          GlobalStore.set({ currentUser: null, activeRole: null, isAuthenticated: false, authLoading: false });
          resolve(null);
        }
      });
      return;
    }

    onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        // Attempt to restore session from IndexedDB cache before defaulting to unauthenticated
        const cachedSession = await LocalStorageDBService.getCache('user_session');
        if (cachedSession && (!cachedSession.expiresAt || Date.now() < cachedSession.expiresAt)) {
          console.log('[AuthService] 📴 Local session restored for:', cachedSession.email);
          const cachedProfile = (await LocalStorageDBService.getCache(`users/${cachedSession.uid}`)) || {};
          const fullSession = { ...cachedProfile, ...cachedSession };
          GlobalStore.set({
            currentUser: fullSession,
            activeRole: fullSession.role,
            isAuthenticated: true,
            authLoading: false
          });
          const cachedCompany = await LocalStorageDBService.getCache(`companies/${cachedSession.companyId}`);
          if (cachedCompany) {
            GlobalStore.set({ currentCompany: cachedCompany });
          }
          clearTimeout(timeout);
          resolve(fullSession);
          return;
        }

        GlobalStore.set({ currentUser: null, activeRole: null, isAuthenticated: false, authLoading: false });
        clearTimeout(timeout);
        resolve(null);
        return;
      }

      // User is signed in — try to load their profile
      try {
        let userProfile = null;

        // 1. Try Realtime Database when online
        if (db && navigator.onLine) {
          try {
            const userRef = ref(db, `users/${firebaseUser.uid}`);
            const snap = await Promise.race([
              get(userRef),
              new Promise((_, reject) => setTimeout(() => reject(new Error('database-timeout')), 3000))
            ]);
            if (snap.exists()) {
              userProfile = snap.val();
              await LocalStorageDBService.setCache(`users/${firebaseUser.uid}`, userProfile);
            }
          } catch (e) {
            console.warn('[AuthService] RTDB session restore network issue, using cache:', e.message);
          }
        }

        // 2. Try IndexedDB cache fallback
        if (!userProfile) {
          userProfile = await LocalStorageDBService.getCache(`users/${firebaseUser.uid}`);
        }

        // 3. SuperAdmin fallback
        if (!userProfile && firebaseUser.email === SUPER_ADMIN_EMAIL) {
          userProfile = { ...SUPER_ADMIN_PROFILE };
        }

        if (userProfile) {
          // Validar si el negocio existe y no ha sido eliminado (excepto si es SUPER_ADMIN)
          if (userProfile.companyId && userProfile.companyId !== 'global') {
            if (db && navigator.onLine) {
              try {
                const companySnap = await get(ref(db, `companies/${userProfile.companyId}`));
                if (!companySnap.exists() || (companySnap.val() && companySnap.val().status === 'ELIMINADO')) {
                  console.warn('[AuthService] Company deleted or trashed. Blocking session.');
                  GlobalStore.set({ currentUser: null, activeRole: null, isAuthenticated: false, authLoading: false });
                  clearTimeout(timeout);
                  resolve(null);
                  return;
                }
                await LocalStorageDBService.setCache(`companies/${userProfile.companyId}`, companySnap.val());
              } catch (err) {
                console.warn('[AuthService] Failed to verify company during restore:', err.message);
              }
            } else {
              const cachedCompany = await LocalStorageDBService.getCache(`companies/${userProfile.companyId}`);
              if (cachedCompany && cachedCompany.status === 'ELIMINADO') {
                console.warn('[AuthService] Cached company is deleted. Blocking session.');
                GlobalStore.set({ currentUser: null, activeRole: null, isAuthenticated: false, authLoading: false });
                clearTimeout(timeout);
                resolve(null);
                return;
              }
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
            permissions: userProfile.permissions || {},
            phone: userProfile.phone || userProfile.telefono || '',
            personalInfo: userProfile.personalInfo || '',
            avatarImageId: userProfile.avatarImageId || '',
            photoURL: userProfile.photoURL || '',
            preferences: userProfile.preferences || {},
            expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days offline session validity
          };

          await LocalStorageDBService.setCache('user_session', userSession);
          await LocalStorageDBService.setUserSession(userSession);

          GlobalStore.set({
            currentUser: userSession,
            activeRole: userSession.role,
            isAuthenticated: true,
            authLoading: false
          });

          AppearanceService.loadAndApply().catch(e => console.warn('[AuthService] Could not apply appearance on session restore:', e));

          clearTimeout(timeout);
          resolve(userSession);
        } else {
          // Check cached session as ultimate fallback
          const cachedSession = await LocalStorageDBService.getCache('user_session');
          if (cachedSession && (!cachedSession.expiresAt || Date.now() < cachedSession.expiresAt)) {
            GlobalStore.set({
              currentUser: cachedSession,
              activeRole: cachedSession.role,
              isAuthenticated: true,
              authLoading: false
            });
            clearTimeout(timeout);
            resolve(cachedSession);
            return;
          }

          GlobalStore.set({ currentUser: null, activeRole: null, isAuthenticated: false, authLoading: false });
          clearTimeout(timeout);
          resolve(null);
        }

      } catch (e) {
        console.warn('[AuthService] Session restore error:', e.message);
        const cachedSession = await LocalStorageDBService.getCache('user_session');
        if (cachedSession && (!cachedSession.expiresAt || Date.now() < cachedSession.expiresAt)) {
          GlobalStore.set({ currentUser: cachedSession, activeRole: cachedSession.role, isAuthenticated: true, authLoading: false });
          clearTimeout(timeout);
          resolve(cachedSession);
          return;
        }

        GlobalStore.set({ currentUser: null, activeRole: null, isAuthenticated: false, authLoading: false });
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
          avatarImageId: val.avatarImageId || null,
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
   * Resets lockout state and unlocks a user account in RTDB and localStorage.
   * @param {string} emailOrUid
   */
  static async unlockUserAccount(emailOrUid) {
    if (!db || !emailOrUid) return false;

    let targetUid = emailOrUid;
    let cleanEmail = (emailOrUid || '').toLowerCase().trim();

    try {
      if (cleanEmail.includes('@')) {
        const usersSnap = await get(ref(db, 'users'));
        if (usersSnap.exists()) {
          usersSnap.forEach(snap => {
            const u = snap.val() || {};
            if ((u.email || '').toLowerCase().trim() === cleanEmail) {
              targetUid = snap.key;
            }
          });
        }
      }

      if (targetUid) {
        await update(ref(db, `users/${targetUid}`), {
          accountLocked: false,
          failedAttempts: 0,
          lockoutUntil: 0,
          unlockedAt: Date.now()
        }).catch(e => console.warn('[AuthService] Could not unlock RTDB user:', e.message));
      }

      if (cleanEmail.includes('@')) {
        try {
          localStorage.removeItem(`ultra_login_lockout_${cleanEmail}`);
        } catch (_) {}
      }

      console.log('[AuthService] ✅ Account unlocked for:', emailOrUid);
      return true;
    } catch (e) {
      console.warn('[AuthService] Error unlocking account:', e.message);
      return false;
    }
  }

  /**
   * Admin method to reset or change a user's password with audit logging and automatic account unlock.
   */
  static async adminUpdateUserPassword(targetUid, targetEmail, newPassword) {
    if (!db) throw new Error('Base de datos no inicializada.');

    const currentUser = GlobalStore.getState().currentUser || {};
    const timestamp = Date.now();
    const cleanEmail = (targetEmail || '').toLowerCase().trim();

    const updates = {
      storedPassword: newPassword,
      accountLocked: false,
      failedAttempts: 0,
      lockoutUntil: 0,
      unlockedAt: timestamp,
      updatedAt: timestamp
    };

    await update(ref(db, `users/${targetUid}`), updates);

    // Also update company ownerPassword or employee record if user belongs to a company
    try {
      const userSnap = await get(ref(db, `users/${targetUid}`));
      if (userSnap.exists()) {
        const userData = userSnap.val() || {};
        const companyId = userData.companyId;
        if (companyId && companyId !== 'global') {
          await update(ref(db, `companies/${companyId}`), {
            ownerPassword: newPassword,
            updatedAt: timestamp
          }).catch(() => {});
          await update(ref(db, `${companyId}/employees/${targetUid}`), {
            storedPassword: newPassword,
            accountLocked: false,
            updatedAt: timestamp
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('[AuthService] Could not sync password to company branch:', e.message);
    }

    if (cleanEmail) {
      try {
        localStorage.removeItem(`ultra_login_lockout_${cleanEmail}`);
      } catch (_) {}
    }

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
        details: `Contraseña restablecida y cuenta desbloqueada para el usuario ${targetEmail}.`
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
   * After deletion the email is indexed so it can be re-registered freely.
   */
  static async adminDeleteUserAccount(targetUid, targetEmail, companyId) {
    if (!db) throw new Error('Base de datos no inicializada.');

    const currentUser = GlobalStore.getState().currentUser || {};
    const timestamp = Date.now();
    const cleanEmail = (targetEmail || '').toLowerCase().trim();
    const updates = {};

    // ── 1. Index deleted email so createUser can re-link the Firebase Auth account ──
    if (cleanEmail) {
      const rawEmail = (targetEmail || '').toLowerCase().trim();
      const emailKey1 = rawEmail.replace(/\./g, ',');
      const emailKey2 = cleanEmail.replace(/\./g, ',');
      const record = {
        uid: targetUid,
        email: rawEmail,
        companyId: companyId || 'global',
        deletedAt: timestamp,
        deletedAtLocal: new Date().toISOString()
      };
      updates[`deleted_users_by_email/${emailKey1}`] = record;
      updates[`deleted_users_by_email/${emailKey2}`] = record;
    }

    // ── 2. Remove global user profile and company employee record ──────────────
    updates[`users/${targetUid}`] = null;
    if (companyId && companyId !== 'global') {
      updates[`${companyId}/employees/${targetUid}`] = null;
    }

    // ── 3. Clean up any pending_owner_requests linked to this email ───────────
    try {
      const reqSnap = await get(ref(db, 'pending_owner_requests'));
      if (reqSnap.exists()) {
        reqSnap.forEach(snap => {
          const req = snap.val() || {};
          const reqEmail = (req.email || '').toLowerCase().trim();
          if (reqEmail === cleanEmail) {
            updates[`pending_owner_requests/${snap.key}`] = null;
          }
        });
      }
    } catch (e) {
      console.warn('[AuthService] ⚠️ Could not clean pending_owner_requests for deleted user:', e.message);
    }

    await update(ref(db), updates);

    // ── 4. Clear local saved-account cache for this email ─────────────────────
    try {
      const { SavedAccountsService } = await import('./saved-accounts.service.js');
      SavedAccountsService.remove(cleanEmail);
    } catch (_) {}

    try {
      const auditRef = push(ref(db, 'audit_logs'));
      await set(auditRef, {
        action: 'ADMIN_DELETE_USER',
        programmerEmail: currentUser.email || 'superadmin@ultraadmin.com',
        programmerUid: currentUser.uid || 'system',
        targetUid,
        targetEmail: cleanEmail,
        timestamp,
        isoDate: new Date().toISOString(),
        details: `Cuenta de usuario ${cleanEmail} (${targetUid}) eliminada por el programador. Email liberado para re-registro.`
      });
    } catch (e) {
      console.warn('[AuthService] Audit log write failed:', e);
    }

    return true;
  }
}
