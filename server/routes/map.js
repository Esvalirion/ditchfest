const { Router } = require('express');
const { pool } = require('../db');
const { optionalAuth } = require('../middleware/auth');
const { canon, groupMembers } = require('../services/links');
const { fetchMapLeaderboard } = require('../services/tmio');
const { lookupMapByUid, parseTagIds, getTagsTable } = require('../services/tmx');
const { getCoauthors } = require('../services/coauthors');
const { lookupMany } = require('../services/names');
const { TMIO_USER_AGENT } = require('../config');

const router = Router();

// GET /api/map/:mapUid — public. Map details + external links (trackmania.io,
// TMX) + top-5 leaderboard, all best-effort: the external calls can't take
// the page down if trackmania.io/TMX are slow or the map isn't listed there.
router.get('/map/:mapUid', optionalAuth, async (req, res) => {
  const { mapUid } = req.params;

  // Migration 007 adds the tmx_* style columns; if it hasn't been applied on
  // this DB yet, the query errors on the missing columns and the whole page
  // dies. Retry without them and degrade to no style chips. Dead code once
  // 007 is applied everywhere.
  let rows;
  try {
    rows = (await pool.query(mapQuery(true), [mapUid])).rows;
  } catch (e) {
    if (e && (e.code === '42703' || /does not exist/i.test(String(e.message || '')))) {
      rows = (await pool.query(mapQuery(false), [mapUid])).rows;
    } else {
      throw e;
    }
  }
  if (rows.length === 0) return res.status(404).json({ error: 'unknown_map' });
  const map = rows[0];

  let voted = false;
  if (req.accountId) {
    const members = await groupMembers(req.accountId);
    const ph = members.map((_, i) => `$${i + 2}`).join(', ');
    const r = await pool.query(
      `SELECT 1 FROM votes WHERE map_uid = $1 AND account_id IN (${ph})`,
      [mapUid, ...members]
    );
    voted = r.rowCount > 0;
  }

  // The TMX lookup either resolves to an info object, to null ("confirmed not
  // on TMX"), or throws (network/5xx → caught → tmxLookupFailed=true). Keep
  // that distinction: a confirmed null is authoritative, a failure should
  // fall through to the synced columns instead of silently reading as "not on
  // TMX".
  let tmx = null;
  let tmxLookupFailed = false;
  const [leaderboard] = await Promise.all([
    fetchMapLeaderboard(mapUid, TMIO_USER_AGENT, 5).catch((e) => {
      console.error('tmio leaderboard fetch failed', String(e));
      return null;
    }),
    lookupMapByUid(mapUid, TMIO_USER_AGENT)
      .then((r) => {
        tmx = r;
      })
      .catch((e) => {
        console.error('tmx lookup failed', String(e));
        tmxLookupFailed = true;
      }),
  ]);

  // Style/tags prefer the live TMX lookup; if that failed (network) or the
  // map isn't on TMX, fall back to whatever the catalog sync last persisted —
  // so a transient TMX outage doesn't blank the chips.
  let style = (tmx && tmx.style) || map.tmx_style || null;
  let tags = tmx ? tmx.tags : null;
  if (!tags && map.tmx_tags) {
    tags = parseTagIds(map.tmx_tags, await getTagsTable(TMIO_USER_AGENT));
  }
  if (!tags) tags = [];
  // onTmx: true while there's any doubt. The "Not on TMX" chip only shows on
  // a confirmed absence — a live lookup that returned null, or a sync that
  // stamped tmx_styles_updated_at while leaving both style and tags empty.
  const onTmx = tmx
    ? true
    : tmxLookupFailed
      ? !(map.tmx_styles_updated_at && style == null && tags.length === 0)
      : false;

  // Co-authors (collaborations): admin-managed extras beyond the single
  // Nadeo-credited author. getCoauthors degrades to [] when migration 008
  // hasn't been applied yet, so the page still renders — just without the
  // extra names. Names are resolved live via the TM OAuth API (same as the
  // primary author), best-effort: a TM hiccup leaves names null, not a crash.
  const coauthorIds = await getCoauthors(mapUid);
  let coauthors = [];
  if (coauthorIds.length) {
    const names = await lookupMany(coauthorIds);
    coauthors = coauthorIds.map((id) => ({ accountId: id, name: names.get(id) || null }));
  }

  res.json({
    mapUid: map.map_uid,
    name: map.name,
    authorAccountId: map.author_account_id,
    authorName: map.author_name,
    thumbnailUrl: map.thumbnail_url,
    campaignId: map.campaign_id,
    editionName: map.edition_name,
    votes: map.votes,
    voted,
    style,
    tags,
    onTmx,
    tmioUrl: `https://trackmania.io/#/leaderboard/${encodeURIComponent(mapUid)}`,
    tmxUrl: tmx && tmx.url,
    leaderboard: leaderboard || [],
    coauthors,
  });
});

module.exports = router;

/** The one-map query, with or without the migration-007 style columns.
 *  Identical apart from those three columns so the two paths can't drift. */
function mapQuery(withStyles) {
  const styleCols = withStyles
    ? 'm.tmx_style, m.tmx_tags, m.tmx_styles_updated_at,'
    : '';
  return `
    SELECT m.map_uid, m.name, m.author_account_id, m.author_name, m.thumbnail_url,
           m.campaign_id, e.name AS edition_name,
           ${styleCols}
           (SELECT COUNT(DISTINCT ${canon('v.account_id')})::int FROM votes v
              WHERE v.map_uid = m.map_uid) AS votes
     FROM maps m
     JOIN editions e ON e.campaign_id = m.campaign_id
     WHERE m.map_uid = $1`;
}
