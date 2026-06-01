-- Multiselect job requirements: driving licenses + start availability (matches candidates picklists).
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS "licenseTypes" TEXT[] DEFAULT '{}';

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS "availabilityOptions" TEXT[] DEFAULT '{}';

-- Backfill from legacy single-value columns
UPDATE jobs
SET "licenseTypes" = ARRAY[TRIM("licenseType")]
WHERE COALESCE(array_length("licenseTypes", 1), 0) = 0
  AND "licenseType" IS NOT NULL
  AND TRIM("licenseType") <> ''
  AND TRIM("licenseType") <> 'לא חשוב';

UPDATE jobs
SET "availabilityOptions" = ARRAY[TRIM(availability)]
WHERE COALESCE(array_length("availabilityOptions", 1), 0) = 0
  AND availability IS NOT NULL
  AND TRIM(availability) <> '';
