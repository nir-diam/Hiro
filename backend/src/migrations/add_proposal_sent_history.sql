ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS sent_history JSONB NOT NULL DEFAULT '[]'::jsonb;
