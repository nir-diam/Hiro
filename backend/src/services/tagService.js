const { Op } = require('sequelize');
const Tag = require('../models/Tag');
const TagHistory = require('../models/TagHistory');
const CandidateTag = require('../models/CandidateTag');
const tagEmbeddingService = require('./tagEmbeddingService');
const { sendSingleTurnChat } = require('./geminiService');
const promptService = require('./promptService');
const { sequelize } = require('../config/db');

const fireAndForget = (promise) => {
  if (!promise || typeof promise.catch !== 'function') return;
  promise.catch((err) => {
    console.error('[tagService] background task failed', err?.message || err);
  });
};

const isConnectionError = (err) =>
  err && (err.name === 'SequelizeConnectionError' || err.name === 'SequelizeConnectionAcquireTimeoutError' || (err.original && err.original.code === 'ECONNRESET'));

const withConnectionRetry = async (fn, maxAttempts = 2) => {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isConnectionError(err)) {
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
};

/**
 * When a tag is updated from draft to active: find pending tags whose name matches
 * the activated tag's main name (tagKey, displayNameHe, displayNameEn) or any alias/synonym;
 * migrate their candidate_tags to the activated tag, then delete the pending tags.
 */
const migratePendingTagsToActivated = async (activatedTag) => {
  const primaryNames = [
    activatedTag.tagKey,
    activatedTag.displayNameHe,
    activatedTag.displayNameEn,
  ].map((v) => (v || '').toString().trim()).filter(Boolean);

  const aliases = Array.isArray(activatedTag.aliases) ? activatedTag.aliases : [];
  const synonyms = Array.isArray(activatedTag.synonyms) ? activatedTag.synonyms : [];
  const aliasNames = aliases.map((a) => (a || '').toString().trim()).filter(Boolean);
  const synonymPhrases = (synonyms || []).map((s) => (typeof s === 'string' ? s : (s && s.phrase) || '').toString().trim()).filter(Boolean);

  const namesToMatch = [...new Set([...primaryNames, ...aliasNames, ...synonymPhrases])];
  if (namesToMatch.length === 0) return;

  const conditions = namesToMatch.flatMap((name) => {
    const lower = name.toLowerCase();
    return [
      sequelize.where(sequelize.fn('LOWER', sequelize.col('tag_key')), lower),
      sequelize.where(sequelize.fn('LOWER', sequelize.col('display_name_he')), lower),
      sequelize.where(sequelize.fn('LOWER', sequelize.col('display_name_en')), lower),
    ];
  });

  const pendingTags = await withConnectionRetry(() =>
    Tag.findAll({
      where: {
        status: 'pending',
        id: { [Op.ne]: activatedTag.id },
        [Op.or]: conditions,
      },
    })
  );

  for (const pendingTag of pendingTags) {
    await withConnectionRetry(async () => {
      const transaction = await sequelize.transaction();
      try {
        const candidateTags = await CandidateTag.findAll({
          where: { tag_id: pendingTag.id },
          transaction,
        });

        // 1. Create new CandidateTag linking each candidate to the activated tag (findOrCreate to avoid duplicate). Use activatedTag for tag-derived fields; use ct values when present for the rest.
        for (const ct of candidateTags) {
          const hasNumber = (v) => typeof v === 'number' && !Number.isNaN(v);
          const hasBoolean = (v) => typeof v === 'boolean';
          await CandidateTag.findOrCreate({
            where: { candidate_id: ct.candidate_id, tag_id: activatedTag.id },
            defaults: {
              candidate_id: ct.candidate_id,
              tag_id: activatedTag.id,
              raw_type: activatedTag.type ?? ct.raw_type ?? null,
              context: activatedTag.context ?? ct.context ?? null,
              is_current: hasBoolean(ct.is_current) ? ct.is_current : true,
              is_in_summary: hasBoolean(ct.is_in_summary) ? ct.is_in_summary : true,
              confidence_score: hasNumber(ct.confidence_score) ? ct.confidence_score : null,
              calculated_weight: hasNumber(ct.calculated_weight) ? ct.calculated_weight : null,
              final_score: hasNumber(ct.final_score) ? ct.final_score : null,
              is_active: true,
            },
            transaction,
          });
        }

        // 2. Remove old CandidateTag rows that pointed to the pending tag
        await CandidateTag.destroy({
          where: { tag_id: pendingTag.id },
          transaction,
        });

        // 3. Remove tag_histories that reference the pending tag (FK constraint)
        await TagHistory.destroy({
          where: { tag_id: pendingTag.id },
          transaction,
        });

        // 4. Delete the pending tag
        await pendingTag.destroy({ transaction });
        await transaction.commit();
      } catch (err) {
        await transaction.rollback();
        console.error('[tagService.migratePendingTagsToActivated]', pendingTag.id, err?.message || err);
        throw err;
      }
    });
  }
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

const list = async (options = {}) => {
  const {
    page = 1,
    limit,
    searchTerm = '',
    synonymSearch = '',
    types = [],
    categories = [],
    statuses = [],
    sourceFilter,
    createdFrom,
    createdTo,
    updatedFrom,
    updatedTo,
    sort = 'tagKey',
    direction = 'asc',
  } = options;

  const hasLimit = typeof limit !== 'undefined' && limit !== null;
  const normalizedLimit =
    hasLimit ? Math.max(1, Math.min(Number(limit) || 100, 500)) : null;
  const normalizedPage = Math.max(1, Number(page) || 1);
  const offset = hasLimit ? (normalizedPage - 1) * normalizedLimit : 0;

  const where = {};
  const searchConditions = [];
  const normalizedSearch = (searchTerm || '').trim().toLowerCase();
  if (normalizedSearch) {
    const likeTerm = `%${normalizedSearch}%`;
    const columnMap = {
      displayNameHe: 'display_name_he',
      displayNameEn: 'display_name_en',
      tagKey: 'tag_key',
      category: 'category',
    };
    Object.values(columnMap).forEach((column) => {
      searchConditions.push(
        sequelize.where(sequelize.fn('LOWER', sequelize.col(column)), {
          [Op.like]: likeTerm,
        }),
      );
    });
    // Also match tags whose synonyms (e.g. phrase "Training and Implementation") or aliases contain the search term
    searchConditions.push(
      sequelize.where(
        sequelize.fn('LOWER', sequelize.cast(sequelize.col('synonyms'), 'text')),
        { [Op.like]: likeTerm },
      ),
    );
    searchConditions.push(
      sequelize.where(
        sequelize.fn('LOWER', sequelize.cast(sequelize.col('aliases'), 'text')),
        { [Op.like]: likeTerm },
      ),
    );
  }

  const normalizedSynonym = (synonymSearch || '').trim().toLowerCase();
  if (normalizedSynonym) {
    const likeTerm = `%${normalizedSynonym}%`;
    searchConditions.push(
      sequelize.where(
        sequelize.fn('LOWER', sequelize.cast(sequelize.col('synonyms'), 'text')),
        { [Op.like]: likeTerm },
      ),
    );
  }

  if (searchConditions.length) {
    where[Op.or] = searchConditions;
  }

  if (Array.isArray(types) && types.length) {
    where.type = { [Op.in]: types };
  }
  if (Array.isArray(categories) && categories.length) {
    where.category = { [Op.in]: categories };
  }
  if (Array.isArray(statuses) && statuses.length) {
    where.status = { [Op.in]: statuses };
  } else {
    where.status = { [Op.ne]: 'pending' };
  }

  const normalizedSource = (sourceFilter || '').toLowerCase();
  if (normalizedSource) {
    if (normalizedSource === 'curator') {
      where.source = { [Op.in]: ['admin', 'system'] };
    } else if (normalizedSource === 'candidate') {
      where.source = { [Op.in]: ['user', 'candidate'] };
    } else if (['ai', 'manual', 'admin', 'system', 'user'].includes(normalizedSource)) {
      where.source = normalizedSource;
    }
  }

  if (createdFrom || createdTo) {
    where.createdAt = {};
    if (createdFrom) {
      where.createdAt[Op.gte] = new Date(createdFrom);
    }
    if (createdTo) {
      where.createdAt[Op.lte] = new Date(createdTo);
    }
  }
  if (updatedFrom || updatedTo) {
    where.updatedAt = {};
    if (updatedFrom) {
      where.updatedAt[Op.gte] = new Date(updatedFrom);
    }
    if (updatedTo) {
      where.updatedAt[Op.lte] = new Date(updatedTo);
    }
  }

  const sortableKeys = new Set(['tagKey', 'displayNameHe', 'displayNameEn', 'type', 'category', 'status', 'createdAt', 'source', 'usageCount']);
  const safeSortKey = sortableKeys.has(sort) ? sort : 'tagKey';
  const safeSortDirection = (direction || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  const queryOptions = {
    where,
    order: [[safeSortKey, safeSortDirection]],
    attributes: {
      exclude: ['embedding'],
    },
    ...(hasLimit
      ? {
          limit: normalizedLimit,
          offset,
        }
      : {}),
  };
  const { count, rows } = await Tag.findAndCountAll(queryOptions);

  return { rows, total: count, page: normalizedPage, limit: normalizedLimit };
};

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


  const wasDraft = (beforeState.status || '').toLowerCase() === 'draft';
  const becomingActive = (payload.status || '').toLowerCase() === 'active';
  const wasActive = (beforeState.status || '').toLowerCase() === 'active';
  const becomingDraft = (payload.status || '').toLowerCase() === 'draft';

  await tag.update(payload);

  if (wasDraft && becomingActive) {
    await migratePendingTagsToActivated(tag);
    await CandidateTag.update({ is_active: true }, { where: { tag_id: tag.id } });
  }
  if (wasActive && becomingDraft) {
    await CandidateTag.update({ is_active: false }, { where: { tag_id: tag.id } });
  }



 

 

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

