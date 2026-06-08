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
  const t = String(tagType || 'skill').toLowerCase();
  if (t === 'degree') return 'education';
  if (['skill', 'role', 'tool', 'education', 'unknown'].includes(t)) return t;
  return 'skill';
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
    };
  }

  const vectorTop = hybrid.find((h) => h.source === 'vector' && (h.score || 0) >= 0.82);
  if (vectorTop?.name) {
    return {
      action: 'merge',
      target_tag: vectorTop.name,
      reasoning: `התאמה סמנטית גבוהה ל-${vectorTop.name} (ללא Gemini)`,
    };
  }

  const fuzzyTop = hybrid.find((h) => h.source === 'fuzzy');
  if (fuzzyTop?.name) {
    return {
      action: 'merge',
      target_tag: fuzzyTop.name,
      reasoning: `התאמה טקסטואלית ל-${fuzzyTop.name} (ללא Gemini)`,
    };
  }

  return {
    action: 'create',
    target_tag: null,
    reasoning: 'לא נמצאה התאמה — הצעה ליצירת תגית (ללא Gemini)',
  };
};

const normalizeAgentDecision = (parsed, candidateNames) => {
  let aiSuggestedTarget = parsed.target_tag;
  if (parsed.action === 'merge' && aiSuggestedTarget) {
    const exact = candidateNames.find((n) => n === aiSuggestedTarget);
    if (!exact) {
      const ci = candidateNames.find(
        (n) => n.toLowerCase() === String(aiSuggestedTarget).toLowerCase(),
      );
      if (ci) aiSuggestedTarget = ci;
    }
  } else if (parsed.action !== 'merge') {
    aiSuggestedTarget = null;
  }
  return { action: parsed.action, aiSuggestedTarget, reasoning: parsed.reasoning };
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

  return TagAiDecision.create({
    pendingTagId: tag.id,
    originalTerm,
    detectedType: mapDetectedType(tag.type),
    contextSample: userPayload.context_sample,
    aiDecision: decision.action,
    aiSuggestedTarget: decision.aiSuggestedTarget,
    aiReasoning: decision.reasoning,
    candidateTagsSnapshot: hybrid,
    reviewStatus: 'pending_review',
  });
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

/** Queue decision if tag is pending and has no open AI review row (e.g. tag existed before agent ran). */
const schedulePendingIfNeeded = (pendingTagId, contextSample = '', options = {}) => {
  if (!pendingTagId) return;
  setImmediate(async () => {
    try {
      const tag = await Tag.findByPk(pendingTagId);
      if (!tag || String(tag.status).toLowerCase() !== 'pending') return;
      const open = await TagAiDecision.findOne({
        where: { pendingTagId, reviewStatus: 'pending_review' },
      });
      if (open) return;
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
} = {}) => {
  const where = {};
  if (reviewStatus && reviewStatus !== 'all') {
    where.reviewStatus = reviewStatus;
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
    order: [['createdAt', 'DESC']],
    limit: safeLimit,
    offset,
  });

  return {
    data: rows.map((row) => {
      const plain = row.get ? row.get({ plain: true }) : row;
      return {
        id: plain.id,
        pendingTagId: plain.pendingTagId,
        originalTerm: plain.originalTerm,
        detectedType: plain.detectedType,
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
            : plain.reviewStatus === 'approved'
              ? 'approved'
              : 'overridden',
        actionDate: plain.createdAt,
        reviewStatus: plain.reviewStatus,
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
};
