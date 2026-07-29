const { Router } = require('express');
const { pool } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { getAppToken, resolveDisplayNames } = require('../services/names');
const { ROOT_ADMIN_ID } = require('../config');

const router = Router();

// GET /api/admins -> list; POST /api/admins { accountId } -> add. Admin-only.
router.get('/admins', requireAdmin, async (_req, res) => {
  let rootName = null;
  if (ROOT_ADMIN_ID) {
    try {
      const token = await getAppToken();
      const names = await resolveDisplayNames([ROOT_ADMIN_ID], token);
      rootName = names[ROOT_ADMIN_ID] || null;
    } catch (e) {
      // OAuth lookup optional; fall back to no name.
    }
  }

  const { rows } = await pool.query(
    'SELECT account_id, display_name FROM admins ORDER BY created_at ASC'
  );

  const admins = [];
  if (ROOT_ADMIN_ID) {
    admins.push({ accountId: ROOT_ADMIN_ID, displayName: rootName, isRoot: true });
  }
  for (const r of rows) {
    if (r.account_id === ROOT_ADMIN_ID) continue; // never duplicate the root
    admins.push({ accountId: r.account_id, displayName: r.display_name, isRoot: false });
  }

  res.json({ admins, rootAdminId: ROOT_ADMIN_ID });
});

router.post('/admins', requireAdmin, async (req, res) => {
  const accountId = (req.body?.accountId || '').trim();
  if (!accountId) return res.status(400).json({ error: 'missing_accountId' });

  // Validate the account exists (and get its name) via the OAuth API. A
  // failed *call* (502) is a different fact from "no such account" (404) —
  // don't let one masquerade as the other.
  let name;
  try {
    const token = await getAppToken();
    const names = await resolveDisplayNames([accountId], token);
    name = names[accountId] || null;
  } catch (e) {
    console.error('admin add lookup failed', String(e));
    return res.status(502).json({ error: 'lookup_failed' });
  }
  if (!name) return res.status(404).json({ error: 'unknown_account' });

  await pool.query(
    `INSERT INTO admins (account_id, display_name, added_by) VALUES ($1, $2, $3)
     ON CONFLICT (account_id) DO UPDATE SET display_name = EXCLUDED.display_name`,
    [accountId, name, req.accountId]
  );
  res.json({ ok: true, accountId, displayName: name });
});

// POST /api/admins/remove { accountId } -> remove (never the root). Admin-only.
router.post('/admins/remove', requireAdmin, async (req, res) => {
  const accountId = (req.body?.accountId || '').trim();
  if (!accountId) return res.status(400).json({ error: 'missing_accountId' });
  if (accountId === ROOT_ADMIN_ID) {
    return res.status(400).json({ error: 'cannot_remove_root' });
  }

  await pool.query('DELETE FROM admins WHERE account_id = $1', [accountId]);
  res.json({ ok: true });
});

module.exports = router;
