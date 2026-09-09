const { sequelize } = require('../src/config/db');

async function main() {
  await sequelize.authenticate();

  const [c] = await sequelize.query(
    `SELECT id, "fullName", email, "resumeContentHash", "resumeUrl", "createdAt", "updatedAt"
     FROM candidates WHERE id = '87d4e302-ded1-41c6-a7ae-b39889a89c1e'`
  );
  console.log('=== uriah candidate ===');
  console.log(JSON.stringify(c[0], null, 2));

  const [created] = await sequelize.query(
    `SELECT id, "fullName", email, "isDeleted", "createdAt", "updatedAt"
     FROM candidates
     WHERE "createdAt" BETWEEN '2026-08-30 13:00:00+00' AND '2026-08-30 13:45:00+00'
     ORDER BY "createdAt"`
  );
  console.log('=== candidates created 13:00-13:45 UTC ===');
  console.log(JSON.stringify(created, null, 2));

  const [deleted] = await sequelize.query(
    `SELECT id, "fullName", email, "isDeleted", "createdAt", "updatedAt"
     FROM candidates
     WHERE "updatedAt" BETWEEN '2026-08-30 13:00:00+00' AND '2026-08-30 13:45:00+00'
       AND "isDeleted" = true
     ORDER BY "updatedAt"`
  );
  console.log('=== soft-deleted in window ===');
  console.log(JSON.stringify(deleted, null, 2));

  const keys = [
    'incoming/2g60i677g0h3kbnpr4h2loljci2hjh63me0h6b81',
    'incoming/22kmauq2adgjuqf6b4npkaa8fme01nedpqa0ce01',
    'incoming/3inn6o4eql6fgvqi0asqbqnaqorqmtj6376luo81',
    'incoming/b37n3fug8o2r941jlt8uro8j4n25h1cl4aq2c601',
    'incoming/1p89f5bflqor3cdi3n1t54akpsnb4rrv5trubmo1',
  ];
  const [uploads] = await sequelize.query(
    `SELECT id, "candidateId", "fileKey", subject, "createdAt"
     FROM email_uploads WHERE "fileKey" = ANY($1::text[]) ORDER BY "fileKey", "createdAt"`,
    { bind: [keys] }
  );
  console.log('=== target file uploads ===');
  console.log(JSON.stringify(uploads, null, 2));

  const [hashDupes] = await sequelize.query(
    `SELECT id, "fullName", email, "resumeContentHash", "isDeleted", "createdAt"
     FROM candidates
     WHERE "resumeContentHash" IS NOT NULL
       AND "updatedAt" BETWEEN '2026-08-30 13:00:00+00' AND '2026-08-30 13:45:00+00'
     ORDER BY "updatedAt"`
  );
  console.log('=== candidates with resumeContentHash updated in window ===');
  console.log(JSON.stringify(hashDupes, null, 2));

  const [allUriahUploads] = await sequelize.query(
    `SELECT id, "fileKey", subject, "createdAt"
     FROM email_uploads
     WHERE "candidateId" = '87d4e302-ded1-41c6-a7ae-b39889a89c1e'
     ORDER BY "createdAt"`
  );
  console.log('=== all uploads linked to uriah (count=' + allUriahUploads.length + ') ===');
  console.log(JSON.stringify(allUriahUploads, null, 2));

  const [anyHash] = await sequelize.query(
    `SELECT id, "fullName", email, "resumeContentHash", "createdAt", "updatedAt"
     FROM candidates
     WHERE "resumeContentHash" = '3556a5df0f02a4c4ee82f2f18716cb2fcd12cc0892d8b7ad0881edcacf0ce99f'`
  );
  console.log('=== candidates with uriah current hash ===');
  console.log(JSON.stringify(anyHash, null, 2));

  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
