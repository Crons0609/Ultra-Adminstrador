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
  constructor({
    id,
    name,
    logo = '',
    plan = 'BASIC',
    status = 'ACTIVE',
    country = 'Nicaragua',
    state = '',
    city = '',
    postalCode = '',
    address = '',
    modules = {},
    config = {}
  }) {
    if (!id) throw new Error('Company validation: ID is required');
    if (!name) throw new Error('Company validation: Name is required');

    this.id = id;
    this.name = name;
    this.logo = logo;
    this.plan = plan;
    this.status = status;
    this.country = country || 'Nicaragua';
    this.state = state || '';
    this.city = city || '';
    this.postalCode = postalCode || '';
    this.address = address || '';
    this.modules = modules || {};
    
    // Default tenant feature configuration flags
    this.config = {
      enableWhatsApp: true,
      enableTelegram: true,
      enableKDS: true,
      enablePWA: true,
      customDomain: null,
      modules: this.modules,
      ...config
    };
  }

  static fromFirestore(docSnapshot) {
    const data = docSnapshot.data ? docSnapshot.data() : docSnapshot;
    return new Company({
      id: docSnapshot.id || data.id,
      name: data.name,
      logo: data.logo,
      plan: data.plan,
      status: data.status,
      country: data.country || 'Nicaragua',
      state: data.state || '',
      city: data.city || '',
      postalCode: data.postalCode || '',
      address: data.address || '',
      modules: data.modules || data.config?.modules || {},
      config: data.config
    });
  }

  toFirestore() {
    return {
      name: this.name,
      logo: this.logo,
      plan: this.plan,
      status: this.status,
      country: this.country,
      state: this.state,
      city: this.city,
      postalCode: this.postalCode,
      address: this.address,
      modules: this.modules,
      config: {
        ...this.config,
        modules: this.modules
      }
    };
  }
}

