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

  await q('Tenant record', `
    SELECT id, name, "displayName", domain
    FROM clients WHERE id = :tid
  `, { tid: TENANT_ID });

  await q('Jobs by client_id (top tenants)', `
    SELECT client_id, COUNT(*)::int AS jobs
    FROM jobs
    GROUP BY client_id
    ORDER BY jobs DESC
    LIMIT 10
  `);

  await q('מימד jobs: employer label distribution', `
    SELECT client AS employer_label, COUNT(*)::int AS jobs
    FROM jobs
    WHERE client_id = :tid
    GROUP BY client
    ORDER BY jobs DESC
    LIMIT 30
  `, { tid: TENANT_ID });

  await q('מימד jobs: inbox prefix breakdown', `
    SELECT
      CASE
        WHEN "uniqueEmail" ILIKE '%humand+%' THEN 'humand inbox'
        WHEN "uniqueEmail" IS NULL OR TRIM("uniqueEmail") = '' THEN 'no inbox'
        ELSE 'other inbox'
      END AS inbox_type,
      COUNT(*)::int AS jobs
    FROM jobs
    WHERE client_id = :tid
    GROUP BY 1
    ORDER BY jobs DESC
  `, { tid: TENANT_ID });

  await q('Jobs with employer רפא / אורד / פרישמן', `
    SELECT id, client, client_id, "uniqueEmail", status, "openDate"
    FROM jobs
    WHERE client_id = :tid
      AND (
        client ILIKE '%רפא%'
        OR client ILIKE '%אורד%'
        OR client ILIKE '%פרישמן%'
      )
    ORDER BY "openDate" DESC NULLS LAST
    LIMIT 15
  `, { tid: TENANT_ID });

  await q('humand inbox jobs NOT stamped מימד', `
    SELECT id, client, client_id, "uniqueEmail"
    FROM jobs
    WHERE "uniqueEmail" ILIKE '%humand+%'
      AND (client_id IS NULL OR client_id <> :tid)
    LIMIT 20
  `, { tid: TENANT_ID });

  await q('Jobs stamped מימד but NOT humand inbox', `
    SELECT id, client, client_id, "uniqueEmail"
    FROM jobs
    WHERE client_id = :tid
      AND ("uniqueEmail" IS NULL OR "uniqueEmail" NOT ILIKE '%humand+%')
    LIMIT 20
  `, { tid: TENANT_ID });

  await q('Label match: job.client = tenant name (מימד אנושי only)', `
    SELECT COUNT(*)::int AS jobs
    FROM jobs
    WHERE client_id = :tid
      AND LOWER(TRIM(client)) = LOWER(TRIM('מימד אנושי'))
  `, { tid: TENANT_ID });

  await q('Users linked to מימד tenant', `
    SELECT id, email, role, "clientId"
    FROM users
    WHERE "clientId" = :tid
  `, { tid: TENANT_ID });

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
