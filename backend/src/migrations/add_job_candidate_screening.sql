-- Table to store screening data per candidate per job (answers to screening questions + telephone impression).
-- Run against your PostgreSQL DB.

CREATE TABLE IF NOT EXISTS job_candidate_screening (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "candidateId" UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  "jobId" UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  "screeningAnswers" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "telephoneImpression" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE ("candidateId", "jobId")
);

CREATE INDEX IF NOT EXISTS idx_job_candidate_screening_candidate
  ON job_candidate_screening ("candidateId");
CREATE INDEX IF NOT EXISTS idx_job_candidate_screening_job
  ON job_candidate_screening ("jobId");
