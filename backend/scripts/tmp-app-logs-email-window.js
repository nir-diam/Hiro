const { sequelize } = require('../src/config/db');

async function main() {
  await sequelize.authenticate();
  const [logs] = await sequelize.query(`
    SELECT timestamp, source, message, context
    FROM app_logs
    WHERE timestamp BETWEEN '2026-08-30 12:50:00+00' AND '2026-08-30 13:35:00+00'
      AND (
        source ILIKE '%email%'
        OR message ILIKE '%[email]%'
        OR message ILIKE '%reusing candidate%'
        OR message ILIKE '%routed ingest%'
        OR message ILIKE '%created new candidate%'
        OR message ILIKE '%duplicate resume%'
        OR message ILIKE '%duplicate S3%'
      )
    ORDER BY timestamp
    LIMIT 100
  `);
  console.log('count:', logs.length);
  for (const row of logs) {
    const ctx = row.context ? JSON.stringify(row.context).slice(0, 250) : '';
    console.log(
      row.timestamp.toISOString(),
      '|',
      row.source,
      '|',
      row.message,
      ctx ? '| ' + ctx : '',
    );
  }
  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
