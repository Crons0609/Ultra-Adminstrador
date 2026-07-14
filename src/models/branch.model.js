/**
 * @file branch.model.js
 * @description Model definition representing a Restaurant Branch/Location.
 */

export class Branch {
  /**
   * @param {Object} data 
   * @param {string} data.id 
   * @param {string} data.name 
   * @param {string} data.address 
   * @param {string} [data.phone] 
   * @param {string} data.companyId 
   */
  constructor({ id, name, address, phone = '', companyId }) {
    if (!id) throw new Error('Branch validation: ID is required');
    if (!name) throw new Error('Branch validation: Name is required');
    if (!companyId) throw new Error('Branch validation: CompanyId is required');

    this.id = id;
    this.name = name;
    this.address = address;
    this.phone = phone;
    this.companyId = companyId;
  }

  static fromFirestore(docSnapshot) {
    const data = docSnapshot.data();
    return new Branch({
      id: docSnapshot.id,
      name: data.name,
      address: data.address,
      phone: data.phone,
      companyId: data.companyId
    });
  }

  toFirestore() {
    return {
      name: this.name,
      address: this.address,
      phone: this.phone,
      companyId: this.companyId
    };
  }
}
