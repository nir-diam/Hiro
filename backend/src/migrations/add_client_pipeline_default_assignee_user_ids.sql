ALTER TABLE client_pipelines
  ADD COLUMN IF NOT EXISTS default_assignee_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
