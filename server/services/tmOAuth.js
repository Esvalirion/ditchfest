// TM OAuth (Authorization Code) — the "Login with Ubisoft" flow. Same
// provider/endpoints as COTD's routes/auth.js ("Login with TM") and the
// real tm-votes source (kept as a private reference, not duplicated in
// this repo — see COTD_MIGRATION_PLAN.md). Unrelated to the Nadeo
// service-account ticket exchange used for public map/leaderboard data —
// this is a normal three-legged OAuth flow for "who is this visitor."
//
// redirect_uri is passed in per-call rather than read from config: it's
// derived from the incoming request (see routes/auth.js), which is what
// lets this app be served from more than one domain (df.esvalirion.tech and
// later ditchfest.su) without an OAuth redirect mismatch — every domain
// just needs to be registered on the TM OAuth app once.
const { TM_CLIENT_ID, TM_CLIENT_SECRET } = require('../config');

const AUTH_URL = 'https://api.trackmania.com/oauth/authorize';
const TOKEN_URL = 'https://api.trackmania.com/api/access_token';
const USER_URL = 'https://api.trackmania.com/api/user';

function authorizeUrl(redirectUri, state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: TM_CLIENT_ID,
    redirect_uri: redirectUri,
    state,
    prompt: 'login', // force the TM login screen even if already authenticated elsewhere
  });
  return `${AUTH_URL}?${params}`;
}

/** Exchanges an OAuth code for { accountId, displayName }. Throws on failure. */
async function exchangeCode(code, redirectUri) {
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: TM_CLIENT_ID,
      client_secret: TM_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`tm oauth token exchange failed [${tokenRes.status}]: ${await tokenRes.text()}`);
  }
  const { access_token } = await tokenRes.json();

  const userRes = await fetch(USER_URL, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!userRes.ok) {
    throw new Error(`tm oauth user lookup failed [${userRes.status}]: ${await userRes.text()}`);
  }
  const { accountId, displayName } = await userRes.json();
  return { accountId, displayName };
}

module.exports = { authorizeUrl, exchangeCode };
