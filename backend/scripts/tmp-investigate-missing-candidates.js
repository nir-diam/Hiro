const { sequelize } = require('../src/config/db');

async function main() {
  await sequelize.authenticate();

  const emails = [
    'almog8104@gmail.com',
    'batelsabhat@gmail.com',
    'ofersharon77@gmail.com',
    'urihav1995@gmail.com',
  ];

  const [rows] = await sequelize.query(
    `SELECT id, "fullName", email, phone, "isDeleted", "canonicalCandidateId",
            "ingestPending", source, "createdAt", "updatedAt"
     FROM candidates
     WHERE lower(trim(email)) = ANY($1::text[])
        OR "fullName" ILIKE ANY(ARRAY['%אלמוג%שרביט%','%בתאל%סבהט%','%עופר%שרון%','%אוריה%'])
     ORDER BY "createdAt" DESC`,
    { bind: [emails.map((e) => e.toLowerCase())] }
  );
  console.log('=== candidates (including deleted/linked) ===');
  console.log(JSON.stringify(rows, null, 2));

  const ids = rows.map((r) => r.id);
  if (ids.length) {
    const [uploads] = await sequelize.query(
      `SELECT id, "candidateId", "fileKey", subject, "from", "to", "createdAt"
       FROM email_uploads
       WHERE "candidateId" = ANY($1::uuid[])
       ORDER BY "createdAt" DESC`,
      { bind: [ids] }
    );
    console.log('=== email_uploads for those candidates ===');
    console.log(JSON.stringify(uploads, null, 2));
  }

  const [deletedSearch] = await sequelize.query(
    `SELECT id, "fullName", email, phone, "isDeleted", "canonicalCandidateId", "createdAt", "updatedAt"
     FROM candidates
     WHERE "isDeleted" = true
       AND ("createdAt" >= '2026-08-30' OR "updatedAt" >= '2026-08-30')
       AND (
         email ILIKE '%almog%' OR email ILIKE '%batel%' OR email ILIKE '%ofersharon%'
         OR "fullName" ILIKE '%אלמוג%' OR "fullName" ILIKE '%בתאל%' OR "fullName" ILIKE '%עופר%'
       )
     ORDER BY "updatedAt" DESC
     LIMIT 20`
  );
  console.log('=== soft-deleted candidates Aug 30 ===');
  console.log(JSON.stringify(deletedSearch, null, 2));

  const [linkedSearch] = await sequelize.query(
    `SELECT id, "fullName", email, "canonicalCandidateId", "isDeleted", "createdAt", "updatedAt"
     FROM candidates
     WHERE "canonicalCandidateId" IS NOT NULL
       AND ("createdAt" >= '2026-08-30' OR "updatedAt" >= '2026-08-30')
     ORDER BY "updatedAt" DESC
     LIMIT 30`
  );
  console.log('=== canonical-linked candidates Aug 30 ===');
  console.log(JSON.stringify(linkedSearch, null, 2));

  const [logs] = await sequelize.query(
    `SELECT timestamp, source, message,
            context->>'cvEmail' as cv_email,
            context->>'candidateId' as candidate_id,
            context
     FROM app_logs
     WHERE timestamp BETWEEN '2026-08-30 16:00:00+03' AND '2026-08-30 16:45:00+03'
       AND (
         source ILIKE '%email%'
         OR message ILIKE '%merge%'
         OR message ILIKE '%split%'
         OR message ILIKE '%routed%'
         OR message ILIKE '%duplicate%'
         OR message ILIKE '%soft-delete%'
         OR message ILIKE '%ingest%'
       )
     ORDER BY timestamp
     LIMIT 80`
  );
  console.log('=== app_logs email/merge around 16:00-16:45 ===');
  console.log(JSON.stringify(logs, null, 2));

  const [uploadsWindow] = await sequelize.query(
    `SELECT eu.id, eu."candidateId", eu."fileKey", eu.subject, eu."from", eu."to", eu."createdAt",
            c."fullName", c.email, c."isDeleted", c."canonicalCandidateId"
     FROM email_uploads eu
     LEFT JOIN candidates c ON c.id = eu."candidateId"
     WHERE eu."createdAt" BETWEEN '2026-08-30 16:00:00+03' AND '2026-08-30 16:45:00+03'
     ORDER BY eu."createdAt" DESC`
  );
  console.log('=== email_uploads in window ===');
  console.log(JSON.stringify(uploadsWindow, null, 2));

  const [cvLogs] = await sequelize.query(
    `SELECT id, timestamp,
            left(context->'inputJson'->'history'->0->>'text', 80) as cv_snippet,
            context->'outputJson'->>'email' as parsed_email,
            context->'outputJson'->>'fullName' as parsed_name,
            left(context->>'outputRaw', 120) as output_head
     FROM app_logs
     WHERE source ILIKE '%cv_parsing%'
       AND timestamp BETWEEN '2026-08-30 16:00:00+03' AND '2026-08-30 16:45:00+03'
     ORDER BY timestamp`
  );
  console.log('=== cv_parsing logs in window ===');
  console.log(JSON.stringify(cvLogs, null, 2));

  const [events] = await sequelize.query(
    `SELECT "createdAt", "eventType", "entityId", "entityName", params
     FROM system_events
     WHERE "createdAt" BETWEEN '2026-08-30 16:00:00+03' AND '2026-08-30 16:45:00+03'
       AND (
         "eventType" ILIKE '%merge%' OR "eventType" ILIKE '%CV%' OR "eventType" ILIKE '%identity%'
         OR params::text ILIKE '%almog%' OR params::text ILIKE '%batel%' OR params::text ILIKE '%ofersharon%'
       )
     ORDER BY "createdAt"
     LIMIT 50`
  ).catch(() => [[], null]);
  console.log('=== system_events in window ===');
  console.log(JSON.stringify(events, null, 2));

  const [canonicalTargets] = await sequelize.query(
    `SELECT c.id, c."fullName", c.email, c."isDeleted", c."canonicalCandidateId", c."updatedAt"
     FROM candidates c
     WHERE c.id IN (
       SELECT "canonicalCandidateId" FROM candidates
       WHERE "canonicalCandidateId" IS NOT NULL
         AND lower(trim(email)) = ANY($1::text[])
     )`,
    { bind: [emails.map((e) => e.toLowerCase())] }
  );
  console.log('=== canonical merge targets ===');
  console.log(JSON.stringify(canonicalTargets, null, 2));

  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
