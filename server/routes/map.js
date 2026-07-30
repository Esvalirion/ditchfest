const { Router } = require('express');
const { pool } = require('../db');
const { optionalAuth } = require('../middleware/auth');
const { canon, groupMembers } = require('../services/links');
const { fetchMapLeaderboard } = require('../services/tmio');
const { lookupMapByUid } = require('../services/tmx');
const { TMIO_USER_AGENT } = require('../config');

const router = Router();

// GET /api/map/:mapUid — public. Map details + external links (trackmania.io,
// TMX) + top-5 leaderboard, all best-effort: the external calls can't take
// the page down if trackmania.io/TMX are slow or the map isn't listed there.
router.get('/map/:mapUid', optionalAuth, async (req, res) => {
  const { mapUid } = req.params;

  const { rows } = await pool.query(
    `SELECT m.map_uid, m.name, m.author_account_id, m.author_name, m.thumbnail_url,
            m.campaign_id, e.name AS edition_name,
            (SELECT COUNT(DISTINCT ${canon('v.account_id')})::int FROM votes v
               WHERE v.map_uid = m.map_uid) AS votes
     FROM maps m
     JOIN editions e ON e.campaign_id = m.campaign_id
     WHERE m.map_uid = $1`,
    [mapUid]
  );
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

  const [leaderboard, tmx] = await Promise.all([
    fetchMapLeaderboard(mapUid, TMIO_USER_AGENT, 5).catch((e) => {
      console.error('tmio leaderboard fetch failed', String(e));
      return null;
    }),
    lookupMapByUid(mapUid, TMIO_USER_AGENT).catch((e) => {
      console.error('tmx lookup failed', String(e));
      return null;
    }),
  ]);

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
    tmioUrl: `https://trackmania.io/#/leaderboard/${encodeURIComponent(mapUid)}`,
    tmxUrl: tmx && tmx.url,
    leaderboard: leaderboard || [],
  });
});

module.exports = router;
