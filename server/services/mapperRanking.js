// Shared by routes/mapper.js and routes/mappers.js so the two pages can
// never disagree about who sits where — same query, same order.
const { pool } = require('../db');
const { canon } = require('./links');

/** Mappers with their total "+" and their map count. Ordered by votes desc
 *  (ties break by name) — the array index (1-based) is the rank, not a SQL
 *  window function, matching the real tm-votes source exactly. The client
 *  re-sorts locally when the user switches to the "Maps" category.
 *
 *  Grouped by identity (see links.js canon()): a mapper with a linked alt
 *  gets one row pooling all their maps, and a voter's linked accounts
 *  voting for the same map still only count once. `maps` is a DISTINCT
 *  count because the LEFT JOIN to votes fans map rows out per vote. */
async function getMapperResults() {
  const authorCanon = canon('m.author_account_id');
  const voterCanon = canon('v.account_id');
  const { rows } = await pool.query(`
    SELECT ${authorCanon} AS account_id,
           COALESCE(
             MAX(CASE WHEN m.author_account_id = ${authorCanon} THEN m.author_name END),
             MAX(m.author_name)
           ) AS name,
           COUNT(DISTINCT v.map_uid || '|' || ${voterCanon})::int AS votes,
           COUNT(DISTINCT m.map_uid)::int AS maps
    FROM maps m
    LEFT JOIN votes v ON v.map_uid = m.map_uid
    WHERE m.author_account_id IS NOT NULL
    GROUP BY 1
    ORDER BY votes DESC, name ASC
  `);
  return rows.map((r) => ({ accountId: r.account_id, name: r.name, votes: r.votes, maps: r.maps }));
}

module.exports = { getMapperResults };
