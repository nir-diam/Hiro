const { connectDb, sequelize } = require('../src/config/db');

const CID = 'f1b12e27-0299-4b2a-930b-04e3bf8cb2bc';

async function main() {
  await connectDb();

  const [nonHumand] = await sequelize.query(
    `SELECT id, client, client_id, "uniqueEmail"
     FROM jobs
     WHERE client_id = :cid
       AND ("uniqueEmail" IS NULL OR "uniqueEmail" NOT ILIKE '%humand+%')
     LIMIT 20`,
    { replacements: { cid: CID } },
  );
  console.log('מימד client_id but NOT humand inbox:', nonHumand.length);
  console.table(nonHumand);

  const [otherTenantHumand] = await sequelize.query(
    `SELECT id, client, client_id, "uniqueEmail"
     FROM jobs
     WHERE client_id IS DISTINCT FROM :cid
       AND "uniqueEmail" ILIKE '%humand+%'
     LIMIT 20`,
    { replacements: { cid: CID } },
  );
  console.log('humand inbox but different/null client_id:', otherTenantHumand.length);
  console.table(otherTenantHumand);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
