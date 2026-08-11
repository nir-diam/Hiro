-- Links duplicate candidate rows (same email / phone / id) as versions of a primary profile.
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "canonicalCandidateId" UUID NULL;

CREATE INDEX IF NOT EXISTS idx_candidates_canonical_candidate_id
  ON candidates ("canonicalCandidateId")
  WHERE "canonicalCandidateId" IS NOT NULL;

COMMENT ON COLUMN candidates."canonicalCandidateId" IS
  'When set, this row is a version/shadow of the primary candidate id; list views show one row per identity group.';
