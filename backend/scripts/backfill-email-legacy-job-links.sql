-- READ ONLY — no INSERT/UPDATE/DELETE.
-- Email ingests on one calendar day (Israel) with legacy posting code (< 1_000_000).
-- Change target_day, run the whole file in your SQL client.

WITH cfg AS (
  SELECT DATE '2026-10-11' AS target_day  -- <-- change date
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
    eu."fileKey",
    eu."createdAt"
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
with_job AS (
  SELECT
    lc.*,
    j.id AS connect_job_id,
    j.title AS connect_job_title,
    j.client AS connect_job_client,
    j."postingCode" AS connect_job_posting_code
  FROM legacy_code lc
  LEFT JOIN jobs j ON j."postingCode" = lc.posting_code
  WHERE lc.posting_code IS NOT NULL
    AND lc.posting_code ~ '^\d+$'
    AND lc.posting_code::bigint < 1000000
)
SELECT
  c."fullName" AS candidate_name,
  w."candidateId" AS candidate_id,
  w.posting_code,
  w.connect_job_id,
  w.connect_job_title,
  w.connect_job_client,
  w.connect_job_posting_code,
  CASE
    WHEN w.connect_job_id IS NULL THEN 'NO_JOB_FOR_CODE'
    WHEN EXISTS (
      SELECT 1 FROM job_candidates jc
      WHERE jc."jobId" = w.connect_job_id AND jc."candidateId" = w."candidateId"
    ) THEN 'ALREADY_LINKED'
    ELSE 'NEEDS_LINK'
  END AS link_action,
  w."createdAt" AS email_upload_at,
  w.id AS email_upload_id,
  left(w.subject, 120) AS subject_preview
FROM with_job w
INNER JOIN candidates c ON c.id = w."candidateId"
ORDER BY link_action, w."createdAt";
