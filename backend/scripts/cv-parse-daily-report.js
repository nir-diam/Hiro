/**
 * Yesterday's CV intake: how many arrived, how many failed, at which stage, by source.
 *
 *   node scripts/cv-parse-daily-report.js
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { sequelize } = require('../src/config/db');
const { buildCvParseDailyReport, formatCvParseDailyReport } = require('../src/services/cvParseReportService');

async function main() {
  await sequelize.authenticate();
  const report = await buildCvParseDailyReport(new Date());
  console.log(formatCvParseDailyReport(report));
  await sequelize.close();
}

main().catch((err) => {
  console.error('[cv-parse-report] failed', err?.message || err);
  process.exit(1);
});
