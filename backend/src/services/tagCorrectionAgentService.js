const path = require('path');
const dotenv = require('dotenv');
const { Op } = require('sequelize');
const Tag = require('../models/Tag');
const TagAiDecision = require('../models/TagAiDecision');
const SystemTag = require('../models/SystemTag');
const TagCorrectionPlatformSettings = require('../models/TagCorrectionPlatformSettings');
const ClientUsageSetting = require('../models/ClientUsageSetting');
const promptService = require('./promptService');
const { sendChat, resolveGeminiApiKey } = require('./geminiService');
const tagHybridSearchService = require('./tagHybridSearchService');
const tagEmbeddingService = require('./tagEmbeddingService');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PROMPT_ID = 'tag_correction_agent';

const parseAgentJson = (text) => {
  const trimmed = String(text || '').trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    const err = new Error('Agent returned no JSON');
    err.status = 502;
    throw err;
  }
  const parsed = JSON.parse(match[0]);
  const action = String(parsed.action || '').toLowerCase();
  if (!['merge', 'create', 'delete'].includes(action)) {
    const err = new Error('Invalid agent action');
    err.status = 502;
    throw err;
  }
  return {
    action,
    target_tag: parsed.target_tag != null ? String(parsed.target_tag) : null,
    reasoning: String(parsed.reasoning || '').trim(),
    hesitation_level: typeof parsed.hesitation_level === 'number'
      ? Math.max(0, Math.min(100, Math.round(parsed.hesitation_level)))
      : null,
    dilemma_reasoning: parsed.dilemma_reasoning ? String(parsed.dilemma_reasoning).trim() : null,
  };
};

const ensurePlatformSettingsRow = async () => {
  let row = await TagCorrectionPlatformSettings.findByPk(1);
  if (!row) {
    row = await TagCorrectionPlatformSettings.create({ id: 1, agentEnabled: true });
  }
  return row;
};

const isPlatformAgentEnabled = async () => {
  const row = await ensurePlatformSettingsRow();
  return row.agentEnabled !== false;
};

const setPlatformAgentEnabled = async (enabled) => {
  const row = await ensurePlatformSettingsRow();
  row.agentEnabled = Boolean(enabled);
  await row.save();
  return { agentEnabled: row.agentEnabled };
};

const isClientAgentEnabled = async (clientId) => {
  if (!clientId) return true;
  const row = await ClientUsageSetting.findByPk(clientId);
  if (!row) return true;
  const plain = row.get ? row.get({ plain: true }) : row;
  return plain.tagCorrectionAgentEnabled !== false;
};

const mapDetectedType = (tagType) => {
  const t = String(tagType || 'skill').toLowerCase().trim();
  // Map all catalog Tag.type values to a display-friendly label.
  // 'degree' is stored as 'education' in the UI for readability.
  if (t === 'degree') return 'education';
  const knownTypes = ['skill', 'role', 'tool', 'education', 'certification', 'language', 'seniority', 'industry', 'soft_skill', 'unknown'];
  return knownTypes.includes(t) ? t : 'skill';
};

/** When Gemini is unavailable, use best hybrid match so reviewers still get a queue row. */
const heuristicDecision = (originalTerm, hybrid = []) => {
  const term = String(originalTerm || '').trim().toLowerCase();
  const noise = [
    'רישיון',
    'נהיגה',
    'תחביב',
    'גיל',
    'מין',
    'driver',
    'license',
    'hobby',
    'hobbies',
  ];
  if (noise.some((n) => term.includes(n))) {
    return {
      action: 'delete',
      target_tag: null,
      reasoning: 'נראה כמידע לא מקצועי — דורש אישור ידני (ללא Gemini)',
      hesitation_level: 5,
      dilemma_reasoning: 'מונח אוטומטי שזוהה כרעש — ביטחון גבוה',
    };
  }

  const vectorTop = hybrid.find((h) => h.source === 'vector' && (h.score || 0) >= 0.82);
  if (vectorTop?.name) {
    return {
      action: 'merge',
      target_tag: vectorTop.name,
      reasoning: `התאמה סמנטית גבוהה ל-${vectorTop.name} (ללא Gemini)`,
      hesitation_level: 10,
      dilemma_reasoning: 'התאמה סמנטית גבוהה מאוד — ביטחון גבוה',
    };
  }

  const fuzzyTop = hybrid.find((h) => h.source === 'fuzzy');
  if (fuzzyTop?.name) {
    return {
      action: 'merge',
      target_tag: fuzzyTop.name,
      reasoning: `התאמה טקסטואלית ל-${fuzzyTop.name} (ללא Gemini)`,
      hesitation_level: 28,
      dilemma_reasoning: 'התאמה טקסטואלית חלקית — ביטחון בינוני',
    };
  }

  return {
    action: 'create',
    target_tag: null,
    reasoning: 'לא נמצאה התאמה — הצעה ליצירת תגית (ללא Gemini)',
    hesitation_level: 18,
    dilemma_reasoning: 'לא נמצאה התאמה קיימת — נדרשת יצירת תגית חדשה',
  };
};

