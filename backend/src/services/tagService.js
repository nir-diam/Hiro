const { Op } = require('sequelize');
const Tag = require('../models/Tag');
const TagHistory = require('../models/TagHistory');
const CandidateTag = require('../models/CandidateTag');
const tagEmbeddingService = require('./tagEmbeddingService');
const { sendSingleTurnChat } = require('./geminiService');
const promptService = require('./promptService');

const fireAndForget = (promise) => {
  if (!promise || typeof promise.catch !== 'function') return;
  promise.catch((err) => {
    console.error('[tagService] background task failed', err?.message || err);
  });
};

const cleanupPendingCorrections = async (values = [], options = {}) => {
  const terms = Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => (value || '').toString().trim())
        .filter(Boolean),
    ),
  );
  if (!terms.length) return;
  const filter = {
    status: 'pending',
    [Op.or]: [
      { displayNameHe: { [Op.in]: terms } },
      { displayNameEn: { [Op.in]: terms } },
      { tagKey: { [Op.in]: terms } },
    ],
  };
  const excludeIds = Array.isArray(options.excludeIds) ? options.excludeIds.map(String) : [];
  if (excludeIds.length) {
    filter.id = { [Op.notIn]: excludeIds };
  }
  const pending = await Tag.findAll({
    where: filter,
    attributes: ['id'],
  });
  const ids = pending.map((entry) => entry.id);
  if (!ids.length) return;
  await CandidateTag.destroy({
    where: { tag_id: { [Op.in]: ids } },
  });
  await Tag.destroy({
    where: { id: { [Op.in]: ids } },
  });
};

const list = async () =>
  Tag.findAll({
    attributes: {
      exclude: ['embedding'],
    },
  });

const getById = async (id) => {
  const tag = await Tag.findByPk(id);
  if (!tag) {
    const err = new Error('Tag not found');
    err.status = 404;
    throw err;
  }
  return tag;
};

const normalizeSynonyms = (synonyms) => {
  if (!Array.isArray(synonyms)) return [];
  return synonyms
    .map((syn, i) => {
      const normalized = typeof syn === 'string' ? { phrase: syn } : syn || {};
      const phrase = normalized.phrase || (typeof syn === 'string' ? syn : '');
      if (!phrase) return null;
      const language = normalized.language || (/[a-zA-Z]/.test(phrase) ? 'en' : 'he');
      const priority = Number.isFinite(normalized.priority)
        ? normalized.priority
        : Math.max(1, 5 - i);

      return {
        id: normalized.id || `syn_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`,
        phrase,
        language,
        type: normalized.type || 'synonym',
        priority,
      };
    })
    .filter(Boolean);
};

const applyAudit = (payload = {}, options = {}) => {
  const actor = options.actingUser || payload.updatedBy || payload.createdBy || 'system';
  if (!payload.source) {
    payload.source = options.source || 'manual';
  }
  if (!payload.createdBy) {
    payload.createdBy = options.createdBy || actor;
  }
  payload.updatedBy = options.updatedBy || actor;
};

const recordTagHistory = async ({ tagId, action, actor, before, after }) => {
  if (!tagId) return;
  try {
    await TagHistory.create({
      tagId,
      action,
      actor: actor || 'system',
      changes: {
        ...(before ? { before } : {}),
        ...(after ? { after } : {}),
      },
    });
  } catch (err) {
    console.error('[tagService] failed to record tag history', err?.message || err);
  }
};

const normalizeTagKey = (value) => {
  return (value || '')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
};

const create = async (payload, options = {}) => {
  if (!payload.tagKey) {
    payload.tagKey = normalizeTagKey(payload.displayNameEn || payload.displayNameHe || 'tag');
  }
  applyAudit(payload, options);
  if (payload.synonyms) {
    payload.synonyms = normalizeSynonyms(payload.synonyms);
  }
  const created = await Tag.create(payload);
  fireAndForget(recordTagHistory({
    tagId: created.id,
    action: 'create',
    actor: payload.createdBy || options.actingUser,
    after: created.get({ plain: true }),
  }));
  fireAndForget(tagEmbeddingService.scheduleTagEmbedding(created));
  return created;
};

const update = async (id, payload, options = {}) => {
  const tag = await getById(id);
  const beforeState = tag.get({ plain: true });
  if (payload.tagKey === '' || (!payload.tagKey && (payload.displayNameEn || payload.displayNameHe))) {
    payload.tagKey = normalizeTagKey(payload.displayNameEn || payload.displayNameHe || tag.tagKey);
  }
  applyAudit(payload, options);
  if (payload.synonyms) {
    payload.synonyms = normalizeSynonyms(payload.synonyms);
  }
  await cleanupPendingCorrections(
    [
      payload.tagKey,
      payload.displayNameHe,
      payload.displayNameEn,
      ...(payload.synonyms || []).map((syn) => syn.phrase),
      ...(payload.aliases || tag.aliases || []),
    ],
    { excludeIds: [id] },
  );

  await tag.update(payload);
  fireAndForget(recordTagHistory({
    tagId: tag.id,
    action: 'update',
    actor: payload.updatedBy || options.actingUser,
    before: beforeState,
    after: tag.get({ plain: true }),
  }));

  fireAndForget(tagEmbeddingService.scheduleTagEmbedding(tag));
  return tag;
};

