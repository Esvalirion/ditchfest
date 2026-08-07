// Home-page dashboard: one response carrying the headline numbers (total
// maps / mappers / editions / votes), a summary of the latest edition, and
// a per-edition map count series for the bar chart.
//
// Every aggregate reuses the same rules as the rest of the app:
//  - identity is resolved at read time via canon() (services/links.js), so a
//    mapper with linked alts counts once and a voter's group still casts one
//    "+" per map;
//  - a map's effective campaign is COALESCE(display_campaign_id, campaign_id),
//    matching services/editions.js;
//  - a public edition is one that is not hidden AND has at least one map, the
//    same HAVING/EXISTS clauses used by getEditions().
const { pool } = require('../db');
const { canon } = require('./links');

/** SQL fragment matching the "effective campaign" rule used everywhere that
 *  folds maps into the edition they're displayed under. */
const EFFECTIVE_CAMPAIGN = 'COALESCE(m.display_campaign_id, m.campaign_id)';

/** The exact ORDER BY getEditions() uses to rank editions newest-first, so the
 *  home page's "latest edition" and per-edition chart can never disagree with
 *  the Maps page about which edition sits on top. */
const EDITION_ORDER = `(e.sort_order IS NULL), e.sort_order DESC,
      GREATEST(e.campaign_id, MAX(m.campaign_id)) DESC`;

async function getHomeStats() {
  const [totals, latest, perEdition] = await Promise.all([
    getTotals(),
    getLatestEdition(),
    getPerEdition(),
  ]);
  return { totals, latest, perEdition };
}

/** Headline counters for the three metric cards plus total votes cast. */
async function getTotals() {
  const authorCanon = canon('m.author_account_id');
  const voterCanon = canon('v.account_id');
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM maps) AS maps,
      (SELECT COUNT(DISTINCT ${authorCanon})::int
         FROM maps m WHERE m.author_account_id IS NOT NULL) AS mappers,
      (SELECT COUNT(*)::int
         FROM editions e
         WHERE NOT e.hidden
           AND EXISTS (SELECT 1 FROM maps m
                       WHERE ${EFFECTIVE_CAMPAIGN} = e.campaign_id)) AS editions,
      (SELECT COUNT(DISTINCT v.map_uid || '|' || ${voterCanon})::int
         FROM votes v) AS votes
  `);
  const r = rows[0] || {};
  return {
    maps: r.maps || 0,
    mappers: r.mappers || 0,
    editions: r.editions || 0,
    votes: r.votes || 0,
  };
}

/** The newest non-hidden edition that has maps, with its map/vote totals, the
 *  three most-voted maps, and the mapper whose maps gathered the most votes.
 *  Returns null when no public edition with maps exists yet. */
async function getLatestEdition() {
  const { rows } = await pool.query(`
    SELECT e.campaign_id,
           COALESCE(e.display_name, e.name) AS name,
           e.theme,
           e.media
    FROM editions e
    LEFT JOIN maps m ON ${EFFECTIVE_CAMPAIGN} = e.campaign_id
    WHERE NOT e.hidden
    GROUP BY e.campaign_id, e.name
    HAVING COUNT(m.map_uid) > 0
    ORDER BY ${EDITION_ORDER}
    LIMIT 1
  `);
  if (!rows.length) return null;
  const edition = rows[0];

  const [counts, topMaps, topMapper] = await Promise.all([
    getEditionCounts(edition.campaign_id),
    getTopMaps(edition.campaign_id, 3),
    getTopMapper(edition.campaign_id),
  ]);

  return {
    campaignId: edition.campaign_id,
    name: edition.name,
    theme: edition.theme,
    media: edition.media,
    mapCount: counts.mapCount,
    voteCount: counts.voteCount,
    topMaps,
    topMapper,
  };
}

/** How many maps an edition shows, and how many distinct (map, identity) votes
 *  were cast across them. */
async function getEditionCounts(campaignId) {
  const voterCanon = canon('v.account_id');
  const { rows } = await pool.query(
    `
    SELECT
      COUNT(DISTINCT m.map_uid)::int AS map_count,
      COUNT(DISTINCT v.map_uid || '|' || ${voterCanon})::int AS vote_count
    FROM maps m
    LEFT JOIN votes v ON v.map_uid = m.map_uid
    WHERE ${EFFECTIVE_CAMPAIGN} = $1
  `,
    [campaignId]
  );
  const r = rows[0] || {};
  return { mapCount: r.map_count || 0, voteCount: r.vote_count || 0 };
}

/** The `limit` most-voted maps in an edition, most votes first. */
async function getTopMaps(campaignId, limit) {
  const voterCanon = canon('v.account_id');
  const { rows } = await pool.query(
    `
    SELECT m.map_uid AS "mapUid",
           m.name,
           m.author_name AS "authorName",
           m.thumbnail_url AS "thumbnailUrl",
           COUNT(DISTINCT v.map_uid || '|' || ${voterCanon})::int AS votes
    FROM maps m
    LEFT JOIN votes v ON v.map_uid = m.map_uid
    WHERE ${EFFECTIVE_CAMPAIGN} = $1
    GROUP BY m.map_uid, m.name, m.author_name, m.thumbnail_url
    ORDER BY votes DESC, m.name ASC
    LIMIT $2
  `,
    [campaignId, limit]
  );
  return rows;
}

/** The mapper whose maps in this edition gathered the most votes (ties break by
 *  name). Pools linked accounts via canon(), like the global mappers ranking.
 *  Returns null when the edition's maps have no recorded authors. */
async function getTopMapper(campaignId) {
  const authorCanon = canon('m.author_account_id');
  const voterCanon = canon('v.account_id');
  const { rows } = await pool.query(
    `
    SELECT ${authorCanon} AS account_id,
           COALESCE(
             MAX(CASE WHEN m.author_account_id = ${authorCanon} THEN m.author_name END),
             MAX(m.author_name)
           ) AS name,
           COUNT(DISTINCT v.map_uid || '|' || ${voterCanon})::int AS votes
    FROM maps m
    LEFT JOIN votes v ON v.map_uid = m.map_uid
    WHERE ${EFFECTIVE_CAMPAIGN} = $1
      AND m.author_account_id IS NOT NULL
    GROUP BY 1
    ORDER BY votes DESC, name ASC
    LIMIT 1
  `,
    [campaignId]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return { accountId: r.account_id, name: r.name, votes: r.votes };
}

/** Map count per public edition, newest-first (the client reverses it to plot
 *  chronologically left-to-right). Same ordering criterion as getEditions(). */
async function getPerEdition() {
  const { rows } = await pool.query(`
    SELECT e.campaign_id AS "campaignId",
           COALESCE(e.display_name, e.name) AS name,
           COUNT(m.map_uid)::int AS "mapCount"
    FROM editions e
    LEFT JOIN maps m ON ${EFFECTIVE_CAMPAIGN} = e.campaign_id
    WHERE NOT e.hidden
    GROUP BY e.campaign_id, e.name
    HAVING COUNT(m.map_uid) > 0
    ORDER BY ${EDITION_ORDER}
  `);
  return rows;
}

module.exports = { getHomeStats };
