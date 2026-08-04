/**
 * @file sw.js
 * @description Ultra Administrador — Offline-First Service Worker
 *
 * Estrategia:
 *  - App shell (HTML, CSS, JS, fuentes, assets) → Cache First
 *  - Solicitudes de red propias → Network First con fallback a caché
 *  - Firebase RTDB / Auth / Firestore → NUNCA interceptado (Firebase maneja su propia persistencia offline)
 *  - Background Sync → Cola de escrituras pendientes que se reenvían al reconectarse
 */

const CACHE_VERSION = 'ultra-admin-v11-offline-full';
const SYNC_TAG      = 'ultra-offline-sync';

// ─── Assets del App Shell (se almacenan en instalación) ──────────────────────
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/app.js',
  '/src/styles/main.css',
  '/assets/logo_ultra_administrador.png',
  '/logo_ultra_administrador.png',
  'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js'
];

// ─── Dominios de API que NUNCA se interceptan para evitar interferir con REST/WebSockets ───
const BYPASS_PATTERNS = [
  'firebaseio.com',
  'firebasedatabase.app',
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'accounts.google.com',
  'localhost:9000',
  'localhost:9099',
  'localhost:8080'
];

// ─────────────────────────────────────────────────────────────────────────────
// INSTALL — cache del app shell
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v9 — caching full app shell & Firebase JS SDK...');
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn('[SW] Some shell assets failed to cache on install:', err.message);
      });
    })
  );
  self.skipWaiting();
});

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVATE — limpiar cachés viejos
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v9 — cleaning old caches...');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION)
          .map((k) => {
            console.log('[SW] Deleted old cache:', k);
            return caches.delete(k);
          })
      )
    )
  );
  self.clients.claim();
});

// ─────────────────────────────────────────────────────────────────────────────
// FETCH — estrategia de red
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = req.url;

  // Solo interceptamos GET
  if (req.method !== 'GET') return;

  // Bypass total para REST endpoints / WebSockets de Firebase Auth & RTDB
  if (BYPASS_PATTERNS.some((p) => url.includes(p))) return;

  // ── CDNs, librerías de Firebase y Fuentes → Stale-While-Revalidate (devuelve caché instantáneo offline) ──
  if (
    url.includes('gstatic.com/firebasejs') ||
    url.includes('cdn.tailwindcss.com') ||
    url.includes('unpkg.com') ||
    url.includes('cdnjs.cloudflare.com') ||
    url.includes('jsdelivr.net') ||
    url.includes('esm.sh') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com')
  ) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // ── Navegación principal (rutas SPA / HTML) → Stale-While-Revalidate / Cache First ──
  if (req.mode === 'navigate' || isShellRequest(url)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // ── Código fuente en /src/ y assets locales → Stale-While-Revalidate ──
  if (url.includes('/src/') || url.includes('/assets/')) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // ── Todo lo demás → Network First con fallback a caché ──────────────────
  event.respondWith(networkFirstWithCache(req));
});

// ─────────────────────────────────────────────────────────────────────────────
// BACKGROUND SYNC — reenvío de datos offline
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    console.log('[SW] 🔄 Background sync triggered — replaying offline writes...');
    event.waitUntil(replayOfflineQueue());
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MENSAJES desde la app
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'QUEUE_WRITE':
      // La app encola una escritura offline para reenviarla al reconectarse
      queueOfflineWrite(payload);
      break;

    case 'CACHE_URLS':
      // Cachear URLs adicionales bajo demanda (p.ej. rutas de la SPA)
      if (Array.isArray(payload?.urls)) {
        caches.open(CACHE_VERSION).then((c) => c.addAll(payload.urls).catch(() => {}));
      }
      break;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stale-While-Revalidate: Devuelve instantáneamente la copia en caché si existe,
 * mientras descarga en segundo plano la versión actualizada. Si está offline,
 * entrega inmediatamente el recurso guardado permitiendo abrir la app sin internet.
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch((err) => {
    console.warn('[SW] Offline fetch warning for:', request.url, err.message);
  });

  if (cached) {
    return cached;
  }

  try {
    const networkRes = await fetchPromise;
    if (networkRes) return networkRes;
  } catch (_) {}

  if (request.mode === 'navigate') {
    const fallback = await caches.match('/index.html') || await caches.match('/');
    if (fallback) return fallback;
  }

  return new Response(offlineFallbackHTML(), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    status: 503
  });
}

