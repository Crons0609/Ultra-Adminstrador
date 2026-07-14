const functions = require('firebase-functions');
exports.onUserCreated = functions.auth.user().onCreate(async (user) => {
  console.log('User Auth registered:', user.uid);
});
