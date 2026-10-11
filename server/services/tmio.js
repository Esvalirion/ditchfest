// Minimal trackmania.io API client used by the hourly sync. Ported from the
// real tm-votes' src/tmio.ts (kept as a private reference, not duplicated
// in this repo — see COTD_MIGRATION_PLAN.md).
//
// trackmania.io gates its API: requests must send a descriptive User-Agent
// (project + contact), otherwise the site returns its SPA HTML instead of
// JSON. Endpoints used (reverse-engineered from the site's own frontend):
//   GET /api/club/{club}/folder/{folder}/{page}  -> campaigns inside a folder
//   GET /api/campaign/{club}/{campaignId}         -> a campaign's map playlist

const BASE = 'https://trackmania.io';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(path, userAgent) {
  // trackmania.io soft-limits to ~2 req/s; retry once on 429 after a pause.
  let res = await fetch(`${BASE}${path}`, {
    headers: { 'User-Agent': userAgent, Accept: 'application/json' },
  });
  if (res.status === 429) {
    await sleep(2500);
    res = await fetch(`${BASE}${path}`, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
    });
  }
  if (!res.ok) {
    throw new Error(`trackmania.io ${path} -> HTTP ${res.status}`);
  }
  const text = await res.text();
  // A gated/blocked request returns the SPA HTML; guard against that.
  if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
    throw new Error(`trackmania.io ${path} -> HTML (blocked; check User-Agent)`);
  }
  return JSON.parse(text);
}

function collectCampaigns(data) {
  const acts = data.activities || [];
  return acts
    .filter((a) => a.type === 'campaign' && a.campaignid)
    .map((a) => ({ campaignid: a.campaignid, name: a.name || '', media: a.media, position: a.position }));
}

/** All campaigns inside a club folder, walking every page. */
async function fetchFolderCampaigns(clubId, folderId, userAgent) {
  const first = await get(`/api/club/${clubId}/folder/${folderId}/0`, userAgent);
  const pageMax = first.page_max || 0;
  const campaigns = collectCampaigns(first);

  for (let page = 1; page <= pageMax; page++) {
    await sleep(600); // stay under the ~2 req/s soft limit
    const data = await get(`/api/club/${clubId}/folder/${folderId}/${page}`, userAgent);
    campaigns.push(...collectCampaigns(data));
  }
  return campaigns;
}

/** The maps (playlist) of a single campaign. */
async function fetchCampaignMaps(clubId, campaignId, userAgent) {
  const data = await get(`/api/campaign/${clubId}/${campaignId}`, userAgent);
  return data.playlist || [];
}

/**
 * Strip Trackmania text-formatting codes ($abc colours, $w/$s/$o styles,
 * links, $$ escape) so names display as plain text.
 */
function stripFormat(str) {
  if (!str) return '';
  return str
    .replace(/\$[0-9a-fA-F]{3}/g, '') // colour codes
    .replace(/\$[lhpLHP]\[[^\]]*\]/g, '') // link codes with [target]
    .replace(/\$[^$]/g, (m) => (m === '$$' ? '$' : '')) // style letters etc.
    .replace(/\$\$/g, '$')
    .trim();
}

/** Top N times for a map, newest first by position (1st place first). */
async function fetchMapLeaderboard(mapUid, userAgent, length = 5) {
  const data = await get(`/api/leaderboard/map/${mapUid}`, userAgent);
  return (data.tops || []).slice(0, length).map((t) => ({
    position: t.position,
    time: t.time,
    accountId: t.player && t.player.id,
    name: t.player && stripFormat(t.player.name),
  }));
}

/** Map info for the records sweep: just the four Nadeo medal times (ms).
 *  Note the endpoint is /api/map/{uid} (singular) — /api/maps/{uid} is a
 *  different (gated) route that answers with the SPA HTML. Nulls mean the
 *  map simply has no medal times (unranked etc.) — still a valid result. */
async function fetchMapMedalTimes(mapUid, userAgent) {
  const data = await get(`/api/map/${mapUid}`, userAgent);
  return {
    author: data.authorScore ?? null,
    gold: data.goldScore ?? null,
    silver: data.silverScore ?? null,
    bronze: data.bronzeScore ?? null,
  };
}

/** One leaderboard page for the records sweep: `length` entries starting at
 *  `offset`, plus the map's total finisher count (so the caller can walk
 *  every page — popular maps have 500+ finishers, a single top window would
 *  silently undercount their medals). `locked` is true on competition maps;
 *  their tops come back empty, which the caller treats as "no records". */
async function fetchLeaderboardPage(mapUid, userAgent, offset, length) {
  const data = await get(
    `/api/leaderboard/map/${mapUid}?offset=${offset}&length=${length}`,
    userAgent
  );
  return {
    total: typeof data.playercount === 'number' ? data.playercount : (data.tops || []).length,
    tops: (data.tops || []).map((t) => ({
      position: t.position,
      time: t.time,
      accountId: t.player && t.player.id,
      name: t.player && stripFormat(t.player.name),
    })),
  };
}

module.exports = {
  sleep,
  fetchFolderCampaigns,
  fetchCampaignMaps,
  stripFormat,
  fetchMapLeaderboard,
  fetchMapMedalTimes,
  fetchLeaderboardPage,
};

