// Shared by routes/editions.js (as-is, newest/high-weight first) and
// routes/onboarding.js (reversed to walk history forward) so both pages read
// the exact same catalog.
const { pool } = require('../db');
const { canon } = require('./links');
const { getTagsTable, parseTagIds } = require('./tmx');
const { getCoauthorsForMaps } = require('./coauthors');
const { TMIO_USER_AGENT } = require('../config');

/** Editions (newest/high-weight first) with their maps and per-map vote counts.
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
 *  Order is sort_order DESC (newest campaigns have the highest weight — new
 *  editions get MAX(sort_order)+1 at first sync, see services/catalog.js),
 *  then editions with no sort_order yet, ranked chronologically below the
 *  weighted ones. */
async function getEditions() {
  // The tag id→{name,color} table is cached in-process (see services/tmx.js);
  // resolve it once here so each map's raw "60,12,1" tag string expands to
  // readable names. Empty on a TMX outage → tags just stay blank, style still
  // shows.
  const tagTable = await getTagsTable(TMIO_USER_AGENT);
  const rows = (await pool.query(editionsQuery())).rows;
  // Co-authors are attached in a second pass: one batched query for the whole
  // catalog (getCoauthorsForMaps) instead of N per-map lookups.
  const allMapUids = rows.flatMap((e) => e.maps.map((m) => m.mapUid)).filter(Boolean);
  const coauthorsByMap = await getCoauthorsForMaps(allMapUids);
  return rows.map((e) => ({
    campaignId: e.campaign_id,
    name: e.name,
    media: e.media,
    theme: e.theme,
    maps: e.maps.map((m) => buildMapStyles(m, tagTable, coauthorsByMap.get(m.mapUid) || [])),
  }));
}

/** The editions query, including the TMX style columns (tmx_style/tmx_tags/
 *  tmx_styles_updated_at, migration 007). */
function editionsQuery() {
  return `
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
            'style', m.tmx_style,
            'tagsRaw', m.tmx_tags,
            'tmxCheckedAt', m.tmx_styles_updated_at,
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
      (e.sort_order IS NULL), e.sort_order DESC,
      -- An admin-created folder (negative campaign_id) has no chronology of
      -- its own — rank it by the newest real campaign among the maps
      -- actually stashed in it, so it doesn't sink to the bottom under
      -- every real edition ever synced.
      GREATEST(e.campaign_id, MAX(m.campaign_id)) DESC
  `;
}

/** Expands a map's stored TMX columns into the shape the client renders.
 *  - style: readable StyleName or null.
 *  - tags:  [{name,color}] expanded from the raw id string.
 *  - onTmx: false only when we have *confirmed* (tmxCheckedAt set) the map is
 *           NOT on TMX; true otherwise (on TMX, or not yet checked). The
 *           client shows a "Not on TMX" chip exactly in the confirmed-absent
 *           case, never for still-pending maps.
 *  - coauthors: accountId[] of admin-added co-authors (map_coauthors). The
 *           catalog only needs the ids — names are resolved live on the
 *           single-map page (routes/map.js). Identities are NOT resolved here;
 *           aggregates that count authors wrap these in canon() themselves. */
function buildMapStyles(m, tagTable, coauthorIds = []) {
  const style = m.style || null;
  const tags = parseTagIds(m.tagsRaw, tagTable);
  const checked = !!m.tmxCheckedAt;
  const onTmx = !(checked && style == null && tags.length === 0);
  return {
    mapUid: m.mapUid,
    name: m.name,
    author: m.author,
    authorName: m.authorName,
    thumbnailUrl: m.thumbnailUrl,
    votes: m.votes,
    style,
    tags,
    onTmx,
    coauthors: coauthorIds,
  };
}

module.exports = { getEditions };
