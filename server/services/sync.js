// Catalog sync: pull Ditchfest campaigns + their maps from trackmania.io into
// Postgres. Runs on a schedule (see server.js) and from the manual POST
// /api/sync endpoint. Ported from the real tm-votes' src/sync.ts (kept as a
// private reference, not duplicated in this repo — see COTD_MIGRATION_PLAN.md).
//
// To stay well under trackmania.io's rate limit, maps are only fetched for
// campaigns that have no maps yet, plus the few newest campaigns (whose
// current edition may still be gaining maps). Old editions never change, so
// they're fetched exactly once outside of the rotation.
const { fetchCampaignMaps, fetchFolderCampaigns, sleep, stripFormat } = require('./tmio');
const {
  getAccountsMissingName,
  getStalestCampaignIds,
  getSyncedCampaignIds,
  updateAuthorName,
  upsertEdition,
  upsertMap,
} = require('./catalog');
const { getAppToken, resolveDisplayNames } = require('./names');
const { refreshEveryone } = require('./grants');
const { TM_CLUB_ID, TM_FOLDER_ID, TMIO_USER_AGENT } = require('../config');

// Every run refreshes a bounded batch so we never burst through trackmania.io's
// rate limit. The batch is filled by priority: (1) editions with no maps yet,
// (2) the newest few editions, (3) the least-recently-refreshed editions.
// Point (3) rotates the refresh across ALL editions over successive runs, so
// old themes stay up to date too — newer ones just come around more often.
const REFRESH_NEWEST = 3; // always re-fetch this many newest editions
const MAX_FETCH_PER_RUN = 12; // editions fetched per run
const REQUEST_DELAY_MS = 600; // ~1.6 req/s, under the ~2 req/s soft limit

async function syncCatalog() {
  const clubId = Number(TM_CLUB_ID);
  const folderId = Number(TM_FOLDER_ID);
  const ua = TMIO_USER_AGENT;

  const campaigns = await fetchFolderCampaigns(clubId, folderId, ua);

  // Upsert all editions first (cheap, no extra requests).
  for (const c of campaigns) {
    await upsertEdition({
      campaignId: c.campaignid,
      name: stripFormat(c.name),
      media: c.media || null,
      position: c.position ?? null,
    });
  }

  // Build this run's fetch batch by priority. campaign_id increases with
  // each new edition, so higher id = newer (the folder "position" field is not
  // chronological).
  const synced = await getSyncedCampaignIds();
  const byId = new Map(campaigns.map((c) => [c.campaignid, c]));
  const newestFirst = [...campaigns].sort((a, b) => b.campaignid - a.campaignid);

  const batchIds = new Set();
  const batch = [];
  const add = (c) => {
    if (!c || batchIds.has(c.campaignid) || batch.length >= MAX_FETCH_PER_RUN) return;
    batchIds.add(c.campaignid);
    batch.push(c);
  };

  // 1. Editions with no maps yet (initial backfill), newest first.
  for (const c of newestFirst) if (!synced.has(c.campaignid)) add(c);
  // 2. The newest few editions (refreshed every run).
  for (const c of newestFirst.slice(0, REFRESH_NEWEST)) add(c);
  // 3. Fill remaining slots with the least-recently-refreshed editions,
  //    rotating the refresh across all editions over time.
  const stale = await getStalestCampaignIds(MAX_FETCH_PER_RUN);
  for (const id of stale) add(byId.get(id));

  let mapsUpserted = 0;
  let campaignsFetched = 0;
  let stoppedEarly = false;

  for (let i = 0; i < batch.length; i++) {
    if (i > 0) await sleep(REQUEST_DELAY_MS);
    const c = batch[i];
    let maps;
    try {
      maps = await fetchCampaignMaps(clubId, c.campaignid, ua);
    } catch (e) {
      // Stop on error (e.g. rate limit). Whatever's been written so far is
      // persisted; the next run resumes with the still-unsynced campaigns.
      console.error('sync: stopping early at', c.campaignid, String(e));
      stoppedEarly = true;
      break;
    }

    let pos = 0;
    for (const m of maps) {
      if (!m.mapUid) continue;
      await upsertMap({
        mapUid: m.mapUid,
        campaignId: c.campaignid,
        name: stripFormat(m.name),
        authorAccountId: m.author || null,
        authorName: m.authorplayer?.name ? stripFormat(m.authorplayer.name) : null,
        thumbnailUrl: m.thumbnailUrl || null,
        position: m.position ?? pos,
      });
      pos++;
      mapsUpserted++;
    }
    campaignsFetched++;
  }

  // Fill in any missing mapper display names (trackmania.io sometimes omits
  // them). Resolved via the official OAuth display-names API, batched per run.
  let namesResolved = 0;
  try {
    const missing = await getAccountsMissingName(50);
    if (missing.length) {
      const token = await getAppToken();
      const names = await resolveDisplayNames(missing, token);
      for (const [id, name] of Object.entries(names)) {
        if (name) {
          await updateAuthorName(id, stripFormat(name));
          namesResolved++;
        }
      }
    }
  } catch (e) {
    console.error('sync: name resolution failed', String(e));
  }

  // Map counts and leaderboard places move with every sync, so re-check the
  // stat achievements for everyone. This is what catches "was in the top 10
  // at some point" for mappers whose page nobody happens to open.
  let achievementsGranted = 0;
  try {
    achievementsGranted = await refreshEveryone();
  } catch (e) {
    console.error('sync: achievement sweep failed', String(e));
  }

  // How many editions still have no maps at all (initial backfill remaining).
  const syncedAfter = await getSyncedCampaignIds();
  const neverSynced = campaigns.filter((c) => !syncedAfter.has(c.campaignid)).length;

  return {
    campaigns: campaigns.length,
    campaignsFetched,
    mapsUpserted,
    neverSynced,
    namesResolved,
    achievementsGranted,
    stoppedEarly,
  };
}

module.exports = { syncCatalog };
