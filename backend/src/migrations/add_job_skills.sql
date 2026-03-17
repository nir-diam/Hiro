-- Add skills/tags (כישורים ותגיות חכמות) to jobs
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS skills JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN jobs.skills IS 'Array of { id, name, mode, source } for job smart tags';
