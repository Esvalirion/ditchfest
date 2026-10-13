// In-game records on Ditchfest maps — the data side of the Players tab.
// Medal times + the map's full leaderboard, from the same public
// trackmania.io API the catalog sync uses (see tmio.js fetchMapMedalTimes /
// fetchLeaderboardPage). Written ONLY here; upsertMap never touches these
// columns (the same sync-owns-its-columns rule as TMX styles).
//
// A refresh walks the WHOLE leaderboard page by page — popular maps have
// 500+ finishers and a bounded top window would silently undercount medals
// and finishes on exactly those maps. MAX_RECORDS_PER_MAP is only a runaway
// guard, not a semantic cutoff. Rows are replaced wholesale per map
// (delete + insert in one transaction), so old finishers don't linger if
// the board shifts. Positions are the rank at fetch time.
const { pool } = require('../db');
const { fetchMapMedalTimes, fetchLeaderboardPage, sleep } = require('./tmio');

const RECORDS_PAGE = 100; // tm.io leaderboard page length
// Runaway guard: beyond this a map is pathological (competition/bugged) and
// not worth the sync budget; the first MAX_RECORDS_PER_MAP entries still
// land. ~1000 finishers = 10 paced requests ≈ 25s worst case per map.
const MAX_RECORDS_PER_MAP = 1000;
// Pacing: one request per gap, steadily — a sustained rate under
// trackmania.io's ~2 req/s soft limit. (Bursting requests trips a ~60s 429
// penalty window that then swallows every following request — measured the
// hard way.)
const REQUEST_GAP_MS = 600;
const RATE_LIMIT_COOLDOWN_MS = 45_000;

/** Walk a map's full leaderboard, one paced page at a time. */
async function fetchAllRecords(mapUid, userAgent) {
  const tops = [];
  let total = 0;
  for (let offset = 0; offset < MAX_RECORDS_PER_MAP; offset += RECORDS_PAGE) {
    const page = await fetchLeaderboardPage(mapUid, userAgent, offset, RECORDS_PAGE);
    total = page.total;
    tops.push(...page.tops);
    if (tops.length >= total || page.tops.length < RECORDS_PAGE) break;
    await sleep(REQUEST_GAP_MS);
  }
  return { total, tops: tops.slice(0, MAX_RECORDS_PER_MAP) };
}

/** Refresh one map: medal times + full leaderboard + player names,
 *  all-or-nothing. On any failure nothing is written and the map keeps its
 *  old records_updated_at, so the rotation retries it next run (the same
 *  "don't stamp on error" rule as updateMapTmxStyles). A map with a locked
 *  or empty leaderboard is a valid result: medal times get stored, the
 *  record set is just empty. */
