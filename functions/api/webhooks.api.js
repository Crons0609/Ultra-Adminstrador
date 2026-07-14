const functions = require('firebase-functions');
exports.whatsappWebhook = functions.https.onRequest((req, res) => {
  res.status(200).send({ success: true });
});
