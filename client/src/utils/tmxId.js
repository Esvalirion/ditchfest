import { api } from './api';

/**
 * Lazily resolves a map's TMX id (the trailing number of its
 * trackmania.exchange URL) via /api/map/:uid/tmx, caching per mapUid for the
 * page session — a map row asks on first hover, every later hover is free.
 * A miss (not on TMX, or the lookup failed) caches as null: no copy button.
 */
const cache = new Map(); // mapUid -> Promise<number|null>

export function fetchTmxId(mapUid) {
  if (!cache.has(mapUid)) {
    const p = api(`/api/map/${encodeURIComponent(mapUid)}/tmx`)
      .then((d) => (d && d.tmxId != null ? d.tmxId : null))
      .catch(() => null);
    cache.set(mapUid, p);
  }
  return cache.get(mapUid);
}
