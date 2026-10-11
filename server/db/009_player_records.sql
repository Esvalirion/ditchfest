\c ditchfest_db

-- Players tab: in-game records and medals on Ditchfest maps (see CLAUDE.md
-- "Вкладка Players (рекорды на картах)"). Sources are the same public
-- trackmania.io API the catalog sync already uses:
--   GET /api/map/{uid}                            -> medal times
--   GET /api/leaderboard/map/{uid}?offset&length  -> top times per map
-- Only the records sweep in services/records.js writes any of this; the
-- catalog upsert (services/catalog.js upsertMap) never touches these
-- columns/tables — the same rule as the TMX style columns (007).

-- Nadeo medal times per map, denormalized onto maps like tmx_style (007).
-- NULL in *_time_ms = map info fetched but the map has no medal times
-- (unranked etc.); records_updated_at = NULL means "never checked" — the
-- sweep takes those first.
ALTER TABLE maps
  ADD COLUMN IF NOT EXISTS author_time_ms INTEGER,
  ADD COLUMN IF NOT EXISTS gold_time_ms   INTEGER,
  ADD COLUMN IF NOT EXISTS silver_time_ms INTEGER,
  ADD COLUMN IF NOT EXISTS bronze_time_ms INTEGER,
  -- total finishers on the map at fetch time (the leaderboard's playercount)
  ADD COLUMN IF NOT EXISTS records_playercount INTEGER,
  ADD COLUMN IF NOT EXISTS records_updated_at TIMESTAMPTZ;

-- Best known time of a player on a map, from the leaderboard's top window
-- (services/records.js RECORDS_DEPTH). The sweep REPLACES a map's rows on
-- every refresh, so players that dropped out of the window don't linger.
-- No FK on account_id — there is no accounts table and won't be one; the
-- same accountId namespace as votes/maps.author_account_id.
CREATE TABLE IF NOT EXISTS map_records (
  map_uid    TEXT NOT NULL REFERENCES maps(map_uid) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  time_ms    INTEGER NOT NULL,
  position   INTEGER,                   -- rank on the map at fetch time (1 = WR)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (map_uid, account_id)
);
CREATE INDEX IF NOT EXISTS idx_map_records_account ON map_records (account_id);

-- Display-name cache for leaderboard players. NOT an accounts table: no
-- identity, no auth, no links — just the nick seen at fetch time, so the
-- Players page doesn't re-resolve hundreds of names on every view. Names
-- arrive for free in the leaderboard payload itself.
CREATE TABLE IF NOT EXISTS player_names (
  account_id   TEXT PRIMARY KEY,
  display_name TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
