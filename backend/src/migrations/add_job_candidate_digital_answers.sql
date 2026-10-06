-- Digital (automatic) screening answers per candidate+job — separate from telephone script answers.
ALTER TABLE job_candidate_screening
  ADD COLUMN IF NOT EXISTS "digitalAnswers" JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN job_candidate_screening."digitalAnswers" IS
  'Array of { questionId, question, answer } from the job digital questionnaire (candidate portal).';
