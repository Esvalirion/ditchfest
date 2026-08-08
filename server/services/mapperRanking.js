// Shared by routes/mapper.js and routes/mappers.js so the two pages can
// never disagree about who sits where — same query, same order.
const { pool } = require('../db');
const { canon } = require('./links');
const { isCoauthorsMissing } = require('./coauthors');
const { lookupMany } = require('./names');

/** Mappers with their total "+" and their map count. Ordered by votes desc
 *  (ties break by name) — the array index (1-based) is the rank, not a SQL
 *  window function, matching the real tm-votes source exactly. The client
 *  re-sorts locally when the user switches to the "Maps" category.
 *
 *  Grouped by identity (see links.js canon()): a mapper with a linked alt
 *  gets one row pooling all their maps, and a voter's linked accounts
 *  voting for the same map still only count once. `maps` is a DISTINCT
 *  count because the LEFT JOIN to votes fans map rows out per vote.
 *
 *  A map counts for every credited author: the primary author_account_id
 *  AND any admin-added co-authors (map_coauthors, migration 008). So a
 *  collaboration's votes and map-count land on each co-author too. The
 *  co-author's account_id is run through canon() like the primary author,
 *  so a linked alt still rolls up to one identity — and if an admin
 *  accidentally lists the primary author as a co-author, GROUP BY canon()
 *  collapses the duplicate instead of double-counting. */
async function getMapperResults() {
  // The WITH-coauthors query references map_coauthors (migration 008); if that
  // table isn't there yet the query errors out, so retry the legacy variant
  // (primary authors only) and the ranking behaves exactly as before. Dead
  // code once 008 is applied everywhere.
  let rows;
  try {
    rows = (await pool.query(rankingQuery(true))).rows;
  } catch (e) {
    if (isCoauthorsMissing(e)) {
      rows = (await pool.query(rankingQuery(false))).rows;
    } else {
      throw e;
    }
  }

  // Co-authors have no map row of their own, so MAX(m.author_name) comes back
  // NULL for them — resolve those names live via the TM OAuth API (best-effort,
  // a TM hiccup leaves name null rather than throwing). Primary authors whose
  // synced author_name is still missing get resolved here too, same path the
  // catalog sync fills in eventually.
  const missing = rows.filter((r) => !r.name).map((r) => r.account_id);
  const resolved = missing.length ? await lookupMany(missing) : new Map();
  return rows.map((r) => ({
    accountId: r.account_id,
    name: r.name || resolved.get(r.account_id) || null,
    votes: r.votes,
    maps: r.maps,
  }));
}

/** The ranking query, with or without co-authors. withCoauthors is the
 *  migration-008 path; the legacy variant is identical except the
 *  map_authors CTE has only the primary-author arm (kept in one place so the
 *  two can't drift). */
function rankingQuery(withCoauthors) {
  const authorCanon = canon('a.account_id');
  const voterCanon = canon('v.account_id');
  const coauthorArm = withCoauthors
    ? `UNION ALL
    SELECT map_uid, account_id FROM map_coauthors`
    : '';
  return `
    WITH map_authors AS (
      SELECT map_uid, author_account_id AS account_id
        FROM maps WHERE author_account_id IS NOT NULL
      ${coauthorArm}
    )
    SELECT ${authorCanon} AS account_id,
           MAX(CASE WHEN a.account_id = m.author_account_id THEN m.author_name END) AS name,
           COUNT(DISTINCT a.map_uid || '|' || ${voterCanon})::int AS votes,
           COUNT(DISTINCT a.map_uid)::int AS maps
    FROM map_authors a
    LEFT JOIN maps m ON m.map_uid = a.map_uid
    LEFT JOIN votes v ON v.map_uid = a.map_uid
    GROUP BY 1
    ORDER BY votes DESC, name ASC NULLS LAST
  `;
}

module.exports = { getMapperResults };
