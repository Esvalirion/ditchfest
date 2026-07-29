const express = require('express');
const path = require('path');
const fs = require('fs');
const router = require('./routes');

const app = express();

// Sits behind Nginx in production (see COTD_MIGRATION_PLAN.md Фаза 7). Without
// this, req.protocol always reports 'http' (the scheme Nginx actually connects
// with), even for real HTTPS visitors — and routes/auth.js's redirectUri()
// would then send TM OAuth an http:// callback that doesn't match what's
// registered on the OAuth app.
app.set('trust proxy', 1);

app.use(express.json());
app.use(router);

// Serve the built Vue client in production (Docker); skipped in local dev,
// where the client runs its own Vite dev server and proxies /api + /auth
// here instead (see client/vite.config.js).
const PUBLIC = path.join(__dirname, 'public');
if (fs.existsSync(PUBLIC)) {
  app.use(express.static(PUBLIC));
  app.get('*path', (_req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

module.exports = app;
