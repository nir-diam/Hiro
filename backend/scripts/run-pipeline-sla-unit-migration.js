/**
 * Adds sla_limit_unit to pipeline stage tables (safe to re-run).
 * Usage: node scripts/run-pipeline-sla-unit-migration.js
 */
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../src/.env') });

const { sequelize } = require('../src/config/db');

async function main() {
  const sqlPath = path.resolve(__dirname, '../src/migrations/add_pipeline_stage_sla_unit.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await sequelize.authenticate();
  await sequelize.query(sql);
  console.log('pipeline stage sla_limit_unit migration applied.');
  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
