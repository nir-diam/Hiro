-- Multi-value driving license & employment type for candidates. Idempotent.

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "drivingLicenses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "employmentTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill from legacy single-value columns where arrays are still empty
UPDATE candidates c
SET
  "drivingLicenses" = CASE
    WHEN c."drivingLicense" IS NOT NULL AND TRIM(c."drivingLicense") <> '' THEN ARRAY[TRIM(c."drivingLicense")]
    ELSE ARRAY[]::TEXT[]
  END
WHERE COALESCE(array_length(c."drivingLicenses", 1), 0) = 0
  AND c."drivingLicense" IS NOT NULL
  AND TRIM(c."drivingLicense") <> '';

UPDATE candidates c
SET
  "employmentTypes" = CASE
    WHEN c."employmentType" IS NOT NULL AND TRIM(c."employmentType") <> '' THEN ARRAY[TRIM(c."employmentType")]
    ELSE ARRAY[]::TEXT[]
  END
WHERE COALESCE(array_length(c."employmentTypes", 1), 0) = 0
  AND c."employmentType" IS NOT NULL
  AND TRIM(c."employmentType") <> '';
