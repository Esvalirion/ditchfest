// Small HTTP helpers not already covered by Express. Ported from the real
// tm-votes' src/http.ts (kept as a private reference, not duplicated in
// this repo — see COTD_MIGRATION_PLAN.md).

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

function randomToken(bytes) {
  const buf = require('crypto').randomBytes(bytes);
  return buf.toString('hex');
}

module.exports = { readCookie, randomToken };
