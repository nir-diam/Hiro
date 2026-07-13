const { Op } = require('sequelize');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Tag = require('../models/Tag');
const TagAiDecision = require('../models/TagAiDecision');
const tagHybridSearchService = require('./tagHybridSearchService');

const normalizeTagKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

const normalizeTermForMatch = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, ' / ');

const wasPreviouslyMerged = (plain) =>
  plain.aiDecision === 'merge'
  || plain.reviewerAction === 'merge'
  || plain.reviewerAction === 'auto_merge';

const mapDetectedTypeToTagType = (detectedType) => {
  const t = String(detectedType || 'skill').toLowerCase().trim();
  if (t === 'education') return 'degree';
  if (t === 'unknown') return 'skill';
  return t;
};

const findTagIdByAliasTerm = async (term) => {
  const normalized = normalizeTermForMatch(term);
  if (!normalized) return null;

  const rows = await sequelize.query(
    `
    SELECT id
    FROM public.tags
    WHERE lower(COALESCE(status::text, '')) = 'active'
      AND (
        EXISTS (
          SELECT 1
          FROM unnest(COALESCE(aliases, ARRAY[]::text[])) AS alias
          WHERE lower(
            regexp_replace(
              regexp_replace(trim(COALESCE(alias, '')), '\\s+', ' ', 'g'),
              '\\s*/\\s*', ' / ', 'g'
            )
          ) = :normalized
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(synonyms, '[]'::jsonb)) AS syn_elem
          WHERE jsonb_typeof(syn_elem) = 'object'
            AND lower(
              regexp_replace(
                regexp_replace(
                  trim(COALESCE(syn_elem->>'name', syn_elem->>'phrase', '')),
                  '\\s+',
                  ' ',
                  'g'
                ),
                '\\s*/\\s*', ' / ', 'g'
              )
            ) = :normalized
        )
      )
    ORDER BY usage_count DESC NULLS LAST
    LIMIT 1;
    `,
    { replacements: { normalized }, type: QueryTypes.SELECT },
  );
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  return row?.id || null;
};

const tagDisplayNameMatches = (tag, originalTerm) => {
  if (!tag) return false;
  const target = normalizeTermForMatch(originalTerm);
  return [tag.displayNameHe, tag.displayNameEn, tag.tagKey].some(
    (value) => normalizeTermForMatch(value) === target,
  );
};

const resolveMergeTargetTagId = async (plain) => {
  const originalTerm = String(plain.originalTerm || '').trim();
  const targetName = String(plain.aiSuggestedTarget || '').trim();

  const byAlias = await findTagIdByAliasTerm(originalTerm);
  if (byAlias) return byAlias;

  const snapshot = Array.isArray(plain.candidateTagsSnapshot) ? plain.candidateTagsSnapshot : [];
  if (targetName) {
    const snapMatch = snapshot.find(
      (candidate) => normalizeTermForMatch(candidate?.name) === normalizeTermForMatch(targetName),
    );
    if (snapMatch?.tagId) return snapMatch.tagId;
  }

  if (!targetName) return null;

  const catalogType = mapDetectedTypeToTagType(plain.detectedType);
  for (const tagType of [catalogType, plain.detectedType, null]) {
    const resolvedId = await tagHybridSearchService.resolveTargetTagIdByName(
      targetName,
      tagType ? { tagType } : {},
    );
    if (resolvedId) return resolvedId;
  }
  return null;
};

const removeTermFromTargetTag = async (targetTag, term) => {
  const target = normalizeTermForMatch(term);
  if (!target || !targetTag) return false;

  let changed = false;
  const existingAliases = Array.isArray(targetTag.aliases) ? [...targetTag.aliases] : [];
  const nextAliases = existingAliases.filter(
    (alias) => normalizeTermForMatch(alias) !== target,
  );
  if (nextAliases.length !== existingAliases.length) {
    targetTag.aliases = nextAliases;
    changed = true;
  }

  const existingSynonyms = Array.isArray(targetTag.synonyms) ? [...targetTag.synonyms] : [];
  const nextSynonyms = existingSynonyms.filter((entry) => {
    const name = typeof entry === 'string' ? entry : (entry?.name || entry?.phrase || '');
    return normalizeTermForMatch(name) !== target;
  });
  if (nextSynonyms.length !== existingSynonyms.length) {
    targetTag.synonyms = nextSynonyms;
    changed = true;
  }

  if (changed) {
    await targetTag.save({ fields: ['aliases', 'synonyms'] });
    const tagEmbeddingService = require('./tagEmbeddingService');
    tagEmbeddingService.scheduleTagEmbedding(targetTag);
    console.log(
      `[tagAiDecisionResolve] removed alias "${term}" from tag "${targetTag.displayNameHe || targetTag.tagKey}"`,
    );
  }
  return changed;
};

/** Remove originalTerm from any catalog tag that holds it as alias/synonym (incl. prior auto-merges). */
const removeTermIfUsedAsAlias = async (originalTerm) => {
  const trimmed = String(originalTerm || '').trim();
  if (!trimmed) return false;

  const tagId = await findTagIdByAliasTerm(trimmed);
  if (!tagId) return false;

  const tag = await Tag.findByPk(tagId);
  if (!tag) return false;
  return removeTermFromTargetTag(tag, trimmed);
};

