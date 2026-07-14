/**
 * @file order.model.js
 * @description Model definition representing a Food/Drink order.
 */

import { ORDER_STATUS } from '../utils/constants.js';

export class Order {
  /**
   * @param {Object} data 
   * @param {string} data.id 
   * @param {string} data.tableId 
   * @param {string} [data.tableName] 
   * @param {string} [data.waiterId] 
   * @param {Array<Object>} data.items - { productId, name, qty, price, notes[], extras[] }
   * @param {number} data.subtotal 
   * @param {number} data.tip 
   * @param {number} data.total 
   * @param {string} data.status - RECEIVED | PREPARING | PAUSED | READY | DELIVERED | CANCELLED
   * @param {Date} [data.createdAt] 
   */
  constructor({ 
    id, 
    tableId, 
    tableName = '', 
    waiterId = null, 
    items = [], 
    subtotal = 0, 
    tip = 0, 
    total = 0, 
    status = ORDER_STATUS.RECEIVED, 
    createdAt = new Date() 
  }) {
    if (!id) throw new Error('Order validation: ID is required');
    if (!tableId) throw new Error('Order validation: Table ID is required');

    this.id = id;
    this.tableId = tableId;
    this.tableName = tableName;
    this.waiterId = waiterId;
    this.items = items;
    this.subtotal = subtotal;
    this.tip = tip;
    this.total = total;
    this.status = status;
    this.createdAt = createdAt;
  }

  static fromFirestore(docSnapshot) {
    const data = docSnapshot.data();
    return new Order({
      id: docSnapshot.id,
      tableId: data.tableId,
      tableName: data.tableName,
      waiterId: data.waiterId,
      items: data.items,
      subtotal: data.subtotal,
      tip: data.tip,
      total: data.total,
      status: data.status,
      createdAt: data.createdAt ? new Date(data.createdAt.seconds * 1000) : new Date()
    });
  }

  toFirestore() {
    return {
      tableId: this.tableId,
      tableName: this.tableName,
      waiterId: this.waiterId,
      items: this.items,
      subtotal: this.subtotal,
      tip: this.tip,
      total: this.total,
      status: this.status,
      createdAt: this.createdAt
    };
  }
}
