const { Op, QueryTypes } = require('sequelize');
const Tag = require('../models/Tag');
const { sequelize } = require('../config/db');
const { embedText } = require('./embeddingService');
const candidateTagService = require('./candidateTagService');
const {
  VECTOR_LIMIT,
  VECTOR_MIN_SCORE,
  FUZZY_LIMIT,
  FUZZY_FETCH_LIMIT,
  mergeHybridCandidateHits,
} = require('../utils/tagHybridCandidateMerge');
const {
  scoreTagTextAgainstQuery,
  tokenizeForFuzzy,
} = require('../utils/tagTextSimilarity');

/** Minimum text score to prefer similarity-ranked fuzzy (before usage fallback). */
const FUZZY_TEXT_MIN_SCORE = 0.08;
const FUZZY_POOL_LIMIT = 800;

const cosineSimilarity = (a = [], b = []) => {
  if (!a.length || !b.length || a.length !== b.length) return -1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const va = a[i] || 0;
    const vb = b[i] || 0;
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  if (!na || !nb) return -1;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

const normalizeEmbedding = (emb) => {
  if (!emb) return [];
  if (Array.isArray(emb)) return emb.filter((n) => Number.isFinite(n));
  if (typeof emb === 'string') {
    const cleaned = emb.trim().replace(/^\(|\)$/g, '');
    return cleaned
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isFinite(n));
  }
  if (emb?.data) {
    return Array.from(emb.data)
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n));
  }
  return [];
};

const displayLabel = (tag) =>
  String(tag.displayNameHe || tag.displayNameEn || tag.tagKey || '').trim();

const normalizeTagType = (value) => String(value || '').trim().toLowerCase();

/** Map UI / decision detected_type labels to catalog Tag.type values. */
const catalogTagType = (value) => {
  const normalized = normalizeTagType(value);
  if (normalized === 'education') return 'degree';
  return normalized;
};

const buildTypeFilter = (tagType) => {
  const normalized = catalogTagType(tagType);
  if (!normalized) return null;
  return { type: normalized };
};

/**
 * @returns {Promise<Array<{ name: string, source: 'vector'|'fuzzy', score?: number, tagId?: string }>>}
 */
