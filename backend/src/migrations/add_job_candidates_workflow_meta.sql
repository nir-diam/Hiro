-- Optional workflow fields from Update Status modal (job–candidate link).
ALTER TABLE job_candidates
ADD COLUMN IF NOT EXISTS "workflowMeta" JSONB NOT NULL DEFAULT '{}'::jsonb;
