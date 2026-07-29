// Handing out the stat-derived achievements (see earnedFromStats in
// achievements.js). Nothing here decides what a badge means — it only
// feeds current numbers into the rules and writes down what came back.
// Ported from the real tm-votes' src/grants.js (kept as a private
// reference, not duplicated in this repo — see COTD_MIGRATION_PLAN.md).
//
// Only the single-account path (refreshAccount, called on page view / after
// a vote) is implemented here — the real source also has refreshEveryone(),
// swept hourly alongside its trackmania.io catalog sync so "reached the top
// 10" is caught even without a visit. This server has no such sync job yet
// (see routes/admin sync note), so that sweep isn't ported.
const { pool } = require('../db');
const { earnedFromStats, grantAchievements } = require('./achievements');

async function getAccountCounts(members) {
  const ph = members.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM maps WHERE author_account_id IN (${ph}))::int AS maps,
       (SELECT COUNT(DISTINCT map_uid) FROM votes WHERE account_id IN (${ph}))::int AS votes_cast,
       (SELECT COUNT(DISTINCT v.map_uid) FROM votes v
          JOIN maps m ON m.map_uid = v.map_uid
         WHERE v.account_id IN (${ph}) AND m.author_account_id IN (${ph})
       )::int AS self_votes`,
    members
  );
  const row = rows[0];
  return { maps: row.maps, votesCast: row.votes_cast, selfVotes: row.self_votes };
}

/**
 * Grant whatever this identity now qualifies for. `members` is every
 * account linked into it (just the one, normally). Pass `rank` when the
 * caller already has the leaderboard (the account page); pass null to skip
 * the placement badge rather than pay for the ranking query.
 */
async function refreshAccount(canonicalId, members, rank) {
  const counts = await getAccountCounts(members);
  const codes = earnedFromStats({ ...counts, rank });
  if (!codes.length) return;
  // Badges land on the identity, so they survive an alternate being unlinked.
  await grantAchievements(codes.map((code) => ({ accountId: canonicalId, code })));
}

module.exports = { refreshAccount };
