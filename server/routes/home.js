const { Router } = require('express');
const { getHomeStats } = require('../services/homeStats');

const router = Router();

// GET /api/home — public dashboard: headline totals, the latest edition's
// summary, and a per-edition map-count series for the bar chart.
router.get('/home', async (_req, res) => {
  res.json(await getHomeStats());
});

module.exports = router;
