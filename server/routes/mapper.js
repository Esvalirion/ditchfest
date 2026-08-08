const { Router } = require('express');
const { pool } = require('../db');
const { optionalAuth, requireAuth, isAdmin } = require('../middleware/auth');
const { describeAll, getAchievementCodes } = require('../services/achievements');
const { refreshAccount } = require('../services/grants');
const { groupMembers, groupAlts } = require('../services/links');
const { lookupOne } = require('../services/names');
const { getMapperResults } = require('../services/mapperRanking');
const { isCoauthorsMissing } = require('../services/coauthors');
const { canon } = require('../services/links');

const router = Router();

/** Every map this identity is credited on (primary author OR co-author, across
 *  all linked accounts), most-voted first. Co-authored maps come from
 *  map_coauthors (migration 008); if that table isn't applied yet the query
 *  errors and we retry the legacy primary-authors-only form. */
async function getMapperMaps(members) {
  const ph = members.map((_, i) => `$${i + 1}`).join(', ');
  // mapSelect is a WHERE-less SELECT; each call site adds its own predicate
  // (by map_uid set, or by author). It must NOT carry a WHERE against ${ph},
  // because ${ph} is a list of accountIds, not map_uids — such a clause would
  // match nothing and silently zero out the map list.
  const mapSelect = `
    SELECT m.map_uid, m.name, m.thumbnail_url, e.name AS edition_name,
           (SELECT COUNT(DISTINCT ${canon('v.account_id')})::int FROM votes v
              WHERE v.map_uid = m.map_uid) AS votes
     FROM maps m
     LEFT JOIN editions e ON e.campaign_id = m.campaign_id
  `;
  let rows;
  try {
    // CTE gathers this identity's map_uids from both author arms, then joins
    // back to maps for the row. UNION dedups a map where the identity is both
    // primary author and listed as a co-author.
    rows = (
      await pool.query(
        `WITH my_maps AS (
           SELECT map_uid FROM maps WHERE author_account_id IN (${ph})
           UNION
           SELECT map_uid FROM map_coauthors WHERE account_id IN (${ph})
         )
         ${mapSelect} WHERE m.map_uid IN (SELECT map_uid FROM my_maps)
         ORDER BY votes DESC, m.name ASC`,
        members
      )
    ).rows;
  } catch (e) {
    if (isCoauthorsMissing(e)) {
      rows = (
        await pool.query(
          `${mapSelect} WHERE m.author_account_id IN (${ph})
           ORDER BY votes DESC, m.name ASC`,
          members
        )
      ).rows;
    } else {
      throw e;
    }
  }
  return rows.map((r) => ({
    mapUid: r.map_uid,
    name: r.name,
    editionName: r.edition_name,
    thumbnailUrl: r.thumbnail_url,
    votes: r.votes,
  }));
}

// GET /api/mapper?id=<accountId> — public. Every account has one, not just
// mappers: the frontend uses this same page as the player's own profile, so
// a pure voter must get an answer too — they just have no maps and no rank.
// Accounts an admin has linked together answer as one person.
router.get('/mapper', optionalAuth, async (req, res) => {
  const requested = (req.query.id || '').trim();
  if (!requested) return res.status(400).json({ error: 'missing_id' });

  const members = await groupMembers(requested);
  const accountId = members[0]; // the identity, which may differ from `requested`

  const ranking = await getMapperResults();
  const index = ranking.findIndex((m) => m.accountId === accountId);
  const ranked = index !== -1;
  const rank = ranked ? index + 1 : null;

  let name = ranked ? ranking[index].name : null;
  if (!name) name = await lookupOne(accountId); // no maps: ask the OAuth API

  if (!ranked && !name) return res.status(404).json({ error: 'unknown_account' });

  const maps = ranked ? await getMapperMaps(members) : [];

  // Bring the stat badges up to date before listing them.
  try {
    await refreshAccount(accountId, members, rank);
  } catch (e) {
    console.error('achievement refresh failed', String(e));
  }

  const codes = await getAchievementCodes(members);
  const alts = members.length > 1 ? await groupAlts(accountId) : [];

  // The viewer's own votes, not the profile owner's.
  let myVotes = [];
  if (req.accountId) {
    const viewerMembers = await groupMembers(req.accountId);
    const ph = viewerMembers.map((_, i) => `$${i + 1}`).join(', ');
    const r = await pool.query(
      `SELECT DISTINCT map_uid FROM votes WHERE account_id IN (${ph})`,
      viewerMembers
    );
    myVotes = r.rows.map((row) => row.map_uid);
  }

  res.json({
    accountId,
    name,
    rank,
    total: ranking.length,
    votes: ranked ? ranking[index].votes : 0,
    maps,
    myVotes,
    achievements: describeAll(codes),
    // The frontend can check membership to decide whether this is your own
    // page: signing in on an alternate must still show owner controls.
    members,
    alts,
  });
});

// GET /api/me — who am I: validates a stored token, says whether to show
// the admin entry, and hands back the full achievement catalog.
router.get('/me', requireAuth, async (req, res) => {
  const admin = await isAdmin(req.accountId);
  const members = await groupMembers(req.accountId);
  const codes = await getAchievementCodes(members);
  res.json({
    accountId: req.accountId,
    displayName: req.displayName,
    isAdmin: admin,
    achievements: describeAll(codes),
  });
});

module.exports = router;
