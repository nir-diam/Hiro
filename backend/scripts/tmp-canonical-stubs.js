const { sequelize } = require('../src/config/db');

async function main() {
  await sequelize.authenticate();
  const [linked] = await sequelize.query(`
    SELECT id, "fullName", email, "isDeleted", "canonicalCandidateId", "inboundFromEmail", "createdAt", "updatedAt"
    FROM candidates
    WHERE "canonicalCandidateId" = '87d4e302-ded1-41c6-a7ae-b39889a89c1e'
    ORDER BY "createdAt"
  `);
  console.log('=== linked to 87d4e302 ===');
  console.log(JSON.stringify(linked, null, 2));

  const [deletedWindow] = await sequelize.query(`
    SELECT id, "fullName", email, "isDeleted", "inboundFromEmail", "createdAt", "updatedAt"
    FROM candidates
    WHERE "createdAt" BETWEEN '2026-08-30 13:00:00+00' AND '2026-08-30 13:45:00+00'
      AND "isDeleted" = true
    ORDER BY "createdAt"
  `);
  console.log('\n=== deleted created in window ===');
  console.log(JSON.stringify(deletedWindow, null, 2));

  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
