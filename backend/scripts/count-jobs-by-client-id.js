const { connectDb, sequelize } = require('../src/config/db');

const CID = process.argv[2] || 'f1b12e27-0299-4b2a-930b-04e3bf8cb2bc';

async function main() {
  await connectDb();
  const [stats] = await sequelize.query(
    `SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE client_id = :cid)::int AS with_client_id,
      COUNT(*) FILTER (WHERE LOWER(TRIM(client)) = LOWER(TRIM('מימד אנושי')))::int AS label_mimed,
      COUNT(*) FILTER (WHERE "uniqueEmail" ILIKE '%humand+%')::int AS humand_inbox
    FROM jobs`,
    { replacements: { cid: CID } },
  );
  console.log('JOB STATS', stats[0]);

  const [byClient] = await sequelize.query(
    `SELECT client_id, COUNT(*)::int AS c FROM jobs GROUP BY client_id ORDER BY c DESC LIMIT 10`,
  );
  console.log('TOP clientId values', byClient);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
