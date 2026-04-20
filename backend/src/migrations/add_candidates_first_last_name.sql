-- Split display name into firstName / lastName. Idempotent.

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS "firstName" VARCHAR(255);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS "lastName" VARCHAR(255);

UPDATE candidates
SET
  "firstName" = NULLIF(regexp_replace(trim("fullName"), '\s+.*$', ''), ''),
  "lastName" = NULLIF(regexp_replace(trim("fullName"), '^[^\s]+\s*', ''), '')
WHERE trim(coalesce("fullName", '')) <> ''
  AND "firstName" IS NULL
  AND "lastName" IS NULL;
