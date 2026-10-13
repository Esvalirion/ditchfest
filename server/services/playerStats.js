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

// The board has ~18k players, so the client pages through it (and searches)
// instead of pulling everything. The aggregate itself is a full scan of
// map_records, so it's computed once per CACHE_TTL_MS and every page/search
// request slices the cached list in JS. A minute of staleness is invisible:
// the records sweep only lands new leaderboards every 5 minutes.
const CACHE_TTL_MS = 60 * 1000;
const SORT_KEYS = ['author', 'gold', 'silver', 'bronze', 'finishes'];
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

let cache = null; // { at, promise } — the promise is shared by concurrent misses

function getBoard() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.promise;
  const entry = { at: Date.now(), promise: loadBoard() };
  cache = entry;
  // A failed load must not stick for a minute — drop it so the next request retries.
  entry.promise.catch(() => {
    if (cache === entry) cache = null;
  });
  return entry.promise;
}

/** Full board, one ranked list per sort key (rank = place in the whole
 *  board, so a search result still shows the player's real position). */
async function loadBoard() {
  const players = await queryPlayers();
  const bySort = {};
  for (const key of SORT_KEYS) {
    bySort[key] = [...players]
      .sort(
        (a, b) =>
          b[key] - a[key] ||
          b.author - a.author ||
          b.gold - a.gold ||
          b.silver - a.silver ||
          b.finishes - a.finishes ||
          (a.name || '').localeCompare(b.name || '')
      )
      .map((p, i) => ({ ...p, rank: i + 1 }));
  }
  return { bySort, tracks: await getTrackCounts() };
}

/** One page of the board: `sort` picks the ranking column, `q` filters by
 *  name substring (case-insensitive), `offset`/`limit` slice the result.
 *  `total` is the number of players matching the filter. */
async function getPlayerRecords({ sort, q, offset, limit } = {}) {
  // Deploy lockdown: before migration 009 lands there is no map_records to
  // read — answer with an explicit pending flag instead of a 500, so the
  // Players tab can say "not live yet" rather than "failed".
  if (!(await isRecordsSchemaReady())) {
    return { players: [], total: 0, tracks: { total: 0, checked: 0 }, pending: true };
  }
  const board = await getBoard();
  const list = board.bySort[SORT_KEYS.includes(sort) ? sort : 'author'];
  const needle = String(q || '').trim().toLowerCase();
  const matching = needle
    ? list.filter((p) => (p.name || '').toLowerCase().includes(needle))
    : list;
  const from = Math.max(0, parseInt(offset, 10) || 0);
  const size = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT));
  return {
    players: matching.slice(from, from + size),
    total: matching.length,
    tracks: board.tracks,
  };
}

async function queryPlayers() {
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

  return rows.map((r) => ({
    accountId: r.account_id,
    name: r.primary_name || r.fallback_name || null,
    finishes: r.finishes,
    author: r.author,
    gold: r.gold,
    silver: r.silver,
    bronze: r.bronze,
  }));
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
