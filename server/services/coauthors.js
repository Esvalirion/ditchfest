// Co-authors (collaborations) — admin-managed extras beyond a map's single
// Nadeo-credited author. Read paths here are the catalog/board side: who is
// credited on a map. The write side is the admin route
// POST /api/map/:mapUid/coauthors (routes/coauthors.js).
const { pool } = require('../db');

/** AccountIds of a map's co-authors (NOT including the primary author), in the
 *  order they were added. Empty when the map has none. Identities are NOT
 *  resolved here — callers wrap account_id in canon() where they aggregate,
 *  same as for author_account_id. */
async function getCoauthors(mapUid) {
  const { rows } = await pool.query(
    'SELECT account_id FROM map_coauthors WHERE map_uid = $1 ORDER BY created_at',
    [mapUid]
  );
  return rows.map((r) => r.account_id);
}

/** map_uid -> accountId[] for a batch of maps, in one query instead of N.
 *  Maps with no co-authors simply have no entry. Used by getEditions() to
 *  attach co-authors to every map in the catalog. */
async function getCoauthorsForMaps(mapUids) {
  if (!mapUids.length) return new Map();
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
}

module.exports = { getCoauthors, getCoauthorsForMaps };
