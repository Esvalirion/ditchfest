const { Router } = require('express');
const { authorizeUrl, exchangeCode } = require('../services/tmOAuth');
const { issueToken } = require('../services/jwt');
const { grantAchievement } = require('../services/achievements');
const { readCookie, randomToken } = require('../http');
const { TM_FRONTEND_URL } = require('../config');

const router = Router();

const STATE_COOKIE = 'tm_oauth_state';

/** This server's own /auth/callback, derived from the request so it's
 *  correct on every domain the app is served from — not the same as
 *  TM_FRONTEND_URL, which is where the user goes *afterwards*. */
function redirectUri(req) {
  return `${req.protocol}://${req.get('host')}/auth/callback`;
}

/** Where to send the user after /auth/callback. In prod this server also
 *  serves the built client (req.app.locals.servesClient), so the right
 *  answer is whatever domain the request actually came in on — this app is
 *  mirrored on more than one (df.esvalirion.tech, ditchfest.su, ...) and a
 *  fixed TM_FRONTEND_URL would always bounce back to just one of them. In
 *  dev the client lives on Vite's own port, so TM_FRONTEND_URL is still the
 *  only correct answer. */
function frontendBase(req) {
  if (req.app.locals.servesClient) {
    return `${req.protocol}://${req.get('host')}/`;
  }
  return TM_FRONTEND_URL.endsWith('/') ? TM_FRONTEND_URL : TM_FRONTEND_URL + '/';
}

function redirectHome(req, res, params, extraHeaders) {
  const base = frontendBase(req);
  if (extraHeaders) res.set(extraHeaders);
  res.redirect(`${base}#${new URLSearchParams(params)}`);
}

// GET /auth/login — what js/core.js redirects to (WORKER_URL + '/auth/login').
router.get('/login', (req, res) => {
  const state = randomToken(16);
  // SameSite=Lax so the cookie still rides the top-level redirect back.
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: req.protocol === 'https',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
  });
  res.redirect(authorizeUrl(redirectUri(req), state));
});

// GET /auth/callback?code=&state= — exchange code, hand back a JWT the same
// way tm-votes always did: #tm_token=<jwt> in the URL fragment, which
// stores/session.js's consumeRedirect() picks up.
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const cookieState = readCookie(req, STATE_COOKIE);

  if (!code || !state || !cookieState || state !== cookieState) {
    return redirectHome(req, res, { tm_error: 'invalid_state' });
  }

  try {
    const { accountId, displayName } = await exchangeCode(code, redirectUri(req));
    const token = issueToken(accountId, displayName || accountId);

    // Achievement #1 is simply showing up. Never let this turn a successful
    // login into an error page.
    try {
      await grantAchievement(accountId, 'first_login');
    } catch (e) {
      console.error('first_login grant failed', String(e));
    }

    redirectHome(req, res, { tm_token: token }, {
      'Set-Cookie': `${STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    });
  } catch (err) {
    console.error('[auth/callback]', err);
    redirectHome(req, res, { tm_error: 'server_error' });
  }
});

module.exports = router;
