const { Router } = require('express');
const { getPluginCatalog, getPluginRecords, getRoomMaps } = require('../services/pluginCatalog');
const { validateOpenplanetToken } = require('../services/openplanetAuth');
const { grantAchievement } = require('../services/achievements');
const { OPENPLANET_AUTH_SECRET } = require('../config');
const { pool } = require('../db');
const { castVote, castPendingVote, isPendingVotesReady } = require('../services/votes');
const { isInRoom } = require('../services/room');
const { getFestState } = require('../services/fest');

const router = Router();

// GET /api/plugin/maps — public. The whole catalog, flat, for the Openplanet
// plugin: editions + every map with votes, finishers, medal times and medal
// counts. One call per plugin start; cached server-side for a few minutes.
router.get('/plugin/maps', async (_req, res) => {
  res.json(await getPluginCatalog());
});

// GET /api/plugin/records/:accountId — public (same data the Players tab and
// trackmania.io already show). The account's own times on Ditchfest maps, so
// the plugin can paint every medal instantly instead of asking Nadeo ~2000
// times.
router.get('/plugin/records/:accountId', async (req, res) => {
  const result = await getPluginRecords(req.params.accountId);
  if (!result) return res.status(400).json({ error: 'bad_account_id' });
  res.json(result);
});

// GET /api/plugin/room-maps?accountId=X — public. The fest room (running,
// joinLink, serverLogin) and its playlist in play order with name, author,
// votes and this player's own vote — pending ones included for maps not on
// the site yet (onSite: false).
router.get('/plugin/room-maps', async (req, res) => {
  let result;
  try {
    result = await getRoomMaps(req.query.accountId || null);
  } catch (e) {
    console.error('[plugin/room-maps]', String(e));
    return res.status(502).json({ error: 'room_unavailable' });
  }
  if (!result) return res.status(400).json({ error: 'bad_account_id' });
  res.json(result);
});

// POST /api/plugin/vote { token, mapUid, value } — the plugin's "+".
// `token` is a fresh Openplanet Auth::GetToken() token, checked on every
// vote: votes are rare, and it spares the plugin keeping a session of its
// own. A catalog map votes like POST /api/vote; a map that's only in the
// fest room so far parks the vote in pending_votes until the catalog sync
// brings the map in (services/votes.js resolvePendingVotes).
router.post('/plugin/vote', async (req, res) => {
  const { token, mapUid, value } = req.body || {};
  if (!mapUid || typeof mapUid !== 'string') return res.status(400).json({ error: 'missing_mapUid' });
  const wantVote = value === true;

  const who = await authPlugin(token, res);
  if (!who) return;
  req.accountId = who.accountId;

  const onSite = (await pool.query('SELECT 1 FROM maps WHERE map_uid = $1', [mapUid])).rowCount > 0;
  if (onSite) {
    const votes = await castVote(req.accountId, mapUid, wantVote);
    return res.json({ mapUid, voted: wantVote, votes, onSite });
  }

  if (!(await isPendingVotesReady())) return res.status(503).json({ error: 'pending_votes_disabled' });
  // Only a "+" needs the map in the room; taking one back always works, even
  // after the playlist has moved on.
  if (wantVote) {
    let inRoom;
    try {
      inRoom = await isInRoom(mapUid);
    } catch (e) {
      console.error('[plugin/vote]', String(e));
      return res.status(502).json({ error: 'room_unavailable' });
    }
    if (!inRoom) return res.status(404).json({ error: 'unknown_map' });
  }

  const votes = await castPendingVote(req.accountId, mapUid, wantVote);
  res.json({ mapUid, voted: wantVote, votes, onSite });
});

// GET /api/plugin/fest — public. Is it fest day (Friday in Moscow), when the
// next fest starts, and the banner text. Schedule in services/fest.js.
router.get('/plugin/fest', (_req, res) => {
  res.json(getFestState());
});

/** Openplanet token -> { accountId, displayName }, or null after answering
 *  the request with the matching error. */
async function authPlugin(token, res) {
  if (!OPENPLANET_AUTH_SECRET) {
    res.status(503).json({ error: 'plugin_auth_disabled' });
    return null;
  }
  if (!token || typeof token !== 'string') {
    res.status(401).json({ error: 'missing_token' });
    return null;
  }
  let who;
  try {
    who = await validateOpenplanetToken(token);
  } catch (e) {
    console.error('[plugin auth]', String(e));
    res.status(502).json({ error: 'openplanet_unreachable' });
    return null;
  }
  if (!who) {
    res.status(401).json({ error: 'invalid_token' });
    return null;
  }
  // First contact from the plugin counts as showing up, like a site login.
  try {
    await grantAchievement(who.accountId, 'first_login');
  } catch (e) {
    console.error('first_login grant failed', String(e));
  }
  return who;
}

module.exports = router;
