/**
 * @file barcode-registry.service.js
 * @description Service for persisting scanned barcodes/QR codes in Firebase.
 *
 * Stores every unique code under the tenant's `codigos_escaneados` collection
 * so future lookups are instant. Tracks scan count, associated item, and format.
 *
 * Firebase path: {companyId}/codigos_escaneados/{codeHash}
 */

import { FirestoreService } from './firestore.service.js';
import { TimeService } from './time.service.js';
import { BarcodeScannerService } from './barcode-scanner.service.js';

export class BarcodeRegistryService {

  // ─── REGISTER / UPDATE A CODE ─────────────────────────────────────────────

  /**
   * Register or update a scanned code in Firebase.
   * If the code already exists, increments scanCount and updates lastScannedAt.
   *
   * @param {string} code - The scanned barcode/QR string
   * @param {Object} [metadata={}]
   * @param {string} [metadata.productId] - Associated product ID
   * @param {string} [metadata.productName] - Associated product name
   * @param {string} [metadata.associatedWith] - Type: 'producto'|'activo'|'vehiculo'|'herramienta'|'insumo'
   * @param {string} [metadata.format] - Code format (auto-detected if omitted)
   * @returns {Promise<string>} The document ID used (sanitized code)
   */
  static async registerCode(code, metadata = {}) {
    if (!code || typeof code !== 'string') {
      throw new Error('Código inválido.');
    }

    const sanitizedCode = code.trim();
    const docId = BarcodeRegistryService._sanitizeId(sanitizedCode);
    const format = metadata.format || BarcodeScannerService.detectFormat(sanitizedCode);

    try {
      // Check if code already exists
      const existing = await BarcodeRegistryService.lookupCode(sanitizedCode);

      if (existing) {
        // Update existing: increment count, update timestamp
        const updateData = {
          scanCount: (existing.scanCount || 0) + 1,
          lastScannedAt: Date.now(),
          lastScannedAtLocal: TimeService.timestamp()
        };

        // Update association if provided
        if (metadata.productId) updateData.productId = metadata.productId;
        if (metadata.productName) updateData.productName = metadata.productName;
        if (metadata.associatedWith) updateData.associatedWith = metadata.associatedWith;

        await FirestoreService.update('codigos_escaneados', docId, updateData);
      } else {
        // Create new entry
        await FirestoreService.create('codigos_escaneados', {
          code: sanitizedCode,
          format,
          productId: metadata.productId || null,
          productName: metadata.productName || null,
          associatedWith: metadata.associatedWith || null,
          scanCount: 1,
          firstScannedAt: Date.now(),
          firstScannedAtLocal: TimeService.timestamp(),
          lastScannedAt: Date.now(),
          lastScannedAtLocal: TimeService.timestamp(),
          createdAt: Date.now()
        }, docId);
      }

      return docId;
    } catch (err) {
      console.error('[BarcodeRegistry] Error registering code:', err);
      throw err;
    }
  }

  // ─── LOOKUP A CODE ────────────────────────────────────────────────────────

  /**
   * Look up a scanned code in Firebase and return its metadata.
   *
   * @param {string} code - The barcode/QR code string
   * @returns {Promise<Object|null>} The stored code data, or null if not found
   */
  static async lookupCode(code) {
    if (!code) return null;

    const docId = BarcodeRegistryService._sanitizeId(code.trim());

    try {
      const result = await FirestoreService.readOne('codigos_escaneados', docId);
      return result || null;
    } catch (err) {
      // Not found is not an error
      return null;
    }
  }

  // ─── FIND PRODUCT BY CODE ─────────────────────────────────────────────────

  /**
   * Search for a product by its barcode/SKU in the productos collection.
   * Looks in both the `sku` and `barcode` fields.
   *
   * @param {string} code - The barcode to search for
   * @returns {Promise<Object|null>} The product object or null
   */
  static async findProductByCode(code) {
    if (!code) return null;

    try {
      const products = await FirestoreService.readAll('productos');
      if (!products || !Array.isArray(products)) return null;

      const trimmedCode = code.trim().toLowerCase();
      return products.find(p =>
        (p.sku && p.sku.toLowerCase() === trimmedCode) ||
        (p.barcode && p.barcode.toLowerCase() === trimmedCode)
      ) || null;
    } catch (err) {
      console.error('[BarcodeRegistry] Error searching product by code:', err);
      return null;
    }
  }

  // ─── FIND ITEM BY CODE (ANY TYPE) ────────────────────────────────────────

