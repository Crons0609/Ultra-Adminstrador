/**
 * @file sw.js
 * @description Ultra Administrador — Service Worker
 *
 * Estrategia v12 (Network-First para garantizar actualizaciones automáticas):
 *  - index.html / navegación SPA  → Network First  (siempre la versión más nueva de Render)
 *  - /src/ y /assets/ locales      → Network First  (con fallback a caché cuando hay error de red)
 *  - CDNs (Firebase, fuentes, etc) → Stale-While-Revalidate (rendimiento + disponibilidad offline)
 *  - Firebase RTDB / Auth          → NUNCA interceptado (Firebase maneja su propia persistencia)
 *  - Background Sync               → Cola de escrituras pendientes al reconectarse
 *
 * IMPORTANTE: Cambiar CACHE_VERSION en cada deploy fuerza la limpieza de cachés antiguos
 * en todos los dispositivos existentes (incluyendo APKs instaladas).
 */

const CACHE_VERSION = 'ultra-admin-v12-network-first';
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

// Cola de escrituras offline (declarada aquí para que activate pueda referenciarla)
const QUEUE_CACHE = 'ultra-offline-queue-v1';

// ─────────────────────────────────────────────────────────────────────────────
// INSTALL — cache del app shell
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v12-network-first — caching Firebase SDK & critical assets...');
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // Solo pre-cacheamos los SDKs externos que no cambian frecuentemente.
      // Los archivos locales (/src/, /index.html) se obtienen frescos de la red.
      const externalAssets = SHELL_ASSETS.filter(a => a.startsWith('https://'));
      return cache.addAll(externalAssets).catch((err) => {
        console.warn('[SW] Some external assets failed to cache on install:', err.message);
      });
    })
  );
  self.skipWaiting();
});

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVATE — limpiar cachés viejos
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v12-network-first — cleaning old caches...');
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION && k !== QUEUE_CACHE)
          .map((k) => {
            console.log('[SW] Deleted old cache:', k);
            return caches.delete(k);
          })
      );

      // Notificar a todos los clientes que hay una nueva versión del SW activa.
      // Esto permite que la APK muestre un mensaje o recargue de forma controlada.
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach((c) => c.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }));
      console.log(`[SW] ✅ Notified ${clients.length} client(s) of SW update.`);
    })
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

  // ── Navegación principal (index.html / rutas SPA) → Network First ──────────────
  // CRÍTICO: Siempre intenta obtener el HTML más nuevo de Render.
  // Si falla la red, cae a caché para funcionar offline.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirstWithCache(req));
    return;
  }

  // ── Código fuente local (/src/, /assets/) → Network First ────────────────────
  // Garantiza que los cambios en JS/CSS/componentes aparezcan inmediatamente.
  if (url.includes('/src/') || url.includes('/assets/')) {
    event.respondWith(networkFirstWithCache(req));
    return;
  }

  // ── Shell assets explícitos (manifest, sw, version) → Network First ──────────
  if (isShellRequest(url)) {
    event.respondWith(networkFirstWithCache(req));
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

    case 'FORCE_UPDATE':
      // Forzar actualización completa: eliminar todos los cachés y recargar.
      // Invocado por AndroidBridge cuando el usuario toca "Buscar actualizaciones".
      caches.keys().then((keys) =>
        Promise.all(keys.filter(k => k !== QUEUE_CACHE).map(k => caches.delete(k)))
      ).then(() => {
        console.log('[SW] 🔄 All caches cleared on FORCE_UPDATE request.');
        self.skipWaiting();
        // Notificar al cliente para que recargue
        event.source?.postMessage({ type: 'RELOAD_NOW' });
      });
      break;

    case 'CHECK_VERSION':
      // Responder con la versión del SW activo
      event.source?.postMessage({ type: 'SW_VERSION', version: CACHE_VERSION });
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
