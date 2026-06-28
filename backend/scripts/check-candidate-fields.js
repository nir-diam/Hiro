require('dotenv').config();
const { sequelize } = require('../src/config/db');

(async () => {
  const [rows] = await sequelize.query(`
    SELECT id, "fullName", field, industry, source, "createdAt"
    FROM candidates
    WHERE "fullName" LIKE '%אלי כץ%'
    ORDER BY "createdAt" DESC
    LIMIT 5
  `);
  console.log('אלי כץ rows:', JSON.stringify(rows, null, 2));

  const [bad] = await sequelize.query(`
    SELECT field, COUNT(*)::int AS c
    FROM candidates
    WHERE field IS NOT NULL AND field <> ''
    GROUP BY field
    ORDER BY c DESC
    LIMIT 20
  `);
  console.log('top field values:', bad);
  await sequelize.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
