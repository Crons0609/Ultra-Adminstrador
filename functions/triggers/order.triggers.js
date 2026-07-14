const functions = require('firebase-functions');
// Real-time stock decrement triggers on order created
exports.onOrderCreated = functions.firestore
  .document('companies/{companyId}/branches/{branchId}/orders/{orderId}')
  .onCreate(async (snap, context) => {
    console.log('Order created:', context.params.orderId);
  });
