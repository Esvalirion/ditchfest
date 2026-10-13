const { Router } = require('express');
const { getPlayerRecords } = require('../services/playerStats');

const router = Router();

// GET /api/results/players — public leaderboard of in-game records on
// Ditchfest maps (the Players tab). Paged server-side — the board is ~18k
// players: ?sort=author|gold|silver|bronze|finishes (default author),
// ?q= name search, ?offset=&limit= (default 200, max 500).
router.get('/results/players', async (req, res) => {
  const { sort, q, offset, limit } = req.query;
  res.json(await getPlayerRecords({ sort, q, offset, limit }));
});

module.exports = router;
