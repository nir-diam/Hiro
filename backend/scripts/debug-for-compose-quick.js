const { sequelize, connectDb } = require('../src/config/db');

const CLIENT_ID = 'f1b12e27-0299-4b2a-930b-04e3bf8cb2bc';

async function main() {
  await connectDb();

  const [client] = await sequelize.query(
    'SELECT id, name, "displayName", domain, metadata FROM clients WHERE id = :id',
    { replacements: { id: CLIENT_ID } },
  );
  console.log('CLIENT:', client[0]);

  const orgId = client[0]?.metadata?.organizationId;
  if (orgId) {
    const [org] = await sequelize.query(
      'SELECT id, name, "nameEn", "legalName", aliases FROM organizations WHERE id = :id',
      { replacements: { id: orgId } },
    );
    console.log('ORG:', org[0]);
  }

  const [links] = await sequelize.query(
    `SELECT col.id, o.name AS org_name
     FROM client_organization_links col
     LEFT JOIN organizations o ON o.id = col.organization_id
     WHERE col.client_id = :id`,
    { replacements: { id: CLIENT_ID } },
  );
  console.log('LINKS:', links);

  const labels = [
    client[0]?.name,
    client[0]?.displayName,
    client[0]?.domain,
    ...(client[0]?.metadata?.aliases || []),
    client[0]?.metadata?.nameEn,
    client[0]?.metadata?.legalName,
  ].filter(Boolean);
  console.log('LABELS:', labels);

  for (const label of labels) {
    const [rows] = await sequelize.query(
      'SELECT id, title, client FROM jobs WHERE LOWER(TRIM(client)) = LOWER(TRIM(:label)) LIMIT 5',
      { replacements: { label } },
    );
    if (rows.length) console.log('MATCH', label, rows);
  }

  const [partial] = await sequelize.query(
    "SELECT id, title, client FROM jobs WHERE client ILIKE '%בדיקה%' OR client ILIKE '%bedika%' OR client ILIKE '%777%' LIMIT 20",
  );
  console.log('PARTIAL MATCHES:', partial);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
