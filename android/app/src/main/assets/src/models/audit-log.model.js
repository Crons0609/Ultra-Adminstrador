/**
 * @file audit-log.model.js
 * @description Model definition representing a security audit log/action history.
 */

export class AuditLog {
  /**
   * @param {Object} data 
   * @param {string} data.id 
   * @param {string} data.userId 
   * @param {string} data.userEmail 
   * @param {string} data.action - Action identifier, e.g., 'ORDER_CANCEL', 'PAYMENT_PROCESS'
   * @param {string} data.description - Plain english details
   * @param {string} data.companyId 
   * @param {string} [data.ipAddress] 
   * @param {Date} [data.createdAt] 
   */
  constructor({ id, userId, userEmail, action, description, companyId, ipAddress = '', createdAt = new Date() }) {
    if (!id) throw new Error('AuditLog validation: ID is required');
    if (!userId) throw new Error('AuditLog validation: UserID is required');
    if (!action) throw new Error('AuditLog validation: Action is required');
    if (!companyId) throw new Error('AuditLog validation: Company ID is required');

    this.id = id;
    this.userId = userId;
    this.userEmail = userEmail;
    this.action = action;
    this.description = description;
    this.companyId = companyId;
    this.ipAddress = ipAddress;
    this.createdAt = createdAt;
  }

  static fromFirestore(docSnapshot) {
    const data = docSnapshot.data();
    return new AuditLog({
      id: docSnapshot.id,
      userId: data.userId,
      userEmail: data.userEmail,
      action: data.action,
      description: data.description,
      companyId: data.companyId,
      ipAddress: data.ipAddress,
      createdAt: data.createdAt ? new Date(data.createdAt.seconds * 1000) : new Date()
    });
  }

  toFirestore() {
    return {
      userId: this.userId,
      userEmail: this.userEmail,
      action: this.action,
      description: this.description,
      companyId: this.companyId,
      ipAddress: this.ipAddress,
      createdAt: this.createdAt
    };
  }
}
