const functions = require('firebase-functions');
exports.generateReport = functions.https.onRequest((req, res) => {
  res.status(200).send({ success: true, data: [] });
});
