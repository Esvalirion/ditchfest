// The fest club room, as the in-game plugin shows it. Read through tm-api
// (it holds the Nadeo account; GET /live/club/:club/room/:room caches 30 s),
// so the plugin itself makes no Nadeo calls for the room.
//
// Order of events on a fest: the room is set up and played with maps that
// are in no campaign yet; only after it's over does the Ditchfest admin
// create the edition's campaign in the club, and the next catalog sync
// brings those maps in. So while the room runs, its maps are not in `maps`:
// names come from here, votes wait in pending_votes (services/votes.js) and
// move over on the first sync that sees the campaign.
const { TM_API_URL, PLUGIN_ROOMS } = require('../config');

/** The room a request asks about: ?club=&room= when that pair is allowed
 *  (config PLUGIN_ROOMS), the fest room when both are absent, else null —
 *  tm-api's Nadeo account isn't a public proxy for any club's rooms. */
function resolveRoom(club, room) {
  if (club == null && room == null) return PLUGIN_ROOMS[0];
  return PLUGIN_ROOMS.find((r) => r.club === Number(club) && r.room === Number(room)) || null;
}

/** { name, running, joinLink, serverLogin, playerCount, shuffle,
 *    maps: [{ mapUid, name, rawName, author, authorAccountId }] }
 *  for a resolveRoom() result. Throws when tm-api is unreachable or Nadeo
 *  failed. */
async function getRoom({ club, room: roomId }) {
  const res = await fetch(`${TM_API_URL}/live/club/${club}/room/${roomId}`);
  if (!res.ok) throw new Error(`tm-api room -> HTTP ${res.status}`);
  const room = await res.json();
  // joinLink is "#qjoin=<serverLogin>"; the plugin compares the login with
  // the server it's on to tell "in the fest room" from anywhere else.
  const serverLogin = room.joinLink ? room.joinLink.replace(/^#q?join=/, '').split('@')[0] : null;
  return { ...room, serverLogin };
}

/** Is this map in the room's current playlist? A pending vote is only
 *  accepted for those — otherwise anyone could park votes on any uid. */
async function isInRoom(which, mapUid) {
  const room = await getRoom(which);
  return room.maps.some((m) => m.mapUid === mapUid);
}

module.exports = { resolveRoom, getRoom, isInRoom };
