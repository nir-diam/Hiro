-- Parsed CV text version history (each manual save appends the previous searchText here).
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "originalText" TEXT[] NOT NULL DEFAULT '{}';
