const { Router } = require('express');
const { pool } = require('../db');
const { optionalAuth } = require('../middleware/auth');
const { canon, groupMembers } = require('../services/links');
const { Readable } = require('node:stream');
const { fetchMapLeaderboard, fetchMapFileUrl } = require('../services/tmio');
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

// GET /api/map/:mapUid/file — public. The map's .Map.Gbx, streamed through
// us. Nadeo's file URL is public, but it redirects to a CDN object named by a
// bare UUID, so a plain link would save "cd67b314-…" with no extension; here
// the browser gets Content-Disposition with "<map name>.Map.Gbx". The Nadeo
// map id is already in the stored thumbnail URL (…/maps/<id>/thumbnail.jpg),
// so the usual path costs no trackmania.io call; tm.io /api/map is only the
// fallback. Only catalog maps — this is not an open proxy.
router.get('/map/:mapUid/file', async (req, res) => {
  const { mapUid } = req.params;
  const { rows } = await pool.query(
    'SELECT name, thumbnail_url FROM maps WHERE map_uid = $1',
    [mapUid]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'unknown_map' });
  const { name, thumbnail_url: thumb } = rows[0];

  try {
    const m = /^https:\/\/core\.trackmania\.nadeo\.live\/maps\/([0-9a-f-]{36})\//i.exec(thumb || '');
    const fileUrl = m
      ? `https://core.trackmania.nadeo.live/maps/${m[1]}/file`
      : await fetchMapFileUrl(mapUid, TMIO_USER_AGENT);
    if (!fileUrl) return res.status(404).json({ error: 'file_unavailable' });

    const upstream = await fetch(fileUrl, { redirect: 'follow' });
    if (!upstream.ok || !upstream.body) {
      throw new Error(`map file ${fileUrl} -> HTTP ${upstream.status}`);
    }
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': contentDisposition(`${name || mapUid}.Map.Gbx`),
      // A map UID is one exact file (re-saving makes a new UID).
      'Cache-Control': 'public, max-age=86400',
    });
    const len = upstream.headers.get('content-length');
    if (len) res.set('Content-Length', len);
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (e) {
    console.error('map file download failed', String(e));
    if (!res.headersSent) res.status(502).json({ error: 'file_unavailable' });
    else res.destroy();
  }
});

/** attachment; filename="<ascii fallback>"; filename*=UTF-8''<full name> —
 *  map names carry emoji/Cyrillic, and the header itself must stay ASCII. */
function contentDisposition(filename) {
  const safe = filename.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim() || 'map.Map.Gbx';
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`;
}

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
    downloadUrl: `/api/map/${encodeURIComponent(mapUid)}/file`,
    tmioUrl: `https://trackmania.io/#/leaderboard/${encodeURIComponent(mapUid)}`,
    tmxUrl: tmx && tmx.url,
    tmxId: tmx ? tmx.trackId : null,
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
