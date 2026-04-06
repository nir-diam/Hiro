-- Speeds up GET /api/candidates (paginated list): ORDER BY updatedAt + tag joins
-- Run against production when load is low, or use CONCURRENTLY variants manually to avoid long locks.

-- List page: WHERE "isDeleted" = false ORDER BY "updatedAt" DESC LIMIT/OFFSET
CREATE INDEX IF NOT EXISTS idx_candidates_list_updated_at_not_deleted
  ON candidates ("updatedAt" DESC NULLS LAST)
  WHERE "isDeleted" = false;

-- Join / filter active tags per candidate
CREATE INDEX IF NOT EXISTS idx_candidate_tags_candidate_id_active
  ON candidate_tags (candidate_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_candidate_tags_tag_id
  ON candidate_tags (tag_id);
