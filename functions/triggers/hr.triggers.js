const functions = require('firebase-functions');
const FCMService = require('../notifications/fcm.service');

exports.onLeaveRequestCreated = functions.firestore
  .document('companies/{companyId}/branches/{branchId}/leave_requests/{requestId}')
  .onCreate(async (snap, context) => {
    const { companyId, requestId } = context.params;
    const requestData = snap.data() || {};

    console.log(`[HRTrigger] New leave request ${requestId} in company ${companyId}`);

    await FCMService.sendToRoles(companyId, 'LEAVE_REQUEST', {
      requestId,
      documentId: requestId,
      employeeName: requestData.employeeName || 'Un empleado',
      requestType: requestData.type || 'Vacaciones'
    });
  });
