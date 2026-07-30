// Trackmania Exchange (trackmania.exchange) lookup for a map's TMX page, by
// map_uid. Not every Ditchfest map is uploaded there (many are Discord-only
// memes), so a miss is expected and not an error.
const BASE = 'https://trackmania.exchange';

/** { trackId, url } if the map is on TMX, otherwise null. */
async function lookupMapByUid(mapUid, userAgent) {
  const res = await fetch(`${BASE}/api/maps/get_map_info/uid/${encodeURIComponent(mapUid)}`, {
    headers: { 'User-Agent': userAgent, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`trackmania.exchange -> HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !data.TrackID) return null;
  return { trackId: data.TrackID, url: `${BASE}/maps/${data.TrackID}` };
}

module.exports = { lookupMapByUid };
