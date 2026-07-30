\c ditchfest_db

-- sort_order becomes fractional so a single column can be repositioned by
-- bisecting its two new neighbors' values (z-index style: any number is
-- valid, gaps are fine, no need to renumber the rest of the board). Was
-- INTEGER when /campaigns/reorder always resent the whole board's order
-- 0..N-1 in one request — that's what made the position field's valid range
-- track the current campaign count. See routes/campaigns.js's
-- POST /campaigns/position.
ALTER TABLE editions ALTER COLUMN sort_order TYPE DOUBLE PRECISION;
