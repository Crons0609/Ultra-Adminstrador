/**
 * @file conflict-resolver.service.js
 * @description Conflict resolution engine for Offline-First synchronization.
 *
 * Conflict Strategies:
 * - Append-only for Critical Financial Data: sales, orders, payments, cash registers, expenses, purchases.
 *   Prevents overwriting transactions; preserves all historical entries.
 * - Last-Write-Wins for Standard Entities: products, categories, customers, suppliers, settings.
 *   Merges fields, preserving newer timestamps.
 */

import { db } from '../config/firebase.config.js';
import { ref, get, set } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';

const CRITICAL_COLLECTIONS = [
  'orders',
  'invoices',
  'sales',
  'payments',
  'cash-registers',
  'expenses',
  'purchases',
  'arqueos'
];

export class ConflictResolverService {

  /**
   * Evaluates and resolves potential conflicts between local offline write and remote RTDB node.
   *
   * @param {string} path - Target path in RTDB (e.g. "companyId/orders/order123")
   * @param {Object} localData - The offline-queued data payload
   * @param {'set'|'update'|'push'|'remove'} operation - Write operation type
   * @returns {Promise<{action: 'proceed'|'skip'|'append', resolvedData: Object, path: string}>}
   */
  static async resolve(path, localData, operation) {
    if (!db || operation === 'remove' || !localData) {
      return { action: 'proceed', resolvedData: localData, path };
    }

    try {
      const nodeRef = ref(db, path);
      const snap = await get(nodeRef);

      if (!snap.exists()) {
        // Node does not exist remotely yet — proceed cleanly
        return { action: 'proceed', resolvedData: localData, path };
      }

      const remoteData = snap.val();

      // Check Idempotency Key: if already synced, skip!
      if (
        localData._idempotencyKey &&
        remoteData._idempotencyKey === localData._idempotencyKey
      ) {
        console.log(`[ConflictResolver] 🔁 Operation already executed remotely (idempotency key: ${localData._idempotencyKey}). Skipping.`);
        return { action: 'skip', resolvedData: remoteData, path };
      }

      const localTime = localData._syncVersion || localData.updatedAtLocal || 0;
      const remoteTime = remoteData._syncVersion || remoteData.updatedAt || 0;

      // Determine collection type from path
      const pathParts = path.split('/');
      const collectionName = pathParts.length >= 2 ? pathParts[1] : '';
      const isCritical = CRITICAL_COLLECTIONS.includes(collectionName);

      if (isCritical) {
        console.warn(`[ConflictResolver] ⚠️ Conflict in critical collection "${collectionName}" @ ${path}. Applying append strategy to preserve transaction.`);
        // For critical financial records, generate a new unique ID to avoid overwriting remote record
        const newPath = `${pathParts.slice(0, -1).join('/')}/${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const resolvedData = {
          ...localData,
          id: newPath.split('/').pop(),
          _conflictResolution: 'APPENDED',
          _originalConflictingPath: path
        };
        return { action: 'append', resolvedData, path: newPath };
      } else {
        // Standard entity — Last Write Wins with field merge
        if (remoteTime > localTime) {
          console.log(`[ConflictResolver] 🔀 Remote record is newer. Merging local fields onto remote @ ${path}`);
          const mergedData = {
            ...remoteData,
            ...localData,
            _syncVersion: Date.now(),
            _conflictResolution: 'LAST_WRITE_WINS_MERGED'
          };
          return { action: 'proceed', resolvedData: mergedData, path };
        }
      }
    } catch (err) {
      console.warn('[ConflictResolver] Check failed, proceeding with write:', err.message);
    }

    return { action: 'proceed', resolvedData: localData, path };
  }
}
