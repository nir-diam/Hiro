/**
 * Pin the newest staff shadow for every candidate family that has shadows but none pinned.
 *
 * Why: `ensureStaffShadowCopyInner` pins the shadow it creates, but shadows also arrive through
 * bulk backfills and the legacy `create()` route, which strips `staffShadowPinned` from the
 * payload. Production ended up with 580 of 679 families having shadows and NO pinned shadow, so
 * the profile switcher showed an inactive, unpinned "עותק צל" and never defaulted to it.
 *
 * The service now self-heals on every `ensureStaffShadowAfterReady` call; this script repairs the
 * rows that already exist. Idempotent — families that already have a pinned shadow are skipped.
 *
 * Usage (from backend/):
 *   node scripts/pin-unpinned-staff-shadows.js --dry-run
 *   node scripts/pin-unpinned-staff-shadows.js --apply
 *   node scripts/pin-unpinned-staff-shadows.js --apply --limit=100
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../src/.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../src/config/db');
const candidateService = require('../src/services/candidateService');

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const argValue = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const apply = hasFlag('apply');
const dryRun = !apply;
const limit = Math.max(0, Number.parseInt(argValue('limit', '0'), 10) || 0);

const log = (...parts) => console.log(...parts);

/** Families whose live shadows exist but none of them is pinned. */
async function findUnpinnedFamilies() {
  const rows = await sequelize.query(
    `
    SELECT c."canonicalCandidateId" AS primary_id,
           p."fullName"               AS primary_name,
           COUNT(*)                   AS shadow_count
      FROM candidates c
      LEFT JOIN candidates p ON p.id = c."canonicalCandidateId"
     WHERE c."isDeleted" = false
       AND c."staffProfileCopy" = true
       AND c."canonicalCandidateId" IS NOT NULL
     GROUP BY c."canonicalCandidateId", p."fullName"
    HAVING COUNT(*) FILTER (WHERE c."staffShadowPinned" = true) = 0
     ORDER BY shadow_count DESC, primary_id
    `,
    { type: QueryTypes.SELECT },
  );
  return limit > 0 ? rows.slice(0, limit) : rows;
}

async function countState() {
  const [row] = await sequelize.query(
    `
    SELECT
      (SELECT COUNT(*) FROM candidates
        WHERE "isDeleted" = false AND "staffProfileCopy" = true) AS live_shadows,
      (SELECT COUNT(*) FROM candidates
        WHERE "isDeleted" = false AND "staffProfileCopy" = true
          AND "staffShadowPinned" = true) AS pinned_shadows
    `,
    { type: QueryTypes.SELECT },
  );
  return {
    liveShadows: Number(row?.live_shadows) || 0,
    pinnedShadows: Number(row?.pinned_shadows) || 0,
  };
}

async function main() {
  await sequelize.authenticate();

  const before = await countState();
  log(
    `${dryRun ? '[dry-run]' : '[apply]'} live shadows=${before.liveShadows} `
    + `pinned=${before.pinnedShadows}`,
  );

  const families = await findUnpinnedFamilies();
  if (!families.length) {
    log('Nothing to do — every family with shadows already has one pinned.');
    await sequelize.close();
    return;
  }

  log(`\n${families.length} candidate families have shadows but none pinned:`);
  for (const row of families.slice(0, 15)) {
    log(` - ${row.primary_id} | ${row.primary_name || '—'} | ${row.shadow_count} shadow(s)`);
  }
  if (families.length > 15) log(` ... and ${families.length - 15} more`);

  if (dryRun) {
    log('\nDry run — nothing written. Re-run with --apply to pin them.');
    await sequelize.close();
    return;
  }

  let pinned = 0;
  let failed = 0;
  for (const row of families) {
    try {
      await candidateService.ensurePinnedStaffShadowForPrimary(String(row.primary_id));
      pinned += 1;
    } catch (err) {
      failed += 1;
      if (failed <= 10) {
        console.warn(`  FAILED ${row.primary_id}: ${err?.message || err}`);
      }
    }
  }

  const after = await countState();
  log(
    `\nfamilies processed=${pinned} failed=${failed}`
    + `\npinned shadows ${before.pinnedShadows} → ${after.pinnedShadows}`
    + ` (of ${after.liveShadows} live shadows)`,
  );

  await sequelize.close();
  if (failed) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error('[pin-unpinned-staff-shadows] failed', err?.message || err);
  try {
    await sequelize.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
