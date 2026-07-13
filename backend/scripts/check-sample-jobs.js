const { connectDb, sequelize } = require('../src/config/db');

const IDS = [
  'ecf960c8-03f7-4257-b437-d2f109d6251b',
  '69e85ca1-cc50-4580-8dd7-0d229d82d76f',
  '818972d2-47b2-4044-8dd0-fff49dd150ee',
];

async function main() {
  await connectDb();
  const [rows] = await sequelize.query(
    `SELECT id, client, client_id, "uniqueEmail" FROM jobs WHERE id IN (:ids)`,
    { replacements: { ids: IDS } },
  );
  console.table(rows);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
