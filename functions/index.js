const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Export triggers & APIs
exports.orderTriggers = require('./triggers/order.triggers');
exports.inventoryTriggers = require('./triggers/inventory.triggers');
exports.userTriggers = require('./triggers/user.triggers');
exports.notificationsApi = require('./api/notifications.api');
exports.reportsApi = require('./api/reports.api');
exports.webhooksApi = require('./api/webhooks.api');
exports.scheduledTasks = require('./scheduled/tasks.cron');
