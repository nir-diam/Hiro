-- Speeds up recruitment-sources report: filter by createdAt + group by source.
-- Safe to run repeatedly (IF NOT EXISTS). Prefer CONCURRENTLY in production if needed.

CREATE INDEX IF NOT EXISTS idx_candidates_created_at_not_deleted
  ON candidates ("createdAt")
  WHERE "isDeleted" = false;

CREATE INDEX IF NOT EXISTS idx_candidates_source_created_at_not_deleted
  ON candidates (source, "createdAt")
  WHERE "isDeleted" = false;
