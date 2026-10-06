ALTER TABLE candidate_pipelines
  ADD COLUMN IF NOT EXISTS default_contact_id UUID NULL;

ALTER TABLE candidate_pipelines
  ADD COLUMN IF NOT EXISTS default_assignee_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
