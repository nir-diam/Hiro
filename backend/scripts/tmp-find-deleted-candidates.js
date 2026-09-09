const { sequelize } = require('../src/config/db');

const TARGET_EMAILS = [
  'almog8104@gmail.com',
  'batelsabhat@gmail.com',
  'ofersharon77@gmail.com',
  'urihav1995@gmail.com',
];

const TARGET_NAMES = ['אלמוג', 'בתאל', 'עופר', 'אוריה'];

const SHARED_ID = '87d4e302-ded1-41c6-a7ae-b39889a89c1e';

async function main() {
  await sequelize.authenticate();

  console.log('=== 1. candidates by email (including deleted) ===');
  const [byEmail] = await sequelize.query(
    `SELECT id, "fullName", email, phone, "isDeleted", "ingestPending", "canonicalCandidateId",
            "resumeContentHash", "createdAt", "updatedAt"
     FROM candidates
     WHERE lower(trim(email)) = ANY($1::text[])
     ORDER BY "updatedAt" DESC`,
    { bind: [TARGET_EMAILS.map((e) => e.toLowerCase())] },
  );
  console.log(JSON.stringify(byEmail, null, 2));

  console.log('\n=== 2. candidates by name fragment (including deleted, Aug 30 +/- 1 day) ===');
  const [byName] = await sequelize.query(
    `SELECT id, "fullName", email, phone, "isDeleted", "createdAt", "updatedAt"
     FROM candidates
     WHERE ("fullName" ILIKE ANY($1::text[]) OR "searchText" ILIKE ANY($1::text[]))
       AND "createdAt" >= '2026-08-29'::timestamptz
       AND "createdAt" < '2026-09-01'::timestamptz
     ORDER BY "createdAt"`,
    { bind: [TARGET_NAMES.map((n) => `%${n}%`)] },
  );
  console.log(JSON.stringify(byName, null, 2));

  console.log('\n=== 3. ALL soft-deleted candidates on Aug 30 (any update time) ===');
  const [deletedAug30] = await sequelize.query(
    `SELECT id, "fullName", email, phone, "isDeleted", "createdAt", "updatedAt"
     FROM candidates
     WHERE "isDeleted" = true
       AND ("createdAt"::date = '2026-08-30' OR "updatedAt"::date = '2026-08-30')
     ORDER BY "updatedAt"`,
  );
  console.log(JSON.stringify(deletedAug30, null, 2));

  console.log('\n=== 4. identity merge events on shared candidate 87d4e302 ===');
  const [mergeEvents] = await sequelize.query(
    `SELECT ev.elem
     FROM candidates c
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.events, '[]'::jsonb)) AS ev(elem)
     WHERE c.id = $1::uuid
       AND (
         ev.elem->>'type' ILIKE '%מיזוג%'
         OR ev.elem->'metadata'->>'action' = 'identity_merged'
       )
     ORDER BY ev.elem->>'timestamp' NULLS LAST`,
    { bind: [SHARED_ID] },
  );
  console.log(JSON.stringify(mergeEvents.map((r) => r.elem), null, 2));

  console.log('\n=== 5. ALL events on 87d4e302 on Aug 30 ===');
  const [eventsAug30] = await sequelize.query(
    `SELECT ev.elem
     FROM candidates c
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.events, '[]'::jsonb)) AS ev(elem)
     WHERE c.id = $1::uuid
       AND (ev.elem->>'timestamp')::timestamptz >= '2026-08-30'::timestamptz
       AND (ev.elem->>'timestamp')::timestamptz < '2026-08-31'::timestamptz
     ORDER BY ev.elem->>'timestamp'`,
    { bind: [SHARED_ID] },
  );
  console.log(JSON.stringify(eventsAug30.map((r) => r.elem), null, 2));

  console.log('\n=== 6. originalText versions on 87d4e302 (CV history) ===');
  const [orig] = await sequelize.query(
    `SELECT id, "fullName", email, jsonb_array_length(COALESCE("originalText", '[]'::jsonb)) AS version_count,
            "originalText", "searchText", "updatedAt"
     FROM candidates WHERE id = $1::uuid`,
    { bind: [SHARED_ID] },
  );
  if (orig[0]) {
    const row = { ...orig[0] };
    if (Array.isArray(row.originalText)) {
      row.originalText = row.originalText.map((v, i) => ({
        idx: i,
        savedAt: v.savedAt,
        textPreview: (v.text || '').slice(0, 200),
      }));
    }
    row.searchTextPreview = (row.searchText || '').slice(0, 300);
    delete row.searchText;
    console.log(JSON.stringify(row, null, 2));
  }

  console.log('\n=== 7. app_logs cv_parsing for target emails (Aug 30) ===');
  const [logs] = await sequelize.query(
    `SELECT id, source, level, message, metadata, "createdAt"
     FROM app_logs
     WHERE "createdAt" >= '2026-08-30'::timestamptz
       AND "createdAt" < '2026-08-31'::timestamptz
       AND source ILIKE '%cv_parsing%'
       AND (
         message ILIKE ANY($1::text[])
         OR metadata::text ILIKE ANY($1::text[])
       )
     ORDER BY "createdAt"`,
    { bind: [TARGET_EMAILS.map((e) => `%${e}%`)] },
  );
  console.log(JSON.stringify(logs, null, 2));

  console.log('\n=== 8. candidates whose events journal mentions target emails ===');
  const [journalHits] = await sequelize.query(
    `SELECT c.id, c."fullName", c.email, c."isDeleted", ev.elem
     FROM candidates c
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.events, '[]'::jsonb)) AS ev(elem)
     WHERE ev.elem::text ILIKE ANY($1::text[])
     LIMIT 50`,
    { bind: [TARGET_EMAILS.map((e) => `%${e}%`)] },
  );
  console.log(JSON.stringify(journalHits, null, 2));

  console.log('\n=== 9. email_uploads Aug 30 with null candidateId ===');
  const [nullUploads] = await sequelize.query(
    `SELECT id, "fileKey", subject, "candidateId", "createdAt"
     FROM email_uploads
     WHERE "createdAt" >= '2026-08-30 12:00:00+00'
       AND "createdAt" < '2026-08-30 14:00:00+00'
       AND "candidateId" IS NULL
     ORDER BY "createdAt"`,
  );
  console.log(JSON.stringify(nullUploads, null, 2));

  console.log('\n=== 10. any candidate ever had target email in searchText (deleted ok) ===');
  const [searchHits] = await sequelize.query(
    `SELECT id, "fullName", email, "isDeleted", "createdAt", "updatedAt",
            left("searchText", 120) AS search_preview
     FROM candidates
     WHERE "searchText" ILIKE ANY($1::text[])
     ORDER BY "updatedAt" DESC`,
    { bind: [TARGET_EMAILS.map((e) => `%${e}%`)] },
  );
  console.log(JSON.stringify(searchHits, null, 2));

  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
