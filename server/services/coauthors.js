// Co-authors (collaborations) — admin-managed extras beyond a map's single
// Nadeo-credited author. Read paths here are the catalog/board side: who is
// credited on a map. The write side is the admin route
// POST /api/map/:mapUid/coauthors (routes/coauthors.js).
//
// The map_coauthors table lives behind migration 008. Until it's applied on a
// DB, every read here degrades to "no co-authors" (isCoauthorsMissing catch),
// so the code can ship ahead of the migration — same pattern as the tmx_*
// style columns (migration 007, services/tmx.js + editions.js). Once 008 is
// applied everywhere, those fallbacks are dead code.
const { pool } = require('../db');

/** True for a Postgres "relation/column does not exist" error — the exact
 *  failure when migration 008 hasn't been applied but the code already
 *  references map_coauthors. SQLSTATE 42P01 = undefined_table,
 *  42703 = undefined_column. */
function isCoauthorsMissing(e) {
  if (e && (e.code === '42P01' || e.code === '42703')) return true;
  return /does not exist/i.test(String((e && e.message) || ''));
}

/** AccountIds of a map's co-authors (NOT including the primary author), in the
 *  order they were added. Empty when the map has none or the table isn't there
 *  yet (migration 008 pending). Identities are NOT resolved here — callers wrap
 *  account_id in canon() where they aggregate, same as for author_account_id. */
async function getCoauthors(mapUid) {
  try {
    const { rows } = await pool.query(
      'SELECT account_id FROM map_coauthors WHERE map_uid = $1 ORDER BY created_at',
      [mapUid]
    );
    return rows.map((r) => r.account_id);
  } catch (e) {
    if (isCoauthorsMissing(e)) return [];
    throw e;
  }
}

/** map_uid -> accountId[] for a batch of maps, in one query instead of N.
 *  Maps with no co-authors (or before migration 008) simply have no entry.
 *  Used by getEditions() to attach co-authors to every map in the catalog. */
async function getCoauthorsForMaps(mapUids) {
  if (!mapUids.length) return new Map();
  try {
    const ph = mapUids.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await pool.query(
      `SELECT map_uid, account_id FROM map_coauthors
       WHERE map_uid IN (${ph}) ORDER BY created_at`,
      mapUids
    );
    const byMap = new Map();
    for (const r of rows) {
      if (!byMap.has(r.map_uid)) byMap.set(r.map_uid, []);
      byMap.get(r.map_uid).push(r.account_id);
    }
    return byMap;
  } catch (e) {
    if (isCoauthorsMissing(e)) return new Map();
    throw e;
  }
}

module.exports = { isCoauthorsMissing, getCoauthors, getCoauthorsForMaps };
