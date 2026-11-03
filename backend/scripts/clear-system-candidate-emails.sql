-- Clear portal / job-board / Hiro inbox addresses mistakenly stored on candidates.email
-- Sets email to '' (empty string). Run preview first; use batches if the table is under load.
--
-- Patterns covered:
--   *@alljob.co.il  (and other common job-board domains in the same family)
--   *@*.hiro.co.il / *@*.humand.co.il  (includes humand@app.hiro.co.il, humand+tag@app.hiro.co.il)
--
-- Usage (psql):
--   \i scripts/clear-system-candidate-emails.sql
-- Or run sections manually.


-- ---------------------------------------------------------------------------
-- 0. Optional: avoid statement_timeout on large updates (session only)
-- ---------------------------------------------------------------------------
SET statement_timeout = 0;


-- ---------------------------------------------------------------------------
-- 1. PREVIEW — how many rows match (live vs deleted)
-- ---------------------------------------------------------------------------
SELECT
  COUNT(*) AS total_matching,
  COUNT(*) FILTER (WHERE "isDeleted" = false) AS live_matching,
  COUNT(*) FILTER (WHERE "isDeleted" = true) AS deleted_matching
FROM candidates
WHERE NULLIF(TRIM(COALESCE(email, '')), '') IS NOT NULL
  AND (
        LOWER(TRIM(email)) LIKE '%@alljob.co.il'
     OR LOWER(TRIM(email)) ~ '@[^@]*(alljob|jobmaster|drushim|gotfriends|ethosia|linkedin|indeed|glassdoor|careerjet|nisha|sql\.co\.il)[^@]*$'
     OR LOWER(TRIM(email)) ~ '@([a-z0-9-]+\.)+(hiro|humand)\.co\.il$'
     OR LOWER(TRIM(email)) ~ '^(noreply|no-reply|no_reply|donotreply|do-not-reply|mailer-daemon|postmaster|bounce|bounces|mailer|hiro|humand)@'
  );


-- Sample rows (newest first)
SELECT id, "fullName", email, "isDeleted", "updatedAt"
FROM candidates
WHERE NULLIF(TRIM(COALESCE(email, '')), '') IS NOT NULL
  AND (
        LOWER(TRIM(email)) LIKE '%@alljob.co.il'
     OR LOWER(TRIM(email)) ~ '@[^@]*(alljob|jobmaster|drushim|gotfriends|ethosia|linkedin|indeed|glassdoor|careerjet|nisha|sql\.co\.il)[^@]*$'
     OR LOWER(TRIM(email)) ~ '@([a-z0-9-]+\.)+(hiro|humand)\.co\.il$'
     OR LOWER(TRIM(email)) ~ '^(noreply|no-reply|no_reply|donotreply|do-not-reply|mailer-daemon|postmaster|bounce|bounces|mailer|hiro|humand)@'
  )
ORDER BY "updatedAt" DESC
LIMIT 30;


-- ---------------------------------------------------------------------------
-- 2. APPLY — set email to empty string for all matches
--    (Uncomment when preview looks correct.)
-- ---------------------------------------------------------------------------
/*
BEGIN;

UPDATE candidates
SET email = '',
    "updatedAt" = NOW()
WHERE NULLIF(TRIM(COALESCE(email, '')), '') IS NOT NULL
  AND (
        LOWER(TRIM(email)) LIKE '%@alljob.co.il'
     OR LOWER(TRIM(email)) ~ '@[^@]*(alljob|jobmaster|drushim|gotfriends|ethosia|linkedin|indeed|glassdoor|careerjet|nisha|sql\.co\.il)[^@]*$'
     OR LOWER(TRIM(email)) ~ '@([a-z0-9-]+\.)+(hiro|humand)\.co\.il$'
     OR LOWER(TRIM(email)) ~ '^(noreply|no-reply|no_reply|donotreply|do-not-reply|mailer-daemon|postmaster|bounce|bounces|mailer|hiro|humand)@'
  );

-- Recheck live rows still holding a system address
SELECT COUNT(*) AS live_still_bad
FROM candidates
WHERE "isDeleted" = false
  AND NULLIF(TRIM(COALESCE(email, '')), '') IS NOT NULL
  AND (
        LOWER(TRIM(email)) LIKE '%@alljob.co.il'
     OR LOWER(TRIM(email)) ~ '@([a-z0-9-]+\.)+(hiro|humand)\.co\.il$'
  );

COMMIT;
-- ROLLBACK;
*/


-- ---------------------------------------------------------------------------
-- 3. OPTIONAL — live profiles only (7-row class), one row per UPDATE (less locking)
-- ---------------------------------------------------------------------------
/*
UPDATE candidates SET email = '', "updatedAt" = NOW()
WHERE id = 'c80b76c4-1cfc-43b6-a941-58540e976b7c';  -- אברהם אלימלך

UPDATE candidates SET email = '', "updatedAt" = NOW()
WHERE id = 'e62f92e9-1d70-4183-baba-cd2a9551c4e4';  -- קונסטנטין שרמן

UPDATE candidates SET email = '', "updatedAt" = NOW()
WHERE id = '12d1d511-e102-4d04-98bc-5cf690560836'; -- אושר אלגרבלי

UPDATE candidates SET email = '', "updatedAt" = NOW()
WHERE id = '59f311ce-c33c-4d97-8b5b-286291234731'; -- אייל דיין

UPDATE candidates SET email = '', "updatedAt" = NOW()
WHERE id = '6be12011-8064-4861-b65f-7b9e831a0d7c'; -- גיבי קריחלי

UPDATE candidates SET email = '', "updatedAt" = NOW()
WHERE id = '586bcdeb-24f1-464b-901c-79a7827cb1d8'; -- Liron Myz

UPDATE candidates SET email = '', "updatedAt" = NOW()
WHERE id = 'd7a79aac-ddf8-478e-a4d1-8f5fc6715fe7'; -- Liron Myz
*/
