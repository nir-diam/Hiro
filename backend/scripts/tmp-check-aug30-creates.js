const { sequelize } = require('../src/config/db');

(async () => {
  await sequelize.authenticate();

  const [rows] = await sequelize.query(`
    SELECT id, "fullName", email, "isDeleted", "resumeContentHash", "createdAt", "updatedAt"
    FROM candidates
    WHERE "createdAt" >= '2026-08-30 00:00:00+00' AND "createdAt" < '2026-08-31 00:00:00+00'
    ORDER BY "createdAt"
  `);
  console.log('candidates created Aug 30:', rows.length);
  console.log(JSON.stringify(rows, null, 2));

  const [deleted] = await sequelize.query(`
    SELECT id, "fullName", email, "isDeleted", "deletedAt", "createdAt", "updatedAt"
    FROM candidates
    WHERE "isDeleted" = true
      AND "updatedAt" >= '2026-08-30 13:00:00+00' AND "updatedAt" < '2026-08-30 13:45:00+00'
    ORDER BY "updatedAt"
  `);
  console.log('soft-deleted in window:', deleted.length);
  console.log(JSON.stringify(deleted, null, 2));

  const [uploads] = await sequelize.query(`
    SELECT "fileKey", subject, "candidateId", "createdAt"
    FROM email_uploads
    WHERE "createdAt" >= '2026-08-30 13:00:00+00' AND "createdAt" < '2026-08-30 13:45:00+00'
    ORDER BY "createdAt"
  `);
  console.log('email_uploads in window:', uploads.length);
  for (const u of uploads) {
    console.log(u.createdAt.toISOString(), u.fileKey?.slice(0, 40), u.subject?.slice(0, 50) || 'null', u.candidateId);
  }

  await sequelize.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
