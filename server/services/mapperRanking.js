// Shared by routes/mapper.js and routes/mappers.js so the two pages can
// never disagree about who sits where — same query, same order.
const { pool } = require('../db');
const { canon } = require('./links');
const { isCoauthorsMissing } = require('./coauthors');
const { lookupMany } = require('./names');

/** Mappers with their total "+", their map count and how many votes they
 *  cast themselves (the "active voter" leaderboard column). Ordered by votes
 *  desc (ties break by name) — the array index (1-based) is the rank, not a
 *  SQL window function, matching the real tm-votes source exactly. The client
 *  re-sorts locally when the user switches to another category.
 *
 *  Grouped by identity (see links.js canon()): a mapper with a linked alt
 *  gets one row pooling all their maps, and a voter's linked accounts
 *  voting for the same map still only count once. The row is labeled with
 *  the PRIMARY account's name whenever one is known — never the alt's (see
 *  the name-resolution pass below). `maps` is a DISTINCT
 *  count because the LEFT JOIN to votes fans map rows out per vote.
 *
 *  A map counts for every credited author: the primary author_account_id
 *  AND any admin-added co-authors (map_coauthors, migration 008). So a
 *  collaboration's votes and map-count land on each co-author too. The
 *  co-author's account_id is run through canon() like the primary author,
 *  so a linked alt still rolls up to one identity — and if an admin
 *  accidentally lists the primary author as a co-author, GROUP BY canon()
 *  collapses the duplicate instead of double-counting.
 *
 *  The voters CTE is FULL OUTER JOINed: people who voted but never shipped
 *  a map still get a row (votes/maps = 0) — they are the point of the
 *  "Votes Cast" tab. The client hides those rows on the mapper-only tabs. */
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

  // Names: prefer the nick the PRIMARY account itself authored maps under —
  // a linked alt that shipped its own maps must not relabel the identity (the
  // old single MAX(author_name) picked whichever member's nick sorts last).
  // Rows without a primary-authored name (alt-authored-only groups, pure
  // co-authors, primary authors whose synced author_name is still missing,
  // pure voters) resolve the primary's current nick live via the TM OAuth API
  // — best-effort, a TM hiccup falls back to any member's synced nick rather
  // than throwing.
  const missing = rows.filter((r) => !r.primary_name).map((r) => r.account_id);
  const resolved = missing.length ? await lookupMany(missing) : new Map();
  return rows.map((r) => ({
    accountId: r.account_id,
    name: r.primary_name || resolved.get(r.account_id) || r.name || null,
    votes: r.votes,
    maps: r.maps,
    castVotes: r.cast_votes,
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
    ),
    ranked AS (
      SELECT ${authorCanon} AS account_id,
             -- Any member's authoring nick (legacy label / last-resort
             -- fallback) and the primary's own authoring nick (preferred —
             -- see the name-resolution pass in getMapperResults).
             MAX(CASE WHEN a.account_id = m.author_account_id THEN m.author_name END) AS name,
             MAX(CASE WHEN ${authorCanon} = m.author_account_id THEN m.author_name END) AS primary_name,
             COUNT(DISTINCT a.map_uid || '|' || ${voterCanon})::int AS votes,
             COUNT(DISTINCT a.map_uid)::int AS maps
      FROM map_authors a
      LEFT JOIN maps m ON m.map_uid = a.map_uid
      LEFT JOIN votes v ON v.map_uid = a.map_uid
      GROUP BY 1
    ),
    voters AS (
      -- canon() inlines a correlated subquery over account_links, so the
      -- column MUST be qualified (vo.account_id): a bare account_id would
      -- bind to account_links' own column inside the subquery and resolve
      -- every voter to one arbitrary identity.
      SELECT ${canon('vo.account_id')} AS account_id,
             COUNT(*)::int AS cast_votes
      FROM votes vo
      GROUP BY 1
    )
    SELECT account_id,
           r.name,
           r.primary_name,
           COALESCE(r.votes, 0)::int AS votes,
           COALESCE(r.maps, 0)::int AS maps,
           COALESCE(v.cast_votes, 0)::int AS cast_votes
    FROM ranked r
    FULL OUTER JOIN voters v USING (account_id)
    ORDER BY votes DESC, COALESCE(r.primary_name, r.name) ASC NULLS LAST
  `;
}

module.exports = { getMapperResults };
