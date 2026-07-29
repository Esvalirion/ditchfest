const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_TTL_SECONDS } = require('../config');

// Payload shape is a contract with the client: client/src/stores/session.js
// decodes `sub` as accountId and `name` as displayName directly from the
// JWT, unverified (it only reads it for display — this server verifies the
// signature on every request instead).
function issueToken(accountId, displayName) {
  return jwt.sign({ sub: accountId, name: displayName }, JWT_SECRET, {
    expiresIn: JWT_TTL_SECONDS,
  });
}

/** Returns the decoded payload, or null if missing/invalid/expired. */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

module.exports = { issueToken, verifyToken };
