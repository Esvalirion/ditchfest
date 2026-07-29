// DB writes/reads specific to the trackmania.io catalog sync. Ported from
// the relevant parts of the real tm-votes' src/db.ts (kept as a private
// reference, not duplicated in this repo — see COTD_MIGRATION_PLAN.md).
const { pool } = require('../db');

async function upsertEdition({ campaignId, name, media, position }) {
  await pool.query(
    `INSERT INTO editions (campaign_id, name, media, position, updated_at)
     VALUES ($1, $2, $3, $4, now())
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
  getSyncedCampaignIds,
  getStalestCampaignIds,
  getAccountsMissingName,
  updateAuthorName,
};
