/**
 * @file data-prefetch.service.js
 * @description Background pre-fetcher for user authorized modules and company data.
 * Ensures all essential company collections are downloaded and cached in IndexedDB
 * whenever the device is online, guaranteeing immediate availability when offline.
 */

import { FirestoreService } from './firestore.service.js';
import { LocalStorageDBService } from './local-storage-db.service.js';
import { GlobalStore } from '../core/state.js';

export class DataPrefetchService {
  static isPrefetching = false;

  /**
   * Triggers background prefetching for the currently active company and user session.
   * Runs asynchronously without blocking the UI thread.
   */
  static async prefetchCompanyData() {
    if (this.isPrefetching || !navigator.onLine) return;

    const { currentUser, currentCompany } = GlobalStore.getState();
    if (!currentUser || !currentUser.companyId || currentUser.companyId === 'global') return;

    this.isPrefetching = true;
    const companyId = currentUser.companyId;

    console.log(`[DataPrefetch] 🔄 Starting background prefetch for company "${companyId}"...`);

    const collectionsToPrefetch = [
      'products',
      'categories',
      'customers',
      'suppliers',
      'employees',
      'orders',
      'invoices',
      'expenses',
      'purchases',
      'inventory',
      'ingredients',
      'cash-registers',
      'settings',
      'qr-codes',
      'vehicles',
      'rentals',
      'appointments',
      'service-requests',
      'promotions',
      'arqueos'
    ];

    const runChunk = async (index) => {
      if (index >= collectionsToPrefetch.length) {
        this.isPrefetching = false;
        await LocalStorageDBService.setLastSyncTime(`${companyId}/full_prefetch`);
        console.log(`[DataPrefetch] ✅ Background prefetch complete for "${companyId}". All collections cached in IndexedDB.`);
        return;
      }

      const col = collectionsToPrefetch[index];
      try {
        await FirestoreService.query(col);
      } catch (err) {
        console.warn(`[DataPrefetch] Warning prefetching collection "${col}":`, err.message);
      }

      // Schedule next chunk using requestIdleCallback or setTimeout
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => runChunk(index + 1));
      } else {
        setTimeout(() => runChunk(index + 1), 100);
      }
    };

    // Cache company metadata
    if (currentCompany) {
      await LocalStorageDBService.setCache(`companies/${companyId}`, currentCompany);
    }

    runChunk(0);
  }

  /**
   * Prefetches specific database collections for a targeted module in advance (e.g. on sidebar hover).
   * @param {string} moduleId - e.g. 'inventory', 'products', 'employees', 'finance', 'branches', 'expenses'
   */
  static prefetchModuleData(moduleId) {
    if (!navigator.onLine || !moduleId) return;
    const { currentUser } = GlobalStore.getState();
    if (!currentUser || !currentUser.companyId || currentUser.companyId === 'global') return;

    const moduleMap = {
      inventory: ['products', 'categories', 'inventory', 'ingredients'],
      products: ['products', 'categories'],
      employees: ['employees'],
      finance: ['expenses', 'invoices', 'purchases'],
      expenses: ['expenses'],
      branches: ['branches'],
      warehouse: ['inventory', 'products'],
      customers: ['customers'],
      suppliers: ['suppliers'],
      vehicles: ['vehicles'],
      rentals: ['rentals'],
      appointments: ['appointments'],
      reports: ['orders', 'invoices', 'expenses'],
      pos: ['products', 'categories', 'orders'],
      tables: ['orders'],
      kds: ['orders']
    };

    const cols = moduleMap[moduleId];
    if (cols && Array.isArray(cols)) {
      cols.forEach(col => {
        FirestoreService.query(col).catch(() => {});
      });
    }
  }
}
