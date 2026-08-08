// Resolve display names from accountIds via the official TM OAuth API —
// same client-credentials app as login, so no extra credentials needed.
// Ported from the real tm-votes' src/names.ts (kept as a private reference,
// not duplicated in this repo — see COTD_MIGRATION_PLAN.md).
const { TM_CLIENT_ID, TM_CLIENT_SECRET } = require('../config');

const TOKEN_URL = 'https://api.trackmania.com/api/access_token';
const DISPLAY_NAMES_URL = 'https://api.trackmania.com/api/display-names';

/** App-level (no user) access token via client_credentials. */
async function getAppToken() {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: TM_CLIENT_ID,
      client_secret: TM_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`app token -> HTTP ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error('app token missing');
  return data.access_token;
}

/** accountId -> display name, batched at 50 ids per request (API limit). */
async function resolveDisplayNames(accountIds, token) {
  const out = {};
  for (let i = 0; i < accountIds.length; i += 50) {
    const chunk = accountIds.slice(i, i + 50);
    const qs = new URLSearchParams();
    for (const id of chunk) qs.append('accountId[]', id);
    const res = await fetch(`${DISPLAY_NAMES_URL}?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`display-names -> HTTP ${res.status}`);
    Object.assign(out, await res.json());
  }
  return out;
}

/** Convenience: resolve a single accountId, or null if unknown/unreachable. */
async function lookupOne(accountId) {
  try {
    const token = await getAppToken();
    const names = await resolveDisplayNames([accountId], token);
    return names[accountId] || null;
  } catch (e) {
    console.error('name lookup failed', String(e));
    return null;
  }
}

/** Resolve several accountIds at once into a Map<accountId, name>. Missing/
 *  unreachable ids just have no entry (or map to null) — never throws, so a TM
 *  API hiccup can't take down a page that wants to label a few co-authors. */
async function lookupMany(accountIds) {
  if (!accountIds.length) return new Map();
  try {
    const token = await getAppToken();
    const names = await resolveDisplayNames(accountIds, token);
    return new Map(accountIds.map((id) => [id, names[id] || null]));
  } catch (e) {
    console.error('names lookup failed', String(e));
    return new Map();
  }
}

module.exports = { getAppToken, resolveDisplayNames, lookupOne, lookupMany };
