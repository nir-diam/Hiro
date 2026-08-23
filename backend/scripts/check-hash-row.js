require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize } = require('../src/config/db');

(async () => {
  await sequelize.authenticate();
  const cols = await sequelize.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'candidates' AND column_name = 'resumeContentHash'`,
    { type: sequelize.QueryTypes.SELECT },
  );
  console.log('column exists:', cols.length > 0);

  const id = process.argv[2] || '091af7d8-2e30-4af3-8ff8-c12b7199c88f';
  const rows = await sequelize.query(
    `SELECT id, "resumeContentHash", "resumeUrl", "canonicalCandidateId", "isDeleted", "createdAt"
     FROM candidates WHERE id = $1`,
    { bind: [id], type: sequelize.QueryTypes.SELECT },
  );
  console.log('row:', rows[0] || null);
  await sequelize.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
