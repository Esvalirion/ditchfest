module.exports = {
  PORT: process.env.PORT || 3000,
  USER_AGENT: process.env.USER_AGENT || 'ditchfest / contact@example.com',

  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  JWT_TTL_SECONDS: 7 * 24 * 60 * 60, // 7 days — same lifetime core.js already expects

  TM_CLIENT_ID: process.env.TM_CLIENT_ID,
  TM_CLIENT_SECRET: process.env.TM_CLIENT_SECRET,
  // No TM_REDIRECT_URI here on purpose — routes/auth.js derives it from the
  // incoming request (matches the real tm-votes source), so it's correct on
  // every domain the app is served from without config. All of those
  // domains still need to be registered as Redirect URIs on the TM OAuth
  // app at api.trackmania.com — that's a one-time dashboard step, not env.
  TM_FRONTEND_URL: process.env.TM_FRONTEND_URL || 'http://localhost:5173',

  // Single accountId — the root admin. Always admin, independent of the
  // `admins` table, and can't be removed via /api/admins (mirrors
  // ROOT_ADMIN_ID in the real tm-votes source and ADMIN_TM_NAMES in COTD).
  ROOT_ADMIN_ID: process.env.ROOT_ADMIN_ID || '',

  // Catalog auto-sync from trackmania.io (services/sync.js). Same club/folder
  // as the real tm-votes source — these identify the Ditchfest club and the
  // folder inside it holding the DF campaigns, not secrets.
  TM_CLUB_ID: process.env.TM_CLUB_ID || '',
  TM_FOLDER_ID: process.env.TM_FOLDER_ID || '',
  TMIO_USER_AGENT: process.env.TMIO_USER_AGENT || 'ditchfest / contact@example.com',
  // Guards the manual POST /api/sync trigger (X-Sync-Secret header) — the
  // cron-scheduled run doesn't need it, only the manual one does.
  SYNC_SECRET: process.env.SYNC_SECRET || '',

  // Openplanet plugin auth (routes/plugin.js POST /api/plugin/login): the
  // secret from the Authentication tab of the plugin's admin page on
  // openplanet.dev. Empty = plugin login answers 503.
  OPENPLANET_AUTH_SECRET: process.env.OPENPLANET_AUTH_SECRET || '',

  // Shared Nadeo gateway on tm-network (trackmania/tm-api) and the club rooms
  // the plugin may ask about (services/room.js), "club:room" pairs. The first
  // is the default — the DITCHFEST fest room; the second is the Openplanet
  // School room the plugin's developer builds use. Not secrets.
  TM_API_URL: process.env.TM_API_URL || 'http://tm-api-svc:3002',
  PLUGIN_ROOMS: (process.env.PLUGIN_ROOMS || '52818:316252,70151:635523')
    .split(',')
    .map((pair) => pair.split(':').map(Number))
    .map(([club, room]) => ({ club, room })),
};
