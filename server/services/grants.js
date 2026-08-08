// Handing out the stat-derived achievements (see earnedFromStats in
// achievements.js). Nothing here decides what a badge means — it only
// feeds current numbers into the rules and writes down what came back.
// Ported from the real tm-votes' src/grants.ts (kept as a private
// reference, not duplicated in this repo — see COTD_MIGRATION_PLAN.md).
//
// Two entry points, because the stats change for different reasons:
//   refreshAccount()  — one account, on their page view or right after a vote
//   refreshEveryone() — the whole leaderboard, from the catalog sync, so
//                       "reached the top 10" is caught even if nobody visits
//                       that mapper's page while they're up there
//
// Co-authors (map_coauthors, migration 008) count as authors too: a
// collaboration's map count and votes land on every credited author. Each
// co-author account_id is run through canon() just like author_account_id,
// so a linked alt still rolls into one identity. The map_coauthors arm is
// behind migration 008; every query below retries without it if the table
// isn't there yet, so grants behave exactly as before until 008 is applied.
const { pool } = require('../db');
const { earnedFromStats, grantAchievements } = require('./achievements');
const { canon } = require('./links');
const { isCoauthorsMissing } = require('./coauthors');
const { getMapperResults } = require('./mapperRanking');

/** Run a query; on the "map_coauthors does not exist" error (migration 008 not
 *  applied yet), retry the fallback query (which omits the co-author arm) so
 *  achievement grants keep working. Dead branch once 008 is applied. */
async function queryWithCoauthorFallback(queryWith, queryWithout, params = []) {
  try {
    return await pool.query(queryWith, params);
  } catch (e) {
    if (isCoauthorsMissing(e)) return await pool.query(queryWithout, params);
    throw e;
  }
}

async function getAccountCounts(members) {
  const ph = members.map((_, i) => `$${i + 1}`).join(', ');
  // maps: every map this identity authored OR co-authored. self_votes: this
  // identity voting on any map they're credited on (primary or co-author) —
  // "liked every map you made" includes collaborations you helped build.
  const { rows } = await queryWithCoauthorFallback(
    `SELECT
       (SELECT COUNT(DISTINCT map_uid) FROM (
          SELECT map_uid FROM maps WHERE author_account_id IN (${ph})
          UNION
          SELECT map_uid FROM map_coauthors WHERE account_id IN (${ph})
        ) t)::int AS maps,
       (SELECT COUNT(DISTINCT map_uid) FROM votes WHERE account_id IN (${ph}))::int AS votes_cast,
       (SELECT COUNT(DISTINCT t.map_uid) FROM (
          SELECT m.map_uid FROM votes v
            JOIN maps m ON m.map_uid = v.map_uid
           WHERE v.account_id IN (${ph}) AND m.author_account_id IN (${ph})
          UNION
          SELECT c.map_uid FROM votes v
            JOIN map_coauthors c ON c.map_uid = v.map_uid
           WHERE v.account_id IN (${ph}) AND c.account_id IN (${ph})
        ) t)::int AS self_votes`,
    // Fallback: no map_coauthors table — primary authors only.
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

async function getMapCounts() {
  const { rows } = await queryWithCoauthorFallback(
    `SELECT id, COUNT(*)::int AS n FROM (
       SELECT ${canon('author_account_id')} AS id FROM maps WHERE author_account_id IS NOT NULL
       UNION ALL
       SELECT ${canon('account_id')} AS id FROM map_coauthors
     ) t GROUP BY 1`,
    `SELECT ${canon('m.author_account_id')} AS id, COUNT(*)::int AS n FROM maps m
     WHERE m.author_account_id IS NOT NULL GROUP BY 1`
  );
  return new Map(rows.map((r) => [r.id, r.n]));
}

async function getVoteCastCounts() {
  const { rows } = await pool.query(`
    SELECT ${canon('v.account_id')} AS id, COUNT(DISTINCT v.map_uid)::int AS n FROM votes v GROUP BY 1
  `);
  return new Map(rows.map((r) => [r.id, r.n]));
}

async function getSelfVoteCounts() {
  const authorCanon = canon('m.author_account_id');
  const voterCanon = canon('v.account_id');
  const { rows } = await queryWithCoauthorFallback(
    // A self-vote is voting on a map you're credited on — primary author OR
    // co-author. UNION (not UNION ALL) dedups a map where you're both.
    `SELECT ${voterCanon} AS id, COUNT(DISTINCT map_uid)::int AS n FROM (
       SELECT v.map_uid FROM votes v JOIN maps m ON m.map_uid = v.map_uid
         WHERE ${authorCanon} = ${voterCanon}
       UNION
       SELECT v.map_uid FROM votes v JOIN map_coauthors c ON c.map_uid = v.map_uid
         WHERE ${canon('c.account_id')} = ${voterCanon}
     ) t GROUP BY 1`,
    `SELECT ${voterCanon} AS id, COUNT(DISTINCT v.map_uid)::int AS n
    FROM votes v JOIN maps m ON m.map_uid = v.map_uid
    WHERE ${authorCanon} = ${voterCanon}
    GROUP BY 1`
  );
  return new Map(rows.map((r) => [r.id, r.n]));
}

async function getAllAchievementPairs() {
  const { rows } = await pool.query(`SELECT DISTINCT ${canon('a.account_id')} AS id, code FROM achievements a`);
  return new Set(rows.map((r) => `${r.id}:${r.code}`));
}

/** Sweep every mapper and voter. Returns how many badges were newly written. */
async function refreshEveryone() {
  const ranking = await getMapperResults();
  const mapCounts = await getMapCounts();
  const voteCounts = await getVoteCastCounts();
  const selfVotes = await getSelfVoteCounts();
  const existing = await getAllAchievementPairs();

  const rankOf = new Map(ranking.map((m, i) => [m.accountId, i + 1]));
  const accounts = new Set([...mapCounts.keys(), ...voteCounts.keys()]);

  // Only the missing pairs are written, so a run with nothing new costs one
  // batch of zero statements instead of hundreds of no-op inserts.
  const pending = [];
  for (const accountId of accounts) {
    const codes = earnedFromStats({
      maps: mapCounts.get(accountId) || 0,
      rank: rankOf.get(accountId) ?? null,
      votesCast: voteCounts.get(accountId) || 0,
      selfVotes: selfVotes.get(accountId) || 0,
    });
    for (const code of codes) {
      if (!existing.has(`${accountId}:${code}`)) pending.push({ accountId, code });
    }
  }

  await grantAchievements(pending);
  return pending.length;
}

module.exports = { refreshAccount, refreshEveryone };
