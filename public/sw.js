/**
 * @file sw.js
 * @description Service Worker base for PWA installation, offline capabilities, and static assets caching.
 */

const CACHE_NAME = 'ultra-admin-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/app.js',
  '/src/styles/main.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;
  
  // Exclude Firebase API endpoints, real-time database, auth, and emulators
  const url = event.request.url;
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('identitytoolkit') ||
    url.includes('firebaseio.com') ||
    url.includes('localhost:9000') ||
    url.includes('localhost:9099')
  ) {
    return;
  }

  // Network First Strategy: try network, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache successful basic responses
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Serve index.html fallback for SPA navigation when offline
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
