// Casting votes, shared by the website (POST /api/vote) and the in-game plugin
// (POST /api/plugin/vote), plus the pending side only the plugin can reach:
// a vote on a fest map that's in the club room but not in the catalog yet
// waits in pending_votes (migration 010) until the catalog sync brings the
// map in.
const { pool } = require('../db');
const { canon, groupMembers } = require('./links');
const { refreshAccount } = require('./grants');

/** Like or unlike a catalog map. The vote is recorded on the account that
 *  cast it; counting resolves it to the person, so a second linked account
 *  can't add a second "+". Returns the map's new vote count. */
async function castVote(accountId, mapUid, wantVote) {
  if (wantVote) {
    await pool.query(
      'INSERT INTO votes (account_id, map_uid) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [accountId, mapUid]
    );
  } else {
    await pool.query('DELETE FROM votes WHERE account_id = $1 AND map_uid = $2', [accountId, mapUid]);
  }

  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT ${canon('v.account_id')})::int AS c FROM votes v WHERE v.map_uid = $1`,
    [mapUid]
  );

  // Liking something can unlock a badge. Rank is skipped: casting a vote
  // can't move the voter's own placement.
  try {
    const members = await groupMembers(accountId);
    await refreshAccount(members[0], members, null);
  } catch (e) {
    console.error('achievement refresh failed', String(e));
  }

  return rows[0].c;
}

/** Same for a map that isn't in the catalog yet. No badge refresh: the vote
 *  doesn't count anywhere on the site until it resolves. */
async function castPendingVote(accountId, mapUid, wantVote) {
  if (wantVote) {
    await pool.query(
      'INSERT INTO pending_votes (account_id, map_uid) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [accountId, mapUid]
    );
  } else {
    await pool.query('DELETE FROM pending_votes WHERE account_id = $1 AND map_uid = $2', [accountId, mapUid]);
  }
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT ${canon('p.account_id')})::int AS c FROM pending_votes p WHERE p.map_uid = $1`,
    [mapUid]
  );
  return rows[0].c;
}

/** Move pending votes whose map has reached the catalog into `votes`,
 *  keeping when they were cast. Called after every catalog sync. Returns how
 *  many moved. */
async function resolvePendingVotes() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(`
      INSERT INTO votes (account_id, map_uid, created_at)
      SELECT p.account_id, p.map_uid, p.created_at
      FROM pending_votes p JOIN maps m ON m.map_uid = p.map_uid
      ON CONFLICT DO NOTHING
    `);
    await client.query('DELETE FROM pending_votes p USING maps m WHERE m.map_uid = p.map_uid');
    // A map pulled from the room mid-fest (a cut found, swapped for a fixed
    // upload with a new uid) never reaches a campaign, so its votes would
    // wait forever. A campaign lands within days of its fest; a month is
    // well past that.
    await client.query("DELETE FROM pending_votes WHERE created_at < now() - interval '30 days'");
    await client.query('COMMIT');
    return rowCount;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Is migration 010 applied? Re-checked after a minute while it isn't, like
 *  records.js isRecordsSchemaReady: the code may ship before the migration. */
let pendingReady = null; // { ok: boolean, at: number }
async function isPendingVotesReady() {
  if (pendingReady && (pendingReady.ok || Date.now() - pendingReady.at < 60_000)) return pendingReady.ok;
  const { rows } = await pool.query("SELECT to_regclass('public.pending_votes') IS NOT NULL AS ok");
  pendingReady = { ok: rows[0].ok, at: Date.now() };
  return pendingReady.ok;
}

module.exports = { castVote, castPendingVote, resolvePendingVotes, isPendingVotesReady };
