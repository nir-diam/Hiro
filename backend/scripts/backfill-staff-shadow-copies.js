/**
 * One-time migration: ensure every non-deleted primary candidate has a staff shadow copy.
 *
 * Usage (from backend/):
 *   node scripts/backfill-staff-shadow-copies.js
 *   node scripts/backfill-staff-shadow-copies.js --limit=200
 *   node scripts/backfill-staff-shadow-copies.js --dry-run
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../src/.env') });
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { sequelize } = require('../src/config/db');
const Candidate = require('../src/models/Candidate');
const candidateService = require('../src/services/candidateService');
const { Op } = require('sequelize');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 500) : 500;

async function main() {
  await sequelize.authenticate();
  console.log('[backfill-staff-shadow] connected', { dryRun, limit });

  const primaries = await Candidate.findAll({
    where: {
      isDeleted: false,
      staffProfileCopy: false,
      [Op.or]: [{ canonicalCandidateId: null }, { canonicalCandidateId: { [Op.col]: 'id' } }],
    },
    attributes: ['id', 'fullName'],
    order: [['createdAt', 'ASC']],
    limit,
  });

  let created = 0;
  let existed = 0;
  let failed = 0;

  for (const row of primaries) {
    const id = String(row.id);
    try {
      if (dryRun) {
        const shadows = await Candidate.count({
          where: {
            isDeleted: false,
            staffProfileCopy: true,
            canonicalCandidateId: id,
          },
        });
        if (shadows > 0) existed += 1;
        else {
          created += 1;
          console.log('[dry-run] would create shadow for', id, row.fullName || '');
        }
        continue;
      }
      const result = await candidateService.ensureStaffShadowCopy(id);
      if (result.created) {
        created += 1;
        console.log('[created]', id, '→', result.shadow?.id);
      } else {
        existed += 1;
      }
    } catch (err) {
      failed += 1;
      console.error('[fail]', id, err.message || err);
    }
  }

  console.log('[backfill-staff-shadow] done', {
    scanned: primaries.length,
    created,
    existed,
    failed,
  });
  await sequelize.close();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await sequelize.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
