/**
 * @file warehouse.service.js
 * @description Centralized service for Warehouse Management (Bodegas), Stock Tracking,
 *              Movements (Entradas/Salidas), and Inter-Branch Stock Transfers (Traslados).
 */

import { FirestoreService } from './firestore.service.js';
import { GlobalStore } from '../core/state.js';

export class WarehouseService {
  /**
   * Listen to warehouses under the company.
   */
  static listenWarehouses(callback) {
    return FirestoreService.listenToTenant('warehouses', (raw) => {
      let list = [];
      if (raw && typeof raw === 'object') {
        list = Object.entries(raw).map(([id, val]) => ({ id, ...val }));
      }
      callback(list);
    });
  }

  /**
   * Listen to stock transfers under the company.
   */
  static listenTransfers(callback) {
    return FirestoreService.listenToTenant('stock_transfers', (raw) => {
      let list = [];
      if (raw && typeof raw === 'object') {
        list = Object.entries(raw).map(([id, val]) => ({ id, ...val }));
      }
      callback(list);
    });
  }

  /**
   * Listen to warehouse stock entries under the company.
   */
  static listenWarehouseStock(callback) {
    return FirestoreService.listenToTenant('warehouse_stock', (raw) => {
      let list = [];
      if (raw && typeof raw === 'object') {
        list = Object.entries(raw).map(([id, val]) => ({ id, ...val }));
      }
      callback(list);
    });
  }