/**
 * Cache First: devuelve desde caché; si no existe, va a la red y almacena.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Fallback SPA
    const fallback = await caches.match('/index.html');
    return fallback || new Response('Offline', { status: 503 });
  }
}

/**
 * Network First: intenta red, cae a caché si falla.
 */
async function networkFirstWithCache(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type !== 'opaque') {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // SPA navigation fallback
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/index.html');
      if (fallback) return fallback;
    }

    return new Response(offlineFallbackHTML(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 503
    });
  }
}

/**
 * Determina si la solicitud corresponde al app shell propio.
 */
function isShellRequest(url) {
  return (
    url.includes('/src/') ||
    url.includes('/assets/') ||
    url.endsWith('/index.html') ||
    url.endsWith('/manifest.json') ||
    url.endsWith('/sw.js') ||
    url.endsWith('/') ||
    SHELL_ASSETS.some((a) => url.endsWith(a))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cola de escrituras offline (IndexedDB ligero via Cache Storage)
// ─────────────────────────────────────────────────────────────────────────────
const QUEUE_CACHE = 'ultra-offline-queue-v1';

async function queueOfflineWrite(payload) {
  if (!payload) return;
  const cache = await caches.open(QUEUE_CACHE);
  const key   = `offline-write-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const body  = JSON.stringify({ ...payload, queuedAt: Date.now() });
  await cache.put(
    new Request(key, { method: 'GET' }),
    new Response(body, { headers: { 'Content-Type': 'application/json' } })
  );
  console.log('[SW] 📥 Offline write queued:', key);
}

async function replayOfflineQueue() {
  const cache   = await caches.open(QUEUE_CACHE);
  const keys    = await cache.keys();

  if (keys.length === 0) {
    console.log('[SW] ✅ No pending offline writes.');
    return;
  }

  console.log(`[SW] 🔄 Replaying ${keys.length} offline write(s)...`);

  // Notificar a todos los clientes que la sincronización empezó
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach((c) =>
    c.postMessage({ type: 'OFFLINE_SYNC_START', count: keys.length })
  );

  let synced = 0;

  for (const reqKey of keys) {
    try {
      const res  = await cache.match(reqKey);
      const data = await res.json();

      // Notificar a la app para que reenvíe la escritura a Firebase
      clients.forEach((c) =>
        c.postMessage({ type: 'REPLAY_WRITE', payload: data })
      );

      await cache.delete(reqKey);
      synced++;
    } catch (err) {
      console.warn('[SW] Failed to replay write:', err.message);
    }
  }

  // Notificar finalización
  clients.forEach((c) =>
    c.postMessage({ type: 'OFFLINE_SYNC_DONE', synced, total: keys.length })
  );

  console.log(`[SW] ✅ Replayed ${synced}/${keys.length} offline writes.`);
}

/**
 * Página de error offline mínima mostrada cuando nada está en caché.
 */
function offlineFallbackHTML() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sin conexión — Ultra Administrador</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0b; color: #fff;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      height: 100vh; font-family: system-ui, sans-serif;
      text-align: center; padding: 24px;
    }
    .icon { font-size: 72px; margin-bottom: 20px; }
    h1 { font-size: 22px; margin-bottom: 10px; }
    p  { font-size: 14px; color: #888; margin-bottom: 28px; max-width: 320px; }
    .badge {
      background: rgba(139,92,246,0.15);
      border: 1px solid rgba(139,92,246,0.3);
      color: #a78bfa; border-radius: 20px;
      padding: 4px 12px; font-size: 12px; margin-bottom: 28px;
    }
    button {
      background: #7c3aed; color: #fff;
      border: none; border-radius: 12px;
      padding: 14px 32px; font-size: 15px; cursor: pointer;
      font-weight: 600;
    }
    button:active { background: #6d28d9; }
  </style>
</head>
<body>
  <div class="icon">📡</div>
  <div class="badge">Modo Sin Conexión</div>
  <h1>Sin conexión a internet</h1>
  <p>El sistema intentará sincronizar automáticamente todos los datos ingresados cuando se reestablezca la conexión.</p>
  <button onclick="location.reload()">Reintentar Conexión</button>
</body>
</html>`;
}
