/**
 * Runs verify-system-email-ingest.sql section 5a only (null system emails on candidates).
 * Usage: node scripts/run-verify-system-email-repair-5a.js [--dry-run]
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../src/.env') });

const { sequelize } = require('../src/config/db');

const dryRun = process.argv.includes('--dry-run');
/** Skip regex table scan — only rows that still block identity (active profiles). */
const liveOnly = process.argv.includes('--live-only');

const UPDATE_5A = `
UPDATE candidates
SET email = NULL,
    "updatedAt" = NOW()
WHERE NULLIF(LOWER(TRIM(COALESCE(email, ''))), '') IS NOT NULL
  AND (
        LOWER(TRIM(email)) ~ '@[^@]*(alljob|jobmaster|drushim|gotfriends|ethosia|linkedin|indeed|glassdoor|careerjet|nisha|sql\\.co\\.il)[^@]*$'
     OR LOWER(TRIM(email)) ~ '@([a-z0-9-]+\\.)+(hiro|humand)\\.co\\.il$'
     OR LOWER(TRIM(email)) ~ '^(noreply|no-reply|no_reply|donotreply|do-not-reply|mailer-daemon|postmaster|bounce|bounces|mailer|hiro|humand)@'
  )
`;

const RECHECK = `
SELECT
  COUNT(*) FILTER (WHERE "isDeleted" = false) AS live_with_system_email,
  COUNT(*) AS rows_still_matching_pattern
FROM candidates
WHERE NULLIF(LOWER(TRIM(COALESCE(email, ''))), '') IS NOT NULL
  AND (
        LOWER(TRIM(email)) ~ '@[^@]*(alljob|jobmaster|drushim)[^@]*$'
     OR LOWER(TRIM(email)) ~ '@([a-z0-9-]+\\.)+(hiro|humand)\\.co\\.il$'
  )
`;

async function main() {
  await sequelize.authenticate();
  const t = await sequelize.transaction();
  try {
    await sequelize.query("SET LOCAL statement_timeout = '120000'", { transaction: t });
    const [[before]] = await sequelize.query(RECHECK, { transaction: t });
    console.log('[before]', before);

    if (dryRun) {
      const [[would]] = await sequelize.query(
        `SELECT COUNT(*)::int AS n FROM candidates
         WHERE NULLIF(LOWER(TRIM(COALESCE(email, ''))), '') IS NOT NULL
           AND (
                 LOWER(TRIM(email)) ~ '@[^@]*(alljob|jobmaster|drushim|gotfriends|ethosia|linkedin|indeed|glassdoor|careerjet|nisha|sql\\.co\\.il)[^@]*$'
              OR LOWER(TRIM(email)) ~ '@([a-z0-9-]+\\.)+(hiro|humand)\\.co\\.il$'
              OR LOWER(TRIM(email)) ~ '^(noreply|no-reply|no_reply|donotreply|do-not-reply|mailer-daemon|postmaster|bounce|bounces|mailer|hiro|humand)@'
           )`,
        { transaction: t },
      );
      console.log('[dry-run] would update', would.n, 'rows');
      await t.rollback();
      return;
    }

    let meta;
    if (liveOnly) {
      const [ids] = await sequelize.query(
        `SELECT id FROM candidates
         WHERE "isDeleted" = false
           AND NULLIF(LOWER(TRIM(COALESCE(email, ''))), '') IS NOT NULL
           AND (
                 LOWER(TRIM(email)) ~ '@[^@]*(alljob|jobmaster|drushim|gotfriends|ethosia|linkedin|indeed|glassdoor|careerjet|nisha|sql\\.co\\.il)[^@]*$'
              OR LOWER(TRIM(email)) ~ '@([a-z0-9-]+\\.)+(hiro|humand)\\.co\\.il$'
              OR LOWER(TRIM(email)) ~ '^(noreply|no-reply|no_reply|donotreply|do-not-reply|mailer-daemon|postmaster|bounce|bounces|mailer|hiro|humand)@'
           )`,
        { transaction: t },
      );
      const idList = ids.map((r) => r.id);
      console.log('[live-only] ids', idList.length);
      if (idList.length) {
        [, meta] = await sequelize.query(
          `UPDATE candidates SET email = NULL, "updatedAt" = NOW() WHERE id = ANY($1::uuid[])`,
          { bind: [idList], transaction: t },
        );
      } else {
        meta = { rowCount: 0 };
      }
    } else {
      [, meta] = await sequelize.query(UPDATE_5A, { transaction: t });
    }
    const [[after]] = await sequelize.query(RECHECK, { transaction: t });
    console.log('[5a] updated rows', meta?.rowCount ?? meta);
    console.log('[after]', after);
    await t.commit();
    console.log('COMMIT ok');
  } catch (err) {
    await t.rollback();
    throw err;
  } finally {
    await sequelize.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
