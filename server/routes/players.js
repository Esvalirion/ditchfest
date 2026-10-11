const { Router } = require('express');
const { getPlayerRecords } = require('../services/playerStats');

const router = Router();

// GET /api/results/players — public leaderboard of in-game records on
// Ditchfest maps (the Players tab). Default order is Author medals; the
// client re-sorts locally per category, same contract as /api/results/mappers.
router.get('/results/players', async (_req, res) => {
  res.json(await getPlayerRecords());
});

module.exports = router;
