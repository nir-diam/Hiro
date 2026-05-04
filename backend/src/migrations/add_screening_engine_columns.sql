-- Screening inclusion engine: job_candidates meta + status history + client/job defaults
-- PostgreSQL. Run manually when deploying.

-- job_candidates (camelCase columns match Sequelize model without underscored)
ALTER TABLE job_candidates ADD COLUMN IF NOT EXISTS "manualOverride" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE job_candidates ADD COLUMN IF NOT EXISTS "screeningEnteredAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE job_candidates ADD COLUMN IF NOT EXISTS "lastStatusGroup" VARCHAR(64);
ALTER TABLE job_candidates ADD COLUMN IF NOT EXISTS "lastExitAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE job_candidates ADD COLUMN IF NOT EXISTS "lastExitReason" VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_job_candidates_candidate_screening
  ON job_candidates ("candidateId", "lastStatusGroup")
  WHERE "jobId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_candidates_job_screening
  ON job_candidates ("jobId", "lastStatusGroup")
  WHERE "jobId" IS NOT NULL;

-- client_usage_settings (underscored — ClientUsageSetting model uses underscored: true)
ALTER TABLE client_usage_settings ADD COLUMN IF NOT EXISTS default_job_validity_days INTEGER NOT NULL DEFAULT 90;
-- Column name must match ClientUsageSetting.defaultJobReScreeningCooldownMonths field mapping (not Sequelize’s default default_job_re_screening_cooldown_months).
ALTER TABLE client_usage_settings ADD COLUMN IF NOT EXISTS default_job_rescreening_cooldown_months INTEGER NOT NULL DEFAULT 3;
ALTER TABLE client_usage_settings ADD COLUMN IF NOT EXISTS default_require_original_cv BOOLEAN NOT NULL DEFAULT false;

-- Optional: jobs.validityDays if missing on older DBs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS "validityDays" INTEGER;

-- Job-level screening fields (may already exist from earlier migrations / sync)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS "reScreeningCooldownMonths" INTEGER DEFAULT 3;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS "requireOriginalCv" BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS job_candidate_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "jobCandidateId" UUID NOT NULL REFERENCES job_candidates(id) ON DELETE CASCADE,
  "fromStatus" VARCHAR(500),
  "toStatus" VARCHAR(500) NOT NULL,
  "fromGroup" VARCHAR(64),
  "toGroup" VARCHAR(64),
  "changedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "changedByUserId" UUID,
  source VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_jcse_job_candidate_changed
  ON job_candidate_status_events ("jobCandidateId", "changedAt" DESC);
