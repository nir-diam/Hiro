const { Op, QueryTypes } = require('sequelize');
const Tag = require('../models/Tag');
const { sequelize } = require('../config/db');
const { embedText } = require('./embeddingService');
const candidateTagService = require('./candidateTagService');

const VECTOR_LIMIT = 7;
const FUZZY_LIMIT = 3;

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
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, VECTOR_LIMIT);

    for (const row of scored) {
      vectorHits.push({
        name: displayLabel(row.tag),
        source: 'vector',
        score: row.score,
        tagId: row.tag.id,
      });
    }
  }

  const escaped = sequelize.escape(`%${term.replace(/%/g, '\\%')}%`);
  const typeClause = typeFilter
    ? `AND type = ${sequelize.escape(typeFilter.type)}`
    : '';
  const fuzzyRows = await sequelize.query(
    `
    SELECT id, tag_key, display_name_he, display_name_en, type
    FROM tags
    WHERE status = 'active'
      ${typeClause}
      AND (
        display_name_he ILIKE ${escaped}
        OR display_name_en ILIKE ${escaped}
        OR tag_key ILIKE ${escaped}
      )
    ORDER BY usage_count DESC NULLS LAST
    LIMIT ${FUZZY_LIMIT}
    `,
    { type: QueryTypes.SELECT },
  );

  const fuzzyHits = (fuzzyRows || []).map((row) => ({
    name: String(row.display_name_he || row.display_name_en || row.tag_key || '').trim(),
    source: 'fuzzy',
    tagId: row.id,
  }));

  const seen = new Set();
  const merged = [];
  for (const hit of [...vectorHits, ...fuzzyHits]) {
    const key = (hit.name || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(hit);
    if (merged.length >= VECTOR_LIMIT + FUZZY_LIMIT) break;
  }
  return merged;
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
  findHybridCandidates,
  resolveTargetTagIdByName,
  displayLabel,
  buildTypeFilter,
  normalizeTagType,
};
