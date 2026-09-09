-- Staff-created shadow profile copies (צור העתק) — not candidate portal versions.
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "staffProfileCopy" BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN candidates."staffProfileCopy" IS
  'True when recruiters created this row as an internal editable shadow copy of a primary candidate profile.';

-- Legacy rows created before staffProfileCopy existed (name suffix at ingest time).
UPDATE candidates
SET "staffProfileCopy" = true
WHERE "staffProfileCopy" = false
  AND "canonicalCandidateId" IS NOT NULL
  AND (
    COALESCE("fullName", '') ~* '_duplicate[0-9]*$'
    OR COALESCE("title", '') ~* '_duplicate[0-9]*$'
  );