const normalizeAgentDecision = (parsed, candidateNames) => {
  // Normalize LLM typo "manuel" → "manual"
  const action = parsed.action === 'manuel' ? 'manual' : (parsed.action || 'create');
  let aiSuggestedTarget = parsed.target_tag;
  if (action === 'merge' && aiSuggestedTarget) {
    const exact = candidateNames.find((n) => n === aiSuggestedTarget);
    if (!exact) {
      const ci = candidateNames.find(
        (n) => n.toLowerCase() === String(aiSuggestedTarget).toLowerCase(),
      );
      if (ci) aiSuggestedTarget = ci;
    }
  } else if (action !== 'merge') {
    aiSuggestedTarget = null;
  }
  return {
    action,
    aiSuggestedTarget,
    reasoning: parsed.reasoning,
    hesitationLevel: parsed.hesitation_level ?? null,
    dilemmaReasoning: parsed.dilemma_reasoning ?? null,
  };
};

const runDecisionForPendingTag = async (pendingTagId, contextSample = '') => {
  const tag = await Tag.findByPk(pendingTagId);
  if (!tag || String(tag.status).toLowerCase() !== 'pending') return null;

  const existing = await TagAiDecision.findOne({
    where: { pendingTagId, reviewStatus: 'pending_review' },
  });
  if (existing) return existing;

  const originalTerm = String(tag.displayNameHe || tag.displayNameEn || tag.tagKey || '').trim();
  const hybrid = await tagHybridSearchService.findHybridCandidates(originalTerm, contextSample, {
    tagType: tag.type,
  });
  const candidateNames = hybrid.map((h) => h.name).filter(Boolean);

  const promptRow = await promptService.ensureById(PROMPT_ID);
  if (!promptRow) {
    const err = new Error(`Prompt ${PROMPT_ID} not found`);
    err.status = 500;
    throw err;
  }

  const userPayload = {
    original_term: originalTerm,
    detected_type: mapDetectedType(tag.type),
    context_sample: contextSample || tag.category || tag.internalNote || 'AI detection',
    candidate_tags: candidateNames,
  };

  let decision;
  const apiKey = resolveGeminiApiKey();
  try {
    if (!apiKey) {
      throw new Error('Gemini API key not configured');
    }
    const reply = await sendChat({
      apiKey,
      systemPrompt: promptRow.template,
      message: JSON.stringify(userPayload),
      responseMimeType: 'application/json',
      generationConfig: {
        temperature: promptRow.temperature ?? 0.1,
        maxOutputTokens: 1024,
      },
    });
    decision = normalizeAgentDecision(parseAgentJson(reply), candidateNames);
  } catch (geminiErr) {
    console.warn(
      '[tagCorrectionAgent] Gemini failed, using heuristic',
      pendingTagId,
      geminiErr?.message || geminiErr,
    );
    decision = normalizeAgentDecision(heuristicDecision(originalTerm, hybrid), candidateNames);
  }

  tagEmbeddingService.scheduleTagEmbedding(tag);

  const tagDecision = await TagAiDecision.create({
    pendingTagId: tag.id,
    originalTerm,
    detectedType: mapDetectedType(tag.type),
    contextSample: userPayload.context_sample,
    aiDecision: decision.action,
    aiSuggestedTarget: decision.aiSuggestedTarget,
    aiReasoning: decision.reasoning,
    hesitationLevel: decision.hesitationLevel,
    dilemmaReasoning: decision.dilemmaReasoning,
    candidateTagsSnapshot: hybrid,
    // 'manual' means the AI explicitly deferred to a human reviewer
    reviewStatus: decision.action === 'manual' ? 'manual_queue' : 'pending_review',
  });

  // Auto-apply high-confidence merge decisions immediately so the alias is added
  // without waiting for a human reviewer.
  // When hesitationLevel is null (Gemini omitted it), treat as 0 (fully confident).
  // Threshold 50 catches most genuine merges while still holding back truly uncertain ones.
  const AUTO_MERGE_THRESHOLD = 50;
  if (
    decision.action === 'merge' &&
    decision.aiSuggestedTarget &&
    (decision.hesitationLevel ?? 0) < AUTO_MERGE_THRESHOLD
  ) {
    try {
      const targetTagId = await tagHybridSearchService.resolveTargetTagIdByName(
        decision.aiSuggestedTarget,
        { tagType: tag.type },
      );
      if (targetTagId) {
        // Lazy require to avoid circular dependency (tagController ← tagCorrectionAgentService)
        const { resolvePendingTags } = require('../controllers/tagController');
        await resolvePendingTags({
          ids: [tag.id],
          action: 'link',
          targetTagId,
          aliasPriority: 4,
        });
        // FK is ON DELETE SET NULL — pendingTagId is now null but the record survives.
        await tagDecision.update({
          reviewStatus: 'approved',
          reviewerAction: 'auto_merge',
          resolvedAt: new Date(),
        });
        console.log(
          `[tagCorrectionAgent] auto-merged "${originalTerm}" → "${decision.aiSuggestedTarget}" ` +
          `(hesitation: ${decision.hesitationLevel}, targetId: ${targetTagId})`,
        );
      } else {
        console.warn(
          `[tagCorrectionAgent] auto-merge: could not resolve target id for "${decision.aiSuggestedTarget}" — left for review`,
        );
      }
    } catch (autoMergeErr) {
      console.warn(
        '[tagCorrectionAgent] auto-merge failed for',
        pendingTagId,
        autoMergeErr?.message || autoMergeErr,
      );
    }
  }

  return tagDecision;
};

