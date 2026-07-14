/**
 * @file inventory.model.js
 * @description Model definition representing an Inventory Ingredient/Raw Material.
 */
export class InventoryItem {
  constructor({ id, name, sku, stock, minStock, unit, unitCost, supplierId }) {
    this.id = id;
    this.name = name;
    this.sku = sku;
    this.stock = stock;
    this.minStock = minStock;
    this.unit = unit; // kg, lt, pza
    this.unitCost = unitCost;
    this.supplierId = supplierId;
  }
}