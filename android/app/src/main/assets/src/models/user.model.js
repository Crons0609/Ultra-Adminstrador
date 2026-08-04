/**
 * @file user.model.js
 * @description Model definition and parser for application Users.
 */

import { isValidEmail } from '../utils/validators.js';

export class User {
  /**
   * @param {Object} data 
   * @param {string} data.uid 
   * @param {string} data.email 
   * @param {string} data.displayName 
   * @param {string} data.role 
   * @param {string} data.companyId 
   * @param {Array<string>} [data.branchIds] 
   * @param {boolean} [data.isActive] 
   */
  constructor({ uid, email, displayName, role, companyId, branchIds = [], isActive = true }) {
    if (!uid) throw new Error('User validation: UID is required');
    if (!isValidEmail(email)) throw new Error('User validation: Valid email is required');
    if (!role) throw new Error('User validation: Role is required');
    if (!companyId) throw new Error('User validation: CompanyId is required');

    this.uid = uid;
    this.email = email;
    this.displayName = displayName || 'Usuario';
    this.role = role;
    this.companyId = companyId;
    this.branchIds = branchIds;
    this.isActive = isActive;
  }

  /**
   * Parse Firestore database document snapshot to User object.
   * @param {Object} docSnapshot 
   * @returns {User}
   */
  static fromFirestore(docSnapshot) {
    const data = docSnapshot.data();
    return new User({
      uid: docSnapshot.id,
      email: data.email,
      displayName: data.displayName,
      role: data.role,
      companyId: data.companyId,
      branchIds: data.branchIds,
      isActive: data.isActive
    });
  }

  /**
   * Convert User instance back to a plain object matching the firestore document schema.
   */
  toFirestore() {
    return {
      email: this.email,
      displayName: this.displayName,
      role: this.role,
      companyId: this.companyId,
      branchIds: this.branchIds,
      isActive: this.isActive
    };
  }
}
