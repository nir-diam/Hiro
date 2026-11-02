-- Job role tags: required years of experience + look-back window (years) for search.
-- NULL = not set. Safe to re-run.
ALTER TABLE system_tags
  ADD COLUMN IF NOT EXISTS years_experience SMALLINT NULL,
  ADD COLUMN IF NOT EXISTS lookback_years SMALLINT NULL;
