// Shared by routes/editions.js (as-is, newest first) and routes/onboarding.js
// (filtered + reversed) so both pages read the exact same catalog.
const { pool } = require('../db');
const { canon } = require('./links');

/** Editions (newest first) with their maps and per-map vote counts.
 *  campaign_id is assigned by Nadeo in creation order, so it's a reliable
 *  chronological key — the folder "position" field is not. */
async function getEditions() {
  const { rows } = await pool.query(`
    SELECT
      e.campaign_id,
      e.name,
      e.media,
      COALESCE(
        json_agg(
          json_build_object(
            'mapUid', m.map_uid,
            'name', m.name,
            'author', m.author_account_id,
            'authorName', m.author_name,
            'thumbnailUrl', m.thumbnail_url,
            'votes', (SELECT COUNT(DISTINCT ${canon('v.account_id')})::int FROM votes v
                        WHERE v.map_uid = m.map_uid)
          ) ORDER BY m.position ASC NULLS LAST, m.name ASC
        ) FILTER (WHERE m.map_uid IS NOT NULL),
        '[]'
      ) AS maps
    FROM editions e
    LEFT JOIN maps m ON m.campaign_id = e.campaign_id
    GROUP BY e.campaign_id
    ORDER BY e.campaign_id DESC
  `);
  return rows.map((e) => ({ campaignId: e.campaign_id, name: e.name, media: e.media, maps: e.maps }));
}

module.exports = { getEditions };
