-- ============================================================================
-- Verification + repair queries for the CV-ingest system-email bug
-- (candidates merged into a wrong row because alljob / hiro address was used
--  as an identity key, plus the two mails that left no trace).
--
-- Run in order. Each SELECT is read-only; the repair section is clearly marked.
-- Column names are camelCase (quoted) on `candidates`, snake_case on `app_logs`.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Which candidates currently HOLD a system email (the poisoned rows)
--    Mirrors backend/src/services/candidateIdentityService.js → SYSTEM_EMAIL_SQL_GUARD
-- ---------------------------------------------------------------------------
SELECT id,
       "fullName",
       email,
       "inboundFromEmail",
       title,
       "isDeleted",
       "createdAt",
       "updatedAt"
FROM candidates
WHERE NULLIF(LOWER(TRIM(COALESCE(email, ''))), '') IS NOT NULL
  AND (
        LOWER(TRIM(email)) ~ '@[^@]*(alljob|jobmaster|drushim|gotfriends|ethosia|linkedin|indeed|glassdoor|careerjet|nisha|sql\.co\.il)[^@]*$'
     OR LOWER(TRIM(email)) ~ '@([a-z0-9-]+\.)+(hiro|humand)\.co\.il$'
     OR LOWER(TRIM(email)) ~ '^(noreply|no-reply|no_reply|donotreply|do-not-reply|mailer-daemon|postmaster|bounce|bounces|mailer|hiro|humand)@'
  )
ORDER BY "updatedAt" DESC;


-- ---------------------------------------------------------------------------
-- 2. Merge victims: soft-deleted rows that were folded into a target
--    The target id is read from the candidate journal (`events` JSONB),
--    written by backend/src/utils/candidateCanonicalLinkEvent.js
-- ---------------------------------------------------------------------------
SELECT victim.id AS victim_id,
       victim."fullName" AS victim_name,
       victim.email AS victim_email,
       victim."updatedAt" AS merged_at,
       evt->'metadata'->>'primaryCandidateId' AS merged_into_id,
       primary_row."fullName" AS merged_into_name,
       primary_row.email AS merged_into_email
FROM candidates victim
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(victim.events, '[]'::jsonb)) AS evt
LEFT JOIN candidates primary_row
       ON primary_row.id::text = evt->'metadata'->>'primaryCandidateId'
WHERE victim."isDeleted" = true
  AND evt->'metadata'->>'action' = 'identity_merged'
ORDER BY victim."updatedAt" DESC;


-- ---------------------------------------------------------------------------
-- 2b. Same list, but ONLY victims whose email was a system address
--     (these are the genuinely wrong merges — a real shared address is rare)
-- ---------------------------------------------------------------------------
SELECT victim.id AS victim_id,
       victim."fullName" AS victim_name,
       victim.email AS victim_email,
       victim."updatedAt" AS merged_at,
       evt->'metadata'->>'primaryCandidateId' AS merged_into_id,
       primary_row."fullName" AS merged_into_name
FROM candidates victim
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(victim.events, '[]'::jsonb)) AS evt
LEFT JOIN candidates primary_row
       ON primary_row.id::text = evt->'metadata'->>'primaryCandidateId'
WHERE victim."isDeleted" = true
  AND evt->'metadata'->>'action' = 'identity_merged'
  AND (
        LOWER(TRIM(victim.email)) ~ '@[^@]*(alljob|jobmaster|drushim|gotfriends|ethosia|linkedin|indeed|glassdoor|careerjet|nisha|sql\.co\.il)[^@]*$'
     OR LOWER(TRIM(victim.email)) ~ '@([a-z0-9-]+\.)+(hiro|humand)\.co\.il$'
  )
ORDER BY victim."updatedAt" DESC;


-- ---------------------------------------------------------------------------
-- 3. BUG 2 — the two mails with no trace.
--    Did Hiro even RECEIVE them? A row in email_uploads proves the notify
--    endpoint was hit; absence proves the mail never reached the API.
-- ---------------------------------------------------------------------------
SELECT id,
       "fileKey",
       bucket,
       "from",
       "to",
       subject,
       "candidateId",
       user_notes,
       "createdAt",
       "updatedAt"
