const functions = require('firebase-functions');
exports.onStockUpdated = functions.firestore
  .document('companies/{companyId}/branches/{branchId}/inventory/{itemId}')
  .onUpdate(async (change, context) => {
    console.log('Stock changed for item:', context.params.itemId);
  });
