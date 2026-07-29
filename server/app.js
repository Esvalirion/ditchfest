const express = require('express');
const path = require('path');
const fs = require('fs');
const router = require('./routes');

const app = express();

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
