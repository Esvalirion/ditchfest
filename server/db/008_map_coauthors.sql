\c ditchfest_db

-- Admin-managed co-authors on a map (collaborations). Several mappers may have
-- built a map together, but Nadeo only credits one author_account_id, which is
-- what sync fills in (services/catalog.js upsertMap). This table holds the
-- extras an admin adds manually. Sync NEVER writes here, so admin edits survive
-- every catalog refresh — same rule as the editions/maps override columns in
-- 003/004.
--
-- Like the tmx_* style columns (migration 007), this sits behind its own
-- migration: the code reads it through try/catch (services/coauthors.js
-- isCoauthorsMissing) and degrades to "no co-authors" when 008 hasn't been
-- applied yet, so a deploy of the code can run ahead of the deploy of the
-- migration on prod. Once 008 is applied everywhere, those fallbacks are dead
-- code.
--
-- account_id has no FK on purpose: there is no accounts table (see
-- 002_schema.sql), and it's resolved to an identity at read time via canon()
-- in services/links.js — exactly like votes.account_id and maps.
-- author_account_id, so a co-author's linked alt still rolls up to the same
-- identity in every aggregate.
CREATE TABLE IF NOT EXISTS map_coauthors (
  map_uid    TEXT NOT NULL REFERENCES maps(map_uid) ON DELETE CASCADE,
  account_id TEXT NOT NULL, -- co-author accountId (resolved via canon() at read time)
  added_by   TEXT,          -- admin accountId who added this co-author
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (map_uid, account_id)
);
CREATE INDEX IF NOT EXISTS idx_map_coauthors_account ON map_coauthors (account_id);
