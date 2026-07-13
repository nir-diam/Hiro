const { connectDb, sequelize } = require('../src/config/db');

const TENANT_ID = 'f1b12e27-0299-4b2a-930b-04e3bf8cb2bc';
const PLACEHOLDERS = ['לקוח כללי', 'לקוח חדש', 'לא צוין'];

async function q(label, sql, replacements = {}) {
  const [rows] = await sequelize.query(sql, { replacements });
  console.log('\n===', label, '===');
  console.table(rows);
  return rows;
}

async function main() {
  await connectDb();

  await q('Status breakdown', `
    SELECT status, COUNT(*)::int AS jobs
    FROM jobs WHERE client_id = :tid
    GROUP BY status ORDER BY jobs DESC
  `, { tid: TENANT_ID });

  await q('Open + real employer (not placeholder)', `
    SELECT COUNT(*)::int AS jobs
    FROM jobs
    WHERE client_id = :tid
      AND status = 'פתוחה'
      AND client NOT IN (:placeholders)
  `, { tid: TENANT_ID, placeholders: PLACEHOLDERS });

  await q('Open employers list', `
    SELECT client, COUNT(*)::int AS jobs
    FROM jobs
    WHERE client_id = :tid
      AND status = 'פתוחה'
      AND client NOT IN (:placeholders)
    GROUP BY client ORDER BY jobs DESC
  `, { tid: TENANT_ID, placeholders: PLACEHOLDERS });

  await q('Publication activity', `
    SELECT
      COUNT(DISTINCT j.id)::int AS total_jobs,
      COUNT(DISTINCT jp."jobId")::int AS has_publication_row,
      COUNT(DISTINCT jp."jobId") FILTER (WHERE jp."heroImageUrl" IS NOT NULL)::int AS has_hero,
      COUNT(DISTINCT jp."jobId") FILTER (WHERE jp."visitCount" > 0)::int AS has_visits,
      COUNT(DISTINCT jp."jobId") FILTER (
        WHERE jp."trackingLinks" IS NOT NULL AND jp."trackingLinks"::text <> '[]'
      )::int AS has_tracking_links
    FROM jobs j
    LEFT JOIN job_publications jp ON jp."jobId" = j.id
    WHERE j.client_id = :tid
  `, { tid: TENANT_ID });

  await q('Jobs with visits or submissions', `
    SELECT COUNT(DISTINCT j.id)::int AS jobs_with_activity
    FROM jobs j
    LEFT JOIN job_publications jp ON jp."jobId" = j.id
    LEFT JOIN job_candidates jc ON jc."jobId" = j.id AND jc.source LIKE 'public_apply:%'
    WHERE j.client_id = :tid
      AND (
        COALESCE(jp."visitCount", 0) > 0
        OR jc.id IS NOT NULL
        OR jp."heroImageUrl" IS NOT NULL
      )
  `, { tid: TENANT_ID });

  await q('Recommended publishing scope: open, non-placeholder', `
    SELECT id, client, status, "openDate"
    FROM jobs
    WHERE client_id = :tid
      AND status = 'פתוחה'
      AND client NOT IN (:placeholders)
    ORDER BY "openDate" DESC
    LIMIT 25
  `, { tid: TENANT_ID, placeholders: PLACEHOLDERS });

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