const findActiveTagByDisplayName = async (originalTerm) => {
  const normalized = normalizeTermForMatch(originalTerm);
  if (!normalized) return null;

  return Tag.findOne({
    where: {
      status: 'active',
      [Op.or]: [
        sequelize.where(
          sequelize.fn(
            'lower',
            sequelize.fn(
              'regexp_replace',
              sequelize.fn('trim', sequelize.col('display_name_he')),
              '\\s+',
              ' ',
              'g',
            ),
          ),
          normalized,
        ),
        sequelize.where(
          sequelize.fn(
            'lower',
            sequelize.fn(
              'regexp_replace',
              sequelize.fn('trim', sequelize.col('display_name_en')),
              '\\s+',
              ' ',
              'g',
            ),
          ),
          normalized,
        ),
      ],
    },
  });
};

const applyCreateOverride = async (plain, resolvePendingFn, pendingTag, pendingStatus) => {
  const originalTerm = String(plain.originalTerm || '').trim();
  if (!originalTerm) {
    const err = new Error('Missing original term on decision');
    err.status = 400;
    throw err;
  }

  // Always strip alias/synonym entries first — even when AI said "create" and the term
  // was previously auto-merged onto another catalog tag.
  await removeTermIfUsedAsAlias(originalTerm);

  const pendingMatchesTerm = tagDisplayNameMatches(pendingTag, originalTerm);

  if (pendingTag && pendingStatus === 'pending' && pendingMatchesTerm) {
    await resolvePendingFn({
      ids: [pendingTag.id],
      action: 'create',
      bypassStatusCheck: true,
    });
    const reloaded = await Tag.findByPk(pendingTag.id);
    console.log(`[tagAiDecisionResolve] activated pending tag "${originalTerm}" (${pendingTag.id})`);
    return reloaded || pendingTag;
  }

  if (pendingTag && pendingStatus === 'active' && pendingMatchesTerm) {
    return pendingTag;
  }

  const existing = await findActiveTagByDisplayName(originalTerm);
  if (existing) {
    console.log(`[tagAiDecisionResolve] active tag already exists for "${originalTerm}" (${existing.id})`);
    return existing;
  }

  const tagKey = normalizeTagKey(originalTerm) || `tag_${Date.now()}`;
  const tagType = mapDetectedTypeToTagType(plain.detectedType);

  const tag = await Tag.create({
    tagKey,
    displayNameHe: originalTerm,
    displayNameEn: originalTerm,
    type: tagType,
    source: 'ai',
    status: 'active',
    qualityState: 'initial_detection',
  });

  const tagEmbeddingService = require('./tagEmbeddingService');
  tagEmbeddingService.scheduleTagEmbedding(tag);
  console.log(`[tagAiDecisionResolve] created active tag "${originalTerm}" (${tag.id})`);
  return tag;
};

/** @deprecated use applyCreateOverride */
const revertMergeAliasAndCreateTag = applyCreateOverride;

/**
 * Map UI / reviewer action to resolvePending action + optional targetTagId.
 */
const mapReviewerAction = async (action, decisionRow, targetTagId, pendingTagType) => {
  const normalized = String(action || '').toLowerCase();
  if (normalized === 'create') {
    return { resolveAction: 'create', targetTagId: null };
  }
  if (normalized === 'delete') {
    return { resolveAction: 'ignore', targetTagId: null };
  }
  if (normalized === 'merge') {
    let resolvedTargetId = targetTagId || null;
    if (!resolvedTargetId && decisionRow.aiSuggestedTarget) {
      resolvedTargetId = await tagHybridSearchService.resolveTargetTagIdByName(
        decisionRow.aiSuggestedTarget,
        { tagType: pendingTagType },
      );
    }
    if (!resolvedTargetId) {
      const err = new Error('Merge requires a target tag');
      err.status = 400;
      throw err;
    }
    return { resolveAction: 'link', targetTagId: resolvedTargetId };
  }
  const err = new Error('Invalid action');
  err.status = 400;
  throw err;
};

