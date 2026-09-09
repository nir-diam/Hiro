const { sequelize } = require('../src/config/db');

async function main() {
  await sequelize.authenticate();

  const [rows] = await sequelize.query(`
    SELECT id, "candidateId", "fileKey", subject, "createdAt"
    FROM email_uploads
    WHERE id BETWEEN 970 AND 1005
    ORDER BY id
  `);
  console.log('=== uploads 970-1005 ===');
  console.log(JSON.stringify(rows, null, 2));

  const [rutFirst] = await sequelize.query(`
    SELECT id, "candidateId", "fileKey", subject, "createdAt"
    FROM email_uploads
    WHERE "candidateId" = '87d4e302-ded1-41c6-a7ae-b39889a89c1e'
    ORDER BY "createdAt"
    LIMIT 3
  `);
  console.log('=== first 3 uploads on shared candidate ===');
  console.log(JSON.stringify(rutFirst, null, 2));

  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
