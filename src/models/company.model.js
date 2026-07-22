/**
 * @file company.model.js
 * @description Model definition representing Tenant Restaurants/Companies.
 */

export class Company {
  /**
   * @param {Object} data 
   * @param {string} data.id 
   * @param {string} data.name 
   * @param {string} [data.logo] 
   * @param {string} data.plan - 'FREE' | 'BASIC' | 'PREMIUM'
   * @param {string} data.status - 'ACTIVE' | 'SUSPENDED'
   * @param {Object} [data.config] - Customized features flags per tenant
   */
  constructor({ id, name, logo = '', plan = 'BASIC', status = 'ACTIVE', config = {} }) {
    if (!id) throw new Error('Company validation: ID is required');
    if (!name) throw new Error('Company validation: Name is required');

    this.id = id;
    this.name = name;
    this.logo = logo;
    this.plan = plan;
    this.status = status;
    
    // Default tenant feature configuration flags
    this.config = {
      enableWhatsApp: true,
      enableTelegram: true,
      enableKDS: true,
      enablePWA: true,
      customDomain: null,
      ...config
    };
  }

  static fromFirestore(docSnapshot) {
    const data = docSnapshot.data();
    return new Company({
      id: docSnapshot.id,
      name: data.name,
      logo: data.logo,
      plan: data.plan,
      status: data.status,
      config: data.config
    });
  }

  toFirestore() {
    return {
      name: this.name,
      logo: this.logo,
      plan: this.plan,
      status: this.status,
      config: this.config
    };
  }
}
