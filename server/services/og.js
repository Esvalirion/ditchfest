// Open Graph / Twitter Card previews for Discord, Telegram, Slack, etc.
//
// These crawlers don't run JavaScript, so a Vue SPA's <head> stays empty for
// them no matter what the client sets at runtime. To give each /map/:mapUid
// and /mapper/:id its own rich card, we intercept those routes in app.js before
// the SPA fallback, pull the lightest possible row from the DB (no external
// trackmania.io/TMX calls — a crawler only needs a title and a thumbnail), and
// inject the OG/Twitter meta tags into index.html.
//
// Everything here is best-effort: a DB hiccup or an unknown id degrades to the
// default site-wide card, never to a 500. Crawlers re-fetch occasionally, so
// the same link will pick up updated data on its own.
const { pool } = require('../db');
const { canon } = require('./links');
const { isCoauthorsMissing } = require('./coauthors');
const { getEditions } = require('./editions');

const SITE_NAME = 'Ditchfest Signs';
const SITE_DESCRIPTION = 'Community signs, ratings and leaderboards for Ditchfest maps.';

// In-memory cache so a crawler re-fetching the same link (Discord does this
// when you edit/repost) doesn't hit the DB each time. Tiny TTL: long enough to
// absorb a burst, short enough that a re-sync'd name/thumbnail shows up soon.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // key -> { value, expires }

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  let value;
  try {
    value = await loader();
  } catch (e) {
    console.error('og loader failed for', key, String(e));
    return null; // degrade to the default card
  }
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

/** One map's OG-relevant fields: name, thumbnail, author, edition, vote count.
 *  No leaderboard, no TMX lookup, no external calls — just the catalog row
 *  that sync.js keeps warm. Returns null when the map isn't in the catalog. */
