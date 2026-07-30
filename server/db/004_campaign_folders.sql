\c ditchfest_db

-- More admin-editable additions, same rule as 003: services/sync.js never
-- writes to these, so admin changes survive every catalog refresh.

-- Overrides the synced Nadeo campaign name for display. `editions.name`
-- keeps getting overwritten by sync from Nadeo every run — this is the
-- admin's own label, independent of that.
ALTER TABLE editions ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Hide a campaign from the public site regardless of whether it still has
-- maps (getEditions() already drops empty ones on its own; this is for
-- hiding a non-empty one on purpose).
ALTER TABLE editions ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;

-- Admin-created "folders" that don't correspond to any real Nadeo campaign
-- get an id from here instead of a real campaign_id. Real trackmania.io
-- campaign ids are always positive and only ever grow, so negative ids can
-- never collide with one, now or later.
CREATE SEQUENCE IF NOT EXISTS editions_virtual_id_seq
  AS INTEGER MINVALUE -2147483647 MAXVALUE -1 START -1 INCREMENT -1;
