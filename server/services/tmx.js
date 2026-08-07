// Trackmania Exchange (trackmania.exchange) lookup for a map's TMX page, by
// map_uid. Not every Ditchfest map is uploaded there (many are Discord-only
// memes), so a miss is expected and not an error.
//
// Besides the page URL, we also surface the map's style + tags. TMX stores
// style as a readable string (StyleName, e.g. "SpeedMapping") but tags as a
// comma-separated list of NUMERIC ids (Tags, e.g. "60,12,1"). The id→name
// (and optional colour) table comes from /api/meta/tags — it's effectively
// static, so we cache it in-process for a day rather than refetching per map.
const BASE = 'https://trackmania.exchange';

let tagsCache = null; // { id: { name, color } }
let tagsCacheAt = 0;
const TAGS_TTL_MS = 24 * 60 * 60 * 1000;

/** Fetches and caches the TMX tag id→{name,color} table. Returns an empty
 *  object on any error — callers degrade gracefully (tags just stay as the
 *  raw id-less list, the style still shows). */
async function getTagsTable(userAgent) {
  if (tagsCache && Date.now() - tagsCacheAt < TAGS_TTL_MS) return tagsCache;
  try {
    const res = await fetch(`${BASE}/api/meta/tags`, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`trackmania.exchange meta/tags -> HTTP ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.Tags || data.tags || [];
    const table = {};
    for (const t of list) {
      if (t && t.ID != null) table[Number(t.ID)] = { name: t.Name, color: t.Color || '' };
    }
    tagsCache = table;
    tagsCacheAt = Date.now();
    return table;
  } catch (e) {
    console.error('tmx meta/tags fetch failed', String(e));
    return tagsCache || {};
  }
}

/** Turns a TMX "Tags" field ("60,12,1") into [{name,color}] using the cached
 *  id→name table. Unknown/blank ids are dropped. */
function parseTagIds(raw, table) {
  if (!raw) return [];
  const out = [];
  const seen = new Set();
  for (const part of String(raw).split(',')) {
    const id = Number(part.trim());
    if (!Number.isInteger(id) || seen.has(id)) continue;
    const t = table[id];
    if (!t || !t.name) continue;
    seen.add(id);
    out.push({ name: t.name, color: t.color || '' });
  }
  return out;
}

/** { trackId, url, style, tags, tagsRaw } if the map is on TMX, otherwise null.
 *  - style:   the readable StyleName (e.g. "SpeedMapping"), or null.
 *  - tags:    [{name,color}] expanded from the numeric Tags ids.
 *  - tagsRaw: the raw "Tags" string of ids (e.g. "60,12,1"), kept so callers
 *             that persist styles can store it and re-resolve names later
 *             without another TMX fetch. */
async function lookupMapByUid(mapUid, userAgent) {
  const res = await fetch(`${BASE}/api/maps/get_map_info/uid/${encodeURIComponent(mapUid)}`, {
    headers: { 'User-Agent': userAgent, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`trackmania.exchange -> HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !data.TrackID) return null;
  const table = await getTagsTable(userAgent);
  return {
    trackId: data.TrackID,
    url: `${BASE}/maps/${data.TrackID}`,
    style: data.StyleName || null,
    tags: parseTagIds(data.Tags, table),
    tagsRaw: data.Tags || null,
  };
}

module.exports = { lookupMapByUid, parseTagIds, getTagsTable };
