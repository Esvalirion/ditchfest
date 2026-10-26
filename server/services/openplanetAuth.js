// Openplanet plugin auth (https://openplanet.dev/docs/reference/auth). The
// in-game plugin can't do the Ubisoft OAuth flow, but it can ask Openplanet
// for a short-lived token (Auth::GetToken, ~5 min) proving who the player is.
// We trade it once for our own session JWT (routes/plugin.js), so the plugin
// then talks to the regular endpoints (POST /api/vote) like the website does.
const { OPENPLANET_AUTH_SECRET } = require('../config');

const VALIDATE_URL = 'https://openplanet.dev/api/auth/validate';

/** { accountId, displayName } for a valid token, null for a rejected one.
 *  Throws when the fault is ours or Openplanet's (unreachable, bad secret) —
 *  that's a 502, not the player's fault. */
async function validateOpenplanetToken(token) {
  const res = await fetch(VALIDATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token, secret: OPENPLANET_AUTH_SECRET }),
  });
  // Rejections come back as HTTP 500 with {"error": "..."}, so read the body
  // whatever the status and only give up when it isn't that JSON.
  const data = await res.json().catch(() => null);
  if (!data) throw new Error(`openplanet validate -> HTTP ${res.status}`);
  if (data.error === 'invalid secret') throw new Error('openplanet validate -> invalid secret (OPENPLANET_AUTH_SECRET)');
  if (data.error || !data.account_id) return null;
  return { accountId: data.account_id, displayName: data.display_name || data.account_id };
}

module.exports = { validateOpenplanetToken };
