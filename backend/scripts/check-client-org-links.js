const { connectDb, sequelize } = require('../src/config/db');
const { listLinksForClient } = require('../src/services/clientOrganizationSyncService');

(async () => {
  await connectDb();
  const [meta] = await sequelize.query(
    "SELECT id, metadata->>'organizationId' AS org_id FROM clients WHERE id = 'cdad1cf8-60d0-46b1-b4db-804adfdedbe8'",
  );
  console.log('meta', meta);
  const [links] = await sequelize.query('SELECT * FROM client_organization_links');
  console.log('all links', links);
  const rows = await listLinksForClient('cdad1cf8-60d0-46b1-b4db-804adfdedbe8');
  console.log('service links', rows.length);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
