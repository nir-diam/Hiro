-- Version history: [{ "text": "...", "savedAt": "ISO-8601" }] + timestamp for current searchText.
-- Run once if you already have originalText as TEXT[].

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "searchTextSavedAt" TIMESTAMPTZ;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "originalTextJson" JSONB NOT NULL DEFAULT '[]';

-- Convert legacy TEXT[] -> JSONB (only when originalText column is still text[])
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'candidates'
      AND column_name = 'originalText'
      AND udt_name = '_text'
  ) THEN
    UPDATE candidates c
    SET "originalTextJson" = COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'text', btrim(elem),
            'savedAt', COALESCE(c."updatedAt", c."createdAt", NOW())::text
          )
          ORDER BY ord
        )
        FROM unnest(c."originalText") WITH ORDINALITY AS u(elem, ord)
        WHERE elem IS NOT NULL AND btrim(elem) <> ''
      ),
      '[]'::jsonb
    )
    WHERE c."originalText" IS NOT NULL AND cardinality(c."originalText") > 0;

    ALTER TABLE candidates DROP COLUMN "originalText";
    ALTER TABLE candidates RENAME COLUMN "originalTextJson" TO "originalText";
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'candidates'
      AND column_name = 'originalText'
  ) THEN
    ALTER TABLE candidates RENAME COLUMN "originalTextJson" TO "originalText";
  ELSE
    ALTER TABLE candidates DROP COLUMN IF EXISTS "originalTextJson";
  END IF;
END $$;

-- Fresh installs that never had TEXT[]: ensure JSONB column exists
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "originalText" JSONB NOT NULL DEFAULT '[]';

UPDATE candidates
SET "searchTextSavedAt" = COALESCE("searchTextSavedAt", "updatedAt", "createdAt")
WHERE "searchText" IS NOT NULL
  AND btrim("searchText") <> ''
  AND "searchTextSavedAt" IS NULL;
