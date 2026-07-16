-- Add is_active column to recruitment_sources table
ALTER TABLE recruitment_sources
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
