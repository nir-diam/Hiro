ALTER TABLE tag_ai_decisions
  ADD COLUMN IF NOT EXISTS resolved_target_tag_id UUID NULL REFERENCES tags(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tag_ai_decisions_resolved_target_tag_id_idx
  ON tag_ai_decisions (resolved_target_tag_id)
  WHERE resolved_target_tag_id IS NOT NULL;
