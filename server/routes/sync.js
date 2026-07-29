const { Router } = require('express');
const { syncCatalog } = require('../services/sync');
const { SYNC_SECRET } = require('../config');

const router = Router();

// POST /api/sync — manual trigger for testing, guarded by SYNC_SECRET so
// it isn't publicly runnable. The cron (server.js) does this automatically.
router.post('/sync', async (req, res) => {
  if (!SYNC_SECRET || req.headers['x-sync-secret'] !== SYNC_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    res.json(await syncCatalog());
  } catch (e) {
    console.error('manual sync failed', String(e));
    res.status(500).json({ error: 'sync_failed' });
  }
});

module.exports = router;
