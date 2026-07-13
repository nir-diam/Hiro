const { connectDb, sequelize } = require('../src/config/db');

const TENANT_ID = 'f1b12e27-0299-4b2a-930b-04e3bf8cb2bc';

async function q(label, sql, replacements = {}) {
  const [rows] = await sequelize.query(sql, { replacements });
  console.log('\n===', label, '===');
  console.table(rows);
}

async function main() {
  await connectDb();

  await q('How לקוח כללי got מימד client_id', `
    SELECT client, status, COUNT(*)::int AS jobs
    FROM jobs
    WHERE client_id = :tid AND client = 'לקוח כללי'
    GROUP BY client, status
  `, { tid: TENANT_ID });

  await q('Jobs stamped מימד but employer label is NOT מימד and NOT placement-like', `
    SELECT client, COUNT(*)::int AS jobs
    FROM jobs
    WHERE client_id = :tid
      AND client IN ('לקוח כללי', 'לקוח חדש', 'לא צוין')
    GROUP BY client
  `, { tid: TENANT_ID });

  await q('Should client_id be cleared? null client_id jobs', `
    SELECT client, "uniqueEmail", COUNT(*)::int AS jobs
    FROM jobs WHERE client_id IS NULL
    GROUP BY client, "uniqueEmail"
    ORDER BY jobs DESC LIMIT 15
  `);

  await q('Inbox-only scope vs client_id scope', `
    SELECT
      COUNT(*) FILTER (WHERE client_id = :tid)::int AS by_client_id,
      COUNT(*) FILTER (WHERE "uniqueEmail" ILIKE 'humand+%@app.hiro.co.il')::int AS by_humand_inbox,
      COUNT(*) FILTER (
        WHERE client_id = :tid AND "uniqueEmail" ILIKE 'humand+%@app.hiro.co.il'
      )::int AS both
    FROM jobs
  `, { tid: TENANT_ID });

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
