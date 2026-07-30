// Shared by routes/editions.js (as-is, newest first) and routes/onboarding.js
// (filtered + reversed) so both pages read the exact same catalog.
const { pool } = require('../db');
const { canon } = require('./links');

/** Editions (newest first) with their maps and per-map vote counts.
 *  campaign_id is assigned by Nadeo in creation order, so it's a reliable
 *  chronological key — the folder "position" field is not.
 *
 *  A map's effective campaign is display_campaign_id when an admin has set
 *  one (routes/campaigns.js), falling back to its real synced campaign_id
 *  otherwise — lets an overflow campaign (Nadeo caps a campaign at 25 maps)
 *  be folded into the main themed edition it actually belongs to, or into an
 *  admin-created folder that has no real campaign at all (negative
 *  campaign_id — see 004_campaign_folders.sql). display_name overrides the
 *  synced name the same way. Hidden editions, and editions left with no
 *  maps this way (or not yet synced), are dropped: neither is useful to
 *  show or to walk through in onboarding.
 *
 *  Order is sort_order (set by /api/campaigns/reorder) when an admin has
 *  arranged the board, then the chronological rule below for everything
 *  else — so newly-synced editions the admin hasn't touched yet still slot
 *  in after the manually-arranged ones instead of vanishing to wherever
 *  their id would otherwise place them. */
async function getEditions() {
  const { rows } = await pool.query(`
    SELECT
      e.campaign_id,
      COALESCE(e.display_name, e.name) AS name,
      e.media,
      e.theme,
      e.sort_order,
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
    LEFT JOIN maps m ON COALESCE(m.display_campaign_id, m.campaign_id) = e.campaign_id
    WHERE NOT e.hidden
    GROUP BY e.campaign_id
    HAVING COUNT(m.map_uid) > 0
    ORDER BY
      (e.sort_order IS NULL), e.sort_order ASC,
      -- An admin-created folder (negative campaign_id) has no chronology of
      -- its own — rank it by the newest real campaign among the maps
      -- actually stashed in it, so it doesn't sink to the bottom under
      -- every real edition ever synced.
      GREATEST(e.campaign_id, MAX(m.campaign_id)) DESC
  `);
  return rows.map((e) => ({
    campaignId: e.campaign_id,
    name: e.name,
    media: e.media,
    theme: e.theme,
    maps: e.maps,
  }));
}

module.exports = { getEditions };