  /**
   * Search for any item (product, asset, vehicle, tool, supply) by code.
   * First checks the registry, then searches the specific collection.
   *
   * @param {string} code
   * @returns {Promise<{item: Object, type: string}|null>}
   */
  static async findItemByCode(code) {
    if (!code) return null;

    const trimmedCode = code.trim().toLowerCase();

    // 1. Check if we have a registry entry with an association
    const registryEntry = await BarcodeRegistryService.lookupCode(code);
    if (registryEntry && registryEntry.productId && registryEntry.associatedWith) {
      const collectionMap = {
        'producto': 'productos',
        'activo': 'activos',
        'vehiculo': 'vehiculos',
        'herramienta': 'herramientas',
        'insumo': 'insumos'
      };
      const collection = collectionMap[registryEntry.associatedWith];
      if (collection) {
        try {
          const item = await FirestoreService.readOne(collection, registryEntry.productId);
          if (item) {
            return { item: { ...item, id: registryEntry.productId }, type: registryEntry.associatedWith };
          }
        } catch (e) {
          // Fall through to search
        }
      }
    }

    // 2. Search across all collections
    const collections = [
      { name: 'productos', type: 'producto', fields: ['sku', 'barcode'] },
      { name: 'activos', type: 'activo', fields: ['code', 'barcode'] },
      { name: 'vehiculos', type: 'vehiculo', fields: ['code', 'barcode', 'plate'] },
      { name: 'herramientas', type: 'herramienta', fields: ['code', 'barcode'] },
      { name: 'insumos', type: 'insumo', fields: ['code', 'barcode', 'sku'] }
    ];

    for (const col of collections) {
      try {
        const items = await FirestoreService.readAll(col.name);
        if (!items || !Array.isArray(items)) continue;

        const found = items.find(item =>
          col.fields.some(field =>
            item[field] && item[field].toLowerCase() === trimmedCode
          )
        );

        if (found) {
          // Register the association for faster future lookups
          await BarcodeRegistryService.registerCode(code, {
            productId: found.id,
            productName: found.name || found.nombre || '',
            associatedWith: col.type
          });
          return { item: found, type: col.type };
        }
      } catch (e) {
        continue;
      }
    }

    return null;
  }

  // ─── ASSOCIATE A CODE WITH AN ITEM ────────────────────────────────────────

  /**
   * Link a barcode to an existing item in the system.
   *
   * @param {string} code
   * @param {string} itemId
   * @param {string} type - 'producto'|'activo'|'vehiculo'|'herramienta'|'insumo'
   * @param {string} [itemName]
   */
  static async associateCode(code, itemId, type, itemName = '') {
    return BarcodeRegistryService.registerCode(code, {
      productId: itemId,
      productName: itemName,
      associatedWith: type
    });
  }

  // ─── RECENT SCANS ────────────────────────────────────────────────────────

  /**
   * Get the most recent scanned codes for this tenant.
   *
   * @param {number} [limit=50] - Maximum results
   * @returns {Promise<Array>} Sorted by lastScannedAt descending
   */
  static async getRecentScans(limit = 50) {
    try {
      const allCodes = await FirestoreService.readAll('codigos_escaneados');
      if (!allCodes || !Array.isArray(allCodes)) return [];

      return allCodes
        .sort((a, b) => (b.lastScannedAt || 0) - (a.lastScannedAt || 0))
        .slice(0, limit);
    } catch (err) {
      console.error('[BarcodeRegistry] Error fetching recent scans:', err);
      return [];
    }
  }

  /**
   * Listen in real-time to the codes collection.
   * @param {Function} callback
   * @returns {string} Listener ID for cleanup
   */
  static listenToScans(callback) {
    return FirestoreService.listenToTenant('codigos_escaneados', (codes) => {
      const sorted = (codes || [])
        .sort((a, b) => (b.lastScannedAt || 0) - (a.lastScannedAt || 0));
      callback(sorted);
    });
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  /**
   * Sanitize a code to be used as a Firebase key.
   * Firebase RTDB keys cannot contain . $ # [ ] /
   * @param {string} code
   * @returns {string}
   */
  static _sanitizeId(code) {
    return code.replace(/[.#$[\]/]/g, '_');
  }

  /**
   * Get a human-readable type label.
   * @param {string} type
   * @returns {string}
   */
  static getTypeLabel(type) {
    const labels = {
      'producto': 'Producto',
      'activo': 'Activo',
      'vehiculo': 'Vehículo',
      'herramienta': 'Herramienta',
      'insumo': 'Insumo'
    };
    return labels[type] || type || 'Sin asociar';
  }

  /**
   * Get an icon for the item type.
   * @param {string} type
   * @returns {string}
   */
  static getTypeIcon(type) {
    const icons = {
      'producto': '📦',
      'activo': '🖥️',
      'vehiculo': '🚗',
      'herramienta': '🔧',
      'insumo': '🧪'
    };
    return icons[type] || '📋';
  }
}
