/**
 * Repair candidates damaged by job-board / ingest-inbox addresses stored as `candidates.email`.
 *
 * Background: when a CV had no contact email, the fallback chain could persist the envelope sender
 * (`alljobs@alljob.co.il`) or our own ingest inbox (`humand+123@app.hiro.co.il`). The duplicate
 * identity merge then folded every later applicant of that board into whichever candidate got the
 * address first, overwriting the survivor's title/experience and soft-deleting the new row.
 *
 * This script is deliberately conservative and idempotent:
 *   1. clears a system address from live candidates (`email` -> NULL), printing what it changed
 *   2. lists soft-deleted rows whose email is a system address (merge victims) with the merge target
 *      taken from the identity-merge journal, so they can be restored deliberately
 *   3. optionally restores rows with `--restore` (see flags)
 *
 * Usage (from backend/):
 *   node scripts/repair-system-email-candidates.js --dry-run
 *   node scripts/repair-system-email-candidates.js --report=out.json
 *   node scripts/repair-system-email-candidates.js --restore --since=2026-10-21 --only=uuid1,uuid2
 *
 * Flags:
 *   --dry-run            Print the plan; write nothing (default behaviour unless --restore).
 *   --restore            Apply fixes: clear system emails and (with --only) un-delete victim rows.
 *   --since=YYYY-MM-DD   Only consider rows updated on/after this date (default: 2026-10-21).
 *   --only=id,id         Restrict destructive steps to these candidate ids (comma separated).
 *   --report=path.json   Write the full finding set as JSON.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../src/.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../src/config/db');
const Candidate = require('../src/models/Candidate');
const { isSystemEmail } = require('../src/utils/systemEmailAddresses');

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const argValue = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const dryRun = !hasFlag('restore');
const since = argValue('since', '2026-10-21');
const reportPath = argValue('report', null);
const onlyIds = String(argValue('only', '') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const onlyFilter = onlyIds.length ? new Set(onlyIds) : null;
const inScope = (id) => !onlyFilter || onlyFilter.has(String(id));

const log = (...parts) => console.log(...parts);

async function findSystemEmailCandidates() {
  const rows = await sequelize.query(
    `SELECT id, "fullName", email, "isDeleted", "createdAt", "updatedAt", "inboundFromEmail"
     FROM candidates
     WHERE "updatedAt" >= :since
       AND COALESCE(email, '') <> ''
     ORDER BY "updatedAt" DESC`,
    { replacements: { since }, type: QueryTypes.SELECT },
  );
  return rows.filter((row) => isSystemEmail(row.email));
}

/** Merge targets recorded in the candidate journal when a row was folded into another. */
async function loadMergeJournal(candidateIds) {
  if (!candidateIds.length) return new Map();
  const rows = await sequelize.query(
    `SELECT id, "fullName", events
     FROM candidates
     WHERE id = ANY(:ids::uuid[])`,
    { replacements: { ids: candidateIds }, type: QueryTypes.SELECT },
  );
  const byDuplicate = new Map();
  for (const row of rows) {
    const events = Array.isArray(row.events) ? row.events : [];
    for (const evt of events) {
      const meta = evt?.metadata || {};
      if (meta.action !== 'identity_merged') continue;
      const dupId = meta.duplicateCandidateId ? String(meta.duplicateCandidateId) : null;
      if (!dupId) continue;
      byDuplicate.set(dupId, {
        primaryCandidateId: meta.primaryCandidateId ? String(meta.primaryCandidateId) : String(row.id),
        primaryName: row.fullName || null,
        eventAt: evt?.createdAt || evt?.timestamp || null,
      });
    }
  }
  return byDuplicate;
}

/**
 * Merge targets can also be recovered from the journal stored on the *victim* row
 * (`linkedTo`) when the merge was recorded from the other side.
 */
async function repair() {
  await sequelize.authenticate();
  log(`[repair-system-email] connected — ${dryRun ? 'DRY RUN' : 'APPLYING CHANGES'} (since ${since})`);

  const systemRows = await findSystemEmailCandidates();
  const live = systemRows.filter((r) => !r.isDeleted);
  const deleted = systemRows.filter((r) => r.isDeleted);

  log('\n=== live candidates holding a system email ===');
  log(`count: ${live.length}`);
  for (const row of live) {
    log(` - ${row.id} | ${row.fullName || '—'} | ${row.email} | inboundFrom=${row.inboundFromEmail || '—'} | updated=${row.updatedAt?.toISOString?.() || row.updatedAt}`);
  }

  log('\n=== soft-deleted rows with a system email (merge victims) ===');
  log(`count: ${deleted.length}`);
  const mergeJournal = await loadMergeJournal(deleted.map((r) => String(r.id)));
  for (const row of deleted) {
    const merge = mergeJournal.get(String(row.id));
    log(` - ${row.id} | ${row.fullName || '—'} | ${row.email} | mergedInto=${merge?.primaryCandidateId || 'unknown'}${merge?.primaryName ? ` (${merge.primaryName})` : ''} | updated=${row.updatedAt?.toISOString?.() || row.updatedAt}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun,
    since,
    liveSystemEmail: live,
    deletedSystemEmail: deleted.map((row) => ({
      ...row,
      mergedInto: mergeJournal.get(String(row.id)) || null,
    })),
  };

  if (!dryRun) {
    let cleared = 0;
    for (const row of live) {
      if (!inScope(row.id)) continue;
      await Candidate.update({ email: null }, { where: { id: row.id } });
      cleared += 1;
      log(`[cleared] ${row.id} email was ${row.email}`);
    }
    log(`\ncleared system email on ${cleared} live candidate(s)`);

    let restored = 0;
    // Restoring is destructive to the merge outcome, so require an explicit id list.
    if (onlyFilter) {
      for (const row of deleted) {
        if (!inScope(row.id)) continue;
        const victim = await Candidate.findByPk(row.id);
        if (!victim || !victim.isDeleted) continue;
        await Candidate.update(
          { isDeleted: false, email: null, canonicalCandidateId: null },
          { where: { id: row.id } },
        );
        restored += 1;
        log(`[restored] ${row.id} ${row.fullName || ''} (was merged into ${mergeJournal.get(String(row.id))?.primaryCandidateId || 'unknown'})`);
      }
      log(`restored ${restored} row(s)`);
    } else if (deleted.length) {
      log('note: no --only list supplied, so no rows were restored. Review the list above, then re-run with --only=<ids>.');
    }
    report.cleared = cleared;
    report.restored = restored;
  }

  if (reportPath) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    log(`\nreport written to ${reportPath}`);
  }

  await sequelize.close();
}

repair().catch(async (err) => {
  console.error('[repair-system-email] failed', err?.message || err);
  try {
    await sequelize.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
