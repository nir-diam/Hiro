-- Job publication landing page analytics & media
ALTER TABLE job_publications
  ADD COLUMN IF NOT EXISTS "heroImageUrl" VARCHAR(2048),
  ADD COLUMN IF NOT EXISTS "videoUrl" VARCHAR(2048),
  ADD COLUMN IF NOT EXISTS "visitCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "submissionCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "contactEmail" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "contactPhone1" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "contactPhone2" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "landingLayout" VARCHAR(32) DEFAULT 'detailed',
  ADD COLUMN IF NOT EXISTS "landingLayouts" JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_job_publications_job_id ON job_publications ("jobId");
