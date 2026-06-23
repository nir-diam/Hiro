-- Add embedding column to jobs table (same type as candidates.embedding)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS embedding JSONB;
