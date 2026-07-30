\c ditchfest_db

-- Admin-editable additions on top of the synced catalog. services/sync.js's
-- upsertEdition()/upsertMap() (services/catalog.js) never write to these
-- columns, so an admin's changes survive every catalog refresh.

-- Free-text theme for an edition, shown publicly. Independent of the synced
-- name (which sync overwrites from Nadeo's campaign name every run).
ALTER TABLE editions ADD COLUMN IF NOT EXISTS theme TEXT;

-- Lets an admin show a map under a different campaign than the real one it's
-- synced from. Needed because Nadeo caps a campaign at 25 maps: a themed
-- edition with more maps has to be split into two real campaigns on
-- trackmania.io, which sync in as two unrelated editions — this column lets
-- the overflow campaign's maps be folded into the main one for display.
-- NULL (the default) means "use the real campaign_id".
ALTER TABLE maps ADD COLUMN IF NOT EXISTS display_campaign_id INTEGER
  REFERENCES editions(campaign_id) ON DELETE SET NULL;
