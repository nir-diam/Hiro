-- Rejection reason/notes and status for candidate–job screening rows.
ALTER TABLE job_candidate_screening
  ADD COLUMN IF NOT EXISTS "screeningStatus" VARCHAR(32) NOT NULL DEFAULT 'open';

ALTER TABLE job_candidate_screening
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

ALTER TABLE job_candidate_screening
  ADD COLUMN IF NOT EXISTS "rejectionNotes" TEXT;

COMMENT ON COLUMN job_candidate_screening."screeningStatus" IS 'open | rejected';
COMMENT ON COLUMN job_candidate_screening."rejectionReason" IS 'Short rejection category label';
COMMENT ON COLUMN job_candidate_screening."rejectionNotes" IS 'Free-text notes for rejection';
