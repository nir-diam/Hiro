-- Hide candidates from the main list while CV/email ingest + Gemini enrichment is still running.
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "ingestPending" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_candidates_ingest_pending
  ON candidates ("ingestPending")
  WHERE "ingestPending" = true;
