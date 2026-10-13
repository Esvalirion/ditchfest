// Aggregates for the Players tab: per-player in-game stats over the stored
// leaderboards (services/records.js). Medals count cumulatively, the way
// Nadeo awards them: a time under a threshold earns that medal AND every
// softer one below it (author medalist also scores gold, silver and bronze).
// So bronze <= silver <= gold <= author <= finishes always holds.
//
// canon() wraps account_id like everywhere else: if a leaderboard identity
// happens to be linked to site accounts, their records pool into one person
// at read time. Names prefer the identity's own cached nick, then any
// member's (the mapperRanking.js precedence, on the records' own cache
// table instead of maps.author_name).
const { pool } = require('../db');
const { canon } = require('./links');
const { isRecordsSchemaReady } = require('./records');

async function getPlayerRecords() {
  // Deploy lockdown: before migration 009 lands there is no map_records to
  // read — answer with an explicit pending flag instead of a 500, so the
  // Players tab can say "not live yet" rather than "failed".
  if (!(await isRecordsSchemaReady())) {
    return { players: [], tracks: { total: 0, checked: 0 }, pending: true };
  }
  const playerCanon = canon('r.account_id');
  // Two passes: first collapse to one best time per (identity, map) — a
  // linked main + alt that both finished a map must count it once, not twice
  // — then count finishes/medals per identity.
  const { rows } = await pool.query(`
    WITH best AS (
      SELECT ${playerCanon} AS account_id, r.map_uid, MIN(r.time_ms) AS time_ms
      FROM map_records r
      GROUP BY 1, 2
    ),
    names AS (
      SELECT ${playerCanon} AS account_id,
             MAX(CASE WHEN r.account_id = ${playerCanon} THEN pn.display_name END) AS primary_name,
             MAX(pn.display_name) AS fallback_name
      FROM (SELECT DISTINCT account_id FROM map_records) r
      LEFT JOIN player_names pn ON pn.account_id = r.account_id
      GROUP BY 1
    )
    SELECT b.account_id,
           n.primary_name,
           n.fallback_name,
           COUNT(*)::int AS finishes,
           COUNT(*) FILTER (WHERE m.author_time_ms IS NOT NULL AND b.time_ms <= m.author_time_ms)::int AS author,
           COUNT(*) FILTER (WHERE m.gold_time_ms IS NOT NULL AND b.time_ms <= m.gold_time_ms)::int AS gold,
           COUNT(*) FILTER (WHERE m.silver_time_ms IS NOT NULL AND b.time_ms <= m.silver_time_ms)::int AS silver,
           COUNT(*) FILTER (WHERE m.bronze_time_ms IS NOT NULL AND b.time_ms <= m.bronze_time_ms)::int AS bronze
    FROM best b
    JOIN maps m ON m.map_uid = b.map_uid
    LEFT JOIN names n ON n.account_id = b.account_id
    GROUP BY b.account_id, n.primary_name, n.fallback_name
  `);

  const players = rows
    .map((r) => ({
      accountId: r.account_id,
      name: r.primary_name || r.fallback_name || null,
      finishes: r.finishes,
      author: r.author,
      gold: r.gold,
      silver: r.silver,
      bronze: r.bronze,
    }))
    // Name tiebreak in JS: SQL ORDER BY can't wrap output aliases in
    // COALESCE(), and the client re-sorts per category anyway.
    .sort(
      (a, b) =>
        b.author - a.author ||
        b.gold - a.gold ||
        b.silver - a.silver ||
        b.finishes - a.finishes ||
        (a.name || '').localeCompare(b.name || '')
    );

  return { players, tracks: await getTrackCounts() };
}

/** How many maps the board covers — the denominator for "X of Y maps". Only
 *  checked maps count: an unchecked map has no window, and counting it
 *  would fake-inflate the total while the backfill is still running. */
async function getTrackCounts() {
  const { rows } = await pool.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(records_updated_at)::int AS checked
    FROM maps
  `);
  return rows[0] || { total: 0, checked: 0 };
}

module.exports = { getPlayerRecords };
