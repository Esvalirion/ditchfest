// DB writes/reads specific to the trackmania.io catalog sync. Ported from
// the relevant parts of the real tm-votes' src/db.ts (kept as a private
// reference, not duplicated in this repo — see COTD_MIGRATION_PLAN.md).
const { pool } = require('../db');

// New editions are assigned sort_order = MAX(sort_order)+1 at first sync, so
// the board shows campaigns newest-first (high weight → low weight) without an
// admin having to touch them. On conflict the UPDATE branch deliberately does
// NOT set sort_order — a re-sync must never overwrite a value an admin moved.
async function upsertEdition({ campaignId, name, media, position }) {
  await pool.query(
    `INSERT INTO editions (campaign_id, name, media, position, sort_order, updated_at)
     VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM editions), now())
     ON CONFLICT (campaign_id) DO UPDATE SET
       name = EXCLUDED.name, media = EXCLUDED.media,
       position = EXCLUDED.position, updated_at = now()`,
    [campaignId, name, media, position]
  );
}

async function upsertMap({ mapUid, campaignId, name, authorAccountId, authorName, thumbnailUrl, position }) {
  await pool.query(
    `INSERT INTO maps (map_uid, campaign_id, name, author_account_id, author_name, thumbnail_url, position, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (map_uid) DO UPDATE SET
       campaign_id = EXCLUDED.campaign_id, name = EXCLUDED.name,
       author_account_id = EXCLUDED.author_account_id, author_name = EXCLUDED.author_name,
       thumbnail_url = EXCLUDED.thumbnail_url, position = EXCLUDED.position,
       updated_at = now()`,
    [mapUid, campaignId, name, authorAccountId, authorName, thumbnailUrl, position]
  );
}

// The two functions below touch the migration-007 columns (tmx_style/
// tmx_tags/tmx_styles_updated_at). They're only called from the catalog sync,
// whose TMX-style sweep is wrapped in try/catch — so a DB without 007 yet
// logs an error each run but doesn't break the sync. Harmless noise that
// disappears once 007 is applied.

/** Persist a map's TMX style/tags, separately from the catalog upsert. The
 *  catalog sync (services/sync.js) calls this after a TMX lookup; passing
 *  null style+tags is a valid "confirmed not on TMX" result and still stamps
 *  tmx_styles_updated_at so the same map isn't refetched every run. Pass
 *  updatedAt=null to leave the timestamp untouched (e.g. on a network error
 *  where we want to retry next time). */
async function updateMapTmxStyles({ mapUid, style, tags, updatedAt }) {
  if (updatedAt === undefined) updatedAt = new Date();
  await pool.query(
    `UPDATE maps SET tmx_style = $1, tmx_tags = $2, tmx_styles_updated_at = $3
     WHERE map_uid = $4`,
    [style ?? null, tags ?? null, updatedAt, mapUid]
  );
}

/** map_uids of the maps least-recently (or never) checked against TMX — used
 *  to rotate style refreshes across the whole catalog over successive syncs,
 *  the same way getStalestCampaignIds rotates map refreshes. */
async function getMapsMissingTmxStyles(limit) {
  const { rows } = await pool.query(
    `SELECT map_uid FROM maps
     WHERE tmx_styles_updated_at IS NULL
        OR tmx_styles_updated_at < now() - interval '30 days'
     ORDER BY tmx_styles_updated_at ASC NULLS FIRST
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => r.map_uid);
}

/** Campaign IDs that already have at least one map synced. */
async function getSyncedCampaignIds() {
  const { rows } = await pool.query('SELECT DISTINCT campaign_id FROM maps');
  return new Set(rows.map((r) => r.campaign_id));
}

/** Campaign IDs of already-synced editions, least- to most-recently-refreshed
 *  — used to rotate map refreshes across ALL editions over time. */
async function getStalestCampaignIds(limit) {
  const { rows } = await pool.query(
    `SELECT campaign_id, MAX(updated_at) AS last FROM maps
     GROUP BY campaign_id ORDER BY last ASC LIMIT $1`,
    [limit]
  );
  return rows.map((r) => r.campaign_id);
}

/** Distinct mapper accountIds whose display name is still missing. */
async function getAccountsMissingName(limit) {
  const { rows } = await pool.query(
    `SELECT DISTINCT author_account_id AS id FROM maps
     WHERE author_account_id IS NOT NULL
       AND (author_name IS NULL OR author_name = '' OR author_name = author_account_id)
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => r.id);
}

/** Set the display name for every map by the given mapper. */
async function updateAuthorName(accountId, name) {
  await pool.query('UPDATE maps SET author_name = $1 WHERE author_account_id = $2', [name, accountId]);
}

module.exports = {
  upsertEdition,
  upsertMap,
  updateMapTmxStyles,
  getMapsMissingTmxStyles,
  getSyncedCampaignIds,
  getStalestCampaignIds,
  getAccountsMissingName,
  updateAuthorName,
};