FROM email_uploads
WHERE "createdAt" >= '2026-11-01 00:00:00+00'
  AND "createdAt" <  '2026-11-02 00:00:00+00'
  AND (
        COALESCE(subject, '') ILIKE '%זוליץ%'
     OR COALESCE(subject, '') ILIKE '%חלבי%'
     OR COALESCE(subject, '') ILIKE '%olga%'
     OR COALESCE(subject, '') ILIKE '%ronel%'
     OR COALESCE(subject, '') ILIKE '%רונאל%'
     OR COALESCE(subject, '') ILIKE '%אולגה%'
  )
ORDER BY "createdAt";


-- ---------------------------------------------------------------------------
-- 3b. Every ingest row from that day that never produced a candidate
--     (NULL candidateId and no INGEST_FAILED marker = the silent class)
-- ---------------------------------------------------------------------------
SELECT id,
       "fileKey",
       "from",
       subject,
       user_notes,
       "createdAt",
       CASE WHEN "candidateId" IS NULL THEN 'NO_CANDIDATE' ELSE 'linked' END AS link_state,
       CASE WHEN COALESCE(user_notes, '') LIKE 'INGEST_FAILED:%' THEN 'terminal' ELSE 'pending' END AS terminal_state
FROM email_uploads
WHERE "createdAt" >= '2026-11-01 00:00:00+00'
  AND "createdAt" <  '2026-11-02 00:00:00+00'
ORDER BY "createdAt" DESC;


-- ---------------------------------------------------------------------------
-- 3c. The durable ingest trail (app_logs, source = 'email_ingest')
--     If a mail has `accepted` but no `started`/`failed`, it died between
--     the 202 and the first stage — that is the only remaining blind spot.
-- ---------------------------------------------------------------------------
SELECT timestamp,
       level,
       context->>'stage'  AS stage,
       context->>'reason' AS reason,
       context->>'recordId' AS record_id,
       context->>'fileKey' AS file_key,
       context->>'candidateId' AS candidate_id,
       LEFT(context->>'subject', 90) AS subject,
       message
FROM app_logs
WHERE source = 'email_ingest'
  AND timestamp >= '2026-11-01 00:00:00+00'
  AND timestamp <  '2026-11-02 00:00:00+00'
ORDER BY timestamp DESC;


-- ---------------------------------------------------------------------------
-- 3d. Rows that got `accepted` but no terminal stage — the silent drops
-- ---------------------------------------------------------------------------
WITH trail AS (
  SELECT context->>'recordId' AS record_id,
         context->>'stage'    AS stage,
         timestamp
  FROM app_logs
  WHERE source = 'email_ingest'
    AND context->>'recordId' IS NOT NULL
    AND timestamp >= '2026-10-20 00:00:00+00'
)
SELECT t.record_id,
       MIN(t.timestamp) FILTER (WHERE t.stage = 'accepted') AS accepted_at,
       MAX(t.timestamp) FILTER (WHERE t.stage IN ('completed', 'failed', 'skipped')) AS terminal_at,
       ARRAY_AGG(DISTINCT t.stage) AS stages
FROM trail t
GROUP BY t.record_id
HAVING MIN(t.timestamp) FILTER (WHERE t.stage = 'accepted') IS NOT NULL
   AND MAX(t.timestamp) FILTER (WHERE t.stage IN ('completed', 'failed', 'skipped')) IS NULL
ORDER BY accepted_at DESC;


-- ---------------------------------------------------------------------------
-- 4. How much damage: the merge targets that absorbed foreign CVs
-- ---------------------------------------------------------------------------
SELECT primary_row.id,
       primary_row."fullName",
       primary_row.email,
       primary_row.title,
       COUNT(*) AS absorbed_profiles,
       ARRAY_AGG(victim."fullName" ORDER BY victim."updatedAt" DESC) AS absorbed_names