async function refreshMapRecords(mapUid, userAgent) {
  const medals = await fetchMapMedalTimes(mapUid, userAgent);
  await sleep(REQUEST_GAP_MS);
  const { total, tops: raw } = await fetchAllRecords(mapUid, userAgent);

  // One row per player, best time wins. The board is walked page by page over
  // several seconds, so a player who improves mid-walk can show up on two
  // pages — and a duplicate key inside one INSERT ... ON CONFLICT DO UPDATE
  // is a hard Postgres error ("cannot affect row a second time").
  const byAccount = new Map();
  for (const t of raw) {
    if (!t.accountId || !Number.isFinite(t.time)) continue;
    const prev = byAccount.get(t.accountId);
    if (!prev || t.time < prev.time) byAccount.set(t.accountId, t);
  }
  const tops = [...byAccount.values()];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE maps SET author_time_ms = $1, gold_time_ms = $2,
                        silver_time_ms = $3, bronze_time_ms = $4,
                        records_playercount = $5, records_updated_at = now()
       WHERE map_uid = $6`,
      [medals.author, medals.gold, medals.silver, medals.bronze, total, mapUid]
    );
    await client.query('DELETE FROM map_records WHERE map_uid = $1', [mapUid]);
    if (tops.length) {
      const values = tops
        .map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4}, now())`)
        .join(', ');
      await client.query(
        `INSERT INTO map_records (map_uid, account_id, time_ms, position, updated_at) VALUES ${values}
         ON CONFLICT (map_uid, account_id) DO UPDATE SET
           time_ms = EXCLUDED.time_ms, position = EXCLUDED.position, updated_at = now()`,
        tops.flatMap((t) => [mapUid, t.accountId, t.time, t.position ?? null])
      );
    }
    const names = tops.filter((t) => t.name);
    if (names.length) {
      const seen = new Set();
      const fresh = names.filter((t) => !seen.has(t.accountId) && seen.add(t.accountId));
      const values = fresh.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}, now())`).join(', ');
      await client.query(
        `INSERT INTO player_names (account_id, display_name, updated_at) VALUES ${values}
         ON CONFLICT (account_id) DO UPDATE SET
           display_name = EXCLUDED.display_name, updated_at = now()`,
        fresh.flatMap((t) => [t.accountId, t.name])
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { mapUid, medalTimes: medals, records: tops.length, total };
}

// Hot set: maps of the newest few real campaigns. That's where nearly all new
// finishes happen (old ditchfests barely get replayed), so they're refreshed
// whenever they're older than HOT_STALE_MS; the rest of the catalog rotates
// with whatever budget is left. A ditchfest bigger than 25 maps is split into
// several Nadeo campaigns, hence 3 rather than 1.
const HOT_CAMPAIGNS = 3;
const HOT_STALE_MS = 60 * 60_000;

/** Next batch for the sweep: never-checked maps first (a new ditchfest lands
 *  on the first run), then stale hot maps, then the stalest of the rest. */
async function getRecordSweepBatch(limit) {
  const { rows } = await pool.query(
    `WITH hot AS (
       SELECT campaign_id FROM maps GROUP BY campaign_id
       ORDER BY campaign_id DESC LIMIT $2
     )
     SELECT map_uid FROM maps
     ORDER BY
       (records_updated_at IS NULL) DESC,
       (campaign_id IN (SELECT campaign_id FROM hot)
          AND records_updated_at < now() - make_interval(secs => $3)) DESC,
       records_updated_at ASC
     LIMIT $1`,
    [limit, HOT_CAMPAIGNS, HOT_STALE_MS / 1000]
  );
  return rows.map((r) => r.map_uid);
}

/** map_uids that have never been checked at all — what the one-off backfill
 *  walks. Re-refreshing stale-checked maps is the sync sweep's rotation,
 *  not the backfill's job: a stalest-first loop here would never terminate
 *  (measured — it happily re-walked the catalog ~4x until a network blip
 *  tripped the failure breaker). */
async function getNeverCheckedMapUids(limit) {
  const { rows } = await pool.query(
    'SELECT map_uid FROM maps WHERE records_updated_at IS NULL LIMIT $1',
    [limit]
  );
  return rows.map((r) => r.map_uid);
}

/** Refresh a bounded batch — run by its own cron in server.js (RECORDS_CRON).
 *  No-ops (one log line per run) until migration 009 is applied. */
async function sweepRecords(limit, userAgent) {
  if (!(await isRecordsSchemaReady())) {
    console.warn('records: schema not ready (migration 009 applied?) — skipping sweep');
    return [];
  }
  const uids = await getRecordSweepBatch(limit);
  const done = [];
  for (const [i, mapUid] of uids.entries()) {
    if (i) await sleep(REQUEST_GAP_MS);
    try {
      done.push(await refreshMapRecords(mapUid, userAgent));
    } catch (e) {
      // Skip and leave the stamp untouched — next run retries this map first.
      console.error('records: refresh failed for', mapUid, String(e));
    }
  }
  return done;
}

/** One-off full backfill (db/backfillRecords.js): walk every never-checked
 *  map, throttled under trackmania.io's ~2 req/s, and STOP when none are
 *  left — staying fresh afterwards is the sync sweep's job. Returns
 *  { refreshed, failed, remaining } — safe to re-run, it resumes where it
 *  stopped (stamped maps are skipped). A 429 waits out the rate-limit window
 *  and retries the map once; five failures in a row abort the run (the
 *  penalty box only clears with time — better to stop than to spin). */
async function backfillRecords(userAgent, { limit } = {}) {
  if (!(await isRecordsSchemaReady())) {
    throw new Error('records: schema not ready — apply db/009_player_records.sql first');
  }
  let refreshed = 0;
  let failed = 0;
  let consecutiveFails = 0;
  const failedUids = new Set();
  outer: while (limit === undefined || refreshed + failed < limit) {
    // Pull extra candidates so persistently-failing maps can't starve the run.
    const batch = (await getNeverCheckedMapUids(failedUids.size + 10)).filter(
      (uid) => !failedUids.has(uid)
    );
    if (!batch.length) break;
    for (const mapUid of batch) {
      if (limit !== undefined && refreshed + failed >= limit) break outer;
      let ok = false;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        try {
          await refreshMapRecords(mapUid, userAgent);
          ok = true;
        } catch (e) {
          if (attempt === 0 && /429/.test(String(e))) {
            console.warn('records: rate-limited, cooling down', RATE_LIMIT_COOLDOWN_MS, 'ms');
            await sleep(RATE_LIMIT_COOLDOWN_MS);
            continue;
          }
          console.error('records: backfill failed for', mapUid, String(e));
        }
      }
      if (ok) {
        refreshed++;
        consecutiveFails = 0;
      } else {
        failed++;
        failedUids.add(mapUid);
        if (++consecutiveFails >= 5) {
          console.error('records: five maps in a row failing — aborting this run');
          break outer;
        }
      }
      await sleep(REQUEST_GAP_MS);
    }
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM maps WHERE records_updated_at IS NULL'
    );
    console.log(
      `records backfill: ${refreshed} done, ${failed} failed, ${rows[0].n} never-checked left`
    );
  }
  return { refreshed, failed, remaining: failedUids.size ? `${failedUids.size} stuck` : 0 };
}

/** Deploy lockdown: the app can be shipped BEFORE migration 009 is applied
 *  (it's applied by hand, possibly by someone else, later). Everything that
 *  touches the records schema asks this first and quietly no-ops until the
 *  migration lands — the site stays fully functional, the Players tab shows
 *  a "pending" state, the sync just skips its records sweep. A negative
 *  result is re-checked after a minute (the migration may land without a
 *  restart); a positive one is final. */
let schemaReadyCache = null; // { ready: boolean, checkedAt: number }
const SCHEMA_RECHECK_MS = 60_000;

async function isRecordsSchemaReady() {
  if (schemaReadyCache && schemaReadyCache.ready) return true;
  if (schemaReadyCache && Date.now() - schemaReadyCache.checkedAt < SCHEMA_RECHECK_MS) {
    return false;
  }
  try {
    const { rows } = await pool.query(`
      SELECT
        EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = current_schema() AND table_name = 'map_records') AS has_records,
        EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = current_schema() AND table_name = 'player_names') AS has_names,
        EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = current_schema() AND table_name = 'maps'
                  AND column_name = 'records_updated_at') AS has_stamp
    `);
    const r = rows[0] || {};
    const ready = Boolean(r.has_records && r.has_names && r.has_stamp);
    schemaReadyCache = { ready, checkedAt: Date.now() };
    return ready;
  } catch (e) {
    // Can't even ask the catalog — treat as not ready, retry on the next TTL.
    schemaReadyCache = { ready: false, checkedAt: Date.now() };
    return false;
  }
}

module.exports = {
  RECORDS_PAGE,
  MAX_RECORDS_PER_MAP,
  isRecordsSchemaReady,
  refreshMapRecords,
  getRecordSweepBatch,
  sweepRecords,
  backfillRecords,
};
