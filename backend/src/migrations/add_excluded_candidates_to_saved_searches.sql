-- Migration: per-search candidate blacklist
-- excluded_candidate_ids stores UUIDs of candidates explicitly removed from this
-- saved search. The exclusion is search-scoped so the candidate still appears in
-- every other saved search or unfiltered list.

ALTER TABLE saved_searches
  ADD COLUMN IF NOT EXISTS excluded_candidate_ids JSONB NOT NULL DEFAULT '[]';