const scheduleDecisionForPendingTag = (pendingTagId, contextSample = '', options = {}) => {
  if (!pendingTagId) return;
  setImmediate(async () => {
    try {
      const platformOn = await isPlatformAgentEnabled();
      if (!platformOn) return;
      if (options.clientId) {
        const clientOn = await isClientAgentEnabled(options.clientId);
        if (!clientOn) return;
      }
      await runDecisionForPendingTag(pendingTagId, contextSample);
    } catch (err) {
      console.error('[tagCorrectionAgent] schedule failed', pendingTagId, err?.message || err);
    }
  });
};

/** Queue decision if tag is pending and has no open AI review row (e.g. tag existed before agent ran).
 *  If a high-confidence merge decision already exists, apply it immediately. */
const schedulePendingIfNeeded = (pendingTagId, contextSample = '', options = {}) => {
  if (!pendingTagId) return;
  setImmediate(async () => {
    try {
      const tag = await Tag.findByPk(pendingTagId);
      if (!tag || String(tag.status).toLowerCase() !== 'pending') return;
      const open = await TagAiDecision.findOne({
        where: { pendingTagId, reviewStatus: 'pending_review' },
      });
      if (open) {
        // If a high-confidence merge decision already exists, auto-apply it now
        const AUTO_MERGE_THRESHOLD = 50;
        const plain = open.get ? open.get({ plain: true }) : open;
        if (
          plain.aiDecision === 'merge' &&
          plain.aiSuggestedTarget &&
          (plain.hesitationLevel ?? 0) < AUTO_MERGE_THRESHOLD
        ) {
          try {
            const targetTagId = await tagHybridSearchService.resolveTargetTagIdByName(
              plain.aiSuggestedTarget,
              { tagType: tag.type },
            );
            if (targetTagId) {
              const { resolvePendingTags } = require('../controllers/tagController');
              await resolvePendingTags({
                ids: [pendingTagId],
                action: 'link',
                targetTagId,
                aliasPriority: 4,
                bypassStatusCheck: true,
              });
              // FK is ON DELETE SET NULL — pendingTagId is now null but the record survives.
              await open.update({
                reviewStatus: 'approved',
                reviewerAction: 'auto_merge',
                resolvedAt: new Date(),
              });
              console.log(
                `[tagCorrectionAgent] schedulePendingIfNeeded: auto-merged "${plain.originalTerm}" ` +
                `→ "${plain.aiSuggestedTarget}" (hesitation: ${plain.hesitationLevel})`,
              );
            }
          } catch (autoErr) {
            console.warn('[tagCorrectionAgent] schedulePendingIfNeeded auto-merge failed', pendingTagId, autoErr?.message);
          }
        }
        return;
      }
      const platformOn = await isPlatformAgentEnabled();
      if (!platformOn) return;
      if (options.clientId) {
        const clientOn = await isClientAgentEnabled(options.clientId);
        if (!clientOn) return;
      }
      await runDecisionForPendingTag(pendingTagId, contextSample);
    } catch (err) {
      console.error('[tagCorrectionAgent] schedulePendingIfNeeded failed', pendingTagId, err?.message || err);
    }
  });
};

