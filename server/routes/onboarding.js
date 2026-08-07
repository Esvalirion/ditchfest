const { Router } = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { groupMembers } = require('../services/links');
const { getEditions } = require('../services/editions');
const { defOf, grantAchievement } = require('../services/achievements');

const router = Router();

async function getOnboardingDone(members) {
  const ph = members.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query(
    `SELECT DISTINCT campaign_id FROM onboarding_progress WHERE account_id IN (${ph})`,
    members
  );
  return rows.map((r) => Number(r.campaign_id));
}

// GET /api/onboarding
router.get('/onboarding', requireAuth, async (req, res) => {
  const members = await groupMembers(req.accountId);

  // getEditions() is display-sorted (newest/high-weight first); onboarding
  // walks history forward instead, so reverse it. (This mirrors the catalog's
  // notion of recency rather than a strict Nadeo-id timeline, keeping virtual
  // folders in their catalog position rather than pinned to the front.)
  const editions = (await getEditions()).reverse();

  const done = await getOnboardingDone(members);
  const ph = members.map((_, i) => `$${i + 1}`).join(', ');
  const voteRows = await pool.query(`SELECT DISTINCT map_uid FROM votes WHERE account_id IN (${ph})`, members);

  const doneSet = new Set(done);
  res.json({
    editions,
    done,
    myVotes: voteRows.rows.map((r) => r.map_uid),
    completed: editions.length > 0 && editions.every((e) => doneSet.has(Number(e.campaignId))),
  });
});

// POST /api/onboarding/step { campaignId } — mark one edition walked
// through, and on the last one hand out the completion badge.
router.post('/onboarding/step', requireAuth, async (req, res) => {
  const campaignId = Number(req.body?.campaignId);
  if (!Number.isFinite(campaignId)) {
    return res.status(400).json({ error: 'missing_campaignId' });
  }

  // Same set the GET above serves, so "finished everything" means the same
  // thing on both sides — keyed by effective (display-overridden) campaign,
  // same as getEditions().
  const eligible = await pool.query(
    'SELECT DISTINCT COALESCE(display_campaign_id, campaign_id) AS campaign_id FROM maps'
  );
  const eligibleIds = new Set(eligible.rows.map((r) => Number(r.campaign_id)));
  if (!eligibleIds.has(campaignId)) {
    return res.status(404).json({ error: 'unknown_campaign' });
  }

  await pool.query(
    'INSERT INTO onboarding_progress (account_id, campaign_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.accountId, campaignId]
  );

  const members = await groupMembers(req.accountId);
  const done = await getOnboardingDone(members);
  const doneSet = new Set(done);
  const completed = [...eligibleIds].every((id) => doneSet.has(id));

  // A later edition can appear after someone finished; the badge is never
  // taken back, they just get one more step to walk.
  const newAchievements = [];
  if (completed) {
    const first = await grantAchievement(members[0], 'onboarding_complete');
    const def = defOf('onboarding_complete');
    if (first && def) newAchievements.push(def);
  }

  res.json({ done, completed, newAchievements });
});

module.exports = router;
