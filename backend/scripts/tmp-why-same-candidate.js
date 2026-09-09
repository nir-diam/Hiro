const { sequelize } = require('../src/config/db');

async function main() {
  await sequelize.authenticate();

  const [aug30Creates] = await sequelize.query(`
    SELECT id, "fullName", email, "inboundFromEmail", "resumeContentHash", "createdAt", "updatedAt"
    FROM candidates
    WHERE "createdAt"::date = '2026-08-30'
    ORDER BY "createdAt"
  `);
  console.log('=== all candidates created Aug 30 ===');
  console.log(JSON.stringify(aug30Creates, null, 2));

  const [firstUploadPerKey] = await sequelize.query(`
    WITH ranked AS (
      SELECT id, "candidateId", "fileKey", subject, "createdAt",
             ROW_NUMBER() OVER (PARTITION BY "fileKey" ORDER BY id ASC) AS rn
      FROM email_uploads
      WHERE "createdAt" BETWEEN '2026-08-30 12:50:00+00' AND '2026-08-30 13:35:00+00'
    )
    SELECT id, "candidateId", "fileKey", subject, "createdAt"
    FROM ranked WHERE rn = 1
    ORDER BY "createdAt"
  `);
  console.log('\n=== first upload per unique fileKey in window ===');
  console.log(JSON.stringify(firstUploadPerKey, null, 2));

  const [sharedInbound] = await sequelize.query(`
    SELECT id, "fullName", email, "inboundFromEmail", "isDeleted", "createdAt", "updatedAt"
    FROM candidates
    WHERE "inboundFromEmail" ILIKE '%humand.co.il%'
    ORDER BY "createdAt" DESC
    LIMIT 10
  `);
  console.log('\n=== candidates with humand inboundFromEmail ===');
  console.log(JSON.stringify(sharedInbound, null, 2));

  const [nullCandidateFirst] = await sequelize.query(`
    SELECT id, "candidateId", "fileKey", subject, "createdAt"
    FROM email_uploads
    WHERE id IN ('978','980','982','983')
    ORDER BY id
  `);
  console.log('\n=== failed uploads (null candidateId) ===');
  console.log(JSON.stringify(nullCandidateFirst, null, 2));

  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
