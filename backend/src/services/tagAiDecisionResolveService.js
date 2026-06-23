const Tag = require('../models/Tag');
const TagAiDecision = require('../models/TagAiDecision');
const tagHybridSearchService = require('./tagHybridSearchService');

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
    const pendingTag = await Tag.findByPk(plain.pendingTagId);

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

    if (!pendingTag || String(pendingTag.status).toLowerCase() !== 'pending') {
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
          console.log(`[tagAiDecisionResolve] merged non-pending tag ${plain.pendingTagId} → ${mapped.targetTagId} (bypass)`);
        } catch (mergeErr) {
          console.warn(`[tagAiDecisionResolve] bypass merge failed for ${plain.pendingTagId}:`, mergeErr?.message);
        }
      }
      decision.reviewStatus = 'overridden';
      decision.reviewerAction = action;
      decision.resolvedAt = new Date();
      await decision.save();
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
    await decision.save();
    results.push(decision.id);
  }

  return { success: true, resolvedIds: results };
};

module.exports = {
  mapReviewerAction,
  applyReviewerActions,
};