  /**
   * Create a new Warehouse (Bodega).
   */
  static async createWarehouse(data) {
    const { currentUser, currentCompany } = GlobalStore.getState();
    const companyId = currentCompany?.id || currentUser?.companyId;

    if (!companyId) throw new Error('Empresa no identificada.');

    const payload = {
      companyId,
      branchId: data.branchId || 'principal',
      branchName: data.branchName || 'Sucursal Principal',
      name: data.name || 'Bodega Principal',
      code: data.code || `BOD-${Math.floor(100 + Math.random() * 900)}`,
      responsibleName: data.responsibleName || '',
      location: data.location || '',
      capacity: Number(data.capacity || 0),
      notes: data.notes || '',
      status: data.status || 'ACTIVA',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    return await FirestoreService.create('warehouses', payload);
  }

  /**
   * Update an existing warehouse.
   */
  static async updateWarehouse(id, updates) {
    await FirestoreService.update('warehouses', id, { ...updates, updatedAt: Date.now() });
  }

  /**
   * Delete a warehouse.
   */
  static async deleteWarehouse(id) {
    await FirestoreService.delete('warehouses', id);
  }

  /**
   * Register Stock Entry / Exit into a Warehouse.
   */
  static async registerStockMovement(movement) {
    const { currentUser } = GlobalStore.getState();
    const payload = {
      warehouseId: movement.warehouseId,
      productId: movement.productId,
      productName: movement.productName,
      sku: movement.sku || '',
      type: movement.type, // 'ENTRADA' | 'SALIDA' | 'AJUSTE'
      quantity: Number(movement.quantity),
      reason: movement.reason || '',
      responsible: currentUser?.displayName || currentUser?.email || 'Sistema',
      supplier: movement.supplier || '',
      cost: Number(movement.cost || 0),
      batchNumber: movement.batchNumber || '',
      expirationDate: movement.expirationDate || '',
      timestamp: Date.now()
    };

    // Save log
    await FirestoreService.create('warehouse_movements', payload);

    // Update or create warehouse_stock record
    const stockId = `${movement.warehouseId}_${movement.productId}`;
    const currentStock = await FirestoreService.readPath(`${GlobalStore.getState().currentUser.companyId}/warehouse_stock/${stockId}`);
    
    const prevQty = Number(currentStock?.quantity || 0);
    const newQty = movement.type === 'ENTRADA' ? (prevQty + Number(movement.quantity)) : Math.max(0, prevQty - Number(movement.quantity));

    await FirestoreService.update('warehouse_stock', stockId, {
      warehouseId: movement.warehouseId,
      productId: movement.productId,
      productName: movement.productName,
      sku: movement.sku || '',
      quantity: newQty,
      minStock: Number(movement.minStock || currentStock?.minStock || 5),
      maxStock: Number(movement.maxStock || currentStock?.maxStock || 100),
      batchNumber: movement.batchNumber || currentStock?.batchNumber || '',
      expirationDate: movement.expirationDate || currentStock?.expirationDate || '',
      updatedAt: Date.now()
    });
  }

  /**
   * Fetch available products and stock for a given origin (bodega or sucursal).
   * @param {string} sourceType - 'bodega' | 'sucursal'
   * @param {string} sourceId - Warehouse ID or Branch ID
   * @returns {Promise<Array>} List of product items with available quantity and metadata
   */
  static async getAvailableStockForOrigin(sourceType, sourceId) {
    const companyId = GlobalStore.getState().currentUser?.companyId;
    if (!companyId) return [];

    try {
      const allProducts = await FirestoreService.query('productos') || [];

      if (sourceType === 'bodega') {
        const stockList = await FirestoreService.query('warehouse_stock') || [];
        const filteredStock = stockList.filter(s => s.warehouseId === sourceId);

        return filteredStock.map(s => {
          const mainProd = allProducts.find(p => p.id === s.productId) || {};
          return {
            id: s.productId,
            productId: s.productId,
            name: s.productName || mainProd.name || mainProd.nombre || 'Producto',
            sku: s.sku || mainProd.sku || mainProd.code || '',
            barcode: mainProd.barcode || mainProd.codigoBarras || '',
            category: mainProd.category || mainProd.categoria || 'General',
            brand: mainProd.brand || mainProd.marca || '',
            unit: mainProd.unit || mainProd.unidadMedida || 'unidades',
            availableStock: Number(s.quantity || 0),
            batchNumber: s.batchNumber || mainProd.batchNumber || '',
            expirationDate: s.expirationDate || mainProd.expirationDate || '',
            serials: mainProd.serials || []
          };
        }).filter(item => item.availableStock > 0);
      } else {
        // Sucursal / Main Catalog
        return allProducts.map(p => ({
          id: p.id,
          productId: p.id,
          name: p.name || p.nombre || 'Producto',
          sku: p.sku || p.code || '',
          barcode: p.barcode || p.codigoBarras || '',
          category: p.category || p.categoria || 'General',
          brand: p.brand || p.marca || '',
          unit: p.unit || p.unidadMedida || 'unidades',
          availableStock: Number(p.stock || p.existencias || 0),
          batchNumber: p.batchNumber || '',
          expirationDate: p.expirationDate || '',
          serials: p.serials || []
        })).filter(item => item.availableStock > 0);
      }
    } catch (e) {
      console.warn('[WarehouseService] Error querying available stock for origin:', e);
      return [];
    }
  }

  /**
   * Create a new Stock Transfer (Traslado).
   */
  static async createTransfer(transferData) {
    const { currentUser, currentCompany } = GlobalStore.getState();
    const companyId = currentCompany?.id || currentUser?.companyId;

    const now = Date.now();
    const transferNumber = `TR-${now.toString().slice(-6)}`;

    const initialStatus = transferData.status || (currentUser?.role === 'OWNER' ? 'EN_TRANSITO' : 'PENDIENTE');

    const timeline = [
      {
        status: 'CREADO',
        timestamp: now,
        user: currentUser?.displayName || currentUser?.email || 'Usuario',
        role: currentUser?.role || '',
        note: 'Traslado registrado'
      }
    ];

    if (initialStatus === 'EN_TRANSITO') {
      timeline.push({
        status: 'EN_TRANSITO',
        timestamp: now + 1,
        user: currentUser?.displayName || currentUser?.email || 'Usuario',
        role: currentUser?.role || '',
        note: 'Traslado iniciado y enviado'
      });
    }

    const payload = {
      companyId,
      transferNumber,
      sourceType: transferData.sourceType, // 'sucursal' | 'bodega'
      sourceId: transferData.sourceId,
      sourceName: transferData.sourceName,
      sourceBranchId: transferData.sourceBranchId || '',
      sourceBranchName: transferData.sourceBranchName || '',

      targetType: transferData.targetType, // 'sucursal' | 'bodega'
      targetId: transferData.targetId,
      targetName: transferData.targetName,
      targetBranchId: transferData.targetBranchId || '',
      targetBranchName: transferData.targetBranchName || '',

      items: (transferData.items || []).map(item => ({
        productId: item.productId,
        name: item.name || item.productName || '',
        sku: item.sku || '',
        barcode: item.barcode || '',
        unit: item.unit || 'unidades',
        quantity: Number(item.quantity || 0),
        batchNumber: item.batchNumber || '',
        expirationDate: item.expirationDate || '',
        selectedSerials: item.selectedSerials || []
      })),

      reason: transferData.reason || 'Reposición',
      notes: transferData.notes || '',

      status: initialStatus, // 'BORRADOR' | 'PENDIENTE' | 'APROBADO' | 'EN_TRANSITO' | 'RECIBIDO' | 'CANCELADO' | 'RECHAZADO'

      responsibleUid: currentUser?.uid || '',
      responsibleName: currentUser?.displayName || currentUser?.email || 'Usuario',
      responsibleRole: currentUser?.role || '',

      timeline,

      createdAt: now,
      updatedAt: now
    };

    const docId = await FirestoreService.create('stock_transfers', payload);

    return { docId, transferNumber };
  }

  /**
   * Approve a pending Transfer.
   */
  static async approveTransfer(transferId, currentTransfer) {
    const { currentUser } = GlobalStore.getState();
    const now = Date.now();

    const timeline = [...(currentTransfer.timeline || []), {
      status: 'APROBADO',
      timestamp: now,
      user: currentUser?.displayName || currentUser?.email || 'Usuario',
      role: currentUser?.role || '',
      note: 'Traslado aprobado por administración'
    }, {
      status: 'EN_TRANSITO',
      timestamp: now + 1,
      user: currentUser?.displayName || currentUser?.email || 'Usuario',
      role: currentUser?.role || '',
      note: 'Mercancía despachada en tránsito'
    }];

    await FirestoreService.update('stock_transfers', transferId, {
      status: 'EN_TRANSITO',
      timeline,
      approvedBy: currentUser?.displayName || currentUser?.email,
      approvedAt: now,
      updatedAt: now
    });
  }

  /**
   * Reject a pending Transfer.
   */
  static async rejectTransfer(transferId, currentTransfer, reason = '') {
    const { currentUser } = GlobalStore.getState();
    const now = Date.now();

    const timeline = [...(currentTransfer.timeline || []), {
      status: 'RECHAZADO',
      timestamp: now,
      user: currentUser?.displayName || currentUser?.email || 'Usuario',
      role: currentUser?.role || '',
      note: `Traslado rechazado: ${reason || 'Sin motivo especificado'}`
    }];

    await FirestoreService.update('stock_transfers', transferId, {
      status: 'RECHAZADO',
      rejectionReason: reason,
      timeline,
      updatedAt: now
    });
  }

  /**
   * Process Reception of a Transfer (Full or Partial).
   * Atomically updates inventory at Origin (deduction) and Destination (addition).
   */
  static async receiveTransfer(transferId, currentTransfer, receptionData = {}) {
    if (currentTransfer.status === 'RECIBIDO') {
      throw new Error('Este traslado ya fue recibido previamente. Operación duplicada no permitida.');
    }

    const { currentUser, currentCompany } = GlobalStore.getState();
    const companyId = currentCompany?.id || currentUser?.companyId;
    const now = Date.now();

    const receivedItems = receptionData.receivedItems || currentTransfer.items || [];
    const isPartial = receptionData.isPartial || false;
    const discrepancyReason = receptionData.discrepancyReason || '';
    const discrepancyNotes = receptionData.discrepancyNotes || '';

    // 1. Process atomic stock changes for each item
    for (const item of receivedItems) {
      const qtySent = Number(item.quantity || 0);
      const qtyReceived = Number(item.receivedQuantity !== undefined ? item.receivedQuantity : qtySent);
      const qtyDamaged = Number(item.damagedQuantity || 0);
      const qtyMissing = Number(item.missingQuantity || 0);

      // Effective addition to target is what was actually received intact
      const qtyEffectiveTarget = Math.max(0, qtyReceived - qtyDamaged);

      // Deduct full sent quantity from Origin
      if (currentTransfer.sourceType === 'bodega') {
        const stockId = `${currentTransfer.sourceId}_${item.productId}`;
        const currentStock = await FirestoreService.readPath(`${companyId}/warehouse_stock/${stockId}`);
        const prevQty = Number(currentStock?.quantity || 0);
        const newQty = Math.max(0, prevQty - qtySent);
        await FirestoreService.update('warehouse_stock', stockId, {
          quantity: newQty,
          updatedAt: now
        });
      } else {
        // Sucursal / Main Catalog
        const prod = await FirestoreService.readPath(`${companyId}/productos/${item.productId}`);
        if (prod) {
          const prevQty = Number(prod.stock || prod.existencias || 0);
          const newQty = Math.max(0, prevQty - qtySent);
          await FirestoreService.update('productos', item.productId, {
            stock: newQty,
            existencias: newQty,
            updatedAt: now
          });
        }
      }

      // Add effective quantity to Destination
      if (currentTransfer.targetType === 'bodega') {
        const stockId = `${currentTransfer.targetId}_${item.productId}`;
        const currentStock = await FirestoreService.readPath(`${companyId}/warehouse_stock/${stockId}`);
        const prevQty = Number(currentStock?.quantity || 0);
        const newQty = prevQty + qtyEffectiveTarget;
        await FirestoreService.update('warehouse_stock', stockId, {
          warehouseId: currentTransfer.targetId,
          productId: item.productId,
          productName: item.name || item.productName || '',
          sku: item.sku || '',
          quantity: newQty,
          updatedAt: now
        });
      } else {
        // Sucursal / Main Catalog
        const prod = await FirestoreService.readPath(`${companyId}/productos/${item.productId}`);
        if (prod) {
          const prevQty = Number(prod.stock || prod.existencias || 0);
          const newQty = prevQty + qtyEffectiveTarget;
          await FirestoreService.update('productos', item.productId, {
            stock: newQty,
            existencias: newQty,
            updatedAt: now
          });
        }
      }

      // Record movement log
      await FirestoreService.create('warehouse_movements', {
        companyId,
        transferId,
        transferNumber: currentTransfer.transferNumber,
        productId: item.productId,
        productName: item.name,
        sentQuantity: qtySent,
        receivedQuantity: qtyReceived,
        damagedQuantity: qtyDamaged,
        missingQuantity: qtyMissing,
        sourceName: currentTransfer.sourceName,
        targetName: currentTransfer.targetName,
        responsible: currentUser?.displayName || currentUser?.email || 'Usuario',
        timestamp: now
      });
    }

    // 2. Update Transfer status and timeline
    const timeline = [...(currentTransfer.timeline || []), {
      status: 'RECIBIDO',
      timestamp: now,
      user: currentUser?.displayName || currentUser?.email || 'Usuario',
      role: currentUser?.role || '',
      note: isPartial
        ? `Recibido parcialmente. Motivo: ${discrepancyReason || 'Diferencia en recepción'}`
        : 'Recibido completo en destino'
    }];

    await FirestoreService.update('stock_transfers', transferId, {
      status: 'RECIBIDO',
      isPartial,
      receivedItems,
      discrepancyReason,
      discrepancyNotes,
      receivedBy: currentUser?.displayName || currentUser?.email || 'Usuario',
      receivedAt: now,
      timeline,
      updatedAt: now
    });
  }

  /**
   * Cancel a Transfer.
   */
  static async cancelTransfer(transferId, currentTransfer, reason = '') {
    if (currentTransfer.status === 'RECIBIDO') {
      throw new Error('No se puede cancelar un traslado que ya ha sido recibido.');
    }

    const { currentUser } = GlobalStore.getState();
    const now = Date.now();

    const timeline = [...(currentTransfer.timeline || []), {
      status: 'CANCELADO',
      timestamp: now,
      user: currentUser?.displayName || currentUser?.email || 'Usuario',
      role: currentUser?.role || '',
      note: `Traslado cancelado: ${reason || 'Cancelación manual'}`
    }];

    await FirestoreService.update('stock_transfers', transferId, {
      status: 'CANCELADO',
      cancelReason: reason,
      canceledBy: currentUser?.displayName || currentUser?.email,
      canceledAt: now,
      timeline,
      updatedAt: now
    });
  }
}

