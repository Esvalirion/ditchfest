const { Router } = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { canon, groupMembers } = require('../services/links');
const { refreshAccount } = require('../services/grants');
const { getAppToken, resolveDisplayNames } = require('../services/names');

const router = Router();

// POST /api/vote { mapUid, value } — like or unlike a map. Votes are
// toggleable and unlimited; the PK makes a repeat vote a no-op.
router.post('/vote', requireAuth, async (req, res) => {
  const { mapUid, value } = req.body || {};
  if (!mapUid || typeof mapUid !== 'string') {
    return res.status(400).json({ error: 'missing_mapUid' });
  }
  const wantVote = value === true;

  const mapExists = await pool.query('SELECT 1 FROM maps WHERE map_uid = $1', [mapUid]);
  if (mapExists.rowCount === 0) return res.status(404).json({ error: 'unknown_map' });

  // The vote is recorded on the account that cast it; counting resolves it
  // to the person, so a second linked account can't add a second "+".
  if (wantVote) {
    await pool.query(
      'INSERT INTO votes (account_id, map_uid) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.accountId, mapUid]
    );
  } else {
    await pool.query('DELETE FROM votes WHERE account_id = $1 AND map_uid = $2', [
      req.accountId,
      mapUid,
    ]);
  }

  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT ${canon('account_id')})::int AS c FROM votes WHERE map_uid = $1`,
    [mapUid]
  );

  // Liking something can unlock a badge. Rank is skipped: casting a vote
  // can't move the voter's own placement.
  try {
    const members = await groupMembers(req.accountId);
    await refreshAccount(members[0], members, null);
  } catch (e) {
    console.error('achievement refresh failed', String(e));
  }

  res.json({ mapUid, voted: wantVote, votes: rows[0].c });
});

// GET /api/map-voters?mapUid=X — public. Who voted for one map: accountId +
// display name, earliest vote first (linked accounts count once).
router.get('/map-voters', async (req, res) => {
  const mapUid = (req.query.mapUid || '').trim();
  if (!mapUid) return res.status(400).json({ error: 'missing_mapUid' });

  const mapExists = await pool.query('SELECT 1 FROM maps WHERE map_uid = $1', [mapUid]);
  if (mapExists.rowCount === 0) return res.status(404).json({ error: 'unknown_map' });

  const { rows } = await pool.query(
    `SELECT ${canon('account_id')} AS account_id, MIN(created_at) AS created_at
     FROM votes WHERE map_uid = $1 GROUP BY 1 ORDER BY created_at ASC`,
    [mapUid]
  );

  // Best-effort: if the name API is down, still return the list, just
  // without names — the frontend falls back to showing nothing/accountId.
  let names = {};
  if (rows.length) {
    try {
      const token = await getAppToken();
      names = await resolveDisplayNames(rows.map((r) => r.account_id), token);
    } catch (e) {
      console.error('voter name lookup failed', String(e));
    }
  }

  res.json({
    mapUid,
    voters: rows.map((r) => ({ accountId: r.account_id, name: names[r.account_id] || null })),
  });
});

module.exports = router;
