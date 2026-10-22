ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS key_facts text[] NOT NULL DEFAULT '{}';
