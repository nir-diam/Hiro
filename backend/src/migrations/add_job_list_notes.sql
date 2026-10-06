ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS "listNotes" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "listNotesHistory" JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN jobs."listNotes" IS 'Editable notes shown in jobs table grid (separate from internalNotes).';
COMMENT ON COLUMN jobs."listNotesHistory" IS 'Audit trail for listNotes edits: user, timestamp, before/after text.';
