const { Router } = require('express');
const { getPluginCatalog, getPluginRecords, getRoomMaps } = require('../services/pluginCatalog');
const { validateOpenplanetToken } = require('../services/openplanetAuth');
const { issueToken } = require('../services/jwt');
const { grantAchievement } = require('../services/achievements');
const { OPENPLANET_AUTH_SECRET } = require('../config');

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

// GET /api/plugin/room-maps?uids=a,b,c&accountId=X — public. The room's
// playlist (uids in the room's order, as the plugin got them from Nadeo)
// enriched with name, author, votes and this player's own vote.
router.get('/plugin/room-maps', async (req, res) => {
  const uids = String(req.query.uids || '').split(',').filter(Boolean);
  const result = await getRoomMaps(uids, req.query.accountId || null);
  if (!result) return res.status(400).json({ error: 'bad_request' });
  res.json(result);
});

// POST /api/plugin/login { token } — trade an Openplanet Auth::GetToken()
// token for the same session JWT the website's Ubisoft login gives. The
// plugin keeps it (7 days) and votes through the regular POST /api/vote.
router.post('/plugin/login', async (req, res) => {
  if (!OPENPLANET_AUTH_SECRET) return res.status(503).json({ error: 'plugin_auth_disabled' });
  const { token } = req.body || {};
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'missing_token' });

  let who;
  try {
    who = await validateOpenplanetToken(token);
  } catch (e) {
    console.error('[plugin/login]', String(e));
    return res.status(502).json({ error: 'openplanet_unreachable' });
  }
  if (!who) return res.status(401).json({ error: 'invalid_token' });

  try {
    await grantAchievement(who.accountId, 'first_login');
  } catch (e) {
    console.error('first_login grant failed', String(e));
  }

  res.json({
    token: issueToken(who.accountId, who.displayName),
    accountId: who.accountId,
    displayName: who.displayName,
  });
});

module.exports = router;
