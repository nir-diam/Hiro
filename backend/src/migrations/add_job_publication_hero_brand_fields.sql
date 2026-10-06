ALTER TABLE job_publications
  ADD COLUMN IF NOT EXISTS "heroBrandSource" VARCHAR(32) NULL;

ALTER TABLE job_publications
  ADD COLUMN IF NOT EXISTS "heroBrandColorOverride" VARCHAR(32) NULL;
