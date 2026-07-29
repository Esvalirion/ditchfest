const { Router } = require('express');
const { pool } = require('../db');
const { optionalAuth } = require('../middleware/auth');
const { groupMembers } = require('../services/links');
const { getEditions } = require('../services/editions');

const router = Router();

// GET /api/editions — public; myVotes is only populated when logged in.
router.get('/editions', optionalAuth, async (req, res) => {
  const editions = await getEditions();

  // Votes are per person, not per login: a linked alternate sees the same
  // buttons lit as the primary account.
  let myVotes = [];
  if (req.accountId) {
    const members = await groupMembers(req.accountId);
    const ph = members.map((_, i) => `$${i + 1}`).join(', ');
    const r = await pool.query(`SELECT DISTINCT map_uid FROM votes WHERE account_id IN (${ph})`, members);
    myVotes = r.rows.map((row) => row.map_uid);
  }

  res.json({ editions, myVotes });
});

module.exports = router;
