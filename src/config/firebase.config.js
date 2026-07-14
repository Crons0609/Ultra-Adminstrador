/**
 * @file firebase.config.js
 * @description Firebase SDK initialization with real production credentials.
 * Project: super-administrador-df803
 *
 * SDK Version: 12.16.0 (matches Firebase Console version)
 * Services enabled: Auth, Firestore, Storage, Functions, Analytics, Messaging
 */

// ─── Firebase SDK Modular Imports (CDN v12.16.0) ─────────────────────────────
// NOTE: Import paths must be static strings — no template literals allowed in ES module imports
import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, connectAuthEmulator }
  from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator }
  from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { getStorage, connectStorageEmulator }
  from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';
import { getFunctions, connectFunctionsEmulator }
  from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';
import { getAnalytics, isSupported as isAnalyticsSupported }
  from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-analytics.js';
import { getMessaging, isSupported as isMessagingSupported }
  from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging.js';
// ─────────────────────────────────────────────────────────────────────────────

// ─── Project Credentials ─────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            'AIzaSyBepg-SWU0O0pQotFi5dBy66QCe8LdgksM',
  authDomain:        'super-administrador-df803.firebaseapp.com',
  projectId:         'super-administrador-df803',
  storageBucket:     'super-administrador-df803.firebasestorage.app',
  messagingSenderId: '417717665818',
  appId:             '1:417717665818:web:488e18c9ed7aa79b7391a3',
  measurementId:     'G-SS8DELMFEM'
};
// ─────────────────────────────────────────────────────────────────────────────

// ─── Detect environment ───────────────────────────────────────────────────────
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(window.location.hostname);
// ─────────────────────────────────────────────────────────────────────────────

// ─── Exported Firebase Service Instances ─────────────────────────────────────
export let firebaseApp = null;
export let auth        = null;
export let db          = null;
export let storage     = null;
export let functions   = null;
export let analytics   = null;
export let messaging   = null;
// ─────────────────────────────────────────────────────────────────────────────

// ─── Initialize Firebase ──────────────────────────────────────────────────────
try {
  // 1. Core App
  firebaseApp = initializeApp(firebaseConfig);
  console.log('[Firebase] ✅ App initialized. Project:', firebaseConfig.projectId);

  // 2. Authentication
  auth = getAuth(firebaseApp);

  // 3. Firestore Database
  db = getFirestore(firebaseApp);

  // 4. Cloud Storage
  storage = getStorage(firebaseApp);

  // 5. Cloud Functions (us-central1 default region)
  functions = getFunctions(firebaseApp, 'us-central1');

  // ─── Local Emulators (only on localhost) ────────────────────────────────────
  // Uncomment ONLY if you have run: firebase emulators:start
  if (IS_LOCAL) {
    console.log('[Firebase] 🧪 Modo desarrollo local. Emuladores disponibles (descomentarlos en firebase.config.js si los activas).');
    // connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    // connectFirestoreEmulator(db, 'localhost', 8080);
    // connectStorageEmulator(storage, 'localhost', 9199);
    // connectFunctionsEmulator(functions, 'localhost', 5001);
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // 6. Google Analytics (async — not critical path)
  isAnalyticsSupported().then(supported => {
    if (supported) {
      analytics = getAnalytics(firebaseApp);
      console.log('[Firebase] 📊 Analytics activo.');
    }
  }).catch(() => {});

  // 7. Cloud Messaging / Push notifications (async — requires HTTPS + user permission)
  isMessagingSupported().then(supported => {
    if (supported) {
      messaging = getMessaging(firebaseApp);
      console.log('[Firebase] 🔔 Cloud Messaging activo.');
    }
  }).catch(() => {});

} catch (error) {
  console.error('[Firebase] ❌ Error crítico de inicialización:', error.code, error.message);
}
// ─────────────────────────────────────────────────────────────────────────────
