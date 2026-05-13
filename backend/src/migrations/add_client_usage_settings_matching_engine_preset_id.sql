-- Chosen matching-engine preset per client (Company Settings → פרטים).
-- Run against PostgreSQL after deploy.

ALTER TABLE client_usage_settings
  ADD COLUMN IF NOT EXISTS matching_engine_preset_id INTEGER NULL
  REFERENCES matching_engine_configs(id) ON DELETE SET NULL;

COMMENT ON COLUMN client_usage_settings.matching_engine_preset_id IS
  'matching_engine_configs.id (type=preset) assigned to this client; NULL = use first eligible preset for the client';
