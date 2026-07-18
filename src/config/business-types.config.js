/**
 * @file business-types.config.js
 * @description Centralized catalog of all supported business types grouped by category.
 *
 * Architecture:
 * - BUSINESS_TYPE_CATEGORIES: Ordered array of { label, icon, types[] }
 * - getBusinessTypeOptions(selectedValue?): Returns HTML <optgroup>/<option> ready to inject in <select>
 * - FLAT_BUSINESS_TYPES: Flat array of all type values for validation
 *
 * Adding a new type: just append to the `types` array in the relevant category.
 * Adding a new category: push a new object to BUSINESS_TYPE_CATEGORIES.
 */

export const BUSINESS_TYPE_CATEGORIES = [
  {
    label: '🍽️ Gastronomía',
    types: [
      'Restaurante',
      'Restaurante Familiar',
      'Restaurante Buffet',
      'Restaurante de Mariscos',
      'Restaurante de Carnes',
      'Restaurante Asiático',
      'Restaurante Mexicano',
      'Restaurante Italiano',
      'Restaurante de Sushi',
      'Comida Rápida',
      'Pizzería',
      'Cafetería',
      'Heladería',
      'Panadería',
      'Pastelería',
      'Food Truck',
      'Cocina Fantasma',
    ]
  },
  {
    label: '🍺 Bebidas',
    types: [
      'Bar',
      'Bar Deportivo',
      'Lounge Bar',
      'Pub',
      'Cervecería',
      'Licorería',
      'Vinoteca',
      'Discoteca / Club Nocturno',
    ]
  },
  {
    label: '🛒 Comercio',
    types: [
      'Tienda',
      'Minimarket',
      'Supermercado',
      'Pulpería',
      'Tienda de Conveniencia',
    ]
  },
  {
    label: '🔧 Servicios',
    types: [
      'Empresa de Servicios Varios',
      'Empresa de Limpieza',
      'Empresa de Mantenimiento',
      'Taller Mecánico',
      'Taller de Motocicletas',
      'Taller Automotriz',
      'Lavado de Vehículos',
      'Barbería',
      'Salón de Belleza',
      'Spa',
      'Gimnasio',
    ]
  },
  {
    label: '🚗 Transporte',
    types: [
      'Alquiler de Coches',
      'Alquiler de Motocicletas',
      'Empresa de Transporte',
      'Servicio de Delivery',
    ]
  },
  {
    label: '🏨 Otros',
    types: [
      'Hotel',
      'Hostal',
      'Casa de Huéspedes',
      'Ferretería',
      'Farmacia',
      'Veterinaria',
      'Floristería',
      'Librería',
      'Tienda de Ropa',
      'Tienda de Electrónica',
      'Tienda de Mascotas',
      'Oficina',
      'Empresa Personalizada',
    ]
  }
];

/**
 * Flat array of every business type value (for validation).
 */
export const FLAT_BUSINESS_TYPES = BUSINESS_TYPE_CATEGORIES.flatMap(cat => cat.types);

/**
 * Generate <optgroup>/<option> HTML for a <select> element.
 * @param {string} [selectedValue] - Currently selected type to mark as `selected`.
 * @returns {string} HTML string
 */
export function getBusinessTypeOptions(selectedValue = '') {
  return BUSINESS_TYPE_CATEGORIES.map(category => {
    const options = category.types.map(type => {
      const selected = type === selectedValue ? ' selected' : '';
      return `<option value="${type}"${selected}>${type}</option>`;
    }).join('\n            ');

    return `
          <optgroup label="${category.label}">
            ${options}
          </optgroup>`;
  }).join('');
}
