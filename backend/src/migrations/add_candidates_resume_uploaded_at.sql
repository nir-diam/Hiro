-- When the original resume file (resumeUrl) was last uploaded — independent of candidate.updatedAt.
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "resumeUploadedAt" TIMESTAMPTZ;

UPDATE candidates
SET "resumeUploadedAt" = COALESCE("resumeUploadedAt", "createdAt", "updatedAt")
WHERE "resumeUrl" IS NOT NULL
  AND btrim("resumeUrl") <> ''
  AND "resumeUploadedAt" IS NULL;
