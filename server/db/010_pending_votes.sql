\c ditchfest_db

-- Votes on fest maps the site doesn't know yet. On fest day the maps are
-- played in the club room first; the edition's campaign (and so the maps row
-- the votes FK needs) only appears later, once the catalog sync picks it up.
-- The in-game plugin (POST /api/plugin/vote) parks a vote here when its map
-- is in the room playlist but not in `maps`; services/votes.js
-- resolvePendingVotes moves it into `votes`, keeping created_at, after every
-- catalog sync. No FK on map_uid on purpose: there is nothing to point at yet.
CREATE TABLE IF NOT EXISTS pending_votes (
  account_id TEXT NOT NULL,
  map_uid    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, map_uid)
);
CREATE INDEX IF NOT EXISTS idx_pending_votes_map ON pending_votes (map_uid);
