const { connectDb, sequelize } = require('../src/config/db');

const TENANT_ID = 'f1b12e27-0299-4b2a-930b-04e3bf8cb2bc';

async function q(label, sql, replacements = {}) {
  const [rows] = await sequelize.query(sql, { replacements });
  console.log('\n===', label, '===');
  console.table(rows);
  return rows;
}

async function main() {
  await connectDb();

  await q('מימד linked organizations', `
    SELECT col.id, col.is_primary,
           COALESCE(o.name, ot.name) AS org_name
    FROM client_organization_links col
    LEFT JOIN organizations o ON o.id = col.organization_id
    LEFT JOIN organization_tmps ot ON ot.id = col.organization_tmp_id
    WHERE col.client_id = :tid
    ORDER BY col.is_primary DESC, org_name
    LIMIT 30
  `, { tid: TENANT_ID });

  await q('Jobs matching linked org names', `
    WITH orgs AS (
      SELECT LOWER(TRIM(COALESCE(o.name, ot.name))) AS name
      FROM client_organization_links col
      LEFT JOIN organizations o ON o.id = col.organization_id
      LEFT JOIN organization_tmps ot ON ot.id = col.organization_tmp_id
      WHERE col.client_id = :tid
    )
    SELECT COUNT(*)::int AS jobs
    FROM jobs j
    WHERE j.client_id = :tid
      AND LOWER(TRIM(j.client)) IN (SELECT name FROM orgs)
  `, { tid: TENANT_ID });

  await q('Status breakdown for מימד jobs', `
    SELECT status, COUNT(*)::int AS jobs
    FROM jobs WHERE client_id = :tid
    GROUP BY status ORDER BY jobs DESC
  `, { tid: TENANT_ID });

  await q('Placeholder employer labels', `
    SELECT client, COUNT(*)::int AS jobs
    FROM jobs
    WHERE client_id = :tid
      AND client IN ('לקוח חדש', 'לקוח כללי', 'לא צוין')
    GROUP BY client
  `, { tid: TENANT_ID });

  await q('Jobs with job_publications row', `
    SELECT
      COUNT(DISTINCT j.id)::int AS mimed_jobs,
      COUNT(DISTINCT jp."jobId")::int AS with_publication,
      COUNT(DISTINCT jp."jobId") FILTER (WHERE jp."heroImageUrl" IS NOT NULL)::int AS with_hero
    FROM jobs j
    LEFT JOIN job_publications jp ON jp."jobId" = j.id
    WHERE j.client_id = :tid
  `, { tid: TENANT_ID });

  await q('Admin vs tenant: jobs without client_id that use humand', `
    SELECT COUNT(*)::int AS null_client_humand
    FROM jobs
    WHERE client_id IS NULL AND "uniqueEmail" ILIKE '%humand+%'
  `);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
