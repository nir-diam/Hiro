ALTER TABLE client_pipelines
  ADD COLUMN IF NOT EXISTS default_contact_id UUID NULL;