const findHybridCandidates = async (originalTerm, contextSample = '', options = {}) => {
  const term = String(originalTerm || '').trim();
  if (!term) return [];

  const typeFilter = buildTypeFilter(options.tagType);
  const searchText = [term, contextSample].filter(Boolean).join(' ');
  let queryEmbedding = [];
  try {
    queryEmbedding = normalizeEmbedding(await embedText(searchText));
  } catch (err) {
    console.warn('[tagHybridSearch] embed failed', err?.message || err);
  }

  const vectorHits = [];
  if (queryEmbedding.length) {
    const activeTags = await Tag.findAll({
      where: {
        status: 'active',
        embedding: { [Op.ne]: null },
        ...(typeFilter || {}),
      },
      attributes: ['id', 'tagKey', 'displayNameHe', 'displayNameEn', 'type', 'embedding'],
      limit: 800,
    });
    const scored = activeTags
      .map((tag) => {
        const plain = tag.get ? tag.get({ plain: true }) : tag;
        const emb = normalizeEmbedding(plain.embedding);
        const score = cosineSimilarity(queryEmbedding, emb);
        return { tag: plain, score };
      })
      .filter((row) => row.score >= VECTOR_MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, VECTOR_LIMIT);

    for (const row of scored) {
      vectorHits.push({
        name: displayLabel(row.tag),
        tagKey: row.tag.tagKey || null,
        source: 'vector',
        score: row.score,
        tagId: row.tag.id,
      });
    }
  }

  const vectorIds = vectorHits
    .map((h) => h.tagId)
    .filter((id) => id != null && String(id).trim());

  const fuzzyHits = [];
  const fuzzySeenIds = new Set();

  const pushFuzzyTag = (plain, textScore = null) => {
    const id = plain?.id != null ? String(plain.id) : '';
    if (!id || fuzzySeenIds.has(id) || fuzzyHits.length >= FUZZY_LIMIT) return;
    const name = displayLabel(plain);
    if (!name) return;
    fuzzySeenIds.add(id);
    fuzzyHits.push({
      name,
      tagKey: plain.tagKey || plain.tag_key || null,
      source: 'fuzzy',
      tagId: plain.id,
      ...(textScore != null && Number.isFinite(textScore) ? { score: textScore } : {}),
    });
  };

  const needles = tokenizeForFuzzy(term);
  const searchNeedles = needles.length ? needles : [term].filter(Boolean);
  const fuzzyOrParts = [];
  for (const needle of searchNeedles) {
    const escaped = sequelize.escape(`%${needle.replace(/%/g, '\\%')}%`);
    fuzzyOrParts.push(`display_name_he ILIKE ${escaped}`);
    fuzzyOrParts.push(`display_name_en ILIKE ${escaped}`);
    fuzzyOrParts.push(`tag_key ILIKE ${escaped}`);
  }
  const fuzzyMatchClause = fuzzyOrParts.length ? `(${fuzzyOrParts.join(' OR ')})` : 'FALSE';
  const excludeVectorClause = vectorIds.length
    ? `AND id NOT IN (${vectorIds.map((id) => sequelize.escape(String(id))).join(', ')})`
    : '';
  const typeClause = typeFilter
    ? `AND type = ${sequelize.escape(typeFilter.type)}`
    : '';

  const ilikeRows = await sequelize.query(
    `
    SELECT id, tag_key, display_name_he, display_name_en, type
    FROM tags
    WHERE status = 'active'
      ${typeClause}
      ${excludeVectorClause}
      AND ${fuzzyMatchClause}
    ORDER BY usage_count DESC NULLS LAST
    LIMIT ${FUZZY_FETCH_LIMIT}
    `,
    { type: QueryTypes.SELECT },
  );
  for (const row of ilikeRows || []) {
    pushFuzzyTag(row);
  }

  if (fuzzyHits.length < FUZZY_LIMIT) {
    const poolWhere = {
      status: 'active',
      ...(typeFilter || {}),
      ...(vectorIds.length ? { id: { [Op.notIn]: vectorIds } } : {}),
    };
    const poolTags = await Tag.findAll({
      where: poolWhere,
      attributes: ['id', 'tagKey', 'displayNameHe', 'displayNameEn', 'usageCount'],
      limit: FUZZY_POOL_LIMIT,
      order: [[sequelize.literal('usage_count DESC NULLS LAST')]],
    });

    const ranked = poolTags
      .map((tag) => {
        const plain = tag.get ? tag.get({ plain: true }) : tag;
        const label = displayLabel(plain);
        const textScore = scoreTagTextAgainstQuery(term, contextSample, label);
        return { plain, textScore, usage: Number(plain.usageCount) || 0 };
      })
      .filter(({ plain }) => plain?.id && !fuzzySeenIds.has(String(plain.id)))
      .sort((a, b) => b.textScore - a.textScore || b.usage - a.usage);

    for (const { plain, textScore } of ranked) {
      if (fuzzyHits.length >= FUZZY_LIMIT) break;
      if (textScore < FUZZY_TEXT_MIN_SCORE) continue;
      pushFuzzyTag(plain, textScore);
    }

    // Fill remaining fuzzy slots (same tag type, not in vector top-20) for Gemini tracking.
    if (fuzzyHits.length < FUZZY_LIMIT) {
      for (const { plain, textScore } of ranked) {
        if (fuzzyHits.length >= FUZZY_LIMIT) break;
        pushFuzzyTag(plain, textScore > 0 ? textScore : null);
      }
    }
  }

  return mergeHybridCandidateHits(vectorHits, fuzzyHits, FUZZY_LIMIT);
};

const resolveTargetTagIdByName = async (name, options = {}) => {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const found = await candidateTagService.findTagByNameOrAlias(trimmed);
  if (!found?.id) return null;

  const typeFilter = buildTypeFilter(options.tagType);
  if (typeFilter && catalogTagType(found.type) !== typeFilter.type) {
    return null;
  }
  return found.id;
};

module.exports = {
  VECTOR_LIMIT,
  VECTOR_MIN_SCORE,
  FUZZY_LIMIT,
  findHybridCandidates,
  mergeHybridCandidateHits,
  resolveTargetTagIdByName,
  displayLabel,
  buildTypeFilter,
  normalizeTagType,
};
