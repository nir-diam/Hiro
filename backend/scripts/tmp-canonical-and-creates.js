const { sequelize } = require('../src/config/db');

(async () => {
  await sequelize.authenticate();
  const id = '87d4e302-ded1-41c6-a7ae-b39889a89c1e';

  const [canonical] = await sequelize.query(
    `SELECT id, "fullName", email, phone, "canonicalCandidateId", "isDeleted", "createdAt", "updatedAt"
     FROM candidates
     WHERE "canonicalCandidateId" = :id
     ORDER BY "createdAt"`,
    { replacements: { id } }
  );
  console.log('=== linked via canonicalCandidateId ===');
  console.log(JSON.stringify(canonical, null, 2));

  const [created] = await sequelize.query(
    `SELECT id, "fullName", email, phone, "canonicalCandidateId", "isDeleted", "createdAt"
     FROM candidates
     WHERE "createdAt" BETWEEN '2026-08-30 12:50:00+00' AND '2026-08-30 13:45:00+00'
     ORDER BY "createdAt"`,
  );
  console.log('=== all candidates created 12:50-13:45 UTC ===');
  console.log(JSON.stringify(created, null, 2));

  const emails = ['almog8104@gmail.com', 'batelsabhat@gmail.com', 'ofersharon77@gmail.com', 'urihav1995@gmail.com'];
  const [byEmail] = await sequelize.query(
    `SELECT id, "fullName", email, "isDeleted", "createdAt", "updatedAt"
     FROM candidates
     WHERE lower(email) = ANY(ARRAY[:emails]::text[])
     ORDER BY "createdAt"`,
    { replacements: { emails: emails.map((e) => e.toLowerCase()) } }
  );
  console.log('=== candidates by target emails (any time) ===');
  console.log(JSON.stringify(byEmail, null, 2));

  await sequelize.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
