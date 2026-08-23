-- SHA-256 of raw resume file bytes (before Gemini parse) for duplicate upload detection.
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "resumeContentHash" VARCHAR(64) NULL;

CREATE INDEX IF NOT EXISTS idx_candidates_resume_content_hash
  ON candidates (LOWER("resumeContentHash"))
  WHERE "resumeContentHash" IS NOT NULL AND "isDeleted" = false;

COMMENT ON COLUMN candidates."resumeContentHash" IS
  'SHA-256 hex digest of raw CV file bytes at ingest; independent of AI parse output.';
