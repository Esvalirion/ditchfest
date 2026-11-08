import { api } from './api';

/**
 * Lazily resolves a map's TMX id (the trailing number of its
 * trackmania.exchange URL) via /api/map/:uid/tmx, caching per mapUid for the
 * page session — a map row asks on first hover, every later hover is free.
 * Resolves a number, null when TMX confirms the map isn't there (the row then
 * copies the map UID instead), or undefined when the lookup itself failed —
 * not cached, so the next hover asks again rather than offering the UID for a
 * map that may well be on TMX.
 */
const cache = new Map(); // mapUid -> Promise<number|null>

export function fetchTmxId(mapUid) {
  if (!cache.has(mapUid)) {
    const p = api(`/api/map/${encodeURIComponent(mapUid)}/tmx`)
      .then((d) => (d && d.tmxId != null ? d.tmxId : null))
      .catch(() => {
        cache.delete(mapUid);
        return undefined;
      });
    cache.set(mapUid, p);
  }
  return cache.get(mapUid);
}
