// Achievement catalog and the rules that derive badges from account stats.
// Ported from the real tm-votes' src/achievements.ts (kept as a private
// reference, not duplicated in this repo — see COTD_MIGRATION_PLAN.md).
// Codes are copied verbatim and must stay that way: a real data migration
// would carry earned rows that reference these exact strings.
//
// Two kinds:
//   - event badges, granted where they happen (first_login, onboarding_complete)
//   - stat badges, derived by earnedFromStats() below and granted by
//     services/grants.js whenever an account's page is opened or a vote is cast
const { pool } = require('../db');

const ACHIEVEMENTS = [
  {
    code: 'first_login',
    name: 'Welcome to the Ditch',
    description: 'You showed up. That is the whole achievement.',
    hint: 'Sign in with your Ubisoft account.',
    icon: '🕳️',
  },
  {
    code: 'onboarding_complete',
    name: 'Certified Ditch Enjoyer',
    description: 'Every edition, every map. Please go touch grass.',
    hint: 'Walk through every edition on the Start here page.',
    icon: '🏅',
  },
  {
    code: 'map_one',
    name: 'It Exists',
    description: 'You built a Ditchfest map and let other people drive it.',
    hint: 'Have at least one map in the Ditchfest catalog.',
    icon: '🧱',
  },
  {
    code: 'maps_10',
    name: 'Serial Offender',
    description: 'Ten maps in. This is a pattern now, not an accident.',
    hint: 'Have more than 10 maps in the Ditchfest catalog.',
    icon: '🏗️',
  },
  {
    code: 'maps_50',
    name: 'Ditch Industrial Complex',
    description: 'Fifty maps. Somewhere out there is a hobby you could have had instead.',
    hint: 'Have more than 50 maps in the Ditchfest catalog.',
    icon: '🏭',
  },
  {
    code: 'top10',
    name: 'Top Ten Material',
    description: 'You made the top 10. It stays yours even if you slide off.',
    hint: 'Reach the top 10 of the mappers leaderboard.',
    icon: '🥇',
  },
  {
    code: 'vote_one',
    name: 'First Contact',
    description: 'You liked a map. Someone out there felt that.',
    hint: 'Like at least one map.',
    icon: '👍',
  },
  {
    code: 'votes_10',
    name: 'Generous',
    description: 'Over ten likes handed out. The mappers thank you.',
    hint: 'Like more than 10 maps.',
    icon: '❤️',
  },
  {
    code: 'self_vote',
    name: 'Conflict of Interest',
    description:
      'You liked every single map you have ever made. Not one of them slipped through.',
    hint:
      'Like every map you made. Half the community manages one and calls it a joke — ' +
      'doing all of them is not a joke, and that is what makes it art.',
    icon: '🤫',
    secret: true,
  },
];

const BY_CODE = new Map(ACHIEVEMENTS.map((a) => [a.code, a]));

function defOf(code) {
  return BY_CODE.get(code) || null;
}

/** Which stat badges the account currently qualifies for. Badges are never
 *  taken back, so "reached the top 10 once" survives dropping out of it. */
function earnedFromStats({ maps, rank, votesCast, selfVotes }) {
  const codes = [];
  if (maps >= 1) codes.push('map_one');
  if (maps > 10) codes.push('maps_10');
  if (maps > 50) codes.push('maps_50');
  if (rank !== null && rank <= 10) codes.push('top10');
  if (votesCast >= 1) codes.push('vote_one');
  if (votesCast > 10) codes.push('votes_10');
  // Every one of your own maps, not just one.
  if (maps >= 1 && selfVotes >= maps) codes.push('self_vote');
  return codes;
}

const REDACTED = {
  code: 'secret',
  name: '???',
  description: 'Something is hidden here.',
  hint: 'No hints. That is the point.',
  icon: '❓',
  secret: true,
};

/** The whole catalog, marked with what this account has earned. A secret
 *  badge's whole definition (including its code) is replaced until earned,
 *  so the unlock condition never leaks to the client. */
function describeAll(rows) {
  const earnedAt = new Map(rows.map((r) => [r.code, r.createdAt]));
  return ACHIEVEMENTS.map((def) => {
    const earned = earnedAt.has(def.code);
    const shown = def.secret && !earned ? REDACTED : def;
    return { ...shown, earned, earnedAt: earnedAt.get(def.code) ?? null };
  });
}

/** Award an achievement. Returns true only the first time it's earned. */
async function grantAchievement(accountId, code) {
  const { rowCount } = await pool.query(
    'INSERT INTO achievements (account_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [accountId, code]
  );
  return rowCount > 0;
}

/** Award several at once; existing ones are left untouched. */
async function grantAchievements(rows) {
  if (!rows.length) return;
  const values = rows.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
  const params = rows.flatMap((r) => [r.accountId, r.code]);
  await pool.query(
    `INSERT INTO achievements (account_id, code) VALUES ${values} ON CONFLICT DO NOTHING`,
    params
  );
}

/** Achievement codes this player earned on any linked account, oldest first. */
async function getAchievementCodes(members) {
  const placeholders = members.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query(
    `SELECT code, MIN(created_at) AS created_at FROM achievements
     WHERE account_id IN (${placeholders}) GROUP BY code ORDER BY created_at ASC`,
    members
  );
  return rows.map((r) => ({ code: r.code, createdAt: r.created_at }));
}

module.exports = {
  ACHIEVEMENTS,
  defOf,
  earnedFromStats,
  describeAll,
  grantAchievement,
  grantAchievements,
  getAchievementCodes,
};
