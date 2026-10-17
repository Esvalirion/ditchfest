// Data for the Openplanet in-game plugin (openplanet/ in this repo) — a
// Better-TOTD-style browser for Ditchfest maps. The plugin makes exactly two
// calls: the whole catalog once (getPluginCatalog) and the local player's own
// times (getPluginRecords). Everything else it needs — the map file URL to
// play it, the live PB right after a run — it asks the game itself.
//
// The catalog is getEditions() as-is (same admin folders, renames, hidden
// editions, ordering as the Maps page), flattened and enriched with what the
// records sweep (services/records.js, migration 009) already keeps per map:
// medal times, finisher count, how many identities hold each medal. Before
// 009 is applied those fields are just null and the plugin shows "?".
const { pool } = require('../db');
const { canon } = require('./links');
const { getEditions } = require('./editions');
const { isRecordsSchemaReady } = require('./records');

// The catalog changes with the 30-min sync and the 5-min records sweep; one
// plugin start = one fetch, so a short in-process cache only shields the full
// map_records scan from a burst of players launching the game at fest time.
const CATALOG_TTL_MS = 5 * 60_000;
let catalogCache = null; // { at: number, value: object }

async function getPluginCatalog() {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.value;
  const value = await buildCatalog();
  catalogCache = { at: Date.now(), value };
  return value;
}

async function buildCatalog() {
  const recordsReady = await isRecordsSchemaReady();
  const [editions, stats, coauthorNames] = await Promise.all([
    getEditions(),
    recordsReady ? getMapRecordStats() : new Map(),
    getCoauthorNames(recordsReady),
  ]);

  const maps = [];
  editions.forEach((e, order) => {
    for (const m of e.maps) {
      const s = stats.get(m.mapUid) || {};
      maps.push({
        uid: m.mapUid,
        name: m.name,
        author: m.authorName,
        authorId: m.author,
        coauthors: coauthorNames.get(m.mapUid) || [],
        edition: order,
        votes: m.votes,
        finishers: s.finishers ?? null,
        medals: s.medals || null,
        medalCounts: s.medalCounts || null,
        recordsStored: s.stored ?? null,
        slowestStoredMs: s.slowest ?? null,
        style: m.style,
        tags: m.tags.map((t) => t.name),
        onTmx: m.onTmx,
      });
    }
  });

  return {
    // Index = edition order on the site: 0 is the newest; maps[].edition
    // points here.
    editions: editions.map((e) => ({ id: e.campaignId, name: e.name, theme: e.theme })),
    maps,
    recordsReady,
    generatedAt: new Date().toISOString(),
  };
}

/** map_uid -> { finishers, medals: [at,gold,silver,bronze] ms, medalCounts, stored, slowest }.
 *  medalCounts are identities (canon()), counted cumulatively like the
 *  Players tab: an AT also counts as gold, silver and bronze. A linked main
 *  and alt on one map collapse to their best time first, then count once.
 *
 *  `stored` / `slowest` = leaderboard places (raw accounts, comparable to
 *  records_playercount) we hold and the slowest of their times. The sweep
 *  keeps only the top MAX_RECORDS_PER_MAP places: when finishers > stored, a
 *  player missing from the records may be ranked below the cut, and a medal
 *  whose threshold is slower than `slowest` has holders we can't see — its
 *  count is a lower bound. Faster thresholds stay exact. */
async function getMapRecordStats() {
  const { rows } = await pool.query(`
    WITH best AS (
      SELECT ${canon('r.account_id')} AS account_id, r.map_uid, MIN(r.time_ms) AS time_ms
      FROM map_records r
      GROUP BY 1, 2
    ),
    counts AS (
      SELECT b.map_uid,
             COUNT(*) FILTER (WHERE b.time_ms <= m.author_time_ms)::int AS at,
             COUNT(*) FILTER (WHERE b.time_ms <= m.gold_time_ms)::int   AS gold,
             COUNT(*) FILTER (WHERE b.time_ms <= m.silver_time_ms)::int AS silver,
             COUNT(*) FILTER (WHERE b.time_ms <= m.bronze_time_ms)::int AS bronze
      FROM best b
      JOIN maps m ON m.map_uid = b.map_uid
      GROUP BY b.map_uid
    ),
    stored AS (
      SELECT map_uid, COUNT(*)::int AS stored, MAX(time_ms) AS slowest
      FROM map_records
      GROUP BY map_uid
    )
    SELECT m.map_uid, m.author_time_ms, m.gold_time_ms, m.silver_time_ms, m.bronze_time_ms,
           m.records_playercount, m.records_updated_at,
           c.at, c.gold, c.silver, c.bronze, st.stored, st.slowest
    FROM maps m
    LEFT JOIN counts c ON c.map_uid = m.map_uid
    LEFT JOIN stored st ON st.map_uid = m.map_uid
  `);
  const byMap = new Map();
  for (const r of rows) {
    // Not swept yet → leave everything null: "unknown", not "zero".
    if (!r.records_updated_at) continue;
    byMap.set(r.map_uid, {
      finishers: r.records_playercount ?? 0,
      medals: r.author_time_ms == null
        ? null
        : [r.author_time_ms, r.gold_time_ms, r.silver_time_ms, r.bronze_time_ms],
      medalCounts: [r.at ?? 0, r.gold ?? 0, r.silver ?? 0, r.bronze ?? 0],
      stored: r.stored ?? 0,
      slowest: r.slowest ?? null,
    });
  }
  return byMap;
}

/** map_uid -> co-author display names (getEditions() only carries their ids).
 *  The name comes from a map they authored themselves, else from the
 *  leaderboard nick cache (player_names, only once migration 009 exists);
 *  unresolvable co-authors are skipped — the plugin uses names for display
 *  and author search only. */
async function getCoauthorNames(recordsReady) {
  const { rows } = await pool.query(`
    SELECT c.map_uid,
           COALESCE(
             (SELECT m.author_name FROM maps m
               WHERE m.author_account_id = c.account_id AND m.author_name IS NOT NULL
               LIMIT 1)
             ${recordsReady ? ', (SELECT pn.display_name FROM player_names pn WHERE pn.account_id = c.account_id)' : ''}
           ) AS name
    FROM map_coauthors c
    ORDER BY c.created_at
  `);
  const byMap = new Map();
  for (const r of rows) {
    if (!r.name) continue;
    if (!byMap.has(r.map_uid)) byMap.set(r.map_uid, []);
    byMap.get(r.map_uid).push(r.name);
  }
  return byMap;
}

const ACCOUNT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One account's times on Ditchfest maps from the records sweep:
 *  { records: { [mapUid]: [timeMs, position] } }, or null for a malformed id.
 *  Deliberately the raw account, not canon(): this is "my PB in the game",
 *  and the game knows nothing about linked alts. Coverage is the sweep's —
 *  up to MAX_RECORDS_PER_MAP places, ~1h fresh on current editions, ~2 days
 *  on the rest; the plugin tops it up with the game's own PB. */
async function getPluginRecords(accountId) {
  if (!ACCOUNT_ID_RE.test(accountId || '')) return null;
  if (!(await isRecordsSchemaReady())) return { records: {}, pending: true };
  const { rows } = await pool.query(
    'SELECT map_uid, time_ms, position FROM map_records WHERE account_id = $1',
    [accountId.toLowerCase()]
  );
  const records = {};
  for (const r of rows) records[r.map_uid] = [r.time_ms, r.position];
  return { records };
}

module.exports = { getPluginCatalog, getPluginRecords };
