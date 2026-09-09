const { sequelize } = require('../src/config/db');

async function main() {
  await sequelize.authenticate();

  const [early] = await sequelize.query(
    `SELECT id, "candidateId", "from", subject, "fileKey", "createdAt"
     FROM email_uploads
     WHERE "candidateId" = '87d4e302-ded1-41c6-a7ae-b39889a89c1e'
     ORDER BY "createdAt" ASC
     LIMIT 10`
  );
  console.log('=== first 10 uploads to shared candidate ===');
  console.log(JSON.stringify(early, null, 2));

  const [candidateHistory] = await sequelize.query(
    `SELECT id, "fullName", email, phone, "inboundFromEmail", "resumeContentHash",
            "isDeleted", "createdAt", "updatedAt", "ingestPending"
     FROM candidates
     WHERE id = '87d4e302-ded1-41c6-a7ae-b39889a89c1e'`
  );
  console.log('=== candidate row ===');
  console.log(JSON.stringify(candidateHistory[0], null, 2));

  const [emailMatches] = await sequelize.query(
    `SELECT id, "fullName", email, "createdAt", "updatedAt"
     FROM candidates
     WHERE email IN ('almog8104@gmail.com', 'batelsabhat@gmail.com', 'ofersharon77@gmail.com', 'urihav1995@gmail.com', 'hr@humand.co.il')
     ORDER BY email`
  );
  console.log('=== candidates by parsed emails ===');
  console.log(JSON.stringify(emailMatches, null, 2));

  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
