/**
 * @file server.js
 * @description Local Express server to host the SPA for local development and Render deployment.
 */

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'Ultra Administrador',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/cron/ping', (req, res) => {
  const configuredToken = process.env.CRON_JOB_TOKEN || '';
  const incomingToken = req.query.token || req.get('x-cron-token') || '';

  if (configuredToken && incomingToken !== configuredToken) {
    return res.status(401).json({
      ok: false,
      error: 'Token de cron job inválido'
    });
  }

  res.json({
    ok: true,
    message: 'Keep alive recibido correctamente',
    service: 'Ultra Administrador',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Disable caching for development
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Serve static assets from public and src directories
app.use(express.static(path.join(__dirname, 'public')));
app.use('/src', express.static(path.join(__dirname, 'src')));

// SPA fallback: redirect all other requests to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Local address: http://localhost:${PORT}`);
});
