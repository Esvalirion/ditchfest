// Admin management of map co-authors (collaborations). Nadeo credits a single
// author per map, but a map can have several real builders; this lets an admin
// add the extras manually. Stored in map_coauthors (migration 008), which sync
// never touches — same separation as the editions/maps override columns.
const { Router } = require('express');
const { pool } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = Router();

// POST /api/map/:mapUid/coauthors { accountIds: [...] } — admin-only.
//
// Replaces the full set: pass [] to clear, pass [a, b] to set exactly those
// two. Idempotent — sending the same list twice changes nothing. Done in one
// transaction (delete-then-insert) so a partial write can't leave the map with
// half a co-author list.
//
// If migration 008 hasn't been applied on this DB yet, the table doesn't exist
// and the write errors — we surface that as 503 migration_pending so the admin
// UI can show "this feature isn't enabled on the server yet" instead of a
// generic 500. Read paths degrade silently (services/coauthors.js); only the
// write needs to tell the admin it can't do it yet.
router.post('/map/:mapUid/coauthors', requireAdmin, async (req, res) => {
  const { mapUid } = req.params;
  const raw = req.body?.accountIds;
  if (!Array.isArray(raw)) {
    return res.status(400).json({ error: 'missing_accountIds' });
  }
  // Dedup + trim + drop empties. Keep order stable for the admin's sanity.
  const seen = new Set();
  const accountIds = [];
  for (const item of raw) {
    const id = String(item).trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      accountIds.push(id);
    }
  }

  const exists = await pool.query('SELECT 1 FROM maps WHERE map_uid = $1', [mapUid]);
  if (exists.rowCount === 0) return res.status(404).json({ error: 'unknown_map' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM map_coauthors WHERE map_uid = $1', [mapUid]);
    for (const accountId of accountIds) {
      await client.query(
        `INSERT INTO map_coauthors (map_uid, account_id, added_by) VALUES ($1, $2, $3)
         ON CONFLICT (map_uid, account_id) DO NOTHING`,
        [mapUid, accountId, req.accountId]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    if (e && (e.code === '42P01' || e.code === '42703')) {
      return res.status(503).json({ error: 'migration_pending' });
    }
    throw e;
  } finally {
    client.release();
  }

  res.json({ ok: true, mapUid, accountIds });
});

module.exports = router;
