/**
 * @file firestore.service.js
 * @description General generic Firestore CRUD service layer enforcing multi-tenant isolation.
 */

import { GlobalStore } from '../core/state.js';

export class FirestoreService {
  /**
   * Helper to ensure all operations append the active company tenant ID.
   * @private
   */
  static _getTenantPath(collection) {
    const { currentUser } = GlobalStore.getState();
    if (!currentUser || !currentUser.companyId) {
      throw new Error('Tenant context missing. Unable to perform Firestore query.');
    }
    // E.g. companies/company-test/orders
    return `companies/${currentUser.companyId}/${collection}`;
  }

  /**
   * Create document in tenant collection.
   * @param {string} collection 
   * @param {Object} data 
   * @param {string} [customId] 
   */
  static async create(collection, data, customId = null) {
    const path = this._getTenantPath(collection);
    console.log(`[FirestoreService] Creating in ${path}`, { data, customId });
    // Mock response. Real firebase client SDK call in Phase 4.
    return { id: customId || 'mock-doc-id', ...data, createdAt: new Date() };
  }

  /**
   * Get document by ID in tenant collection.
   * @param {string} collection 
   * @param {string} id 
   */
  static async getById(collection, id) {
    const path = this._getTenantPath(collection);
    console.log(`[FirestoreService] Get from ${path}/${id}`);
    return null;
  }

  /**
   * Update document in tenant collection.
   * @param {string} collection 
   * @param {string} id 
   * @param {Object} data 
   */
  static async update(collection, id, data) {
    const path = this._getTenantPath(collection);
    console.log(`[FirestoreService] Updating ${path}/${id}`, data);
    return true;
  }

  /**
   * Delete document in tenant collection.
   * @param {string} collection 
   * @param {string} id 
   */
  static async delete(collection, id) {
    const path = this._getTenantPath(collection);
    console.log(`[FirestoreService] Deleting ${path}/${id}`);
    return true;
  }

  /**
   * Query records inside a tenant collection with optional filters.
   * @param {string} collection 
   * @param {Array} [filters] 
   */
  static async query(collection, filters = []) {
    const path = this._getTenantPath(collection);
    console.log(`[FirestoreService] Querying ${path} with filters:`, filters);
    return [];
  }
}