FROM candidates victim
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(victim.events, '[]'::jsonb)) AS evt
JOIN candidates primary_row
  ON primary_row.id::text = evt->'metadata'->>'primaryCandidateId'
WHERE victim."isDeleted" = true
  AND evt->'metadata'->>'action' = 'identity_merged'
  AND (
        LOWER(TRIM(victim.email)) ~ '@[^@]*(alljob|jobmaster|drushim|gotfriends|ethosia|linkedin|indeed|glassdoor|careerjet|nisha|sql\.co\.il)[^@]*$'
     OR LOWER(TRIM(victim.email)) ~ '@([a-z0-9-]+\.)+(hiro|humand)\.co\.il$'
  )
GROUP BY primary_row.id, primary_row."fullName", primary_row.email, primary_row.title
ORDER BY absorbed_profiles DESC;


-- ============================================================================
-- REPAIR — review everything above first. Run inside a transaction.
-- ============================================================================

BEGIN;

-- 5a. Release the system address from live candidates.
--     This is NOT destructive to CV data; the address was never the person's.
UPDATE candidates
SET email = NULL,
    "updatedAt" = NOW()
WHERE NULLIF(LOWER(TRIM(COALESCE(email, ''))), '') IS NOT NULL
  AND (
        LOWER(TRIM(email)) ~ '@[^@]*(alljob|jobmaster|drushim|gotfriends|ethosia|linkedin|indeed|glassdoor|careerjet|nisha|sql\.co\.il)[^@]*$'
     OR LOWER(TRIM(email)) ~ '@([a-z0-9-]+\.)+(hiro|humand)\.co\.il$'
     OR LOWER(TRIM(email)) ~ '^(noreply|no-reply|no_reply|donotreply|do-not-reply|mailer-daemon|postmaster|bounce|bounces|mailer|hiro|humand)@'
  );

-- 5b. Restore the merge victims — ONLY the ones you confirmed in query 2b.
--     Replace the id list with the real victim ids.
--
-- UPDATE candidates
-- SET "isDeleted" = false,
--     "canonicalCandidateId" = NULL,
--     email = NULL,
--     "updatedAt" = NOW()
-- WHERE id IN (
--   '00000000-0000-0000-0000-000000000000'  -- victim 1
--   -- , '...'                             -- victim 2
-- )
--   AND "isDeleted" = true;

-- Recheck before committing:
SELECT COUNT(*) FILTER (WHERE "isDeleted" = false) AS live_with_system_email
FROM candidates
WHERE LOWER(TRIM(COALESCE(email, ''))) ~ '@[^@]*(alljob|drushim)';

-- COMMIT;   -- or ROLLBACK; if the numbers look wrong


-- ============================================================================
-- 6. NOT fixable by SQL — the corrupted survivors.
--
-- יקטרינה דובאי / אברהם אלימלך now carry a stranger's title + work history,
-- because `buildMergePlan` copied every CV field from the victim onto the
-- primary. There is no before-image in `candidates` (candidateService.update
-- writes no audit_logs row), so the correct values must come from:
--
--   a) the victim rows themselves (still present, just isDeleted = true) —
--      after restoring them, copy their fields back onto the survivor; or
--   b) the original CV file: email_uploads."fileKey" → S3 → re-parse.
--
-- Query the victim's preserved CV data:
-- ---------------------------------------------------------------------------
SELECT id, "fullName", title, "workExperience", education, skills,
       "professionalSummary", "resumeUrl", "resumeContentHash", "createdAt"
FROM candidates
WHERE id IN (
  '00000000-0000-0000-0000-000000000000'
)
  AND "isDeleted" = true;


-- 6b. Find the original mail for a victim, to recover the true CV
-- ---------------------------------------------------------------------------
SELECT eu.id, eu."fileKey", eu.bucket, eu."from", eu.subject, eu."createdAt"
FROM email_uploads eu
JOIN candidates c ON c.id = eu."candidateId"
WHERE c.id = '00000000-0000-0000-0000-000000000000'
ORDER BY eu."createdAt" DESC;
