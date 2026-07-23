/**
 * @file waiter-assignment.service.js
 * @description Automatic Round-Robin waiter assignment logic.
 *
 * When a table receives its first active order and has no assigned waiter,
 * this service picks the next waiter in rotation and writes the assignment
 * to Firebase so all connected clients update in real-time.
 *
 * Round-Robin cursor is persisted in Firebase:
 *   /{companyId}/config/waiterRoundRobinIndex
 *
 * Table assignment is written to:
 *   /{companyId}/tables/{tableId}/assignedWaiterId
 *   /{companyId}/tables/{tableId}/assignedWaiterName
 *   /{companyId}/tables/{tableId}/occupiedSince  (if not already set)
 */

import { FirestoreService } from './firestore.service.js';
import { GlobalStore } from '../core/state.js';

export class WaiterAssignmentService {

  /**
   * Returns the companyId from the global store.
   * @private
   */
  static _getCompanyId() {
    const { currentUser } = GlobalStore.getState();
    return currentUser?.companyId || '';
  }

  /**
   * Retrieve the list of active waiters for the current company.
   * An active waiter has role=WAITER and logged in within 12h, or isActive===true.
   * @returns {Promise<Array<{uid, displayName, email}>>}
   */
  static async getActiveWaiters() {
    const companyId = this._getCompanyId();
    if (!companyId) return [];
    return FirestoreService.getActiveWaiters(companyId);
  }

  /**
   * Determine the next waiter to be assigned using Round-Robin and atomically
   * increment the cursor index in Firebase.
   *
   * @returns {Promise<{uid:string, displayName:string}|null>}
   */
  static async getNextWaiter() {
    const companyId = this._getCompanyId();
    if (!companyId) return null;

    const waiters = await this.getActiveWaiters();
    if (waiters.length === 0) {
      console.warn('[WaiterAssignment] No active waiters found — table will remain unassigned.');
      return null;
    }

    const currentIndex = await FirestoreService.getRoundRobinIndex(companyId);
    const safeIndex = currentIndex % waiters.length;
    const chosenWaiter = waiters[safeIndex];
    const nextIndex = (safeIndex + 1) % waiters.length;

    await FirestoreService.setRoundRobinIndex(companyId, nextIndex);
    console.log(`[WaiterAssignment] Round-Robin assigned to ${chosenWaiter.displayName} (idx ${safeIndex} -> ${nextIndex})`);
    return chosenWaiter;
  }

  /**
   * Automatically assign a table to the next waiter in rotation.
   * Only assigns if the table does not already have an assignedWaiterId.
   *
   * @param {string} tableId
   * @param {Object} [tableData={}]
   * @returns {Promise<{uid:string, displayName:string}|null>}
   */
  static async assignTable(tableId, tableData = {}) {
    if (tableData.assignedWaiterId) {
      console.log(`[WaiterAssignment] Table ${tableId} already assigned — skipping.`);
      return null;
    }

    const waiter = await this.getNextWaiter();
    if (!waiter) return null;

    const waiterRole = waiter.customRole || (waiter.role === 'WAITER' ? 'Mesero' : (waiter.role === 'MANAGER' ? 'Gerente' : (waiter.role === 'CASHIER' ? 'Cajero' : waiter.role))) || 'Mesero';

    const updates = {
      assignedWaiterId: waiter.uid,
      assignedWaiterName: waiter.displayName || waiter.email || 'Mesero',
      assignedWaiterRole: waiterRole
    };

    if (!tableData.occupiedSince) {
      updates.occupiedSince = Date.now();
    }

    await FirestoreService.update('tables', tableId, updates);
    console.log(`[WaiterAssignment] Table ${tableId} assigned to: ${waiter.displayName} (${waiterRole})`);
    return waiter;
  }

  /**
   * Manually reassign a table to a specific waiter (manager/owner action).
   *
   * @param {string} tableId
   * @param {string} waiterId
   * @param {string} waiterName
   * @param {string} waiterRole
   * @returns {Promise<void>}
   */
  static async reassignTable(tableId, waiterId, waiterName, waiterRole) {
    await FirestoreService.update('tables', tableId, {
      assignedWaiterId: waiterId,
      assignedWaiterName: waiterName,
      assignedWaiterRole: waiterRole || 'Mesero'
    });
    console.log(`[WaiterAssignment] Table ${tableId} manually reassigned to ${waiterName} (${waiterRole || 'Mesero'})`);
  }

  /**
   * Clear the waiter assignment when a table is freed/closed.
   *
   * @param {string} tableId
   * @returns {Promise<void>}
   */
  static async releaseTable(tableId) {
    await FirestoreService.update('tables', tableId, {
      assignedWaiterId: null,
      assignedWaiterName: null,
      occupiedSince: null,
    });
    console.log(`[WaiterAssignment] Table ${tableId} released — assignment cleared.`);
  }

  /**
   * Reset the Round-Robin index to 0 (start of new shift).
   * @returns {Promise<void>}
   */
  static async resetRoundRobinIndex() {
    const companyId = this._getCompanyId();
    if (companyId) await FirestoreService.setRoundRobinIndex(companyId, 0);
  }
}
