/**
 * @file table.model.js
 * @description Model definition representing a Restaurant Table.
 */
export class Table {
  constructor({ id, number, seats, zone, qrCode = '', status = 'FREE' }) {
    this.id = id;
    this.number = number;
    this.seats = seats;
    this.zone = zone;
    this.qrCode = qrCode;
    this.status = status; // FREE, OCCUPIED, RESERVED, DIRTY
  }
}