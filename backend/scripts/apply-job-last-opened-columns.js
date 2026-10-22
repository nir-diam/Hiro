require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { sequelize } = require('../src/config/db');

(async () => {
  await sequelize.query(`
    ALTER TABLE jobs
      ADD COLUMN IF NOT EXISTS "lastOpenedByUserId" UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "lastOpenedByName" TEXT NULL,
      ADD COLUMN IF NOT EXISTS "lastOpenedAt" TIMESTAMPTZ NULL;
  `);
  console.log('Applied jobs lastOpened* columns.');
  await sequelize.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
