/**
 * Merge duplicate AI-created pending catalog tags into the canonical active tag that already
 * owns the same identity (tagKey / display names).
 *
 * Background: `ensureTagRecord` used to skip an existing catalog tag when the LLM-detected
 * type disagreed with the stored type, then created a second `pending` row with the same
 * tagKey. `forklift_license` (type=tool, pending) was cloned next to the existing
 * `forklift_license` (type=certification, active). The AI then saw only *same-type*
 * candidates, so it proposed "create" instead of "merge".
 *
 * Now fixed in code, but the already-created duplicates still sit in the review queue.
 * This script finds them and applies the same merge the reviewer would: candidate/job links
 * move to the canonical tag, the term is recorded as an alias, the decision is closed, and
 * the duplicate pending tag is removed (children cleared first — the FK is not cascading).
 *
 * Usage (from backend/):
 *   node scripts/merge-duplicate-pending-tags.js --dry-run
 *   node scripts/merge-duplicate-pending-tags.js --apply
 *   node scripts/merge-duplicate-pending-tags.js --apply --only=38d75496-2375-4aee-b0f4-38adbf07fbcb
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../src/.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../src/config/db');
const Tag = require('../src/models/Tag');
const TagAiDecision = require('../src/models/TagAiDecision');

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const argValue = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const apply = hasFlag('apply');
const dryRun = !apply;
const onlyIds = String(argValue('only', '') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const onlyFilter = onlyIds.length ? new Set(onlyIds) : null;

const log = (...parts) => console.log(...parts);
const norm = (value) => String(value || '').trim().toLowerCase();

/**
 * Every pending tag whose identity (tagKey or both display names) also exists as an active tag.
 * @returns {Promise<Array<{ duplicate: object, canonical: object }>>}
 */
async function findDuplicatePairs() {
  const rows = await sequelize.query(
    `SELECT id, tag_key, display_name_he, display_name_en, status, type, usage_count
       FROM tags
      WHERE lower(COALESCE(status::text, '')) = 'pending'
      ORDER BY created_at ASC`,
    { type: QueryTypes.SELECT },
  );

  const scoped = onlyFilter ? rows.filter((row) => onlyFilter.has(String(row.id))) : rows;
  const pairs = [];

  for (const duplicate of scoped) {
    const key = norm(duplicate.tag_key);
    const he = norm(duplicate.display_name_he);
    const en = norm(duplicate.display_name_en);

    const candidates = [];
    if (key) {
      candidates.push(
        ...(await sequelize.query(
          `SELECT id, tag_key, display_name_he, display_name_en, status, type, usage_count
             FROM tags
            WHERE lower(COALESCE(status::text, '')) = 'active'
              AND lower(trim(COALESCE(tag_key, ''))) = :key
            LIMIT 5`,
          { replacements: { key }, type: QueryTypes.SELECT },
        )),
      );
    }
    if (he && en) {
      candidates.push(
        ...(await sequelize.query(
          `SELECT id, tag_key, display_name_he, display_name_en, status, type, usage_count
             FROM tags
            WHERE lower(COALESCE(status::text, '')) = 'active'
              AND lower(trim(COALESCE(display_name_he, ''))) = :he
              AND lower(trim(COALESCE(display_name_en, ''))) = :en
            LIMIT 5`,
          { replacements: { he, en }, type: QueryTypes.SELECT },
        )),
      );
    }

    const unique = [...new Map(candidates.map((c) => [String(c.id), c])).values()];
    if (!unique.length) continue;

    // Prefer the most-used canonical tag; ties break on the older row (returned first).
    unique.sort((a, b) => (Number(b.usage_count) || 0) - (Number(a.usage_count) || 0));
    pairs.push({ duplicate, canonical: unique[0] });
  }

  return pairs;
}

/** Count the rows that block a tags DELETE (system_tags + tag_histories have no cascade). */
async function countChildren(tagId) {
  const [row] = await sequelize.query(
    `SELECT
       (SELECT count(*) FROM system_tags WHERE tag_id = :id) AS system_tags,
       (SELECT count(*) FROM tag_histories WHERE tag_id = :id) AS tag_histories`,
    { replacements: { id: tagId }, type: QueryTypes.SELECT },
  );
  return {
    systemTags: Number(row?.system_tags) || 0,
    tagHistories: Number(row?.tag_histories) || 0,
  };
}

async function main() {
  log(`${dryRun ? '[dry-run]' : '[apply]'} scanning for duplicate pending catalog tags…`);

  const pairs = await findDuplicatePairs();
  if (!pairs.length) {
    log('No duplicates found.');
    return;
  }

  for (const { duplicate, canonical } of pairs) {
    const children = await countChildren(duplicate.id);
    log(
      `\n• "${duplicate.display_name_he || duplicate.tag_key}" `
      + `pending(${duplicate.type}) ${duplicate.id}`
      + `  →  active(${canonical.type}) ${canonical.id}`
      + `  [links: ${children.systemTags}, history: ${children.tagHistories}]`,
    );

    if (dryRun) continue;

    try {
      const { resolvePendingTags } = require('../src/controllers/tagController');
      await resolvePendingTags({
        ids: [duplicate.id],
        action: 'link',
        targetTagId: canonical.id,
        aliasPriority: 4,
        bypassStatusCheck: true,
      });

      // The FK is ON DELETE SET NULL, so the decision row survives with pending_tag_id = NULL.
      const decisions = await TagAiDecision.findAll({
        where: { pendingTagId: duplicate.id },
      });
      for (const decision of decisions) {
        await decision.update({
          reviewStatus: 'approved',
          reviewerAction: 'merge',
          resolvedAt: new Date(),
          resolvedTargetTagId: canonical.id,
        });
      }

      log(`  merged; ${decisions.length} decision(s) closed`);
    } catch (err) {
      console.error(`  FAILED: ${err?.message || err}`);
      process.exitCode = 1;
    }
  }

  if (dryRun) {
    log('\nDry run — nothing written. Re-run with --apply to merge.');
  }
}

main()
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error(err);
    await sequelize.close().catch(() => {});
    process.exit(1);
  });
