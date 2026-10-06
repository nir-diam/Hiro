-- Protected catalog tags: block destructive edits except aliases/synonyms/domains on target merges.
ALTER TABLE tags
  ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS protected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS protected_by UUID,
  ADD COLUMN IF NOT EXISTS protection_note TEXT;

CREATE INDEX IF NOT EXISTS idx_tags_is_protected ON tags (is_protected) WHERE is_protected = TRUE;
