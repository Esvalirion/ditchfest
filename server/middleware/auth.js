const { verifyToken } = require('../services/jwt');
const { ROOT_ADMIN_ID } = require('../config');
const { pool } = require('../db');
const { grantAchievement } = require('../services/achievements');

function tokenFromHeader(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

// Reaching a valid token also means the player is logged in right now —
// including the case where the browser just reused a stored token and no
// OAuth callback ran this session — so this is also where the login badge
// is hedged in. INSERT OR IGNORE-equivalent: only the first call writes,
// and a failure here must never break the request the caller actually made.
async function markSeen(accountId) {
  try {
    await grantAchievement(accountId, 'first_login');
  } catch (e) {
    console.error('first_login grant failed', String(e));
  }
}

/** Attaches req.accountId/req.displayName if the token is present and valid;
 *  never rejects — routes that work for both logged-in and anonymous
 *  visitors (e.g. GET /api/editions) use this. */
async function optionalAuth(req, _res, next) {
  const payload = verifyToken(tokenFromHeader(req));
  if (payload) {
    req.accountId = payload.sub;
    req.displayName = payload.name;
    await markSeen(payload.sub);
  }
  next();
}

/** Same as optionalAuth, but 401s if there's no valid session. */
async function requireAuth(req, res, next) {
  const payload = verifyToken(tokenFromHeader(req));
  if (!payload) return res.status(401).json({ error: 'unauthorized' });
  req.accountId = payload.sub;
  req.displayName = payload.name;
  await markSeen(payload.sub);
  next();
}

async function isAdmin(accountId) {
  if (!accountId) return false;
  if (accountId === ROOT_ADMIN_ID) return true;
  const { rowCount } = await pool.query(
    'SELECT 1 FROM admins WHERE account_id = $1',
    [accountId]
  );
  return rowCount > 0;
}

/** 401 if not logged in, 403 if logged in but not an admin. */
async function requireAdmin(req, res, next) {
  const payload = verifyToken(tokenFromHeader(req));
  if (!payload) return res.status(401).json({ error: 'unauthorized' });
  req.accountId = payload.sub;
  req.displayName = payload.name;
  await markSeen(payload.sub);

  if (!(await isAdmin(req.accountId))) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

module.exports = { optionalAuth, requireAuth, requireAdmin, isAdmin };
