const { Router } = require('express');
const { getPluginCatalog, getPluginRecords } = require('../services/pluginCatalog');

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

module.exports = router;
