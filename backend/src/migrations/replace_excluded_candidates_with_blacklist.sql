-- Migration: replace the naive excluded_candidate_ids JSONB array with a
-- proper per-search blacklist table that uses stable email/phone identifiers.
-- A candidate who re-submits their CV and gets a new UUID is still blocked
-- as long as their email or phone matches a blacklist entry.

-- Remove the old column (safe IF EXISTS)
ALTER TABLE saved_searches
  DROP COLUMN IF EXISTS excluded_candidate_ids;

-- Per-search blacklist: each row blocks one email or phone (or both)
CREATE TABLE IF NOT EXISTS saved_search_blacklist (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_search_id   UUID NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  candidate_email   TEXT,
  candidate_phone   TEXT,
  excluded_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  excluded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_email_or_phone CHECK (
    candidate_email IS NOT NULL OR candidate_phone IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_ss_blacklist_search_id
  ON saved_search_blacklist(saved_search_id);
CREATE INDEX IF NOT EXISTS idx_ss_blacklist_email
  ON saved_search_blacklist(candidate_email)
  WHERE candidate_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ss_blacklist_phone
  ON saved_search_blacklist(candidate_phone)
  WHERE candidate_phone IS NOT NULL;
