ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS matching_engine_preset_id INTEGER NULL
  REFERENCES matching_engine_configs(id) ON DELETE SET NULL;

COMMENT ON COLUMN jobs.matching_engine_preset_id IS
  'Optional per-job matching_engine_configs preset; NULL = use client default from client_usage_settings';
