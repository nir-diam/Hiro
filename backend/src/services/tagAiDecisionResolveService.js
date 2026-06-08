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

const applyReviewerActions = async ({ decisionIds = [], action, targetTagId }, resolvePendingFn) => {
  if (!Array.isArray(decisionIds) || !decisionIds.length) {
    const err = new Error('No decision IDs provided');
    err.status = 400;
    throw err;
  }

  const decisions = await TagAiDecision.findAll({
    where: { id: decisionIds, reviewStatus: 'pending_review' },
  });
  if (!decisions.length) {
    const err = new Error('No pending AI decisions found');
    err.status = 404;
    throw err;
  }

  const results = [];
  for (const decision of decisions) {
    const plain = decision.get ? decision.get({ plain: true }) : decision;
    const pendingTag = await Tag.findByPk(plain.pendingTagId);
    if (!pendingTag || String(pendingTag.status).toLowerCase() !== 'pending') {
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
