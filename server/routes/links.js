// Admin-only account linking. Not yet wired into AdminView.vue on the
// frontend (see REWRITE_PLAN.md) — added here so the API contract matches
// the real tm-votes source and a real account_links export can be migrated
// in directly once this is needed.
const { Router } = require('express');
const { requireAdmin } = require('../middleware/auth');
const { linkAccount, unlinkAccount, listGroups } = require('../services/links');
const { getAppToken, resolveDisplayNames } = require('../services/names');

const router = Router();

// GET /api/links -> list linked groups; POST { accountId, primaryId } ->
// link one alternate account into another account's identity. Admin-only.
router.get('/links', requireAdmin, async (_req, res) => {
  res.json({ groups: await listGroups() });
});

router.post('/links', requireAdmin, async (req, res) => {
  const accountId = (req.body?.accountId || '').trim();
  const primaryId = (req.body?.primaryId || '').trim();
  if (!accountId || !primaryId) return res.status(400).json({ error: 'missing_accountId' });

  // Both sides must be real accounts — a typo here would quietly fold
  // somebody's votes into an identity that doesn't exist.
  let names;
  try {
    const token = await getAppToken();
    names = await resolveDisplayNames([accountId, primaryId], token);
  } catch (e) {
    console.error('link lookup failed', String(e));
    return res.status(502).json({ error: 'lookup_failed' });
  }
  if (!names[accountId] || !names[primaryId]) {
    return res.status(404).json({ error: 'unknown_account' });
  }

  const problem = await linkAccount(accountId, primaryId, names[accountId], req.accountId);
  if (problem) return res.status(400).json({ error: problem });

  res.json({ ok: true, accountId, primaryId, displayName: names[accountId] });
});

// POST /api/links/unlink { accountId } -> detach one alternate. Its votes
// and maps go back to counting on their own; nothing was merged in storage.
router.post('/links/unlink', requireAdmin, async (req, res) => {
  const accountId = (req.body?.accountId || '').trim();
  if (!accountId) return res.status(400).json({ error: 'missing_accountId' });
  await unlinkAccount(accountId);
  res.json({ ok: true });
});

module.exports = router;
