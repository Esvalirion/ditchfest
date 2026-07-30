\c ditchfest_db

-- Manual column order for /admin/campaigns and the public site. NULL (the
-- default, and sync never sets it otherwise) means "no manual position yet"
-- — those editions keep sorting by the existing chronological rule. Once an
-- admin drags any column, routes/campaigns.js's /campaigns/reorder writes a
-- 0-based sort_order for the whole board in one go.
ALTER TABLE editions ADD COLUMN IF NOT EXISTS sort_order INTEGER;
