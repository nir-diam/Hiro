require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { sequelize } = require('../src/config/db');

(async () => {
  const [cols] = await sequelize.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jobs'
      AND column_name ILIKE 'lastopened%'
    ORDER BY 1
  `);
  console.log('columns:', cols);
  await sequelize.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
