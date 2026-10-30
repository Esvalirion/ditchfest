// "Ditchfest latest": the club campaign the admins refill with each fest's
// maps (TM_LATEST_CAMPAIGN_ID, outside the DF campaigns folder the catalog
// sync reads). Without this step a fest edition goes wrong in two ways:
//  - its maps are added to an existing campaign ("DITCHFEST 134-135"), so the
//    sync files them under the previous edition;
//  - no campaign exists yet at all, so the site doesn't show them.
// After every catalog sync, applyLatest() files the fest's maps into a virtual
// folder "#N" (004_campaign_folders.sql) — the same thing an admin did by hand
// for #133: maps the sync filed under a mixed campaign get a
// display_campaign_id override; maps not synced yet are inserted straight into
// the folder (campaign_id = folder; once they show up in a real campaign the
// sync overwrites campaign_id and the override keeps them in the folder).
//
// Fails closed — whatever it can't be sure about, it leaves alone:
//  - N is the clear-majority "DF<n>" number in the latest maps' names; none,
//    or N not newer than every other DF number on the site → nothing happens
//    (a stale "latest" still holding the previous fest moves nothing);
//  - only maps of the newest real campaigns, only ones with no display
//    override, only from a campaign that also holds maps outside latest (a
//    campaign that is entirely this fest is already its own edition);
//  - a map whose own name says another DF number is skipped;
//  - every map is handled once (auto_latest_maps), so an admin who moves one
//    back is never overridden; a folder an admin deleted is never recreated.
const { pool } = require('../db');
const { stripFormat } = require('./tmio');

// A fest edition over 25 maps is split over several real campaigns, hence 3.
const NEWEST_REAL_CAMPAIGNS = 3;
const MAX_LATEST_MAPS = 25; // Nadeo's cap per campaign; more = not a campaign we understand
const MIN_NUMBERED = 3; // names carrying N needed before N is trusted
const LOCK_KEY = 'ditchfest:auto-latest';

