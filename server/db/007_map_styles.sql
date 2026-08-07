\c ditchfest_db

-- Map style/tags, sourced from trackmania.exchange (TMX). These are
-- sync-written columns, just like maps.name / maps.author_name: the catalog
-- sync (services/sync.js) fills them in and rewrites them, admins never touch
-- them, and they're deliberately separate from the TMX lookup done live on
-- the single-map page (routes/map.js) so the board can render styles without
-- N extra TMX calls per page view.
--
-- tmx_style: readable StyleName (e.g. "SpeedMapping"), or NULL.
-- tmx_tags:  the raw TMX "Tags" string of numeric ids (e.g. "60,12,1"). Kept
--            as-is so a future tag-table refresh re-resolves names without a
--            new TMX fetch; services/editions.js expands ids to {name,color}.
-- tmx_styles_updated_at: last time we asked TMX. A row with a recent value but
--            NULL style+tags means "confirmed not on TMX" — the sync must NOT
--            refetch those every run, only the stale/never-fetched ones (see
--            services/catalog.js getMapsMissingTmxStyles).
ALTER TABLE maps
  ADD COLUMN IF NOT EXISTS tmx_style TEXT,
  ADD COLUMN IF NOT EXISTS tmx_tags TEXT,
  ADD COLUMN IF NOT EXISTS tmx_styles_updated_at TIMESTAMPTZ;
