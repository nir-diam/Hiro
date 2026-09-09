const { sequelize } = require('../src/config/db');

async function main() {
  await sequelize.authenticate();
  const ids = [
    'b31940da-fd53-4248-9974-688d46fd738c',
    'f1b12e27-0299-4b2a-930b-04e3bf8cb2bc',
  ];
  for (const id of ids) {
    const [rows] = await sequelize.query(
      `SELECT id, name, "displayName", "logoUrl", "primaryColor", metadata
       FROM clients WHERE id = $1::uuid`,
      { bind: [id] },
    );
    console.log('\n===', id, '===');
    console.log(JSON.stringify(rows[0], null, 2));
    const [links] = await sequelize.query(
      `SELECT l.id, l.is_primary, o.id AS org_id, o.name AS org_name, o.logo AS org_logo
       FROM client_organization_links l
       LEFT JOIN organizations o ON o.id = l.organization_id
       WHERE l.client_id = $1::uuid`,
      { bind: [id] },
    );
    console.log('org links:', JSON.stringify(links, null, 2));
  }
  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
