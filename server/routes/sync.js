const { Router } = require('express');
const { syncCatalog } = require('../services/sync');
const { requireAdmin } = require('../middleware/auth');
const { SYNC_SECRET } = require('../config');

const router = Router();

// POST /api/sync — manual trigger for testing/backfill, guarded by a static
// SYNC_SECRET header so it isn't publicly runnable. Used from curl; the cron
// (server.js) does this automatically. The admin-button variant below is the
// JWT-gated one the UI calls.
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

// POST /api/sync/now — same run, but JWT-gated for the admin button. The
// 60s cooldown lives entirely client-side: trackmania.io rate-limits at
// ~2 req/s and rejects a second sync inside that window (sync_failed).
router.post('/sync/now', requireAdmin, async (_req, res) => {
  try {
    res.json(await syncCatalog());
  } catch (e) {
    console.error('admin sync failed', String(e));
    res.status(500).json({ error: 'sync_failed' });
  }
});

module.exports = router;
