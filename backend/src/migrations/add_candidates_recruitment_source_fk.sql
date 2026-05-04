-- Links a candidate to a configured recruitment source + tracks when the source was first set / last changed.
-- Run after recruitment_sources table exists.

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "recruitmentSourceId" UUID NULL REFERENCES recruitment_sources(id) ON DELETE SET NULL;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "recruitmentSourceCreatedAt" TIMESTAMPTZ NULL;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "recruitmentSourceUpdatedAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_candidates_recruitment_source_id
  ON candidates ("recruitmentSourceId")
  WHERE "recruitmentSourceId" IS NOT NULL;
