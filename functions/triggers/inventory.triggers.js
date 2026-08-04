const functions = require('firebase-functions');
const FCMService = require('../notifications/fcm.service');

exports.onStockUpdated = functions.firestore
  .document('companies/{companyId}/branches/{branchId}/inventory/{itemId}')
  .onUpdate(async (change, context) => {
    const { companyId, itemId } = context.params;
    const beforeData = change.before.data() || {};
    const afterData = change.after.data() || {};

    const newStock = Number(afterData.stock !== undefined ? afterData.stock : afterData.quantity) || 0;
    const oldStock = Number(beforeData.stock !== undefined ? beforeData.stock : beforeData.quantity) || 0;

    const minStock = Number(afterData.minStock || afterData.lowStockThreshold || 5);

    if (newStock === oldStock) return;

    // Check if stock just reached zero
    if (newStock <= 0 && oldStock > 0) {
      console.log(`[InventoryTrigger] Product ${itemId} OUT OF STOCK in company ${companyId}`);
      await FCMService.sendToRoles(companyId, 'OUT_OF_STOCK', {
        documentId: itemId,
        productName: afterData.name || afterData.productName || 'Producto',
        quantity: newStock
      });
    }
    // Check if stock dropped below low stock threshold
    else if (newStock <= minStock && oldStock > minStock) {
      console.log(`[InventoryTrigger] Product ${itemId} LOW STOCK (${newStock}/${minStock}) in company ${companyId}`);
      await FCMService.sendToRoles(companyId, 'LOW_STOCK', {
        documentId: itemId,
        productName: afterData.name || afterData.productName || 'Producto',
        quantity: newStock,
        minStock
      });
    }
  });
