/**
 * Adds landing-page columns to job_publications (safe to re-run).
 * Usage: node scripts/run-job-publications-migration.js
 */
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../src/.env') });

const { sequelize } = require('../src/config/db');

async function main() {
  const sqlPath = path.resolve(__dirname, '../src/migrations/job_publications_landing_fields.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await sequelize.authenticate();
  await sequelize.query(sql);
  console.log('job_publications landing fields migration applied.');
  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
