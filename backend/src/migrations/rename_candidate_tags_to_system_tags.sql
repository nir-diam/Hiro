-- Rename candidate_tags → system_tags and add entity type (candidate | job).
-- All existing rows become type = 'candidate'.

ALTER TABLE IF EXISTS candidate_tags RENAME TO system_tags;

ALTER TABLE system_tags
  ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'candidate';

UPDATE system_tags SET type = 'candidate' WHERE type IS NULL OR trim(type) = '';

ALTER INDEX IF EXISTS idx_candidate_tags_candidate_id_active
  RENAME TO idx_system_tags_candidate_id_active;

ALTER INDEX IF EXISTS idx_candidate_tags_tag_id
  RENAME TO idx_system_tags_tag_id;

CREATE INDEX IF NOT EXISTS idx_system_tags_type
  ON system_tags (type);

-- entity_id references candidates OR jobs (by type); no single FK column constraint.
CREATE INDEX IF NOT EXISTS idx_system_tags_entity_type_active
  ON system_tags (entity_id, type)
  WHERE is_active = true;
