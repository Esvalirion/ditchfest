const express = require('express');
const path = require('path');
const fs = require('fs');
const router = require('./routes');
const {
  SITE_NAME,
  SITE_DESCRIPTION,
  getMapForOg,
  getMapperForOg,
  getMapsPageForOg,
  injectOg,
} = require('./services/og');

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
const INDEX_HTML_PATH = path.join(PUBLIC, 'index.html');
const SERVES_CLIENT = fs.existsSync(PUBLIC);
// routes/auth.js checks this to decide whether the post-login redirect goes
// back to the domain the request came in on (prod, same origin serves API +
// client — works for every domain this app is mirrored on) or to the fixed
// TM_FRONTEND_URL (dev, separate Vite server on its own port).
app.locals.servesClient = SERVES_CLIENT;
if (SERVES_CLIENT) {
  // index.html is read once at boot and reused for every response: injecting
  // OG tags into a fresh copy per request would mean a disk read on every
  // crawler fetch. The built file is immutable per deploy, so this is safe.
  const INDEX_HTML = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  // index:false so GET / doesn't short-circuit on public/index.html before
  // reaching the catch-all below — without this, the root (and only the root)
  // would be served raw, bypassing the OG injection and leaking the relative
  // og:image baked into index.html. Asset paths (/assets/*, /res/*, /Signs/*)
  // are unaffected: they still resolve to files here as before.
  app.use(express.static(PUBLIC, { index: false }));

  // Rich previews (Discord/Telegram/Slack/Twitter). Crawlers don't run JS, so
  // a Vue SPA's <head> is empty for them — here we inject OG/Twitter meta tags
  // into index.html before serving. For /map/:mapUid, /mapper/:id and /maps the
  // card varies (resolved from the DB, best-effort); every other route gets the
  // default site card. The origin is derived per request so og:image/og:url are
  // always absolute, which the OG spec requires and crawlers expect — important
  // because the app is mirrored across multiple domains.
  app.get('*path', async (req, res) => {
    const origin = `${req.protocol}://${req.get('host')}`;
    const url = origin + req.originalUrl.split('?')[0];
    try {
      const mapMatch = /^\/map\/([^/?#]+)/.exec(req.path);
      const mapperMatch = /^\/mapper\/([^/?#]+)/.exec(req.path);

      let data;
      if (mapMatch) {
        const og = await getMapForOg(decodeURIComponent(mapMatch[1]));
        data = og
          ? { ...og, url, origin }
          : { title: SITE_NAME, description: SITE_DESCRIPTION, image: null, url, origin };
      } else if (mapperMatch) {
        const og = await getMapperForOg(decodeURIComponent(mapperMatch[1]));
        data = og
          ? { ...og, url, origin }
          : { title: SITE_NAME, description: SITE_DESCRIPTION, image: null, url, origin };
      } else if (req.path === '/maps') {
        const og = await getMapsPageForOg();
        data = og
          ? { ...og, url, origin }
          : { title: SITE_NAME, description: SITE_DESCRIPTION, image: null, url, origin };
      } else {
        // Every other route (home, /top-mappers, admin, …): default card.
        // Routed through injectOg too so og:image/og:url are absolute
        // (consistent with the per-link paths and the OG spec).
        data = { title: SITE_NAME, description: SITE_DESCRIPTION, image: null, url, origin };
      }
      res.type('html').send(injectOg(INDEX_HTML, data));
    } catch (e) {
      // Safety net: the per-id loaders already swallow DB errors via cached(),
      // but if something unexpected throws in the async path, never hang the
      // request — fall back to the plain SPA HTML so the page still loads.
      console.error('og injection failed', String(e));
      res.sendFile(INDEX_HTML_PATH);
    }
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

module.exports = app;
