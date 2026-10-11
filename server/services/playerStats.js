// Aggregates for the Players tab: per-player in-game stats over the stored
// top windows (services/records.js). Pure read side — medal tiers are bands
// (a time under the author threshold counts as an Author medal, not also as
// gold/silver/bronze), so the four columns sum to "finishes that beat at
// least the bronze time", matching how people talk about medals.
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
  const { rows } = await pool.query(`
    SELECT ${playerCanon} AS account_id,
           MAX(CASE WHEN r.account_id = ${playerCanon} THEN pn.display_name END) AS primary_name,
           MAX(pn.display_name) AS fallback_name,
           COUNT(*)::int AS finishes,
           COUNT(*) FILTER (WHERE m.author_time_ms IS NOT NULL AND r.time_ms <= m.author_time_ms)::int AS author,
           COUNT(*) FILTER (WHERE m.gold_time_ms IS NOT NULL AND r.time_ms <= m.gold_time_ms
                              AND (m.author_time_ms IS NULL OR r.time_ms > m.author_time_ms))::int AS gold,
           COUNT(*) FILTER (WHERE m.silver_time_ms IS NOT NULL AND r.time_ms <= m.silver_time_ms
                              AND (m.gold_time_ms IS NULL OR r.time_ms > m.gold_time_ms))::int AS silver,
           COUNT(*) FILTER (WHERE m.bronze_time_ms IS NOT NULL AND r.time_ms <= m.bronze_time_ms
                              AND (m.silver_time_ms IS NULL OR r.time_ms > m.silver_time_ms))::int AS bronze
    FROM map_records r
    JOIN maps m ON m.map_uid = r.map_uid
    LEFT JOIN player_names pn ON pn.account_id = r.account_id
    GROUP BY 1
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
