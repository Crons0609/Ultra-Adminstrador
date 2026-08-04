/**
 * @file firestore.service.js
 * @description Firebase Realtime Database CRUD service layer with multi-tenant isolation.
 *
 * Architecture:
 * - Tenant ops: Read/write under /companies/{companyId}/{collection}/
 * - Global ops: Read/write at root-level paths like /users/, /companies/
 * - Company ops: Create full company branches with atomic multi-path updates
 * - Real-time: Subscribe to any path via onValue listeners
 *
 * Uses Firebase Realtime Database CDN v12.16.0.
 */

import { db } from '../config/firebase.config.js';
import { GlobalStore } from '../core/state.js';
import { TimeService } from './time.service.js';
import { LocalStorageDBService } from './local-storage-db.service.js';
import { OfflineSyncService } from './offline-sync.service.js';

import {
  ref,
  set,
  get,
  update,
  remove,
  push,
  child,
  onValue,
  off,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';

export class FirestoreService {

  // ─── Active listeners registry (for cleanup) ────────────────────────────────
  static _listeners = new Map();

  // ═══════════════════════════════════════════════════════════════════════════
  // TENANT (per-company) operations
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Helper to resolve the active company tenant path.
   * @private
   * @param {string} collectionName - Sub-collection under the company branch
   * @returns {string} e.g. "companies/abc123/orders"
   */
  static _getTenantPath(collectionName) {
    const { currentUser } = GlobalStore.getState();
    if (!currentUser || !currentUser.companyId) {
      throw new Error('Tenant context missing. Unable to perform Database query.');
    }
    return `${currentUser.companyId}/${collectionName}`;
  }

  /**
   * Create a document in the tenant collection.
   * @param {string} collectionName
   * @param {Object} data
   * @param {string|null} [customId]
   * @returns {Promise<string>} The document ID
   */
  static async create(collectionName, data, customId = null) {
    const path = this._getTenantPath(collectionName);
    const docId = customId || (db ? push(ref(db, path)).key : `${Date.now()}`);
    const fullPath = `${path}/${docId}`;

    const payload = {
      id: docId,
      ...data,
      createdAt: data.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdAtLocal: data.createdAtLocal || TimeService.timestamp(),
      updatedAtLocal: TimeService.timestamp()
    };

    if (navigator.onLine && db) {
      const docRef = ref(db, fullPath);
      await set(docRef, payload);
      console.log(`[DB] ✅ Created ${fullPath}`);
    } else {
      await OfflineSyncService.write('set', fullPath, payload, `Crear en ${collectionName}`);
    }

    // Update local cache
    const cachedList = (await LocalStorageDBService.getCache(path)) || [];
    const updatedList = [...cachedList.filter(item => item.id !== docId), { ...payload, id: docId }];
    await LocalStorageDBService.setCache(path, updatedList);
    await LocalStorageDBService.setCache(fullPath, payload);
    return docId;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RAW PATH operations (for ImageStorageService and other low-level access)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Write data to an absolute database path (no tenant prefix added).
   * @param {string} path - Absolute DB path
   * @param {Object} data - Data to write/merge at this path
   */
  static async writePath(path, data) {
    if (navigator.onLine && db) {
      const docRef = ref(db, path);
      await set(docRef, data);
      console.log(`[DB] ✅ writePath → ${path}`);
    } else {
      await OfflineSyncService.write('set', path, data, `Escritura en ${path}`);
    }
    await LocalStorageDBService.setCache(path, data);
  }

  /**
   * Read data at an absolute database path.
   * @param {string} path - Absolute DB path
   * @returns {Promise<Object|null>}
   */
  static async readPath(path) {
    if (navigator.onLine && db) {
      try {
        const docRef = ref(db, path);
        const snap = await get(docRef);
        if (snap.exists()) {
          const val = snap.val();
          await LocalStorageDBService.setCache(path, val);
          return val;
        }
      } catch (e) {
        console.warn(`[DB] readPath network error for ${path}:`, e.message);
      }
    }
    return LocalStorageDBService.getCache(path);
  }

  /**
   * Remove a node at an absolute database path.
   * @param {string} path - Absolute DB path
   */
  static async removePath(path) {
    if (navigator.onLine && db) {
      const docRef = ref(db, path);
      await remove(docRef);
      console.log(`[DB] ✅ removePath → ${path}`);
    } else {
      await OfflineSyncService.write('remove', path, null, `Eliminar en ${path}`);
    }
    await LocalStorageDBService.setCache(path, null);
  }

  /**
   * Get a document by ID from the tenant collection.
   * @param {string} collectionName
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async getById(collectionName, id) {
    const path = this._getTenantPath(collectionName);
    const fullPath = `${path}/${id}`;

    if (navigator.onLine && db) {
      try {
        const docRef = ref(db, fullPath);
        const snap = await get(docRef);
        if (snap.exists()) {
          const doc = { id: snap.key, ...snap.val() };
          await LocalStorageDBService.setCache(fullPath, doc);
          return doc;
        }
      } catch (e) {
        console.warn(`[DB] getById network error for ${fullPath}:`, e.message);
      }
    }

    const cached = await LocalStorageDBService.getCache(fullPath);
    if (cached) return cached;

    const colCached = await LocalStorageDBService.getCache(path);
    if (Array.isArray(colCached)) {
      const found = colCached.find(item => item.id === id);
      if (found) return found;
    }
    return null;
  }

  /**
   * Update specific fields in a tenant document (non-destructive merge).
   * @param {string} collectionName
   * @param {string} id
   * @param {Object} data
   * @returns {Promise<void>}
   */
  static async update(collectionName, id, data) {
    const path = this._getTenantPath(collectionName);
    const fullPath = `${path}/${id}`;
    const payload = { ...data, updatedAt: serverTimestamp(), updatedAtLocal: TimeService.timestamp() };

    if (navigator.onLine && db) {
      const docRef = ref(db, fullPath);
      await update(docRef, payload);
      console.log(`[DB] ✅ Updated ${fullPath}`);
    } else {
      await OfflineSyncService.write('update', fullPath, payload, `Actualizar ${collectionName}`);
    }

    const cachedItem = (await LocalStorageDBService.getCache(fullPath)) || { id };
    const updatedItem = { ...cachedItem, ...data, updatedAtLocal: TimeService.timestamp() };
    await LocalStorageDBService.setCache(fullPath, updatedItem);

    const cachedList = (await LocalStorageDBService.getCache(path)) || [];
    const updatedList = cachedList.map(item => item.id === id ? { ...item, ...data } : item);
    await LocalStorageDBService.setCache(path, updatedList);
  }

  /**
   * Delete a document from the tenant collection.
   * @param {string} collectionName
   * @param {string} id
   * @returns {Promise<void>}
   */
  static async delete(collectionName, id) {
    const path = this._getTenantPath(collectionName);
    const fullPath = `${path}/${id}`;

    if (navigator.onLine && db) {
      const docRef = ref(db, fullPath);
      try {
        const snapshot = await get(docRef);
        if (snapshot.exists()) {
          const val = snapshot.val();
          const imageId = val.imageId || val.logoImageId || val.avatarImageId;
          if (imageId) {
            const { ImageStorageService } = await import('./image-storage.service.js');
            await ImageStorageService.deleteImage(imageId).catch(() => {});
          }
        }
      } catch (_) {}

      await remove(docRef);
      console.log(`[DB] ✅ Deleted ${fullPath}`);
    } else {
      await OfflineSyncService.write('remove', fullPath, null, `Eliminar de ${collectionName}`);
    }

    const cachedList = (await LocalStorageDBService.getCache(path)) || [];
    const updatedList = cachedList.filter(item => item.id !== id);
    await LocalStorageDBService.setCache(path, updatedList);
    await LocalStorageDBService.setCache(fullPath, null);
  }

  /**
   * Delete ALL documents in a tenant collection.
   * @param {string} collectionName
   * @returns {Promise<void>}
   */
  static async deleteAll(collectionName) {
    const path = this._getTenantPath(collectionName);

    if (navigator.onLine && db) {
      const colRef = ref(db, path);
      await remove(colRef);
      console.log(`[DB] ✅ Deleted all in ${path}`);
    } else {
      await OfflineSyncService.write('remove', path, null, `Vaciar ${collectionName}`);
    }
    await LocalStorageDBService.setCache(path, []);
  }

  /**
   * Query documents in a tenant collection with optional client-side filters.
   * @param {string} collectionName
   * @param {Array<{field: string, op: string, value: *}>} [filters]
   * @param {{field: string, direction?: 'asc'|'desc'}|null} [sortBy]
   * @param {number|null} [limitCount]
   * @returns {Promise<Array<Object>>}
   */
  static async query(collectionName, filters = [], sortBy = null, limitCount = null) {
    const path = this._getTenantPath(collectionName);

    if (navigator.onLine && db) {
      try {
        const colRef = ref(db, path);
        const snapshot = await get(colRef);
        if (snapshot.exists()) {
          let results = [];
          snapshot.forEach(snap => {
            results.push({ id: snap.key, ...snap.val() });
          });
          await LocalStorageDBService.setCache(path, results);
          results = this._applyFilters(results, filters);
          results = this._applySort(results, sortBy);
          if (limitCount) results = results.slice(0, limitCount);
          console.log(`[DB] ✅ Query ${path} → ${results.length} docs`);
          return results;
        } else {
          await LocalStorageDBService.setCache(path, []);
        }
      } catch (e) {
        console.warn(`[DB] Query network error for ${path}, using cached data:`, e.message);
      }
    }

    let cached = (await LocalStorageDBService.getCache(path)) || [];
    let results = this._applyFilters(cached, filters);
    results = this._applySort(results, sortBy);
    if (limitCount) results = results.slice(0, limitCount);
    console.log(`[DB] 📴 Offline query ${path} → ${results.length} cached docs`);
    return results;
  }

  /**
   * Get ALL documents in a tenant collection.
   * @param {string} collectionName
   * @returns {Promise<Array<Object>>}
   */
  static async getAll(collectionName) {
    return this.query(collectionName);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GLOBAL (root-level, non-tenant) operations
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Write a document to a root-level path.
   * Example: setGlobal('users', uid, profileData)
   *
   * @param {string} collectionName
   * @param {string} id
   * @param {Object} data
   * @param {boolean} [merge=true] - If true, merges with existing document
   * @returns {Promise<void>}
   */
  static async setGlobal(collectionName, id, data, merge = true) {
    const fullPath = `${collectionName}/${id}`;
    const payload = { ...data, updatedAt: serverTimestamp(), updatedAtLocal: TimeService.timestamp() };

    if (navigator.onLine && db) {
      const docRef = ref(db, fullPath);
      if (merge) {
        await update(docRef, payload);
      } else {
        await set(docRef, payload);
      }
      console.log(`[DB] ✅ Global set ${fullPath}`);
    } else {
      await OfflineSyncService.write(merge ? 'update' : 'set', fullPath, payload, `Guardar en ${collectionName}`);
    }

    const cachedItem = (await LocalStorageDBService.getCache(fullPath)) || { id };
    const updatedItem = { ...cachedItem, ...data, updatedAtLocal: TimeService.timestamp() };
    await LocalStorageDBService.setCache(fullPath, updatedItem);

    const cachedList = (await LocalStorageDBService.getCache(collectionName)) || [];
    const updatedList = cachedList.map(item => item.id === id ? { ...item, ...data } : item);
    if (!cachedList.some(item => item.id === id)) {
      updatedList.push(updatedItem);
    }
    await LocalStorageDBService.setCache(collectionName, updatedList);
  }

  /**
   * Helper to increment a numeric value at any database path.
   * Useful for analytics counters.
   *
   * @param {string} path - Absolute RTDB path
   * @param {number} [amount=1]
   */
  static async incrementPathValue(path, amount = 1) {
    if (!db || !navigator.onLine) return;
    try {
      const pathRef = ref(db, path);
      const snap = await get(pathRef);
      const val = Number(snap.val() || 0);
      await set(pathRef, val + amount);
    } catch (e) {
      console.warn(`[DB] Failed to increment path ${path}:`, e.message);
    }
  }

  /**
   * Read a document from a root-level path.
   * @param {string} collectionName
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async getGlobal(collectionName, id) {
    const fullPath = `${collectionName}/${id}`;
    if (navigator.onLine && db) {
      try {
        const docRef = ref(db, fullPath);
        const snap = await Promise.race([
          get(docRef),
          new Promise((_, reject) => setTimeout(() => reject(new Error('network-timeout')), 4000))
        ]);
        if (snap.exists()) {
          const val = { id: snap.key, ...snap.val() };
          await LocalStorageDBService.setCache(fullPath, val);
          return val;
        }
      } catch (e) {
        console.warn(`[DB] getGlobal network error for ${fullPath}:`, e.message);
      }
    }

    const cachedDoc = await LocalStorageDBService.getCache(fullPath);
    if (cachedDoc) return cachedDoc;

    const cachedList = (await LocalStorageDBService.getCache(collectionName)) || [];
    return cachedList.find(item => item.id === id) || null;
  }

  /**
   * Query all documents in a root-level collection.
   * @param {string} collectionName
   * @param {Array<{field: string, op: string, value: *}>} [filters]
   * @returns {Promise<Array<Object>>}
   */
  static async queryGlobal(collectionName, filters = []) {
    const path = collectionName;
    if (navigator.onLine && db) {
      try {
        const colRef = ref(db, path);
        const snapshot = await Promise.race([
          get(colRef),
          new Promise((_, reject) => setTimeout(() => reject(new Error('network-timeout')), 4000))
        ]);
        if (snapshot.exists()) {
          let results = [];
          snapshot.forEach(snap => {
            results.push({ id: snap.key, ...snap.val() });
          });
          await LocalStorageDBService.setCache(path, results);
          results = this._applyFilters(results, filters);
          console.log(`[DB] ✅ queryGlobal ${path} → ${results.length} docs`);
          return results;
        } else {
          await LocalStorageDBService.setCache(path, []);
        }
      } catch (e) {
        console.warn(`[DB] queryGlobal network error for ${path}, using cache:`, e.message);
      }
    }

    let cached = (await LocalStorageDBService.getCache(path)) || [];
    let results = this._applyFilters(cached, filters);
    console.log(`[DB] 📴 Offline queryGlobal ${path} → ${results.length} cached docs`);
    return results;
  }

  /**
   * Delete a document from a root-level path.
   * @param {string} collectionName
   * @param {string} id
   * @returns {Promise<void>}
   */
  static async deleteGlobal(collectionName, id) {
    const fullPath = `${collectionName}/${id}`;
    if (navigator.onLine && db) {
      const docRef = ref(db, fullPath);
      await remove(docRef);
      console.log(`[DB] ✅ Global deleted ${fullPath}`);
    } else {
      await OfflineSyncService.write('remove', fullPath, null, `Eliminar en ${collectionName}`);
    }

    const cachedList = (await LocalStorageDBService.getCache(collectionName)) || [];
    const updatedList = cachedList.filter(item => item.id !== id);
    await LocalStorageDBService.setCache(collectionName, updatedList);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPANY STRUCTURE operations — used by Programador (SUPER_ADMIN)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate a new unique company ID using push().
   * @returns {string} A Firebase push-key
   */
  /**
   * Sanitise a string to be a valid Firebase Realtime Database key.
   * Removes ".", "#", "$", "/", "[", or "]".
   * @param {string} key
   * @returns {string}
   */
  static sanitiseKey(key) {
    if (!key) return '';
    return key
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ñ/gi, 'n')
      .replace(/[\.\#\$\/\[\]\?\%]/g, '')
      .replace(/[^a-zA-Z0-9\-_ ]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  /**
   * Create a full company branch in RTDB with all sub-nodes initialized atomically.
   * This is called when the Programador registers a new business.
   *
   * Structure created:
   *   /companies/{companyId}/             → Global index registry for Super Admin
   *   /{companyId}/informacion_local/     → Local business info
   *   /{companyId}/config/                → Business feature toggles
   *   /{companyId}/branches/main/         → Default branch
   *
   * @param {string} companyId - The unique company identifier (sanitised name)
   * @param {Object} companyData - { name, businessType, plan, status, ownerId }
   * @param {Object} [configData] - Optional custom config overrides
   * @returns {Promise<void>}
   */
  static async createCompanyBranch(companyId, companyData, configData = {}) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const now = serverTimestamp();
    const localNow = TimeService.timestamp();

    const defaultConfig = {
      enableKDS: false,
      enableWhatsApp: true,
      enableTelegram: true,
      enableBilling: false,
      enableQR: false,
      enableVehiclesCatalog: false,
      enableRentals: false,
      enableRentalReminders: false,
      enableAppointments: false,
      enableSchedules: false,
      enableReservations: false,
      enableServiceRequests: false,
      enableStaffRoles: false,
      enableEmployeePricing: false,
      currency: 'NIO',
      timezone: TimeService.timezone,
      address: '',
      phone: '',
      logo: '',
      ...configData
    };

    // Atomic multi-path update — all writes succeed or none do
    // Note: Absolutely no ".init" dot keys are used to avoid Firebase key errors
    const updates = {};
    updates[`companies/${companyId}`] = {
      name: companyData.name,
      businessType: companyData.businessType || 'Restaurante',
      plan: companyData.plan || 'FREE',
      status: companyData.status || 'ACTIVO',
      country: companyData.country || 'Nicaragua',
      state: companyData.state || '',
      city: companyData.city || '',
      postalCode: companyData.postalCode || '',
      address: companyData.address || '',
      subscriptionExpiresAt: companyData.subscriptionExpiresAt || '',
      ownerId: companyData.ownerId || '',
      ownerEmail: companyData.ownerEmail || '',
      ownerPassword: companyData.ownerPassword || '',
      modules: companyData.modules || configData.modules || {},
      createdAt: now,
      updatedAt: now,
      createdAtLocal: localNow,
      updatedAtLocal: localNow,
      deletedAt: null,
      statusReason: ''
    };
    updates[`${companyId}/informacion_local`] = {
      nombre: companyData.name,
      propietario: companyData.ownerId || '',
      telefono: companyData.phone || '',
      pais: companyData.country || 'Nicaragua',
      estado: companyData.state || '',
      municipio: companyData.city || '',
      codigoPostal: companyData.postalCode || '',
      direccion: companyData.address || '',
      correo: companyData.ownerEmail || '',
      horario: '',
      logo: '',
      businessType: companyData.businessType || 'Restaurante',
      subscriptionExpiresAt: companyData.subscriptionExpiresAt || '',
      modules: companyData.modules || configData.modules || {},
      configuracion: defaultConfig
    };
    updates[`${companyId}/config`] = {
      ...defaultConfig,
      modules: companyData.modules || configData.modules || {},
      updatedAt: now,
      updatedAtLocal: localNow
    };
    updates[`${companyId}/branches/main`] = {
      name: 'Principal',
      country: companyData.country || 'Nicaragua',
      state: companyData.state || '',
      city: companyData.city || '',
      postalCode: companyData.postalCode || '',
      address: companyData.address || '',
      phone: companyData.phone || '',
      active: true,
      createdAt: now,
      createdAtLocal: localNow
    };

    const rootRef = ref(db);
    await update(rootRef, updates);
    console.log(`[DB] ✅ Company branch created at root: /${companyId}`);
  }

  /**
   * Add an employee record under a specific company's employees node.
   * Dual-write counterpart — user profile also exists at /users/{uid}.
   *
   * @param {string} companyId
   * @param {string} uid
   * @param {Object} employeeData - { displayName, email, role, customRole, branchId }
   * @returns {Promise<void>}
   */
  static async addEmployeeToCompany(companyId, uid, employeeData) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const empRef = ref(db, `${companyId}/employees/${uid}`);
    await set(empRef, {
      displayName: employeeData.displayName || '',
      email: employeeData.email || '',
      role: employeeData.role || 'EMPLOYEE',
      customRole: employeeData.customRole || '',
      branchId: employeeData.branchId || 'main',
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdAtLocal: TimeService.timestamp(),
      updatedAtLocal: TimeService.timestamp()
    });
    console.log(`[DB] ✅ Employee added: /${companyId}/employees/${uid}`);
  }

  /**
   * Remove an employee from a company's employees node.
   * @param {string} companyId
   * @param {string} uid
   * @returns {Promise<void>}
   */
  static async removeEmployeeFromCompany(companyId, uid) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const empRef = ref(db, `${companyId}/employees/${uid}`);
    await remove(empRef);
    console.log(`[DB] ✅ Employee removed: /${companyId}/employees/${uid}`);
  }

  /**
   * Get all employees for a specific company.
   * @param {string} companyId
   * @returns {Promise<Array<Object>>}
   */
  static async getCompanyEmployees(companyId) {
    const path = `${companyId}/employees`;
    if (navigator.onLine && db) {
      try {
        const empRef = ref(db, path);
        const snapshot = await Promise.race([
          get(empRef),
          new Promise((_, reject) => setTimeout(() => reject(new Error('network-timeout')), 4000))
        ]);
        if (snapshot.exists()) {
          const results = [];
          snapshot.forEach(snap => {
            const val = snap.val();
            if (snap.key !== '.init') {
              results.push({ id: snap.key, uid: snap.key, ...val });
            }
          });
          await LocalStorageDBService.setCache(path, results);
          return results;
        }
      } catch (e) {
        console.warn(`[DB] getCompanyEmployees network error for ${companyId}:`, e.message);
      }
    }

    const cached = (await LocalStorageDBService.getCache(path)) || [];
    console.log(`[DB] 📴 Loaded cached company employees for ${companyId}: ${cached.length} items`);
    return cached;
  }

  /**
   * Get company info (the /informacion_local sub-node).
   * @param {string} companyId
   * @returns {Promise<Object|null>}
   */
  static async getCompanyInfo(companyId) {
    const path = `${companyId}/informacion_local`;

    if (navigator.onLine && db) {
      try {
        const infoRef = ref(db, path);
        const snap = await Promise.race([
          get(infoRef),
          new Promise((_, reject) => setTimeout(() => reject(new Error('network-timeout')), 4000))
        ]);
        if (snap.exists()) {
          const data = snap.val();
          let status = 'ACTIVO';
          let config = {};
          let modules = data.modules || {};

          try {
            const configSnap = await Promise.race([
              get(ref(db, `${companyId}/config`)),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500))
            ]);
            if (configSnap.exists()) {
              config = configSnap.val() || {};
              status = config.status || 'ACTIVO';
              if (config.modules) {
                modules = { ...modules, ...config.modules };
              }
            }
          } catch (e) {}

          try {
            const companyRootSnap = await Promise.race([
              get(ref(db, `companies/${companyId}`)),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500))
            ]);
            if (companyRootSnap.exists()) {
              const rootVal = companyRootSnap.val() || {};
              if (rootVal.modules) {
                modules = { ...modules, ...rootVal.modules };
              }
            }
          } catch (e) {}

          const infoObj = {
            id: companyId,
            name: data.nombre || data.name || companyId,
            ownerId: data.propietario || data.ownerId || '',
            phone: data.telefono || '',
            address: data.direccion || '',
            email: data.correo || '',
            status,
            ...data,
            config,
            modules,
          };

          await LocalStorageDBService.setCache(path, infoObj);
          return infoObj;
        }
      } catch (e) {
        console.warn(`[DB] getCompanyInfo network error for ${companyId}:`, e.message);
      }
    }

    const cached = await LocalStorageDBService.getCache(path);
    if (cached) console.log(`[DB] 📴 Loaded cached company info for ${companyId}`);
    return cached;
  }

  /**
   * Update company info fields.
   * @param {string} companyId
   * @param {Object} data
   * @returns {Promise<void>}
   */
  static async updateCompanyInfo(companyId, data) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    // Map fields for informacion_local
    const mappedData = {};
    if (data.name !== undefined) mappedData.nombre = data.name;
    if (data.ownerId !== undefined) mappedData.propietario = data.ownerId;
    if (data.phone !== undefined) mappedData.telefono = data.phone;
    if (data.address !== undefined) mappedData.direccion = data.address;
    if (data.email !== undefined) mappedData.correo = data.email;

    const infoRef = ref(db, `${companyId}/informacion_local`);
    await update(infoRef, { ...mappedData, ...data, updatedAt: serverTimestamp(), updatedAtLocal: TimeService.timestamp() });
    console.log(`[DB] ✅ Company info updated: /${companyId}/informacion_local`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // THEME & VISUAL PREFERENCES (ISOLATED BY USER ROLE & BUSINESS)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Reads programmer preferences from programmer_preferences/{programmerId}.
   * @param {string} programmerId
   * @returns {Promise<Object|null>}
   */
  static async getProgrammerPreferences(programmerId) {
    if (!programmerId) return null;
    const path = `programmer_preferences/${programmerId}`;
    if (navigator.onLine && db) {
      try {
        const prefRef = ref(db, path);
        const snap = await Promise.race([
          get(prefRef),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
        ]);
        if (snap.exists()) {
          const val = snap.val();
          await LocalStorageDBService.setCache(path, val);
          return val;
        }
      } catch (err) {
        console.warn('[FirestoreService] getProgrammerPreferences failed, using cache:', err.message);
      }
    }
    return LocalStorageDBService.getCache(path);
  }

  /**
   * Updates programmer preferences at programmer_preferences/{programmerId}.
   * @param {string} programmerId
   * @param {Object} data
   * @returns {Promise<void>}
   */
  static async updateProgrammerPreferences(programmerId, data = {}) {
    if (!db || !programmerId) throw new Error('[FirestoreService] Database not initialized or invalid programmerId.');
    const clean = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined)
    );
    const prefRef = ref(db, `programmer_preferences/${programmerId}`);
    await update(prefRef, { ...clean, updatedAt: serverTimestamp(), updatedAtLocal: TimeService.timestamp() });
    console.log(`[DB] ✅ Programmer preferences updated: programmer_preferences/${programmerId}`);
  }

  /**
   * Listens for changes on programmer_preferences/{programmerId}.
   * @param {string} programmerId
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  static subscribeProgrammerPreferences(programmerId, callback) {
    if (!db || !programmerId) return () => {};
    const prefRef = ref(db, `programmer_preferences/${programmerId}`);
    return onValue(prefRef, (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() : null);
    });
  }

  /**
   * Reads business settings (visual appearance & identity) from business_settings/{businessId}.
   * @param {string} businessId
   * @returns {Promise<Object|null>}
   */
  static async getBusinessSettings(businessId) {
    if (!businessId) return null;
    const path = `business_settings/${businessId}`;
    if (navigator.onLine && db) {
      try {
        const settingsRef = ref(db, path);
        const snap = await Promise.race([
          get(settingsRef),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
        ]);
        if (snap.exists()) {
          const val = snap.val();
          await LocalStorageDBService.setCache(path, val);
          return val;
        }
      } catch (err) {
        console.warn('[FirestoreService] getBusinessSettings failed, using cache:', err.message);
      }
    }
    return LocalStorageDBService.getCache(path);
  }

  /**
   * Updates business settings at business_settings/{businessId}.
   * @param {string} businessId
   * @param {Object} data
   * @returns {Promise<void>}
   */
  static async updateBusinessSettings(businessId, data = {}) {
    if (!db || !businessId) throw new Error('[FirestoreService] Database not initialized or invalid businessId.');
    const clean = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined)
    );
    const settingsRef = ref(db, `business_settings/${businessId}`);
    await update(settingsRef, { ...clean, updatedAt: serverTimestamp(), updatedAtLocal: TimeService.timestamp() });
    console.log(`[DB] ✅ Business settings updated: business_settings/${businessId}`);
  }

  /**
   * Listens for changes on business_settings/{businessId}.
   * @param {string} businessId
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  static subscribeBusinessSettings(businessId, callback) {
    if (!db || !businessId) return () => {};
    const settingsRef = ref(db, `business_settings/${businessId}`);
    return onValue(settingsRef, (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() : null);
    });
  }

  /**
   * Backwards compatible helper for fetching config.
   * Reads from global/saas_config if companyId === 'global', or business_settings/{companyId} otherwise.
   * @param {string} companyId
   * @returns {Promise<Object|null>}
   */
  static async getCompanyConfig(companyId = 'global') {
    if (companyId === 'global') {
      return this.getSaaSConfig();
    }
    return this.getBusinessSettings(companyId);
  }

  /**
   * Backwards compatible helper for updating config.
   * Updates global/saas_config if companyId === 'global', or business_settings/{companyId} otherwise.
   * @param {string} companyId
   * @param {Object} data
   * @returns {Promise<void>}
   */
  static async updateCompanyConfig(companyId = 'global', data = {}) {
    if (companyId === 'global') {
      return this.updateSaaSConfig(data);
    }
    return this.updateBusinessSettings(companyId, data);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WAITER ASSIGNMENT — Round-Robin helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get all active waiter employees for a company.
   * "Active" = role is WAITER and they have logged in within the last 12 hours,
   * OR their isActive flag is explicitly true.
   * @param {string} companyId
   * @returns {Promise<Array<{uid, displayName, email, role}>>}
   */
  static async getActiveWaiters(companyId) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');
    const empRef = ref(db, `${companyId}/employees`);
    const snapshot = await get(empRef);
    if (!snapshot.exists()) return [];

    const results = [];
    const cutoff = Date.now() - (12 * 60 * 60 * 1000); // 12 hours ago
    snapshot.forEach(snap => {
      if (snap.key === '.init') return;
      const val = snap.val();
      const canTakeOrders = val.permissions?.tomar_pedidos === true || (val.role === 'WAITER' && (!val.permissions || val.permissions.tomar_pedidos !== false));
      if (!canTakeOrders) return;
      // Include if explicitly active, or if last login was within 12h
      const lastLogin = val.lastLoginAt || 0;
      const isActive = val.isActive === true || lastLogin > cutoff;
      if (isActive) {
        results.push({ uid: snap.key, id: snap.key, ...val });
      }
    });

    // Sort by uid to keep consistent ordering across all clients
    results.sort((a, b) => a.uid.localeCompare(b.uid));
    return results;
  }

  /**
   * Read the current Round-Robin cursor index from company config.
   * @param {string} companyId
   * @returns {Promise<number>}
   */
  static async getRoundRobinIndex(companyId) {
    if (!db) return 0;
    try {
      const idxRef = ref(db, `${companyId}/config/waiterRoundRobinIndex`);
      const snap = await get(idxRef);
      return snap.exists() ? Number(snap.val()) : 0;
    } catch (e) {
      console.warn('[DB] getRoundRobinIndex error:', e.message);
      return 0;
    }
  }

  /**
   * Persist the Round-Robin cursor index into company config.
   * @param {string} companyId
   * @param {number} index
   * @returns {Promise<void>}
   */
  static async setRoundRobinIndex(companyId, index) {
    if (!db) return;
    try {
      const idxRef = ref(db, `${companyId}/config/waiterRoundRobinIndex`);
      await set(idxRef, index);
    } catch (e) {
      console.warn('[DB] setRoundRobinIndex error:', e.message);
    }
  }

  /**
   * Alias for listAllCompanies
   */
  static async getCompanies() {
    return this.listAllCompanies();
  }

  /**
   * Alias for listAllCompanies
   */
  static async getAllCompanies() {
    return this.listAllCompanies();
  }

  /**
   * List all companies with their info sub-node.
   * @returns {Promise<Array<Object>>}
   */
  static async listAllCompanies() {
    const path = 'companies';
    if (navigator.onLine && db) {
      try {
        const companiesRef = ref(db, path);
        const snapshot = await Promise.race([
          get(companiesRef),
          new Promise((_, reject) => setTimeout(() => reject(new Error('network-timeout')), 4000))
        ]);

        if (snapshot.exists()) {
          const promises = [];
          snapshot.forEach(companySnap => {
            const companyId = companySnap.key;
            const info = companySnap.val() || {};

            const p = (async () => {
              let employeeCount = 0;
              try {
                const empSnap = await get(ref(db, `${companyId}/employees`));
                if (empSnap.exists()) {
                  employeeCount = Object.keys(empSnap.val()).filter(k => k !== '.init').length;
                }
              } catch (e) {}

              let branchCount = 0;
              try {
                const branchSnap = await get(ref(db, `${companyId}/branches`));
                if (branchSnap.exists()) {
                  branchCount = Object.keys(branchSnap.val()).filter(k => k !== '.init').length;
                }
              } catch (e) {}

              let config = {};
              try {
                const configSnap = await get(ref(db, `${companyId}/config`));
                if (configSnap.exists()) {
                  config = configSnap.val();
                }
              } catch (e) {}

              let ownerEmail = info.ownerEmail || '';
              let ownerPassword = info.ownerPassword || '';
              if (info.ownerId) {
                try {
                  const userSnap = await get(ref(db, `users/${info.ownerId}`));
                  if (userSnap.exists()) {
                    const u = userSnap.val();
                    if (u.email) ownerEmail = u.email;
                    if (u.storedPassword) ownerPassword = u.storedPassword;
                  }
                } catch (e) {}
              }

              const modules = info.modules || config.modules || {};

              return {
                id: companyId,
                name: info.name || companyId,
                businessType: info.businessType || 'Restaurante',
                plan: info.plan || 'FREE',
                status: info.status || 'ACTIVO',
                deletedAt: info.deletedAt || null,
                statusReason: info.statusReason || '',
                ownerId: info.ownerId || '',
                ownerEmail,
                ownerPassword,
                branches: branchCount || 1,
                users: employeeCount || 1,
                modules,
                config: config,
                createdAt: info.createdAt,
                updatedAt: info.updatedAt
              };
            })();
            promises.push(p);
          });

          const results = await Promise.all(promises);
          await LocalStorageDBService.setCache(path, results);
          console.log(`[DB] ✅ Listed ${results.length} companies`);
          return results;
        }
      } catch (e) {
        console.warn(`[DB] listAllCompanies network error:`, e.message);
      }
    }

    const cached = (await LocalStorageDBService.getCache(path)) || [];
    console.log(`[DB] 📴 Loaded cached companies list: ${cached.length} items`);
    return cached;
  }

  /**
   * Delete an entire company branch from RTDB.
   * @param {string} companyId
   * @returns {Promise<void>}
   */
  static async deleteCompany(companyId) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const updates = {};
    updates[`companies/${companyId}`] = null;
    updates[`${companyId}`] = null;

    const rootRef = ref(db);
    await update(rootRef, updates);
    console.log(`[DB] ✅ Company deleted: /${companyId}`);
  }

  /**
   * Update the Super Admin company registry and tenant mirrors atomically.
   * @param {string} companyId
   * @param {Object} data
   */
  static async updateCompany(companyId, data) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const localNow = TimeService.timestamp();
    const updates = {};
    Object.entries(data).forEach(([key, value]) => {
      updates[`companies/${companyId}/${key}`] = value;
    });
    updates[`companies/${companyId}/updatedAt`] = serverTimestamp();
    updates[`companies/${companyId}/updatedAtLocal`] = localNow;

    if (data.name !== undefined) {
      updates[`${companyId}/informacion_local/nombre`] = data.name;
      updates[`${companyId}/branches/main/name`] = 'Principal';
    }
    if (data.country !== undefined) {
      updates[`${companyId}/informacion_local/pais`] = data.country;
      updates[`${companyId}/branches/main/country`] = data.country;
    }
    if (data.state !== undefined) {
      updates[`${companyId}/informacion_local/estado`] = data.state;
      updates[`${companyId}/branches/main/state`] = data.state;
    }
    if (data.city !== undefined) {
      updates[`${companyId}/informacion_local/municipio`] = data.city;
      updates[`${companyId}/branches/main/city`] = data.city;
    }
    if (data.postalCode !== undefined) {
      updates[`${companyId}/informacion_local/codigoPostal`] = data.postalCode;
      updates[`${companyId}/branches/main/postalCode`] = data.postalCode;
    }
    if (data.address !== undefined) {
      updates[`${companyId}/informacion_local/direccion`] = data.address;
      updates[`${companyId}/branches/main/address`] = data.address;
    }
    if (data.businessType !== undefined) {
      updates[`${companyId}/informacion_local/businessType`] = data.businessType;
    }
    if (data.plan !== undefined) {
      updates[`${companyId}/config/plan`] = data.plan;
    }
    if (data.status !== undefined) {
      updates[`${companyId}/config/status`] = data.status;
    }
    if (data.modules !== undefined) {
      updates[`companies/${companyId}/modules`] = data.modules;
      updates[`${companyId}/config/modules`] = data.modules;
      updates[`${companyId}/informacion_local/modules`] = data.modules;
    }
    if (data.subscriptionExpiresAt !== undefined) {
      updates[`${companyId}/informacion_local/subscriptionExpiresAt`] = data.subscriptionExpiresAt;
    }
    updates[`${companyId}/informacion_local/updatedAt`] = serverTimestamp();
    updates[`${companyId}/informacion_local/updatedAtLocal`] = localNow;

    await update(ref(db), updates);
    await this.logAudit({
      action: 'COMPANY_UPDATE',
      companyId,
      description: `Empresa actualizada: ${companyId}`,
      metadata: data
    });
    console.log(`[DB] ✅ Company registry updated: /companies/${companyId}`);
  }

  static async setCompanyLifecycle(companyId, status, reason = '') {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const localNow = TimeService.timestamp();
    const deletedAt = status === 'ELIMINADO' ? serverTimestamp() : null;
    const deletedAtLocal = status === 'ELIMINADO' ? localNow : null;
    const updates = {};

    updates[`companies/${companyId}/status`] = status;
    updates[`companies/${companyId}/statusReason`] = reason;
    updates[`companies/${companyId}/updatedAt`] = serverTimestamp();
    updates[`companies/${companyId}/updatedAtLocal`] = localNow;
    updates[`companies/${companyId}/deletedAt`] = deletedAt;
    updates[`companies/${companyId}/deletedAtLocal`] = deletedAtLocal;
    updates[`${companyId}/config/status`] = status;
    updates[`${companyId}/config/statusReason`] = reason;
    updates[`${companyId}/config/updatedAt`] = serverTimestamp();
    updates[`${companyId}/config/updatedAtLocal`] = localNow;

    await update(ref(db), updates);
    await this.logAudit({
      action: `COMPANY_${status}`,
      companyId,
      description: `Estado de empresa cambiado a ${status}. Motivo: ${reason || 'No especificado'}`,
      metadata: { status, reason }
    });
  }

  static async permanentlyDeleteCompany(companyId, reason = '') {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    // We do NOT fetch the entire company data branch (products, sales, orders, logs) into the client,
    // as it can be extremely large and freeze the browser thread.
    // Instead, we only fetch and backup the registry metadata (SaaS settings).
    const registryData = await this.getGlobal('companies', companyId);
    const localNow = TimeService.timestamp();
    const trashId = `${companyId}_${localNow.epochMs}`;
    const updates = {};

    updates[`deleted_companies/${trashId}`] = {
      companyId,
      registry: registryData || null,
      reason,
      deletedAt: serverTimestamp(),
      deletedAtLocal: localNow
    };
    updates[`companies/${companyId}`] = null;
    updates[companyId] = null; // This deletes the entire tenant branch on the server-side efficiently

    await update(ref(db), updates);
    await this.logAudit({
      action: 'COMPANY_PERMANENT_DELETE',
      companyId,
      description: `Empresa eliminada definitivamente. Motivo: ${reason || 'No especificado'}`,
      metadata: { trashId, reason }
    });
  }

  static async logAudit({ action, companyId = 'global', description = '', metadata = {} }) {
    if (!db) return;
    const { currentUser } = GlobalStore.getState();
    const auditRef = push(ref(db, 'audit_logs'));
    await set(auditRef, {
      action,
      companyId,
      description,
      metadata,
      userId: currentUser?.uid || 'system',
      userEmail: currentUser?.email || 'system',
      createdAt: serverTimestamp(),
      createdAtLocal: TimeService.timestamp()
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SAAS GLOBAL CONFIGURATION — stored at global/saas_config
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Read the global SaaS configuration object from Firebase RTDB.
   * Stored at the path: global/saas_config
   *
   * @returns {Promise<Object|null>}
   */
  static async getSaaSConfig() {
    const path = 'global/saas_config';
    if (navigator.onLine && db) {
      try {
        const configRef = ref(db, path);
        const snap = await Promise.race([
          get(configRef),
          new Promise((_, reject) => setTimeout(() => reject(new Error('network-timeout')), 4000))
        ]);
        if (snap.exists()) {
          const val = snap.val();
          await LocalStorageDBService.setCache(path, val);
          return val;
        }
      } catch (err) {
        console.warn('[FirestoreService] getSaaSConfig failed:', err.message);
      }
    }
    return LocalStorageDBService.getCache(path);
  }

  /**
   * Write / merge fields into the global SaaS configuration object.
   * Stored at the path: global/saas_config
   *
   * @param {Object} data - Fields to merge into the config node.
   * @returns {Promise<void>}
   */
  static async updateSaaSConfig(data = {}) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');
    const configRef = ref(db, 'global/saas_config');
    // Strip undefined values to avoid Firebase errors
    const clean = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined)
    );
    const payload = { ...clean, updatedAtLocal: TimeService.timestamp() };
    await update(configRef, payload);
    await LocalStorageDBService.setCache('global/saas_config', payload);
    console.log('[FirestoreService] ✅ SaaS config updated at global/saas_config');
  }

  static async listPlans() {
    const plans = await this.queryGlobal('saas_plans');
    return plans.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  }

  /**
   * Write a service request from the public catalog into a company's RTDB branch.
   * Does NOT require authentication — publicly accessible write path.
   * @param {string} companyId
   * @param {Object} payload
   */
  static async createPublicServiceRequest(companyId, payload) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');
    const reqsRef = ref(db, `${companyId}/service_requests`);
    const newRef = push(reqsRef);
    const reqData = {
      ...payload,
      id: newRef.key,
      createdAt: serverTimestamp(),
      status: payload.status || 'PENDIENTE'
    };
    await set(newRef, reqData);
    console.log(`[DB] ✅ Public service request created: ${companyId}/service_requests/${newRef.key}`);
    return newRef.key;
  }

  static async savePlan(planId, data) {
    await this.setGlobal('saas_plans', planId, {
      ...data,
      updatedAtLocal: TimeService.timestamp()
    }, true);
    await this.logAudit({
      action: 'SAAS_PLAN_SAVE',
      companyId: 'global',
      description: `Plan SaaS guardado: ${planId}`,
      metadata: { planId, ...data }
    });
  }

  static async deletePlan(planId) {
    await this.deleteGlobal('saas_plans', planId);
    await this.logAudit({
      action: 'SAAS_PLAN_DELETE',
      companyId: 'global',
      description: `Plan SaaS eliminado: ${planId}`,
      metadata: { planId }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REAL-TIME LISTENERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to real-time changes at any RTDB path.
   *
   * @param {string} path - Absolute RTDB path (e.g. "companies/abc/orders")
   * @param {Function} callback - Called with (data: Array|Object|null) on each change
   * @returns {string} Listener ID for later cleanup with unsubscribe()
   */
  static listenToPath(path, callback) {
    const listenerId = `listener_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Immediately deliver cached data if available so views load instantly offline
    LocalStorageDBService.getCache(path).then(cached => {
      if (cached !== null && cached !== undefined) {
        console.log(`[DB] 📴 Loaded initial cached data for listener: ${path}`);
        callback(cached);
      }
    }).catch(() => {});

    if (!db || !navigator.onLine) {
      console.log(`[DB] 📴 Device is offline, skipping live listener registration for ${path}`);
      return listenerId;
    }

    const pathRef = ref(db, path);

    const handler = (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        let result = data;
        if (typeof data === 'object' && !Array.isArray(data)) {
          const arr = [];
          for (const [key, val] of Object.entries(data)) {
            if (key === '.init') continue;
            if (typeof val === 'object' && val !== null) {
              arr.push({ id: key, ...val });
            }
          }
          result = arr;
        }
        LocalStorageDBService.setCache(path, result);
        callback(result);
      } else {
        LocalStorageDBService.setCache(path, []);
        callback([]);
      }
    };

    onValue(pathRef, handler);

    this._listeners.set(listenerId, { pathRef, handler });
    console.log(`[DB] 👂 Listener attached: ${path} (${listenerId})`);
    return listenerId;
  }

  /**
   * Subscribe to raw changes (retains object shape, no list conversion).
   * Useful for single config nodes.
   *
   * @param {string} path
   * @param {Function} callback
   * @returns {string} Listener ID
   */
  static listenToPathRaw(path, callback) {
    const listenerId = `listener_raw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    LocalStorageDBService.getCache(path).then(cached => {
      if (cached !== null && cached !== undefined) {
        callback(cached);
      }
    }).catch(() => {});

    if (!db || !navigator.onLine) {
      return listenerId;
    }

    const pathRef = ref(db, path);

    const handler = (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        LocalStorageDBService.setCache(path, val);
        callback(val);
      } else {
        LocalStorageDBService.setCache(path, null);
        callback(null);
      }
    };

    onValue(pathRef, handler);
    this._listeners.set(listenerId, { pathRef, handler });
    console.log(`[DB] 👂 Raw listener attached: ${path} (${listenerId})`);
    return listenerId;
  }

  /**
   * Subscribe to real-time changes on a tenant path (auto-resolves companyId).
   *
   * @param {string} collectionName - e.g. "orders", "employees"
   * @param {Function} callback
   * @returns {string} Listener ID
   */
  static listenToTenant(collectionName, callback) {
    const path = this._getTenantPath(collectionName);
    return this.listenToPath(path, callback);
  }

  /**
   * Unsubscribe a previously attached listener.
   * @param {string} listenerId
   */
  static unsubscribe(listenerId) {
    const entry = this._listeners.get(listenerId);
    if (entry) {
      off(entry.pathRef, 'value', entry.handler);
      this._listeners.delete(listenerId);
      console.log(`[DB] 🔇 Listener detached: ${listenerId}`);
    }
  }

  /**
   * Unsubscribe ALL active listeners.
   */
  static unsubscribeAll() {
    for (const [id] of this._listeners) {
      this.unsubscribe(id);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERIC PATH operations — for arbitrary RTDB reads/writes
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Read data at any arbitrary RTDB path.
   * @param {string} path
   * @returns {Promise<Object|null>}
   */
  static async readPath(path) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const pathRef = ref(db, path);
    const snap = await get(pathRef);
    return snap.exists() ? snap.val() : null;
  }

  /**
   * Write data at any arbitrary RTDB path (overwrites).
   * @param {string} path
   * @param {Object} data
   * @returns {Promise<void>}
   */
  static async writePath(path, data) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const pathRef = ref(db, path);
    await set(pathRef, data);
    console.log(`[DB] ✅ Write ${path}`);
  }

  /**
   * Read data at any arbitrary RTDB path (one-time fetch, no auth required).
   * Used for public QR token resolution and similar unauthenticated reads.
   * @param {string} path - Absolute RTDB path
   * @returns {Promise<Object|null>} The value at that path, or null if not found
   */
  static async readPath(path) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const pathRef = ref(db, path);
    const snap = await get(pathRef);
    return snap.exists() ? snap.val() : null;
  }

  /**
   * Update data at any arbitrary RTDB path (merge, non-destructive).
   * @param {string} path
   * @param {Object} data
   * @returns {Promise<void>}
   */
  static async updatePath(path, data) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const pathRef = ref(db, path);
    await update(pathRef, data);
    console.log(`[DB] ✅ Update ${path}`);
  }

  /**
   * Perform an atomic multi-path update at the RTDB root.
   * @param {Object} updates - { "path/to/a": value, "path/to/b": value }
   * @returns {Promise<void>}
   */
  static async atomicUpdate(updates) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const rootRef = ref(db);
    await update(rootRef, updates);
    console.log(`[DB] ✅ Atomic update (${Object.keys(updates).length} paths)`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  static _applyFilters(results, filters = []) {
    for (const f of filters) {
      results = results.filter(item => {
        const itemVal = item[f.field];
        if (f.op === '==') return itemVal === f.value;
        if (f.op === '!=') return itemVal !== f.value;
        if (f.op === '>') return itemVal > f.value;
        if (f.op === '<') return itemVal < f.value;
        if (f.op === '>=') return itemVal >= f.value;
        if (f.op === '<=') return itemVal <= f.value;
        return true;
      });
    }
    return results;
  }

  /** @private */
  static _applySort(results, sortBy) {
    if (!sortBy) return results;
    const field = sortBy.field;
    const isAsc = sortBy.direction !== 'desc';
    return results.sort((a, b) => {
      if (a[field] < b[field]) return isAsc ? -1 : 1;
      if (a[field] > b[field]) return isAsc ? 1 : -1;
      return 0;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INVOICE OCR OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Save a newly imported OCR purchase invoice.
   * @param {Object} invoiceData 
   * @returns {Promise<string>} Invoice ID
   */
  static async saveInvoiceImport(invoiceData) {
    const customId = invoiceData.id || `INV-${Date.now()}`;
    return await this.create('invoices', invoiceData, customId);
  }

  /**
   * Retrieve invoice import history for current tenant.
   * @returns {Promise<Array>}
   */
  static async getInvoicesHistory() {
    return await this.query('invoices');
  }

  /**
   * Update invoice import status.
   * @param {string} invoiceId 
   * @param {string} status 
   * @param {Object} [details] 
   */
  static async updateInvoiceStatus(invoiceId, status, details = {}) {
    return await this.update('invoices', invoiceId, {
      status,
      ...details,
      updatedAtLocal: TimeService.timestamp()
    });
  }
}
