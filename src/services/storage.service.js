/**
 * @file storage.service.js
 * @description Uploads product assets, invoice documents and company logos to scoped folders.
 */

import { GlobalStore } from '../core/state.js';

export class StorageService {
  /**
   * Upload a file to Firebase Storage under the tenant namespace.
   * @param {File} file - Browser File object
   * @param {string} folder - E.g. 'products', 'logos'
   * @returns {Promise<string>} Download URL
   */
  static async uploadFile(file, folder) {
    const { currentUser } = GlobalStore.getState();
    if (!currentUser || !currentUser.companyId) {
      throw new Error('Storage Error: Tenant context missing.');
    }

    const path = `companies/${currentUser.companyId}/${folder}/${Date.now()}_${file.name}`;
    console.log(`[StorageService] Uploading file to path: ${path}`);
    
    // Simulate upload delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Return dummy URL
    return `https://firebasestorage.googleapis.com/v0/b/mock-bucket/o/${encodeURIComponent(path)}`;
  }
}