const DF_NUMBER = /(?:^|[^a-z0-9])(?:df|ditchfest)[\s#№_.\-–—]*(\d{1,3})(?!\d)/i;
// A stale "latest" is a fest or two behind; a DF number far above N on the
// site is a meme name ("DF 999"), not a newer fest, and mustn't block forever.
const MAX_PLAUSIBLE_AHEAD = 20;

/** The fest number a map name carries ("DF134 - …", "df 135 …",
 *  "Ditchfest135 - …", "DF#135_…"), or null. */
function dfNumber(name) {
  const m = DF_NUMBER.exec(name || '');
  return m ? Number(m[1]) : null;
}

/** The fest number of a set of map names: the most common DF number, if at
 *  least MIN_NUMBERED names carry it and it's at least 2/3 of the numbered
 *  ones. Otherwise null. */
function pickEditionNumber(names) {
  const counts = new Map();
  let numbered = 0;
  for (const name of names) {
    const n = dfNumber(name);
    if (n == null) continue;
    numbered++;
    counts.set(n, (counts.get(n) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [n, c] of counts) {
    if (c > bestCount) [best, bestCount] = [n, c];
  }
  if (bestCount < MIN_NUMBERED || bestCount * 3 < numbered * 2) return null;
  return best;
}

let schemaReady = null;
/** Same lockdown as isPendingVotesReady: shipping the code before migration
 *  011 just leaves this step off. Needs 010's pending_votes too. */
async function isLatestReady() {
  if (schemaReady && (schemaReady.ok || Date.now() - schemaReady.at < 60_000)) return schemaReady.ok;
  const { rows } = await pool.query(
    `SELECT to_regclass('public.auto_latest_maps') IS NOT NULL
        AND to_regclass('public.auto_latest_editions') IS NOT NULL
        AND to_regclass('public.pending_votes') IS NOT NULL AS ok`
  );
  schemaReady = { ok: rows[0].ok, at: Date.now() };
  return schemaReady.ok;
}

/** Files the latest campaign's playlist (trackmania.io shape) into folder
 *  "#N". Returns a summary; `skipped` says why nothing was done. */
async function applyLatest(playlist) {
  if (!(await isLatestReady())) return { skipped: 'schema_not_ready' };

  const latest = (playlist || [])
    .filter((m) => m && m.mapUid)
    .map((m, i) => ({
      mapUid: m.mapUid,
      name: stripFormat(m.name),
      authorAccountId: m.author || null,
      authorName: m.authorplayer?.name ? stripFormat(m.authorplayer.name) : null,
      thumbnailUrl: m.thumbnailUrl || null,
      position: m.position ?? i,
    }));
  if (latest.length === 0) return { skipped: 'empty' };
  if (latest.length > MAX_LATEST_MAPS) return { skipped: 'too_many_maps' };

  const n = pickEditionNumber(latest.map((m) => m.name));
  if (n == null) return { skipped: 'no_edition_number' };
  // Maps naming a different fest stay out of it, whatever happens below.
  const ours = latest.filter((m) => [null, n].includes(dfNumber(m.name)));
  const latestUids = latest.map((m) => m.mapUid);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS ok', [LOCK_KEY]);
    if (!lock.rows[0].ok) {
      await client.query('ROLLBACK');
      return { edition: n, skipped: 'locked' };
    }

    const result = await fileEdition(client, n, ours, latestUids);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function fileEdition(client, n, ours, latestUids) {
  const known = await client.query(
    'SELECT campaign_id FROM auto_latest_editions WHERE edition_number = $1',
    [n]
  );
  let folderId = known.rows[0]?.campaign_id ?? null;
  if (folderId != null) {
    const exists = await client.query('SELECT 1 FROM editions WHERE campaign_id = $1', [folderId]);
    if (exists.rowCount === 0) return { edition: n, skipped: 'folder_deleted_by_admin' };
  }

  // N must be newer than every other fest on the site. Maps already filed in
  // N's folder don't count: a fest map swapped mid-fest (cut found, new uid)
  // is still there until demoted below.
  const others = await client.query(
    `SELECT name FROM maps
     WHERE map_uid <> ALL($1)
       AND ($2::int IS NULL OR COALESCE(display_campaign_id, campaign_id) <> $2)`,
    [latestUids, folderId]
  );
  const newestOther = Math.max(
    0,
    ...others.rows.map((r) => dfNumber(r.name) ?? 0).filter((x) => x <= n + MAX_PLAUSIBLE_AHEAD)
  );
  if (newestOther >= n) return { edition: n, skipped: 'not_newer', newestOther };

  const handled = new Set(
    (
      await client.query('SELECT map_uid FROM auto_latest_maps WHERE map_uid = ANY($1)', [latestUids])
    ).rows.map((r) => r.map_uid)
  );
  const fresh = ours.filter((m) => !handled.has(m.mapUid));
  const existing = new Map(
    (
      await client.query(
        'SELECT map_uid, campaign_id, display_campaign_id FROM maps WHERE map_uid = ANY($1)',
        [fresh.map((m) => m.mapUid)]
      )
    ).rows.map((r) => [r.map_uid, r])
  );

  const newestReal = new Set(
    (
      await client.query(
        'SELECT campaign_id FROM editions WHERE campaign_id > 0 ORDER BY campaign_id DESC LIMIT $1',
        [NEWEST_REAL_CAMPAIGNS]
      )
    ).rows.map((r) => r.campaign_id)
  );
  const mixed = new Set(
    (
      await client.query(
        `SELECT DISTINCT campaign_id FROM maps
         WHERE campaign_id = ANY($1) AND map_uid <> ALL($2)`,
        [[...newestReal], latestUids]
      )
    ).rows.map((r) => r.campaign_id)
  );

  const toMove = fresh.filter((m) => {
    const row = existing.get(m.mapUid);
    return row && row.display_campaign_id == null && mixed.has(row.campaign_id);
  });
  const toInsert = fresh.filter((m) => !existing.has(m.mapUid));

  if (folderId == null && toMove.length + toInsert.length > 0) {
    folderId = await findOrCreateFolder(client, n);
  }
  if (folderId == null) return { edition: n, moved: 0, inserted: 0, demoted: 0 };

  let moved = 0;
  if (toMove.length) {
    const uids = toMove.map((m) => m.mapUid);
    const res = await client.query(
      `UPDATE maps SET display_campaign_id = $1
       WHERE map_uid = ANY($2) AND display_campaign_id IS NULL
       RETURNING map_uid`,
      [folderId, uids]
    );
    moved = res.rowCount;
    await logMaps(client, res.rows.map((r) => r.map_uid), folderId, 'moved');
  }

  let inserted = 0;
  for (const m of toInsert) {
    const res = await client.query(
      `INSERT INTO maps (map_uid, campaign_id, display_campaign_id, name, author_account_id,
                         author_name, thumbnail_url, position, updated_at)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (map_uid) DO NOTHING`,
      [m.mapUid, folderId, m.name, m.authorAccountId, m.authorName, m.thumbnailUrl, m.position]
    );
    if (res.rowCount) {
      inserted++;
      await logMaps(client, [m.mapUid], folderId, 'inserted');
    }
  }

  const demoted = await demoteDropped(client, folderId, latestUids);
  return { edition: n, folderId, moved, inserted, demoted };
}

/** A map this step inserted that left latest before reaching any real
 *  campaign was swapped out mid-fest. Its row goes, its votes go back to
 *  pending_votes — so they come back if the map ever lands in a campaign,
 *  and expire like any other pending vote otherwise. Skipped when that would
 *  be most of the folder: that's not a swap, that's something unexpected. */
async function demoteDropped(client, folderId, latestUids) {
  const dropped = (
    await client.query(
      `SELECT a.map_uid FROM auto_latest_maps a JOIN maps m ON m.map_uid = a.map_uid
       WHERE a.campaign_id = $1 AND a.action = 'inserted'
         AND m.campaign_id = $1 AND a.map_uid <> ALL($2)`,
      [folderId, latestUids]
    )
  ).rows.map((r) => r.map_uid);
  if (dropped.length === 0) return 0;

  const total = await client.query(
    'SELECT COUNT(*)::int AS c FROM maps WHERE COALESCE(display_campaign_id, campaign_id) = $1',
    [folderId]
  );
  if (dropped.length * 2 > total.rows[0].c) {
    console.warn('auto-latest: not demoting', dropped.length, 'of', total.rows[0].c, 'maps in folder', folderId);
    return 0;
  }

  await client.query(
    `INSERT INTO pending_votes (account_id, map_uid, created_at)
     SELECT account_id, map_uid, created_at FROM votes WHERE map_uid = ANY($1)
     ON CONFLICT DO NOTHING`,
    [dropped]
  );
  await client.query('DELETE FROM maps WHERE map_uid = ANY($1)', [dropped]);
  // Forget them, so a map put back into latest is picked up again.
  await client.query('DELETE FROM auto_latest_maps WHERE map_uid = ANY($1)', [dropped]);
  return dropped.length;
}

/** The folder for fest N: a virtual edition an admin already named "#N", or
 *  a new one, created like POST /api/campaigns does (on top of the board). */
async function findOrCreateFolder(client, n) {
  const label = `#${n}`;
  const found = await client.query(
    `SELECT campaign_id FROM editions
     WHERE campaign_id < 0 AND lower(trim(COALESCE(display_name, name))) = $1
     ORDER BY campaign_id DESC LIMIT 1`,
    [label]
  );
  let folderId = found.rows[0]?.campaign_id;
  if (folderId == null) {
    const created = await client.query(
      `INSERT INTO editions (campaign_id, name, sort_order)
       VALUES (nextval('editions_virtual_id_seq'), $1,
               (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM editions))
       RETURNING campaign_id`,
      [label]
    );
    folderId = created.rows[0].campaign_id;
  }
  await client.query(
    'INSERT INTO auto_latest_editions (edition_number, campaign_id) VALUES ($1, $2)',
    [n, folderId]
  );
  return folderId;
}

async function logMaps(client, uids, folderId, action) {
  if (!uids.length) return;
  await client.query(
    `INSERT INTO auto_latest_maps (map_uid, campaign_id, action)
     SELECT unnest($1::text[]), $2, $3
     ON CONFLICT (map_uid) DO NOTHING`,
    [uids, folderId, action]
  );
}

module.exports = { applyLatest, dfNumber, pickEditionNumber };
