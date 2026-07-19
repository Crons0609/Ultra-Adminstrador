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

/**
 * Classifies a specific business type into one of five categories.
 * @param {string} businessType
 * @returns {'GASTRONOMIA'|'RENT_A_CAR'|'BARBERIA'|'VENTAS'|'SERVICIOS_PERSONALIZADOS'|'PERSONALIZADA'|'OTROS'}
 */
export function getBusinessCategory(businessType) {
  if (!businessType) return 'OTROS';

  const typeLower = businessType.toLowerCase().trim();

  // Gastronomy & Drinks
  if (
    typeLower.includes('restaurante') ||
    typeLower.includes('comida') ||
    typeLower.includes('pizzer') ||
    typeLower.includes('cafeter') ||
    typeLower.includes('helader') ||
    typeLower.includes('panader') ||
    typeLower.includes('pasteler') ||
    typeLower.includes('food truck') ||
    typeLower.includes('cocina') ||
    typeLower.includes('bar') ||
    typeLower.includes('pub') ||
    typeLower.includes('cervecer') ||
    typeLower.includes('licor') ||
    typeLower.includes('vino') ||
    typeLower.includes('discoteca') ||
    typeLower.includes('club')
  ) {
    return 'GASTRONOMIA';
  }

  // Rent a car / Transport
  if (
    typeLower.includes('alquiler de coc') ||
    typeLower.includes('alquiler de mot') ||
    typeLower.includes('rent a car') ||
    typeLower.includes('transporte')
  ) {
    return 'RENT_A_CAR';
  }

  // Barber / Salon / Spa
  if (
    typeLower.includes('barber') ||
    typeLower.includes('belleza') ||
    typeLower.includes('spa') ||
    typeLower.includes('estilista')
  ) {
    return 'BARBERIA';
  }

  // Retail / Commerce (ventas)
  if (
    typeLower.includes('tienda') ||
    typeLower.includes('minimarket') ||
    typeLower.includes('supermercado') ||
    typeLower.includes('pulper') ||
    typeLower.includes('conveniencia') ||
    typeLower.includes('comercio') ||
    typeLower.includes('ferreter') ||
    typeLower.includes('farmacia') ||
    typeLower.includes('ropa') ||
    typeLower.includes('electrónica') ||
    typeLower.includes('mascotas') ||
    typeLower.includes('librería')
  ) {
    return 'VENTAS';
  }

  // Custom / Personalised Services
  if (
    typeLower.includes('carpinter') ||
    typeLower.includes('cámara') ||
    typeLower.includes('instalac') ||
    typeLower.includes('herrer') ||
    typeLower.includes('electric') ||
    typeLower.includes('pintur') ||
    typeLower.includes('construc') ||
    typeLower.includes('diseño') ||
    typeLower.includes('reparac') ||
    typeLower.includes('limpieza') ||
    typeLower.includes('mantenimiento') ||
    typeLower.includes('taller') ||
    typeLower.includes('lavado')
  ) {
    return 'SERVICIOS_PERSONALIZADOS';
  }

  if (typeLower.includes('personalizada')) {
    return 'PERSONALIZADA';
  }

  return 'OTROS';
}

