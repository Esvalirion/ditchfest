// robots.txt and sitemap.xml. Without these routes the SPA catch-all answered
// both with index.html, so crawlers got HTML where they expected text/XML.
//
// The origin is taken per request (the app is mirrored across domains, same as
// the OG cards in og.js). The sitemap lists the static pages plus every map and
// map author of the visible editions — the same rows the Maps page shows.
const { pool } = require('../db');

const STATIC_PATHS = [
  '/',
  '/maps',
  '/signs',
  '/studio',
  '/top-players',
  '/top-mappers',
  '/tierlist/mappers',
  '/tierlist/ditchfests',
  '/missing-tmx',
];

// One query per hour at most: the catalog only changes on sync.
const CACHE_TTL_MS = 60 * 60 * 1000;
let cache = null; // { value: { maps, mappers }, expires }

async function sitemapIds() {
  if (cache && cache.expires > Date.now()) return cache.value;
  const { rows } = await pool.query(`
    SELECT DISTINCT m.map_uid, m.author_account_id
      FROM maps m
      JOIN editions e ON e.campaign_id = COALESCE(m.display_campaign_id, m.campaign_id)
     WHERE NOT e.hidden`);
  const value = {
    maps: rows.map((r) => r.map_uid),
    mappers: [...new Set(rows.map((r) => r.author_account_id).filter(Boolean))],
  };
  cache = { value, expires: Date.now() + CACHE_TTL_MS };
  return value;
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function robotsTxt(origin) {
  return ['User-agent: *', 'Disallow: /admin', 'Disallow: /api/', 'Disallow: /auth/', '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');
}

async function sitemapXml(origin) {
  const { maps, mappers } = await sitemapIds();
  const paths = [
    ...STATIC_PATHS,
    ...maps.map((uid) => `/map/${encodeURIComponent(uid)}`),
    ...mappers.map((id) => `/mapper/${encodeURIComponent(id)}`),
  ];
  const urls = paths.map((p) => `  <url><loc>${escapeXml(origin + p)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

module.exports = { robotsTxt, sitemapXml };
