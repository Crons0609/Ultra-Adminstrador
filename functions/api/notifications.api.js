const functions = require('firebase-functions');
exports.sendPush = functions.https.onRequest((req, res) => {
  res.status(200).send({ success: true, message: 'Push notification triggered' });
});
