const { Router } = require('express');
const { getMapperResults } = require('../services/mapperRanking');

const router = Router();

// GET /api/results/mappers — public leaderboard. Order is the rank — the
// client just numbers rows by array position.
router.get('/results/mappers', async (_req, res) => {
  res.json({ mappers: await getMapperResults() });
});

module.exports = router;
