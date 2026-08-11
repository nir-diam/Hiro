const { sequelize } = require('../src/config/db');
const { QueryTypes } = require('sequelize');

(async () => {
  const rows = await sequelize.query(
    `
    SELECT id, "fullName", email, phone, "userId", "canonicalCandidateId"
    FROM candidates
    WHERE "isDeleted" = false
      AND RIGHT(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 9) = '523872727'
    ORDER BY "createdAt" ASC
    `,
    { type: QueryTypes.SELECT },
  );
  console.log('All rows with phone 052-3872727:', rows.length);
  rows.forEach((r) => console.log(JSON.stringify(r)));

  const listRows = await sequelize.query(
    `
    SELECT id, "fullName", email, "canonicalCandidateId"
    FROM candidates
    WHERE "isDeleted" = false AND "canonicalCandidateId" IS NULL
      AND RIGHT(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 9) = '523872727'
    `,
    { type: QueryTypes.SELECT },
  );
  console.log('\nVisible in admin list (canonical null):', listRows.length);
  listRows.forEach((r) => console.log(JSON.stringify(r)));

  const emailRows = await sequelize.query(
    `
    SELECT id, "fullName", email, "canonicalCandidateId"
    FROM candidates
    WHERE "isDeleted" = false AND "canonicalCandidateId" IS NULL
      AND LOWER(TRIM(COALESCE(email, ''))) LIKE '%diamantnir%'
    `,
    { type: QueryTypes.SELECT },
  );
  console.log('\nVisible with diamantnir email:', emailRows.length);
  emailRows.forEach((r) => console.log(JSON.stringify(r)));

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
