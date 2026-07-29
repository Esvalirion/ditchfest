// Linked accounts — several Ubisoft accounts belonging to one person.
// Ported from the real tm-votes' src/links.ts (kept as a private reference,
// not duplicated in this repo — see COTD_MIGRATION_PLAN.md).
//
// An admin links an alternate account to a primary one; from then on the
// site treats the whole group as a single player: votes count once, maps
// pool into one leaderboard row, achievements and onboarding progress are
// shared. Storage is never rewritten — a vote stays on the account that
// cast it, a map keeps its real author. Aggregates resolve accounts to
// identities at read time via canon(), which keeps unlinking a one-row
// delete instead of an impossible un-merge.
const { pool } = require('../db');

/**
 * SQL fragment: the identity behind an account column.
 *   canon('v.account_id')  ->  the primary account, or the account itself
 * `col` must be SQL you wrote yourself (a column reference), never user input.
 */
function canon(col) {
  return `COALESCE((SELECT l.primary_id FROM account_links l WHERE l.account_id = ${col}), ${col})`;
}

/** The identity this account belongs to (itself, when it isn't linked). */
async function canonicalId(accountId) {
  const { rows } = await pool.query(
    'SELECT primary_id FROM account_links WHERE account_id = $1',
    [accountId]
  );
  return rows[0]?.primary_id ?? accountId;
}

/** Every account in this person's group: the identity first, then alternates. */
async function groupMembers(accountId) {
  const primary = await canonicalId(accountId);
  const { rows } = await pool.query(
    'SELECT account_id FROM account_links WHERE primary_id = $1',
    [primary]
  );
  return [primary, ...rows.map((r) => r.account_id)];
}

/** Alternate accounts attached to an identity, with the nickname each had
 *  when it was linked. */
async function groupAlts(primaryId) {
  const { rows } = await pool.query(
    'SELECT account_id, display_name FROM account_links WHERE primary_id = $1 ORDER BY created_at',
    [primaryId]
  );
  return rows.map((r) => ({ accountId: r.account_id, displayName: r.display_name }));
}

async function listGroups() {
  const { rows } = await pool.query(`
    SELECT l.account_id, l.primary_id, l.display_name,
      (SELECT MAX(m.author_name) FROM maps m WHERE m.author_account_id = l.primary_id) AS primary_name
    FROM account_links l
    ORDER BY l.primary_id, l.created_at
  `);

  const byPrimary = new Map();
  for (const r of rows) {
    const group = byPrimary.get(r.primary_id) || {
      primaryId: r.primary_id,
      primaryName: r.primary_name,
      alts: [],
    };
    group.alts.push({ accountId: r.account_id, displayName: r.display_name });
    byPrimary.set(r.primary_id, group);
  }
  return [...byPrimary.values()];
}

/**
 * Attach accountId to primaryId's identity. Chains are flattened both ways:
 * linking to an account that is itself an alternate attaches to its
 * identity instead, and anything already pointing at accountId is
 * re-pointed, so primary_id never needs following twice.
 */
async function linkAccount(accountId, primaryId, displayName, linkedBy) {
  if (accountId === primaryId) return 'same_account';

  const target = await canonicalId(primaryId);
  // The target already belongs to the account being linked — this would
  // build a cycle. The admin most likely has the two the wrong way round.
  if (target === accountId) return 'primary_is_alt_of_target';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE account_links SET primary_id = $1 WHERE primary_id = $2', [
      target,
      accountId,
    ]);
    await client.query(
      `INSERT INTO account_links (account_id, primary_id, display_name, linked_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (account_id) DO UPDATE
       SET primary_id = EXCLUDED.primary_id,
           display_name = EXCLUDED.display_name,
           linked_by = EXCLUDED.linked_by`,
      [accountId, target, displayName, linkedBy]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return null;
}

/** Detach one alternate. Its votes and maps go back to counting on their own. */
async function unlinkAccount(accountId) {
  await pool.query('DELETE FROM account_links WHERE account_id = $1', [accountId]);
}

module.exports = { canon, canonicalId, groupMembers, groupAlts, listGroups, linkAccount, unlinkAccount };