const listDecisions = async ({
  page = 1,
  limit = 50,
  decision = 'all',
  date = '',
  reviewStatus = 'pending_review',
  reviewerAction = '',
} = {}) => {
  const where = {};
  if (reviewStatus && reviewStatus !== 'all') {
    where.reviewStatus = reviewStatus;
  }
  if (reviewerAction && reviewerAction !== 'all') {
    where.reviewerAction = reviewerAction;
  }
  if (decision && decision !== 'all') {
    where.aiDecision = decision;
  }
  if (date) {
    where.createdAt = {
      [Op.gte]: new Date(`${date}T00:00:00.000Z`),
      [Op.lt]: new Date(`${date}T23:59:59.999Z`),
    };
  }

  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;

  const { rows, count } = await TagAiDecision.findAndCountAll({
    where,
    include: [
      {
        model: Tag,
        as: 'pendingTag',
        attributes: ['id', 'type'],
        required: false,
        include: [
          {
            model: SystemTag,
            as: 'systemTagEntries',
            attributes: ['raw_type'],
            required: false,
            where: { is_active: true },
          },
        ],
      },
    ],
    order: [['createdAt', 'DESC']],
    limit: safeLimit,
    offset,
  });

  return {
    data: rows.map((row) => {
      const plain = row.get ? row.get({ plain: true }) : row;
      const liveType = plain.pendingTag?.type;

      let detectedType;
      if (liveType && liveType !== 'role') {
        // Live catalog type is already specific — use it.
        detectedType = mapDetectedType(liveType);
      } else {
        // Tag is still 'role' (old default). Try to find a better type from any
        // system_tags row that references this pending tag.
        const rawTypes = (plain.pendingTag?.systemTagEntries || [])
          .map((st) => String(st.raw_type || '').toLowerCase().trim())
          .filter((t) => t && t !== 'role');
        const betterRaw = rawTypes[0] ?? null;
        if (betterRaw) {
          detectedType = mapDetectedType(betterRaw);
          // Opportunistically fix the tag in DB so future queries are instant.
          if (plain.pendingTag?.id) {
            Tag.update(
              { type: betterRaw === 'education' ? 'degree' : betterRaw },
              { where: { id: plain.pendingTag.id, type: 'role' } },
            ).catch(() => {});
          }
        } else {
          detectedType = liveType ? mapDetectedType(liveType) : (plain.detectedType || 'skill');
        }
      }

      return {
        id: plain.id,
        pendingTagId: plain.pendingTagId,
        originalTerm: plain.originalTerm,
        detectedType,
        contextSample: plain.contextSample,
        aiDecision: plain.aiDecision,
        aiSuggestedTarget: plain.aiSuggestedTarget,
        aiReasoning: plain.aiReasoning,
        candidateTagsFromDB: Array.isArray(plain.candidateTagsSnapshot)
          ? plain.candidateTagsSnapshot
          : [],
        status:
          plain.reviewStatus === 'pending_review'
            ? 'pending'
            : plain.reviewStatus === 'manual_queue'
              ? 'manual'
              : plain.reviewStatus === 'approved'
                ? 'approved'
                : 'overridden',
        actionDate: plain.createdAt,
        reviewStatus: plain.reviewStatus,
        reviewerAction: plain.reviewerAction ?? null,
        hesitationLevel: typeof plain.hesitationLevel === 'number' ? plain.hesitationLevel : null,
        dilemmaReasoning: plain.dilemmaReasoning ?? null,
      };
    }),
    total: count,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(count / safeLimit)),
  };
};

