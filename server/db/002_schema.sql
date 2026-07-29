\c ditchfest_db

-- Schema reconciled against the real tm-votes (Cloudflare Worker + D1) source,
-- kept privately outside this repo — see COTD_MIGRATION_PLAN.md. Table/column
-- shapes mirror it closely on purpose so a real data export can be imported
-- with minimal transformation; the runtime (Postgres/Express instead of
-- D1/Workers) is the only thing that changed.
--
-- Notably absent on purpose, matching the source: there is NO persistent
-- "accounts" table. Display names are resolved live via the TM OAuth API
-- (services/names.js) and denormalized onto maps.author_name / admins.
-- display_name — never cached centrally, same as tm-votes.

CREATE TABLE IF NOT EXISTS editions (
  campaign_id INTEGER PRIMARY KEY, -- trackmania.io campaignid
  name        TEXT NOT NULL,      -- cleaned campaign name (no TM format codes)
  media       TEXT,               -- thumbnail/banner url
  position    INT,                -- ordering within the folder (higher = newer)
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maps (
  map_uid           TEXT PRIMARY KEY, -- Nadeo map UID
  campaign_id       INTEGER NOT NULL REFERENCES editions(campaign_id) ON DELETE CASCADE,
  name              TEXT NOT NULL,    -- cleaned map name
  author_account_id TEXT,             -- mapper accountId (for the Mappers ranking)
  author_name       TEXT,             -- mapper display name, denormalized (no accounts table)
  thumbnail_url     TEXT,
  position          INT,              -- ordering within the edition
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_maps_campaign ON maps (campaign_id);
CREATE INDEX IF NOT EXISTS idx_maps_author ON maps (author_account_id);

CREATE TABLE IF NOT EXISTS votes (
  account_id TEXT NOT NULL, -- voter accountId (from the session JWT) — no FK, see account_links
  map_uid    TEXT NOT NULL REFERENCES maps(map_uid) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, map_uid)
);
CREATE INDEX IF NOT EXISTS idx_votes_map ON votes (map_uid);

-- The ROOT_ADMIN_ID (env var, see config/index.js) is always an admin and
-- cannot be removed; this table holds additional admins added via the panel.
CREATE TABLE IF NOT EXISTS admins (
  account_id   TEXT PRIMARY KEY,
  display_name TEXT,
  added_by     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Catalog (code/name/icon/description/hint/secret) lives in code —
-- server/services/achievements.js — never here. Codes, once shipped, are
-- never renamed: earned rows reference them.
CREATE TABLE IF NOT EXISTS achievements (
  account_id TEXT NOT NULL,
  code       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, code)
);
CREATE INDEX IF NOT EXISTS idx_achievements_account ON achievements (account_id);

-- One row per edition the player finished in onboarding. Not derivable from
-- `votes` — liking nothing in an edition is a valid answer, so "seen" and
-- "voted" are different facts.
CREATE TABLE IF NOT EXISTS onboarding_progress (
  account_id  TEXT NOT NULL,
  campaign_id INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, campaign_id)
);

-- Linked accounts: several Ubisoft accounts that are the same person. Votes
-- stay on the account that cast them and maps keep their real author —
-- nothing is merged in storage. Every aggregate resolves an account to its
-- identity at read time via canon() in services/links.js, which is what
-- keeps unlinking a one-row delete instead of an impossible un-merge.
CREATE TABLE IF NOT EXISTS account_links (
  account_id   TEXT PRIMARY KEY, -- the alternate account
  primary_id   TEXT NOT NULL,    -- the identity it belongs to
  display_name TEXT,             -- nickname at link time, for the admin list
  linked_by    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_account_links_primary ON account_links (primary_id);
