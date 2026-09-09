const { sequelize } = require('../src/config/db');

async function main() {
  await sequelize.authenticate();

  const [deletedEver] = await sequelize.query(`
    SELECT id, "fullName", email, "isDeleted", "createdAt", "updatedAt"
    FROM candidates
    WHERE "isDeleted" = true
      AND (
        "fullName" ILIKE '%אלמוג%' OR "fullName" ILIKE '%בתאל%' OR "fullName" ILIKE '%עופר%'
        OR email ILIKE '%almog8104%' OR email ILIKE '%batelsabhat%' OR email ILIKE '%ofersharon77%'
      )
    ORDER BY "updatedAt" DESC
    LIMIT 20
  `);
  console.log('=== deleted ever with target names/emails ===');
  console.log(JSON.stringify(deletedEver, null, 2));

  const [sharedDocs] = await sequelize.query(`
    SELECT id, "fullName", email, documents, "resumeUrl",
           jsonb_array_length(COALESCE(documents, '[]'::jsonb)) AS doc_count
    FROM candidates WHERE id = '87d4e302-ded1-41c6-a7ae-b39889a89c1e'
  `);
  console.log('\n=== shared candidate documents ===');
  console.log(JSON.stringify(sharedDocs, null, 2));

  const [aug30Updates] = await sequelize.query(`
    SELECT id, "fullName", email, "isDeleted", "ingestPending", "createdAt", "updatedAt"
    FROM candidates
    WHERE "updatedAt" BETWEEN '2026-08-30 12:50:00+00' AND '2026-08-30 13:35:00+00'
    ORDER BY "updatedAt"
  `);
  console.log('\n=== all candidate updates 12:50-13:35 UTC ===');
  console.log(JSON.stringify(aug30Updates, null, 2));

  const [logs] = await sequelize.query(`
    SELECT id, source, level, message, context, timestamp
    FROM app_logs
    WHERE timestamp >= '2026-08-30'::timestamptz
      AND timestamp < '2026-08-31'::timestamptz
      AND source ILIKE '%cv_parsing%'
      AND context::text ILIKE ANY(ARRAY[
        '%almog8104@gmail.com%', '%batelsabhat@gmail.com%',
        '%ofersharon77@gmail.com%', '%urihav1995@gmail.com%'
      ])
    ORDER BY timestamp
  `);
  console.log('\n=== cv_parsing logs for target emails ===');
  console.log(JSON.stringify(logs.map((l) => ({
    id: l.id,
    timestamp: l.timestamp,
    source: l.source,
    candidateId: l.context?.candidateId || l.context?.inputJson?.candidateId || null,
    emailInOutput: l.context?.outputJson?.email || l.context?.output?.email || null,
    nameInOutput: l.context?.outputJson?.fullName || l.context?.output?.fullName || null,
  })), null, 2));

  const [uploadWindow] = await sequelize.query(`
    SELECT eu.id, eu."candidateId", eu."fileKey", eu.subject, eu."createdAt",
           c."fullName", c.email
    FROM email_uploads eu
    LEFT JOIN candidates c ON c.id = eu."candidateId"
    WHERE eu."createdAt" BETWEEN '2026-08-30 12:50:00+00' AND '2026-08-30 13:35:00+00'
    ORDER BY eu."createdAt"
  `);
  console.log('\n=== email uploads in incident window ===');
  console.log(JSON.stringify(uploadWindow, null, 2));

  const [jobLinks] = await sequelize.query(`
    SELECT jc.id, jc."candidateId", jc."jobId", jc."createdAt", c."fullName", c.email, c."isDeleted"
    FROM job_candidates jc
    JOIN candidates c ON c.id = jc."candidateId"
    WHERE c.email ILIKE ANY(ARRAY['%almog8104%','%batelsabhat%','%ofersharon77%','%urihav1995%'])
       OR c."fullName" ILIKE ANY(ARRAY['%אלמוג%','%בתאל%','%עופר%','%אוריה%'])
    ORDER BY jc."createdAt" DESC
    LIMIT 30
  `);
  console.log('\n=== job_candidates for target names/emails ===');
  console.log(JSON.stringify(jobLinks, null, 2));

  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
