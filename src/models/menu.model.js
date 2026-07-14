/**
 * @file menu.model.js
 * @description Model definition representing a Restaurant Menu configuration.
 */
export class Menu {
  constructor({ id, name, categories = [], isActive = true }) {
    this.id = id;
    this.name = name;
    this.categories = categories;
    this.isActive = isActive;
  }
}