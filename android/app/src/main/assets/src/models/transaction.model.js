/**
 * @file transaction.model.js
 * @description Model definition representing a Cash Box transaction.
 */
export class Transaction {
  constructor({ id, sessionId, type, amount, method, concept, createdBy, createdAt = new Date() }) {
    this.id = id;
    this.sessionId = sessionId;
    this.type = type; // IN, OUT
    this.amount = amount;
    this.method = method; // CASH, CARD, etc.
    this.concept = concept;
    this.createdBy = createdBy;
    this.createdAt = createdAt;
  }
}