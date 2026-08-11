/**
 * @file server.js
 * @description Local Express server to host the SPA for local development and Render deployment.
 *
 * Cache Strategy:
 *  - index.html, sw.js, version.json → no-cache (always revalidate, never serve stale)
 *  - /src/ and /assets/ static files  → max-age=3600 (1 hour — acceptable without hashing)
 *  - API responses                    → no-store (always fresh)
 */

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── App version (keep in sync with public/version.json and src/config/app.config.js) ──
const WEB_VERSION = '1.1.0';
const BUILD_TIME  = new Date().toISOString();

// ── Health check ────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    service: 'Ultra Administrador',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ── Web version endpoint — used by Android WebView to detect updates ────────────
app.get('/api/version', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    version: WEB_VERSION,
    buildTime: BUILD_TIME,
    minNativeVersion: '1.4.7'
  });
});

// ── Keep-alive / cron ping ──────────────────────────────────────────────────────
app.get('/api/cron/ping', (req, res) => {
  const configuredToken = process.env.CRON_JOB_TOKEN || '';
  const incomingToken = req.query.token || req.get('x-cron-token') || '';

  if (configuredToken && incomingToken !== configuredToken) {
    return res.status(401).json({
      ok: false,
      error: 'Token de cron job inválido'
    });
  }

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    message: 'Keep alive recibido correctamente',
    service: 'Ultra Administrador',
    version: WEB_VERSION,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ── Smart cache middleware ──────────────────────────────────────────────────────
// Applied BEFORE static middleware so headers are set correctly per file type.
app.use((req, res, next) => {
  const url = req.path;

  if (
    url === '/' ||
    url.endsWith('/index.html') ||
    url.endsWith('/sw.js') ||
    url.endsWith('/version.json') ||
    url.endsWith('/manifest.json')
  ) {
    // Critical files: always revalidate, never serve stale.
    // ETag will still allow 304 Not Modified responses for efficiency.
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');
  } else if (url.startsWith('/src/') || url.startsWith('/assets/') || url.startsWith('/public/')) {
    // Static source files: 1-hour cache. Short enough to pick up updates,
    // long enough to avoid unnecessary requests.
    res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
  } else {
    // Default for anything else (landing page assets, icons, fonts, etc.)
    res.setHeader('Cache-Control', 'public, max-age=1800, must-revalidate');
  }

  next();
});

// ── Static file serving ─────────────────────────────────────────────────────────
app.use('/landing', express.static(path.join(__dirname, 'public', 'landing')));
app.use('/public',  express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets',  express.static(path.join(__dirname, 'assets')));
app.use('/assets',  express.static(path.join(__dirname, 'public', 'assets')));
app.use('/src',     express.static(path.join(__dirname, 'src')));

// ── Landing page route ──────────────────────────────────────────────────────────
app.get(['/landing', '/landing/', '/landing/index.html', '/public/landing', '/public/landing/index.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing', 'index.html'));
});

// ── SPA fallback: all non-API, non-asset routes serve index.html ────────────────
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[Ultra Administrador] Server v${WEB_VERSION} running on port ${PORT}`);
  console.log(`[Ultra Administrador] Local: http://localhost:${PORT}`);
});

