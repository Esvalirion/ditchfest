\c ditchfest_db

-- Bookkeeping for services/latest.js, which files each fest's maps from the
-- club's "Ditchfest latest" campaign into a virtual folder "#N" after every
-- catalog sync. Until this migration is applied that step is a no-op.

-- One row per fest number the step has filed maps for, pointing at the folder
-- it used. No FK on purpose: if an admin deletes the folder the row stays, and
-- the step reads that as "the admin said no" and never recreates it.
CREATE TABLE IF NOT EXISTS auto_latest_editions (
  edition_number INTEGER PRIMARY KEY,
  campaign_id    INTEGER NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per map the step has touched: 'moved' = display_campaign_id set on
-- a map the sync had filed under a mixed campaign, 'inserted' = a map with no
-- campaign yet, created straight in the folder. A map is handled once, so an
-- admin who moves it back is never overridden. Reverting a run:
--   UPDATE maps SET display_campaign_id = NULL WHERE map_uid IN
--     (SELECT map_uid FROM auto_latest_maps WHERE action = 'moved' AND ...);
CREATE TABLE IF NOT EXISTS auto_latest_maps (
  map_uid     TEXT PRIMARY KEY,
  campaign_id INTEGER NOT NULL, -- the folder
  action      TEXT NOT NULL CHECK (action IN ('moved', 'inserted')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
