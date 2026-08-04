/**
 * @file product.model.js
 * @description Model definition representing a Menu Product/Dish.
 */

export class Product {
  /**
   * @param {Object} data 
   * @param {string} data.id 
   * @param {string} data.name 
   * @param {string} [data.description] 
   * @param {number} data.price 
   * @param {string} [data.image] 
   * @param {string} data.category - ID of the category
   * @param {Array<string>} [data.ingredients] 
   * @param {Array<string>} [data.allergens] 
   * @param {boolean} [data.isAvailable] 
   * @param {number} [data.prepTime] - Estimated preparation time in minutes
   */
  constructor({
    id,
    name,
    description = '',
    price,
    image = '',
    category,
    ingredients = [],
    allergens = [],
    isAvailable = true,
    prepTime = 15
  }) {
    if (!id) throw new Error('Product validation: ID is required');
    if (!name) throw new Error('Product validation: Name is required');
    if (price === undefined || price < 0) throw new Error('Product validation: Price is invalid');
    if (!category) throw new Error('Product validation: Category is required');

    this.id = id;
    this.name = name;
    this.description = description;
    this.price = price;
    this.image = image;
    this.category = category;
    this.ingredients = ingredients;
    this.allergens = allergens;
    this.isAvailable = isAvailable;
    this.prepTime = prepTime;
  }

  static fromFirestore(docSnapshot) {
    const data = docSnapshot.data();
    return new Product({
      id: docSnapshot.id,
      name: data.name,
      description: data.description,
      price: data.price,
      image: data.image,
      category: data.category,
      ingredients: data.ingredients,
      allergens: data.allergens,
      isAvailable: data.isAvailable,
      prepTime: data.prepTime
    });
  }

  toFirestore() {
    return {
      name: this.name,
      description: this.description,
      price: this.price,
      image: this.image,
      category: this.category,
      ingredients: this.ingredients,
      allergens: this.allergens,
      isAvailable: this.isAvailable,
      prepTime: this.prepTime
    };
  }
}