async function getMapForOg(mapUid) {
  return cached('map:' + mapUid, async () => {
    const { rows } = await pool.query(
      `SELECT m.name, m.thumbnail_url, m.author_name, e.name AS edition_name,
              (SELECT COUNT(DISTINCT ${canon('v.account_id')})::int
                 FROM votes v WHERE v.map_uid = m.map_uid) AS votes
         FROM maps m
         JOIN editions e ON e.campaign_id = m.campaign_id
        WHERE m.map_uid = $1`,
      [mapUid]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    const votes = r.votes || 0;
    const by = r.author_name ? ` by ${r.author_name}` : '';
    const edition = r.edition_name ? ` · ${r.edition_name}` : '';
    const voteStr = ` · ${votes} ${votes === 1 ? 'vote' : 'votes'}`;
    return {
      title: r.name || 'Ditchfest map',
      description: `"${r.name || 'Map'}"${by}${edition}${voteStr} on Ditchfest`,
      image: r.thumbnail_url || null,
    };
  });
}

/** A mapper's OG-relevant fields: name, rank, votes, map count, and the best
 *  map's thumbnail (same one MapperView uses as its hero background). Name
 *  comes from the synced catalog/ranking; if it's null we don't chase the TM
 *  OAuth API for it (that's an external call a crawler preview shouldn't pay
 *  for) — the card falls back to a generic title. Returns null for unknown. */
async function getMapperForOg(accountId) {
  return cached('mapper:' + accountId, async () => {
    const members = await groupMembersLite(accountId);
    if (!members.length) return null;
    const identity = members[0];

    const rows = await rankingRows();
    const ranked = rows.find(
      (r) => String(r.account_id) === String(identity)
    );

    if (!ranked) {
      // Not in the mapper ranking: no maps credited. Still a valid account
      // page (a pure voter), just without mapper stats — generic card.
      const name = await catalogName(identity);
      if (!name) return null;
      return {
        title: `${name} — Ditchfest`,
        description: `${name} on Ditchfest Signs`,
        image: null,
      };
    }

    const rank = rows.indexOf(ranked) + 1; // rankingRows() is already sorted
    const name = ranked.name || (await catalogName(identity)) || 'Trackmania mapper';
    const total = rows.length;
    const votes = ranked.votes || 0;
    const mapCount = ranked.maps || 0;
    const bestThumb = await bestMapThumb(members);

    const rankStr = `#${rank} of ${total}`;
    const voteStr = `${votes} ${votes === 1 ? 'vote' : 'votes'}`;
    const mapStr = `${mapCount} ${mapCount === 1 ? 'map' : 'maps'}`;
    return {
      title: `${name} — ${rankStr}`,
      description: `${name} — ${rankStr} · ${voteStr} · ${mapStr} on Ditchfest`,
      image: bestThumb,
    };
  });
}

/** The full mapper ranking, votes-desc/name-asc, same shape as
 *  services/mapperRanking but WITHOUT the TM API name resolution (we fill
 *  missing names lazily from the catalog only when that identity is the one
 *  being previewed). Mirrors migration-008 fallback handling. */
async function rankingRows() {
  const authorCanon = canon('a.account_id');
  const voterCanon = canon('v.account_id');
  const base = (coauthorArm) => `
    WITH map_authors AS (
      SELECT map_uid, author_account_id AS account_id
        FROM maps WHERE author_account_id IS NOT NULL
      ${coauthorArm}
    )
    SELECT ${authorCanon} AS account_id,
           MAX(CASE WHEN a.account_id = m.author_account_id THEN m.author_name END) AS name,
           COUNT(DISTINCT a.map_uid || '|' || ${voterCanon})::int AS votes,
           COUNT(DISTINCT a.map_uid)::int AS maps
      FROM map_authors a
      LEFT JOIN maps m ON m.map_uid = a.map_uid
      LEFT JOIN votes v ON v.map_uid = a.map_uid
     GROUP BY 1
     ORDER BY votes DESC, name ASC NULLS LAST`;
  try {
    return (await pool.query(base('UNION ALL SELECT map_uid, account_id FROM map_coauthors'))).rows;
  } catch (e) {
    if (isCoauthorsMissing(e)) {
      return (await pool.query(base(''))).rows;
    }
    throw e;
  }
}

/** groupMembers() resolved inline — we only need the identity + alts for the
 *  thumbnail lookup, and avoiding the extra round-trips of links.js keeps this
 *  path cheap. Mirrors links.js groupMembers/canonicalId. */
async function groupMembersLite(accountId) {
  const { rows } = await pool.query(
    'SELECT primary_id FROM account_links WHERE account_id = $1',
    [accountId]
  );
  if (!rows.length) return [accountId]; // not linked: identity is itself
  const primary = rows[0].primary_id;
  const { rows: alts } = await pool.query(
    'SELECT account_id FROM account_links WHERE primary_id = $1',
    [primary]
  );
  return [primary, ...alts.map((r) => r.account_id)];
}

/** Best-effort name from the catalog's author_name; no external API call.
 *  Returns null if we genuinely don't know. */
async function catalogName(accountId) {
  const { rows } = await pool.query(
    'SELECT author_name FROM maps WHERE author_account_id = $1 AND author_name IS NOT NULL LIMIT 1',
    [accountId]
  );
  return rows[0]?.author_name || null;
}

/** Top-voted map's thumbnail across the identity's accounts (primary + alts),
 *  mirroring getMapperMaps' sort and co-author fallback. Null if mapless. */
async function bestMapThumb(members) {
  const ph = members.map((_, i) => `$${i + 1}`).join(', ');
  const select = (predicate) => `
    SELECT m.thumbnail_url,
           (SELECT COUNT(DISTINCT ${canon('v.account_id')})::int FROM votes v
              WHERE v.map_uid = m.map_uid) AS votes
      FROM maps m
     WHERE m.thumbnail_url IS NOT NULL AND (${predicate})
     ORDER BY votes DESC, m.name ASC LIMIT 1`;
  try {
    const { rows } = await pool.query(
      select(
        `m.map_uid IN (SELECT map_uid FROM maps WHERE author_account_id IN (${ph})
                 UNION
                 SELECT map_uid FROM map_coauthors WHERE account_id IN (${ph}))`
      ),
      members
    );
    return rows[0]?.thumbnail_url || null;
  } catch (e) {
    if (isCoauthorsMissing(e)) {
      const { rows } = await pool.query(
        select(`m.author_account_id IN (${ph})`),
        members
      );
      return rows[0]?.thumbnail_url || null;
    }
    throw e;
  }
}

/** Build the <head> injection: a block of OG + Twitter meta tags, plus a
 *  <title> override (crawlers read <title> too). Any pre-existing og:/twitter:
 *  meta tags baked into index.html are stripped first — otherwise crawlers see
 *  two complete sets and Discord renders the second one as an extra thumbnail
 *  alongside the real card image. Returns the rewritten HTML, or the input
 *  unchanged if no <title> and no </head> are found. */
function injectOg(html, { title, description, image, url, origin }) {
  const cardImage = image || `${origin}/res/og-default.png`;
  const ogTitle = escapeHtml(title);
  const ogDesc = escapeHtml(description || SITE_DESCRIPTION);
  const ogUrl = escapeHtml(url || origin);
  const tags = [
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${ogTitle}" />`,
    `<meta property="og:description" content="${ogDesc}" />`,
    `<meta property="og:url" content="${ogUrl}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:image" content="${escapeHtml(cardImage)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${ogTitle}" />`,
    `<meta name="twitter:description" content="${ogDesc}" />`,
    `<meta name="twitter:image" content="${escapeHtml(cardImage)}" />`,
  ].join('\n  ');

  // Drop any existing og:/twitter: meta tags from index.html so the injected
  // set is the only one crawlers see — index.html carries a default set as the
  // dev/Vite fallback, and leaving it in produces duplicates in production.
  const cleaned = html.replace(
    /[ \t]*<meta\s+(?:property|name)=["](?:og:|twitter:)[^>]*>\s*/gi,
    ''
  );

  const titleTag = `<title>${ogTitle}</title>`;
  // Replace the existing <title>...</title> (index.html always has one) and
  // drop the OG block right after it. If there's no <title>, insert before
  // </head> instead.
  if (/<title>[^<]*<\/title>/i.test(cleaned)) {
    return cleaned.replace(/<title>[^<]*<\/title>/i, `${titleTag}\n  ${tags}`);
  }
  return cleaned.replace(/<\/head>/i, `  ${tags}\n  ${titleTag}\n</head>`);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The /maps catalog page's OG card: an invitation to vote, paired with the
 *  newest edition's banner (or, when the edition has no banner — common for
 *  fresh editions — the first map's thumbnail). Uses getEditions() rather than
 *  re-implementing the edition ordering (sort_order + display_campaign_id +
 *  hidden + folders), so this card can never disagree with the page itself
 *  about which edition is "newest". The whole editions query is cached here so
 *  a crawler re-fetch is cheap. Returns null on any failure (default card). */
async function getMapsPageForOg() {
  return cached('maps', async () => {
    const editions = await getEditions();
    if (!editions.length) return null;
    const newest = editions[0];
    const editionName = newest.name ? `${newest.name}` : '';
    const image =
      newest.media ||
      newest.maps?.[0]?.thumbnailUrl ||
      null;
    const title = editionName
      ? `Vote on the latest Ditchfest — ${editionName}`
      : 'Vote on the latest Ditchfest maps';
    const description =
      'Pick the best Ditchfest maps. Sign in with Trackmania, hit "+" on the ' +
      'ones you love, and shape the community ranking.';
    return { title, description, image };
  });
}

module.exports = {
  SITE_NAME,
  SITE_DESCRIPTION,
  getMapForOg,
  getMapperForOg,
  getMapsPageForOg,
  injectOg,
};
