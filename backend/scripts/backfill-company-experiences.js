/**
 * One-time backfill: populate companyExperiences for all existing candidates
 * whose workExperience has data but companyExperiences is empty.
 *
 * Usage:  node backend/scripts/backfill-company-experiences.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../src/.env') });

const { sequelize, connectDb } = require('../src/config/db');
const { QueryTypes } = require('sequelize');

function parseEndYearForSort(endDate) {
  if (endDate == null) return 0;
  const s = String(endDate).trim();
  if (/present|כיום/i.test(s)) return 9999;
  const m = s.match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
}

function buildCompanyExperiences(workExperience, experience) {
  const list = Array.isArray(workExperience) && workExperience.length
    ? workExperience
    : Array.isArray(experience) && experience.length
      ? experience
      : [];

  return list
    .filter((e) => e && String(e.company || '').trim())
    .map((e) => {
      const endDate = e.endDate != null ? String(e.endDate).trim() : null;
      const startDate = e.startDate != null ? String(e.startDate).trim() : null;
      const isCurrent = !endDate || /present|כיום/i.test(endDate) || e.isCurrent === true;
      return {
        company:     String(e.company || '').trim(),
        industry:    String(e.companyIndustry || e.industry || e.companyField || '').trim(),
        sector:      String(e.sector || e.companyType || e.orgType || e.type || '').trim(),
        companySize: String(e.companySize || e.size || '').trim(),
        isCurrent,
        startDate:   startDate || null,
        endDate:     isCurrent ? null : (endDate || null),
      };
    })
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      const ea = a.endDate ? parseEndYearForSort(a.endDate) : 9999;
      const eb = b.endDate ? parseEndYearForSort(b.endDate) : 9999;
      if (ea !== eb) return eb - ea;
      const la = a.startDate ? (parseEndYearForSort(a.endDate || String(new Date().getFullYear())) - parseEndYearForSort(a.startDate)) : 0;
      const lb = b.startDate ? (parseEndYearForSort(b.endDate || String(new Date().getFullYear())) - parseEndYearForSort(b.startDate)) : 0;
      return lb - la;
    });
}

async function run() {
  await connectDb();

  const rows = await sequelize.query(
    `SELECT id, "workExperience", experience
     FROM candidates
     WHERE "isDeleted" = false
       AND (jsonb_array_length(COALESCE("companyExperiences",'[]'::jsonb)) = 0)
       AND (
         (jsonb_typeof("workExperience") = 'array' AND jsonb_array_length("workExperience") > 0)
         OR (jsonb_typeof(experience) = 'array' AND jsonb_array_length(experience) > 0)
       )`,
    { type: QueryTypes.SELECT },
  );

  console.log(`Found ${rows.length} candidates to backfill`);

  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const companyExperiences = buildCompanyExperiences(row.workExperience, row.experience);
      if (!companyExperiences.length) continue;

      await sequelize.query(
        `UPDATE candidates SET "companyExperiences" = $1::jsonb WHERE id = $2`,
        { bind: [JSON.stringify(companyExperiences), row.id], type: QueryTypes.UPDATE },
      );
      updated++;
      if (updated % 100 === 0) console.log(`  Updated ${updated}…`);
    } catch (e) {
      failed++;
      console.error(`  Failed for ${row.id}: ${e.message}`);
    }
  }

  console.log(`Done. Updated: ${updated}, Failed: ${failed}`);
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