const applyReviewerActions = async ({ decisionIds = [], action, targetTagId, aliasPriority = 3 }, resolvePendingFn) => {
  if (!Array.isArray(decisionIds) || !decisionIds.length) {
    const err = new Error('No decision IDs provided');
    err.status = 400;
    throw err;
  }

  // 'undo_blacklist' restores a blacklisted decision back to pending_review and tag back to pending.
  if (action === 'undo_blacklist') {
    const decisions = await TagAiDecision.findAll({
      where: { id: decisionIds, reviewerAction: 'blacklist' },
    });
    for (const decision of decisions) {
      const pendingTag = await Tag.findByPk(decision.pendingTagId);
      if (pendingTag && String(pendingTag.status).toLowerCase() === 'deprecated') {
        pendingTag.status = 'pending';
        await pendingTag.save({ fields: ['status'] });
      }
      decision.reviewStatus = 'pending_review';
      decision.reviewerAction = null;
      decision.resolvedAt = null;
      await decision.save();
    }
    return { success: true, resolvedIds: decisions.map((d) => d.id) };
  }

  // 'undo_manual' resets decisions from manual_queue back to pending_review without touching the tag.
  if (action === 'undo_manual') {
    const decisions = await TagAiDecision.findAll({
      where: { id: decisionIds, reviewStatus: 'manual_queue' },
    });
    for (const decision of decisions) {
      decision.reviewStatus = 'pending_review';
      decision.reviewerAction = null;
      decision.resolvedAt = null;
      await decision.save();
    }
    return { success: true, resolvedIds: decisions.map((d) => d.id) };
  }

  // 'manual' moves the decision to manual_queue without resolving the pending tag.
  if (action === 'manual') {
    const decisions = await TagAiDecision.findAll({
      where: { id: decisionIds, reviewStatus: 'pending_review' },
    });
    for (const decision of decisions) {
      decision.reviewStatus = 'manual_queue';
      decision.reviewerAction = 'manual';
      decision.resolvedAt = new Date();
      await decision.save();
    }
    return { success: true, resolvedIds: decisions.map((d) => d.id) };
  }

  // Find by ID only — a reviewer can override any decision regardless of its current status
  const decisions = await TagAiDecision.findAll({
    where: { id: decisionIds },
  });
  if (!decisions.length) {
    const err = new Error('No AI decisions found for the given IDs');
    err.status = 404;
    throw err;
  }

  const results = [];
  for (const decision of decisions) {
    const plain = decision.get ? decision.get({ plain: true }) : decision;
    const pendingTag = plain.pendingTagId ? await Tag.findByPk(plain.pendingTagId) : null;
    const pendingStatus = pendingTag ? String(pendingTag.status).toLowerCase() : null;

    // 'blacklist' — mark the tag as deprecated so it won't be re-detected, close the decision.
    if (action === 'blacklist') {
      if (pendingTag) {
        pendingTag.status = 'deprecated';
        await pendingTag.save({ fields: ['status'] });
      }
      decision.reviewStatus = 'overridden';
      decision.reviewerAction = 'blacklist';
      decision.resolvedAt = new Date();
      await decision.save();
      results.push(decision.id);
      continue;
    }

    // Create override — always undo merge alias first, then activate pending tag or create catalog tag.
    if (action === 'create') {
      const createdTag = await applyCreateOverride(plain, resolvePendingFn, pendingTag, pendingStatus);
      decision.reviewStatus = plain.aiDecision === 'create' ? 'approved' : 'overridden';
      decision.reviewerAction = action;
      decision.aiDecision = 'create';
      decision.resolvedAt = new Date();
      if (createdTag?.id) {
        decision.pendingTagId = createdTag.id;
      }
      await decision.save();
      results.push(decision.id);
      continue;
    }

    if (!pendingTag || pendingStatus !== 'pending') {
      // For 'merge': tag may have already been processed/deprecated but candidates still
      // need to be reassigned to the target and the alias must be recorded.
      // Use bypassStatusCheck so resolvePendingFn does the work regardless of tag status.
      if (action === 'merge' && pendingTag) {
        try {
          const mapped = await mapReviewerAction(action, plain, targetTagId, pendingTag.type);
          await resolvePendingFn({
            ids: [plain.pendingTagId],
            action: mapped.resolveAction,
            targetTagId: mapped.targetTagId,
            aliasPriority,
            bypassStatusCheck: true,
          });
          decision.resolvedTargetTagId = mapped.targetTagId;
          console.log(`[tagAiDecisionResolve] merged non-pending tag ${plain.pendingTagId} → ${mapped.targetTagId} (bypass)`);
        } catch (mergeErr) {
          console.warn(`[tagAiDecisionResolve] bypass merge failed for ${plain.pendingTagId}:`, mergeErr?.message);
        }
      } else if (action === 'merge') {
        try {
          const mapped = await mapReviewerAction(action, plain, targetTagId, plain.detectedType);
          decision.resolvedTargetTagId = mapped.targetTagId;
        } catch (_) { /* best-effort */ }
      }
      decision.reviewStatus = 'overridden';
      decision.reviewerAction = action;
      decision.resolvedAt = new Date();
      await decision.save();
      results.push(decision.id);
      continue;
    }

    const mapped = await mapReviewerAction(action, plain, targetTagId, pendingTag.type);
    await resolvePendingFn({
      ids: [plain.pendingTagId],
      action: mapped.resolveAction,
      targetTagId: mapped.targetTagId,
      aliasPriority,
    });

    decision.reviewStatus = action === plain.aiDecision ? 'approved' : 'overridden';
    decision.reviewerAction = action;
    decision.resolvedAt = new Date();
    if (action === 'merge') {
      decision.resolvedTargetTagId = mapped.targetTagId;
    }
    await decision.save();
    results.push(decision.id);
  }

  return { success: true, resolvedIds: results };
};

module.exports = {
  mapReviewerAction,
  applyReviewerActions,
  removeTermFromTargetTag,
  revertMergeAliasAndCreateTag,
  applyCreateOverride,
};