const remove = async (id, options = {}) => {
  const tag = await getById(id);
  const transaction = options.transaction;
  await tag.destroy({ transaction });
};

let tagPromptTemplate = null;

const loadTagPromptTemplate = async () => {
  try {
    const prompt = await promptService.getById('tag_ai_enriched');
    tagPromptTemplate = prompt?.template || null;
  } catch (err) {
    console.warn('[tagService] tag_ai_enriched prompt missing', err?.message || err);
    tagPromptTemplate = null;
  }
  return tagPromptTemplate;
};

const enrichSuggestions = async (tagsPayload = []) => {
  const apiKey =
    process.env.GIMINI_KEY
    || process.env.GEMINI_KEY
    || process.env.GEMINI_API_KEY
    || process.env.GOOGLE_API_KEY
    || process.env.API_KEY;

  const defaultPrompt = `You are a top-tier recruitment taxonomy expert.
I will provide a list of Tag Names (in Hebrew).
For each tag, generate a detailed JSON object that strictly matches the following structure:

1. "displayNameHe": The input name (corrected if it has typos).
2. "displayNameEn": Professional English translation.
3. "category": A high-level professional category (e.g., "Software Development", "Marketing", "Human Resources").
4. "type": Exact classification from this list: ['role', 'skill', 'tool', 'industry', 'seniority', 'language'].
5. "descriptionHe": A concise professional definition in Hebrew (max 15 words).
6. "domains": An array of 2-3 relevant industry sectors (in Hebrew, e.g., ["הייטק", "פיננסים", "קמעונאות"]).
7. "synonyms": An array of 3-5 objects, each containing:
    - "phrase": The synonym string.
    - "language": "he" or "en".
    - "type": "synonym" or "alias" or "abbreviation".
    - "priority": Integer 1-5 (5 is highest match).

Input List: ${JSON.stringify(tagsPayload.map(t => t.displayNameHe || t.tagKey))}

Return ONLY the JSON Array of objects. No markdown formatting.`;

  const template = await loadTagPromptTemplate();
  const systemPrompt = template
    ? template.replace('{JSON}', JSON.stringify(tagsPayload.map(t => t.displayNameHe || t.tagKey)))
    : defaultPrompt;

  const userMessage = `Input tags (JSON): ${JSON.stringify(tagsPayload)}`;

  const reply = await sendSingleTurnChat({
    apiKey,
    systemPrompt,
    message: userMessage,
  });

  let parsed = [];
  try {
    parsed = JSON.parse(reply);
    if (!Array.isArray(parsed)) throw new Error('Response is not array');
  } catch (e) {
    const err = new Error('Failed to parse AI response');
    err.status = 400;
    throw err;
  }

  return parsed.map((s) => {
    const orig = tagsPayload.find((t) => t.id === s.id) || {};
    const mappedSynonyms = normalizeSynonyms(s.synonyms || orig.synonyms);

    // If the model returned identical priorities for all synonyms, re-rank by order to avoid flat scores.
    if (mappedSynonyms.length > 1) {
      const uniquePriorities = new Set(mappedSynonyms.map((syn) => syn.priority));
      if (uniquePriorities.size === 1) {
        mappedSynonyms.forEach((syn, i) => {
          syn.priority = Math.max(1, 5 - i);
        });
      }
    }

    return {
      id: s.id || orig.id,
      tagKey: s.tagKey || orig.tagKey || (s.displayNameEn || s.displayNameHe || 'tag').toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_'),
      displayNameHe: s.displayNameHe || orig.displayNameHe,
      displayNameEn: s.displayNameEn || orig.displayNameEn,
      category: s.category || orig.category,
      type: s.type || orig.type,
      descriptionHe: s.descriptionHe || orig.descriptionHe,
      domains: s.domains || orig.domains || [],
      status: s.status || orig.status,
      qualityState: s.qualityState || orig.qualityState,
      matchable: orig.matchable,
      usageCount: orig.usageCount,
      lastUsedAt: orig.lastUsedAt,
      source: s.source || orig.source || 'ai',
      synonyms: mappedSynonyms,
    };
  });
};

module.exports = { list, getById, create, update, remove, enrichSuggestions };

