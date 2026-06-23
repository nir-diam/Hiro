-- Change pending_tag_id FK from ON DELETE CASCADE to ON DELETE SET NULL
-- This preserves tag_ai_decisions records after the pending tag is merged/deleted.

ALTER TABLE tag_ai_decisions
  DROP CONSTRAINT IF EXISTS tag_ai_decisions_pending_tag_id_fkey;

ALTER TABLE tag_ai_decisions
  ALTER COLUMN pending_tag_id DROP NOT NULL;

ALTER TABLE tag_ai_decisions
  ADD CONSTRAINT tag_ai_decisions_pending_tag_id_fkey
    FOREIGN KEY (pending_tag_id) REFERENCES tags(id) ON DELETE SET NULL;
