const { Router } = require('express');
const { pool } = require('../db');
const { optionalAuth } = require('../middleware/auth');
const { canon, groupMembers } = require('../services/links');
const { fetchMapLeaderboard } = require('../services/tmio');
const { lookupMapByUid, parseTagIds, getTagsTable } = require('../services/tmx');
const { updateMapTmxStyles } = require('../services/catalog');
const { getCoauthors } = require('../services/coauthors');
const { lookupMany } = require('../services/names');
const { TMIO_USER_AGENT } = require('../config');

const router = Router();

// GET /api/map/:mapUid/tmx — public. Just the TMX lookup, nothing else: the
// maps list calls this on row hover to get the map's TMX id for the "copy
// id" action, so it must stay light — no leaderboard, no co-author fan-out.
router.get('/map/:mapUid/tmx', async (req, res) => {
  try {
    const tmx = await lookupMapByUid(req.params.mapUid, TMIO_USER_AGENT);
    res.json({ tmxId: tmx ? tmx.trackId : null });
  } catch (e) {
    // TMX network/5xx — the client just doesn't get the copy button.
    console.error('tmx lookup failed', String(e));
    res.status(502).json({ error: 'tmx_unavailable' });
  }
});

// GET /api/map/:mapUid — public. Map details + external links (trackmania.io,
// TMX) + top-5 leaderboard, all best-effort: the external calls can't take
// the page down if trackmania.io/TMX are slow or the map isn't listed there.
router.get('/map/:mapUid', optionalAuth, async (req, res) => {
  const { mapUid } = req.params;
  const { rows } = await pool.query(mapQuery(), [mapUid]);
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

  // The live lookup already paid for itself — feed a positive hit back into
  // the cached columns when they're still empty. The sync rotation only
  // rechecks a map every ~30 days, so without this a map uploaded to TMX
  // would linger on the /missing-tmx page for weeks even though every map
  // page visit proves it's there now. Only a hit with an actual style/tags
  // is written, and only when the DB has nothing — no writes on every view,
  // and no "confirmed absent" stamps for TMX maps that simply carry no tags.
  if (tmx && (tmx.style || tmx.tagsRaw) && !map.tmx_style && !map.tmx_tags) {
    try {
      await updateMapTmxStyles({
        mapUid,
        style: tmx.style || null,
        tags: tmx.tagsRaw || null,
      });
    } catch (e) {
      // DB hiccup — the page is unaffected, the sync rotation stays the
      // source of truth.
      console.error('tmx style writeback failed', String(e));
    }
  }

  // Co-authors (collaborations): admin-managed extras beyond the single
  // Nadeo-credited author. Names are resolved live via the TM OAuth API (same
  // as the primary author), best-effort: a TM hiccup leaves names null, not a
  // crash.
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

/** The one-map query, including the TMX style columns (tmx_style/tmx_tags/
 *  tmx_styles_updated_at). */
function mapQuery() {
  return `
    SELECT m.map_uid, m.name, m.author_account_id, m.author_name, m.thumbnail_url,
           m.campaign_id, e.name AS edition_name,
           m.tmx_style, m.tmx_tags, m.tmx_styles_updated_at,
           (SELECT COUNT(DISTINCT ${canon('v.account_id')})::int FROM votes v
              WHERE v.map_uid = m.map_uid) AS votes
     FROM maps m
     JOIN editions e ON e.campaign_id = m.campaign_id
     WHERE m.map_uid = $1`;
}
