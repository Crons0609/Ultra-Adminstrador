const functions = require('firebase-functions');
const FCMService = require('../notifications/fcm.service');

exports.onSaleCreated = functions.firestore
  .document('companies/{companyId}/branches/{branchId}/sales/{saleId}')
  .onCreate(async (snap, context) => {
    const { companyId, saleId } = context.params;
    const saleData = snap.data() || {};

    console.log(`[SaleTrigger] New sale ${saleId} registered in company ${companyId}`);

    await FCMService.sendToRoles(companyId, 'NEW_SALE', {
      saleId,
      documentId: saleId,
      total: saleData.total || 0,
      paymentMethod: saleData.paymentMethod || 'Efectivo',
      customerName: saleData.customerName || ''
    });
  });
