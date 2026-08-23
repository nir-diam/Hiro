require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize } = require('../src/config/db');
const { findExistingByIdentity } = require('../src/services/candidateIdentityService');
const candidateService = require('../src/services/candidateService');

(async () => {
  await sequelize.authenticate();

  const cols = await sequelize.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'candidates' AND column_name = 'canonicalCandidateId'`,
    { type: sequelize.QueryTypes.SELECT },
  );
  console.log('canonicalCandidateId column:', cols.length ? 'yes' : 'NO');

  const rows = await sequelize.query(
    `SELECT id, "fullName", email, phone, "userId", "canonicalCandidateId", "isDeleted", source, "createdAt"
     FROM candidates
     WHERE email ILIKE '%sigalitb73%' OR phone LIKE '%9015574%'
     ORDER BY "createdAt"`,
    { type: sequelize.QueryTypes.SELECT },
  );
  console.log('DB rows:', JSON.stringify(rows, null, 2));

  const dupId = 'd94b4616-767f-4e45-ac23-04f9c7a75166';
  const existing = await findExistingByIdentity({
    email: 'sigalitb73@gmail.com',
    phone: '050-9015574',
    excludeId: dupId,
  });
  console.log('findExistingByIdentity (exclude dup):', existing);

  for (const id of ['d94b4616-767f-4e45-ac23-04f9c7a75166', 'dadd0411-785d-4e7c-9453-3df3dd9d3fba']) {
    const [one] = await sequelize.query(
      `SELECT id, "fullName", email, phone, "userId", "canonicalCandidateId", "isDeleted", source, "createdAt"
       FROM candidates WHERE id = $1`,
      { bind: [id], type: sequelize.QueryTypes.SELECT },
    );
    console.log('by id', id, one || '(not found)');
  }

  const deleted = await sequelize.query(
    `SELECT id, "fullName", email, "isDeleted", source, "createdAt"
     FROM candidates
     WHERE "isDeleted" = true AND (email ILIKE '%sigalitb73%' OR id = $1)
     ORDER BY "createdAt" DESC`,
    { bind: ['d94b4616-767f-4e45-ac23-04f9c7a75166'], type: sequelize.QueryTypes.SELECT },
  );
  console.log('soft-deleted sigalit rows:', deleted);

  await sequelize.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
