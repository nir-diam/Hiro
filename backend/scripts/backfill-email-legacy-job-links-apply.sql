-- WRITES DATA — run only after preview (backfill-email-legacy-job-links.sql).
-- Same target_day as preview.

BEGIN;

WITH cfg AS (
  SELECT DATE '2026-10-11' AS target_day
),
bounds AS (
  SELECT
    (c.target_day AT TIME ZONE 'Asia/Jerusalem') AS day_start,
    ((c.target_day + 1) AT TIME ZONE 'Asia/Jerusalem') AS day_end
  FROM cfg c
),
uploads AS (
  SELECT
    eu.id,
    eu."candidateId",
    eu."jobId" AS upload_job_key,
    eu.subject,
    eu."fileKey"
  FROM email_uploads eu
  CROSS JOIN bounds b
  WHERE eu."candidateId" IS NOT NULL
    AND eu."createdAt" >= b.day_start
    AND eu."createdAt" < b.day_end
),
legacy_code AS (
  SELECT
    u.*,
    COALESCE(
      CASE
        WHEN trim(u.upload_job_key) ~ '^\d+$'
          AND trim(u.upload_job_key)::bigint > 0
          AND trim(u.upload_job_key)::bigint < 1000000
        THEN trim(u.upload_job_key)
      END,
      substring(u.subject FROM 'מס[''׳]?\s*(\d{4,8})'),
      substring(u.subject FROM '[-–—]\s*(\d{4,8})\s*$'),
      (regexp_match(
        (string_to_array(u."fileKey", '/'))[array_length(string_to_array(u."fileKey", '/'), 1)],
        '[-–—]\s*(\d{4,8})(?:\.[^.]+)?$'
      ))[1],
      (regexp_match(
        (string_to_array(u."fileKey", '/'))[array_length(string_to_array(u."fileKey", '/'), 1)],
        '(\d{4,8})(?:\.[^.]+)?$'
      ))[1]
    ) AS posting_code
  FROM uploads u
),
resolved AS (
  SELECT DISTINCT
    lc.id AS upload_id,
    lc."candidateId" AS candidate_id,
    j.id AS job_id
  FROM legacy_code lc
  INNER JOIN jobs j ON j."postingCode" = lc.posting_code
  WHERE lc.posting_code IS NOT NULL
    AND lc.posting_code ~ '^\d+$'
    AND lc.posting_code::bigint < 1000000
)
INSERT INTO job_candidates (
  id,
  "jobId",
  "candidateId",
  status,
  source,
  "workflowMeta",
  "manualOverride"
)
SELECT
  gen_random_uuid(),
  r.job_id,
  r.candidate_id,
  'חדש',
  'email',
  '{}'::jsonb,
  false
FROM resolved r
WHERE NOT EXISTS (
  SELECT 1
  FROM job_candidates jc
  WHERE jc."jobId" = r.job_id
    AND jc."candidateId" = r.candidate_id
);

WITH cfg AS (
  SELECT DATE '2026-10-11' AS target_day
),
bounds AS (
  SELECT
    (c.target_day AT TIME ZONE 'Asia/Jerusalem') AS day_start,
    ((c.target_day + 1) AT TIME ZONE 'Asia/Jerusalem') AS day_end
  FROM cfg c
),
uploads AS (
  SELECT eu.id, eu."candidateId", eu."jobId" AS upload_job_key, eu.subject, eu."fileKey"
  FROM email_uploads eu
  CROSS JOIN bounds b
  WHERE eu."candidateId" IS NOT NULL
    AND eu."createdAt" >= b.day_start
    AND eu."createdAt" < b.day_end
),
legacy_code AS (
  SELECT
    u.id AS upload_id,
    COALESCE(
      CASE
        WHEN trim(u.upload_job_key) ~ '^\d+$'
          AND trim(u.upload_job_key)::bigint > 0
          AND trim(u.upload_job_key)::bigint < 1000000
        THEN trim(u.upload_job_key)
      END,
      substring(u.subject FROM 'מס[''׳]?\s*(\d{4,8})'),
      substring(u.subject FROM '[-–—]\s*(\d{4,8})\s*$'),
      (regexp_match(
        (string_to_array(u."fileKey", '/'))[array_length(string_to_array(u."fileKey", '/'), 1)],
        '[-–—]\s*(\d{4,8})(?:\.[^.]+)?$'
      ))[1],
      (regexp_match(
        (string_to_array(u."fileKey", '/'))[array_length(string_to_array(u."fileKey", '/'), 1)],
        '(\d{4,8})(?:\.[^.]+)?$'
      ))[1]
    ) AS posting_code
  FROM uploads u
),
resolved AS (
  SELECT lc.upload_id, j.id AS job_id
  FROM legacy_code lc
  INNER JOIN jobs j ON j."postingCode" = lc.posting_code
  WHERE lc.posting_code IS NOT NULL
    AND lc.posting_code ~ '^\d+$'
    AND lc.posting_code::bigint < 1000000
)
UPDATE email_uploads eu
SET "jobId" = r.job_id::text
FROM resolved r
WHERE eu.id = r.upload_id
  AND (
    trim(eu."jobId") !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR trim(eu."jobId")::uuid IS DISTINCT FROM r.job_id
  );

COMMIT;
