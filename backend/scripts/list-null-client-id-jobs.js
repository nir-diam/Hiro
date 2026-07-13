const { connectDb, sequelize } = require('../src/config/db');

async function main() {
  await connectDb();
  const [rows] = await sequelize.query(
    `SELECT id, client, client_id, "uniqueEmail" FROM jobs WHERE client_id IS NULL`,
  );
  console.table(rows);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
