-- Add embedding column to organizations table (same type as candidates.embedding)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS embedding JSONB;
