-- Add internalOpinion column to store AI-generated internal opinion (HTML) per candidate+job.
-- Run against your PostgreSQL DB that already has job_candidate_screening.

ALTER TABLE job_candidate_screening
  ADD COLUMN IF NOT EXISTS "internalOpinion" TEXT;

COMMENT ON COLUMN job_candidate_screening."internalOpinion" IS 'AI-generated internal opinion (HTML) for this candidate+job';
