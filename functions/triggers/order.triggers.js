const functions = require('firebase-functions');
const FCMService = require('../notifications/fcm.service');

// Real-time notification trigger on order created
exports.onOrderCreated = functions.firestore
  .document('companies/{companyId}/branches/{branchId}/orders/{orderId}')
  .onCreate(async (snap, context) => {
    const { companyId, orderId } = context.params;
    const orderData = snap.data() || {};

    console.log(`[OrderTrigger] New order created: ${orderId} in company ${companyId}`);

    await FCMService.sendToRoles(companyId, 'NEW_ORDER', {
      orderId,
      documentId: orderId,
      tableName: orderData.tableName || orderData.tableNumber || '',
      total: orderData.total || 0,
      customerName: orderData.customerName || ''
    });
  });

// Real-time notification trigger on order status changed
exports.onOrderStatusUpdated = functions.firestore
  .document('companies/{companyId}/branches/{branchId}/orders/{orderId}')
  .onUpdate(async (change, context) => {
    const { companyId, orderId } = context.params;
    const beforeData = change.before.data() || {};
    const afterData = change.after.data() || {};

    if (beforeData.status === afterData.status) return;

    console.log(`[OrderTrigger] Order ${orderId} status changed: ${beforeData.status} -> ${afterData.status}`);

    const statusMap = {
      'pending': 'Pendiente',
      'in_preparation': 'En Preparación',
      'ready': 'Listo para Servir',
      'delivered': 'Entregado',
      'cancelled': 'Cancelado'
    };

    await FCMService.sendToRoles(companyId, 'ORDER_STATUS', {
      orderId,
      documentId: orderId,
      status: afterData.status,
      statusText: statusMap[afterData.status] || afterData.status,
      total: afterData.total || 0
    });
  });
