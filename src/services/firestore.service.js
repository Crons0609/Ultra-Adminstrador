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
    return `companies/${currentUser.companyId}/${collectionName}`;
  }

  /**
   * Create a document in the tenant collection.
   * @param {string} collectionName
   * @param {Object} data
   * @param {string|null} [customId]
   * @returns {Promise<string>} The document ID
   */
  static async create(collectionName, data, customId = null) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const path = this._getTenantPath(collectionName);
    const payload = { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };

    if (customId) {
      const docRef = ref(db, `${path}/${customId}`);
      await set(docRef, payload);
      console.log(`[DB] ✅ Created ${path}/${customId}`);
      return customId;
    } else {
      const listRef = ref(db, path);
      const newDocRef = push(listRef);
      await set(newDocRef, payload);
      console.log(`[DB] ✅ Created ${path}/${newDocRef.key}`);
      return newDocRef.key;
    }
  }

  /**
   * Get a document by ID from the tenant collection.
   * @param {string} collectionName
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async getById(collectionName, id) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const path = this._getTenantPath(collectionName);
    const docRef = ref(db, `${path}/${id}`);
    const snap = await get(docRef);

    if (!snap.exists()) {
      console.warn(`[DB] Document not found: ${path}/${id}`);
      return null;
    }

    return { id: snap.key, ...snap.val() };
  }

  /**
   * Update specific fields in a tenant document (non-destructive merge).
   * @param {string} collectionName
   * @param {string} id
   * @param {Object} data
   * @returns {Promise<void>}
   */
  static async update(collectionName, id, data) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const path = this._getTenantPath(collectionName);
    const docRef = ref(db, `${path}/${id}`);
    await update(docRef, { ...data, updatedAt: serverTimestamp() });
    console.log(`[DB] ✅ Updated ${path}/${id}`);
  }

  /**
   * Delete a document from the tenant collection.
   * @param {string} collectionName
   * @param {string} id
   * @returns {Promise<void>}
   */
  static async delete(collectionName, id) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const path = this._getTenantPath(collectionName);
    const docRef = ref(db, `${path}/${id}`);
    await remove(docRef);
    console.log(`[DB] ✅ Deleted ${path}/${id}`);
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
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const path = this._getTenantPath(collectionName);
    const colRef = ref(db, path);
    const snapshot = await get(colRef);

    if (!snapshot.exists()) return [];

    let results = [];
    snapshot.forEach(snap => {
      results.push({ id: snap.key, ...snap.val() });
    });

    results = this._applyFilters(results, filters);
    results = this._applySort(results, sortBy);
    if (limitCount) results = results.slice(0, limitCount);

    console.log(`[DB] ✅ Query ${path} → ${results.length} docs`);
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
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const docRef = ref(db, `${collectionName}/${id}`);
    if (merge) {
      await update(docRef, { ...data, updatedAt: serverTimestamp() });
    } else {
      await set(docRef, { ...data, updatedAt: serverTimestamp() });
    }
    console.log(`[DB] ✅ Global set ${collectionName}/${id}`);
  }

  /**
   * Read a document from a root-level path.
   * @param {string} collectionName
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async getGlobal(collectionName, id) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const docRef = ref(db, `${collectionName}/${id}`);
    const snap = await get(docRef);
    return snap.exists() ? { id: snap.key, ...snap.val() } : null;
  }

  /**
   * Query all documents in a root-level collection.
   * @param {string} collectionName
   * @param {Array<{field: string, op: string, value: *}>} [filters]
   * @returns {Promise<Array<Object>>}
   */
  static async queryGlobal(collectionName, filters = []) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const colRef = ref(db, collectionName);
    const snapshot = await get(colRef);

    if (!snapshot.exists()) return [];

    let results = [];
    snapshot.forEach(snap => {
      results.push({ id: snap.key, ...snap.val() });
    });

    results = this._applyFilters(results, filters);
    return results;
  }

  /**
   * Delete a document from a root-level path.
   * @param {string} collectionName
   * @param {string} id
   * @returns {Promise<void>}
   */
  static async deleteGlobal(collectionName, id) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const docRef = ref(db, `${collectionName}/${id}`);
    await remove(docRef);
    console.log(`[DB] ✅ Global deleted ${collectionName}/${id}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPANY STRUCTURE operations — used by Programador (SUPER_ADMIN)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate a new unique company ID using push().
   * @returns {string} A Firebase push-key
   */
  static generateCompanyId() {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');
    const listRef = ref(db, 'companies');
    return push(listRef).key;
  }

  /**
   * Create a full company branch in RTDB with all sub-nodes initialized atomically.
   * This is called when the Programador registers a new business.
   *
   * Structure created:
   *   /companies/{companyId}/info/         → Company metadata
   *   /companies/{companyId}/config/       → Feature toggles + defaults
   *   /companies/{companyId}/branches/main → Default branch
   *   /companies/{companyId}/employees/    → (empty, populated when users are added)
   *   /companies/{companyId}/products/     → (empty placeholder)
   *   ... etc.
   *
   * @param {string} companyId - The unique company identifier
   * @param {Object} companyData - { name, businessType, plan, status, ownerId }
   * @param {Object} [configData] - Optional custom config overrides
   * @returns {Promise<void>}
   */
  static async createCompanyBranch(companyId, companyData, configData = {}) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const now = serverTimestamp();

    const defaultConfig = {
      enableKDS: false,
      enableWhatsApp: false,
      enableBilling: false,
      enableQR: false,
      currency: 'MXN',
      timezone: 'America/Mexico_City',
      address: '',
      phone: '',
      logo: '',
      ...configData
    };

    // Atomic multi-path update — all writes succeed or none do
    const updates = {};
    updates[`companies/${companyId}/info`] = {
      name: companyData.name,
      businessType: companyData.businessType || 'Restaurante',
      plan: companyData.plan || 'FREE',
      status: companyData.status || 'ACTIVO',
      ownerId: companyData.ownerId || '',
      createdAt: now,
      updatedAt: now
    };
    updates[`companies/${companyId}/config`] = {
      ...defaultConfig,
      updatedAt: now
    };
    updates[`companies/${companyId}/branches/main`] = {
      name: 'Principal',
      address: companyData.address || '',
      phone: companyData.phone || '',
      active: true,
      createdAt: now
    };
    // Initialize empty containers with placeholder
    updates[`companies/${companyId}/employees/.init`] = true;
    updates[`companies/${companyId}/products/.init`] = true;
    updates[`companies/${companyId}/categories/.init`] = true;
    updates[`companies/${companyId}/orders/.init`] = true;
    updates[`companies/${companyId}/customers/.init`] = true;
    updates[`companies/${companyId}/inventory/.init`] = true;
    updates[`companies/${companyId}/purchases/.init`] = true;
    updates[`companies/${companyId}/suppliers/.init`] = true;
    updates[`companies/${companyId}/cash_sessions/.init`] = true;
    updates[`companies/${companyId}/tables/.init`] = true;
    updates[`companies/${companyId}/reports/.init`] = true;
    updates[`companies/${companyId}/audit_logs/.init`] = true;

    const rootRef = ref(db);
    await update(rootRef, updates);
    console.log(`[DB] ✅ Company branch created: companies/${companyId}`);
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

    const empRef = ref(db, `companies/${companyId}/employees/${uid}`);
    await set(empRef, {
      displayName: employeeData.displayName || '',
      email: employeeData.email || '',
      role: employeeData.role || 'EMPLOYEE',
      customRole: employeeData.customRole || '',
      branchId: employeeData.branchId || 'main',
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    console.log(`[DB] ✅ Employee added: companies/${companyId}/employees/${uid}`);
  }

  /**
   * Remove an employee from a company's employees node.
   * @param {string} companyId
   * @param {string} uid
   * @returns {Promise<void>}
   */
  static async removeEmployeeFromCompany(companyId, uid) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const empRef = ref(db, `companies/${companyId}/employees/${uid}`);
    await remove(empRef);
    console.log(`[DB] ✅ Employee removed: companies/${companyId}/employees/${uid}`);
  }

  /**
   * Get all employees for a specific company.
   * @param {string} companyId
   * @returns {Promise<Array<Object>>}
   */
  static async getCompanyEmployees(companyId) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const empRef = ref(db, `companies/${companyId}/employees`);
    const snapshot = await get(empRef);

    if (!snapshot.exists()) return [];

    const results = [];
    snapshot.forEach(snap => {
      const val = snap.val();
      if (snap.key !== '.init') {
        results.push({ id: snap.key, uid: snap.key, ...val });
      }
    });
    return results;
  }

  /**
   * Get company info (the /info sub-node).
   * @param {string} companyId
   * @returns {Promise<Object|null>}
   */
  static async getCompanyInfo(companyId) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const infoRef = ref(db, `companies/${companyId}/info`);
    const snap = await get(infoRef);
    return snap.exists() ? { id: companyId, ...snap.val() } : null;
  }

  /**
   * Update company info fields.
   * @param {string} companyId
   * @param {Object} data
   * @returns {Promise<void>}
   */
  static async updateCompanyInfo(companyId, data) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const infoRef = ref(db, `companies/${companyId}/info`);
    await update(infoRef, { ...data, updatedAt: serverTimestamp() });
    console.log(`[DB] ✅ Company info updated: ${companyId}`);
  }

  /**
   * Get company config.
   * @param {string} companyId
   * @returns {Promise<Object|null>}
   */
  static async getCompanyConfig(companyId) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const configRef = ref(db, `companies/${companyId}/config`);
    const snap = await get(configRef);
    return snap.exists() ? snap.val() : null;
  }

  /**
   * Update company config fields.
   * @param {string} companyId
   * @param {Object} data
   * @returns {Promise<void>}
   */
  static async updateCompanyConfig(companyId, data) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const configRef = ref(db, `companies/${companyId}/config`);
    await update(configRef, { ...data, updatedAt: serverTimestamp() });
    console.log(`[DB] ✅ Company config updated: ${companyId}`);
  }

  /**
   * List all companies with their info sub-node.
   * @returns {Promise<Array<Object>>}
   */
  static async listAllCompanies() {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const companiesRef = ref(db, 'companies');
    const snapshot = await get(companiesRef);

    if (!snapshot.exists()) return [];

    const results = [];
    snapshot.forEach(companySnap => {
      const companyId = companySnap.key;
      const data = companySnap.val();
      const info = data.info || {};
      const config = data.config || {};

      // Count employees (exclude .init placeholder)
      let employeeCount = 0;
      if (data.employees) {
        employeeCount = Object.keys(data.employees).filter(k => k !== '.init').length;
      }

      // Count branches
      let branchCount = 0;
      if (data.branches) {
        branchCount = Object.keys(data.branches).filter(k => k !== '.init').length;
      }

      results.push({
        id: companyId,
        name: info.name || 'Sin nombre',
        businessType: info.businessType || 'Restaurante',
        plan: info.plan || 'FREE',
        status: info.status || 'ACTIVO',
        ownerId: info.ownerId || '',
        branches: branchCount,
        users: employeeCount,
        config: config,
        createdAt: info.createdAt,
        updatedAt: info.updatedAt
      });
    });

    console.log(`[DB] ✅ Listed ${results.length} companies`);
    return results;
  }

  /**
   * Delete an entire company branch from RTDB.
   * @param {string} companyId
   * @returns {Promise<void>}
   */
  static async deleteCompany(companyId) {
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const companyRef = ref(db, `companies/${companyId}`);
    await remove(companyRef);
    console.log(`[DB] ✅ Company deleted: ${companyId}`);
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
    if (!db) throw new Error('[FirestoreService] Database not initialized.');

    const pathRef = ref(db, path);
    const listenerId = `listener_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const handler = (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        // Convert object children to array with id
        if (typeof data === 'object' && !Array.isArray(data)) {
          const arr = [];
          for (const [key, val] of Object.entries(data)) {
            if (key === '.init') continue; // skip placeholders
            if (typeof val === 'object' && val !== null) {
              arr.push({ id: key, ...val });
            }
          }
          callback(arr);
        } else {
          callback(data);
        }
      } else {
        callback([]);
      }
    };

    onValue(pathRef, handler);

    // Store for cleanup
    this._listeners.set(listenerId, { pathRef, handler });
    console.log(`[DB] 👂 Listener attached: ${path} (${listenerId})`);
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
}