/** Queue AI decisions for pending tags that have no open decision row (admin backfill). */
const backfillPendingWithoutDecisions = async (limit = 40) => {
  const platformOn = await isPlatformAgentEnabled();
  if (!platformOn) return { processed: 0, skipped: 'agent_disabled' };

  const pendingTags = await Tag.findAll({
    where: { status: 'pending' },
    limit: Math.min(200, Math.max(1, Number(limit) || 40)),
    order: [['createdAt', 'ASC']],
  });

  let processed = 0;
  let lastError = null;
  for (const tag of pendingTags) {
    const open = await TagAiDecision.findOne({
      where: { pendingTagId: tag.id, reviewStatus: 'pending_review' },
    });
    if (open) continue;
    const st = await SystemTag.findOne({
      where: { tag_id: tag.id },
      attributes: ['context', 'quote', 'tag_reason'],
    });
    const plain = st?.get ? st.get({ plain: true }) : st;
    const contextSample =
      plain?.quote || plain?.context || plain?.tag_reason || tag.category || '';
    try {
      await runDecisionForPendingTag(tag.id, contextSample);
      processed += 1;
    } catch (err) {
      lastError = err?.message || String(err);
      console.warn('[tagCorrectionAgent] backfill failed', tag.id, lastError);
    }
  }
  return { processed, total: pendingTags.length, lastError: processed ? null : lastError };
};

/**
 * Retroactively apply all pending merge decisions with hesitationLevel < threshold.
 * Used to process decisions that were created before auto-merge was introduced,
 * or to bulk-resolve a backlog of high-confidence merge decisions.
 */
const backfillAutoMergeDecisions = async (threshold = 30, limit = 200) => {
  const rows = await TagAiDecision.findAll({
    where: {
      aiDecision: 'merge',
      reviewStatus: 'pending_review',
      // Also include rows where hesitationLevel is NULL — those are treated as
      // hesitation=0 (Gemini omitted the field, meaning it was confident).
      [Op.or]: [
        { hesitationLevel: { [Op.lt]: threshold } },
        { hesitationLevel: null },
      ],
    },
    order: [['hesitationLevel', 'ASC']],
    limit: Math.min(500, Math.max(1, Number(limit) || 200)),
    include: [{ model: Tag, as: 'pendingTag', required: false }],
  });

  let applied = 0;
  let skipped = 0;
  const errors = [];

  for (const row of rows) {
    const plain = row.get ? row.get({ plain: true }) : row;
    if (!plain.aiSuggestedTarget) { skipped++; continue; }

    try {
      const tagType = plain.pendingTag?.type || undefined;
      const targetTagId = await tagHybridSearchService.resolveTargetTagIdByName(
        plain.aiSuggestedTarget,
        { tagType },
      );
      if (!targetTagId) {
        console.warn(`[tagCorrectionAgent] backfillAutoMerge: no target found for "${plain.aiSuggestedTarget}" (decision ${plain.id})`);
        skipped++;
        continue;
      }

      const { resolvePendingTags } = require('../controllers/tagController');
      await resolvePendingTags({
        ids: [plain.pendingTagId],
        action: 'link',
        targetTagId,
        aliasPriority: 4,
        bypassStatusCheck: true,
      });
      // FK is ON DELETE SET NULL — pendingTagId is now null but the record survives.
      await row.update({
        reviewStatus: 'approved',
        reviewerAction: 'auto_merge',
        resolvedAt: new Date(),
      });
      console.log(
        `[tagCorrectionAgent] backfillAutoMerge: merged "${plain.originalTerm}" → "${plain.aiSuggestedTarget}" ` +
        `(hesitation: ${plain.hesitationLevel})`,
      );
      applied++;
    } catch (err) {
      console.warn(`[tagCorrectionAgent] backfillAutoMerge failed for decision ${plain.id}:`, err?.message || err);
      errors.push({ id: plain.id, term: plain.originalTerm, error: err?.message });
      skipped++;
    }
  }

  return { applied, skipped, total: rows.length, errors };
};

module.exports = {
  PROMPT_ID,
  parseAgentJson,
  isPlatformAgentEnabled,
  setPlatformAgentEnabled,
  isClientAgentEnabled,
  scheduleDecisionForPendingTag,
  schedulePendingIfNeeded,
  runDecisionForPendingTag,
  listDecisions,
  backfillPendingWithoutDecisions,
  backfillAutoMergeDecisions,
};
