-- Interaction outcomes per pipeline stage (Document Studio / ProcessEvent)
ALTER TABLE client_pipeline_stages
  ADD COLUMN IF NOT EXISTS outcomes JSONB NOT NULL DEFAULT '[]'::jsonb;
