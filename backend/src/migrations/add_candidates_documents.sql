-- Per-candidate document metadata (S3 keys live under candidates/files/<candidateId>/...)
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS documents JSONB NOT NULL DEFAULT '[]'::jsonb;
