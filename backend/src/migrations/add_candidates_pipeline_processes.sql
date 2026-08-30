-- Parallel candidate lifecycle processes (e.g. onboarding + recruitment at the same time).
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "candidatePipelineProcesses" JSONB NOT NULL DEFAULT '[]'::jsonb;
