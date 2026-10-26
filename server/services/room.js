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
const { TM_API_URL, DF_ROOM_CLUB_ID, DF_ROOM_ID } = require('../config');

/** { name, running, joinLink, serverLogin, playerCount,
 *    maps: [{ mapUid, name, rawName, author, authorAccountId }] }
 *  Throws when tm-api is unreachable or Nadeo failed. */
async function getRoom() {
  const res = await fetch(`${TM_API_URL}/live/club/${DF_ROOM_CLUB_ID}/room/${DF_ROOM_ID}`);
  if (!res.ok) throw new Error(`tm-api room -> HTTP ${res.status}`);
  const room = await res.json();
  // joinLink is "#qjoin=<serverLogin>"; the plugin compares the login with
  // the server it's on to tell "in the fest room" from anywhere else.
  const serverLogin = room.joinLink ? room.joinLink.replace(/^#q?join=/, '').split('@')[0] : null;
  return { ...room, serverLogin };
}

/** Is this map in the room's current playlist? A pending vote is only
 *  accepted for those — otherwise anyone could park votes on any uid. */
async function isInRoom(mapUid) {
  const room = await getRoom();
  return room.maps.some((m) => m.mapUid === mapUid);
}

module.exports = { getRoom, isInRoom };
