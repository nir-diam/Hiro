/**
 * Backfill pinned staff shadow copies ("עותק צל") for every listable primary candidate.
 *
 * Why: the candidate list can be restricted to pinned shadows only (`staff_shadow_pinned`).
 * That view is useless while only 95 of ~4,900 candidates have a shadow — a name search
 * returns nothing, which reads as "the system is broken".
 *
 * This script creates the missing shadows through the SAME service the app uses
 * (`candidateService.ensureStaffShadowAfterReady`), so referential integrity, tag copying and
 * pinned-state rules are identical to a real ingest. It is idempotent: candidates that already
 * have a pinned shadow are skipped.
 *
 * Usage (from backend/):
 *   node scripts/backfill-staff-shadow-copies.js --dry-run
 *   node scripts/backfill-staff-shadow-copies.js --apply
 *   node scripts/backfill-staff-shadow-copies.js --apply --limit=200
 *   node scripts/backfill-staff-shadow-copies.js --apply --only=<candidateId>,<candidateId>
 *
 * Flags:
 *   --dry-run           Report what would be created; write nothing (default).
 *   --apply             Create the missing shadow copies.
 *   --limit=N           Process at most N primaries (useful for a first batch).
 *   --only=id,id        Restrict to these primary candidate ids.
 *   --concurrency=N     Parallel ensures (default 2 — the service copies tags per row).
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
const concurrency = Math.max(1, Number.parseInt(argValue('concurrency', '2'), 10) || 2);
const onlyIds = String(argValue('only', '') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const onlyFilter = onlyIds.length ? new Set(onlyIds) : null;

const log = (...parts) => console.log(...parts);

/**
 * Listable primaries with no pinned shadow yet.
 * Mirrors `buildCandidateListWhere` (primary kind): not deleted, not ingest-pending,
 * not itself a shadow copy, and the canonical row of its family.
 */
async function findPrimariesMissingPinnedShadow() {
  const rows = await sequelize.query(
    `
    SELECT c.id,
           c."fullName",
           c."createdAt",
           EXISTS (
             SELECT 1
               FROM candidates s0
              WHERE s0."canonicalCandidateId" = c.id
                AND s0."isDeleted" = false
                AND s0."staffProfileCopy" = true
           ) AS has_any_shadow
      FROM candidates c
     WHERE c."isDeleted" = false
       AND COALESCE(c."ingestPending", false) = false
       AND COALESCE(c."staffProfileCopy", false) = false
       AND c."canonicalCandidateId" IS NULL
       AND NOT EXISTS (
             SELECT 1
               FROM candidates s
              WHERE s."canonicalCandidateId" = c.id
                AND s."isDeleted" = false
                AND s."staffProfileCopy" = true
                AND s."staffShadowPinned" = true
           )
     ORDER BY c."createdAt" ASC
    `,
    { type: QueryTypes.SELECT },
  );

  const scoped = onlyFilter ? rows.filter((r) => onlyFilter.has(String(r.id))) : rows;
  return limit > 0 ? scoped.slice(0, limit) : scoped;
}

async function countCoverage() {
  const [row] = await sequelize.query(
    `
    SELECT
      (SELECT COUNT(*) FROM candidates
        WHERE "isDeleted" = false
          AND COALESCE("ingestPending", false) = false
          AND COALESCE("staffProfileCopy", false) = false
          AND "canonicalCandidateId" IS NULL) AS primaries,
      (SELECT COUNT(*) FROM candidates
        WHERE "isDeleted" = false
          AND COALESCE("staffProfileCopy", false) = true
          AND COALESCE("staffShadowPinned", false) = true) AS pinned_shadows
    `,
    { type: QueryTypes.SELECT },
  );
  return {
    primaries: Number(row?.primaries) || 0,
    pinnedShadows: Number(row?.pinned_shadows) || 0,
  };
}

async function runBatches(items, size, worker) {
  let idx = 0;
  let created = 0;
  let repaired = 0;
  let skipped = 0;
  let failed = 0;
  let done = 0;
  const total = items.length;
  const progressEvery = Math.max(25, Math.min(100, Math.floor(total / 20) || 25));

  const run = async () => {
    while (idx < items.length) {
      const current = items[idx++];
      try {
        const result = await worker(current);
        if (result?.created) created += 1;
        else if (result?.shadow) repaired += 1;
        else skipped += 1;
      } catch (err) {
        failed += 1;
        console.warn(`  FAILED ${current.id} ${current.fullName || ''}: ${err?.message || err}`);
      }
      done += 1;
      if (done % progressEvery === 0 || done === total) {
        log(`  … ${done}/${total} (new=${created} repaired=${repaired} failed=${failed})`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
  return { created, repaired, skipped, failed };
}

async function main() {
  await sequelize.authenticate();

  const before = await countCoverage();
  log(
    `${dryRun ? '[dry-run]' : '[apply]'} primaries=${before.primaries} `
    + `pinnedShadows=${before.pinnedShadows} `
    + `(${before.primaries ? Math.round((before.pinnedShadows / before.primaries) * 1000) / 10 : 0}% coverage)`,
  );

  const missing = await findPrimariesMissingPinnedShadow();
  if (!missing.length) {
    log('Nothing to do — every listable primary already has a pinned shadow.');
    await sequelize.close();
    return;
  }

  const needNewClone = missing.filter((r) => !r.has_any_shadow).length;
  const needPinOnly = missing.length - needNewClone;
  log(
    `\n${missing.length} primary candidate(s) without a pinned shadow:`
    + ` ${needNewClone} need new עותק צל, ${needPinOnly} have shadow but none pinned`,
  );
  for (const row of missing.slice(0, 20)) {
    const kind = row.has_any_shadow ? 'pin/repair' : 'create';
    log(` - ${row.id} | ${row.fullName || '—'} | ${kind} | created ${row.createdAt?.toISOString?.() || row.createdAt}`);
  }
  if (missing.length > 20) log(` ... and ${missing.length - 20} more`);

  if (dryRun) {
    log('\nDry run — nothing written. Re-run with --apply to create the shadow copies.');
    await sequelize.close();
    return;
  }

  log(`\nEnsuring shadows (concurrency ${concurrency})…`);
  const { created, repaired, skipped, failed } = await runBatches(missing, concurrency, (row) =>
    candidateService.ensureStaffShadowAfterReady(String(row.id), { force: true }),
  );

  const after = await countCoverage();
  log(
    `\nnewClones=${created} repairedExisting=${repaired} skipped=${skipped} failed=${failed}`
    + `\npinnedShadows ${before.pinnedShadows} → ${after.pinnedShadows} of ${after.primaries} primaries`
    + ` (${after.primaries ? Math.round((after.pinnedShadows / after.primaries) * 1000) / 10 : 0}%)`,
  );

  await sequelize.close();
  if (failed) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error('[backfill-staff-shadow-copies] failed', err?.message || err);
  try {
    await sequelize.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
