const { Op, fn, col, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const CandidateTag = require('../models/CandidateTag');
const Tag = require('../models/Tag');
const Candidate = require('../models/Candidate');
const tagScoringEngine = require('./tagScoringEngine');

if (!CandidateTag.associations?.tag) {
  CandidateTag.belongsTo(Tag, { foreignKey: 'tag_id', as: 'tag' });
}

if (!CandidateTag.associations?.candidate) {
  CandidateTag.belongsTo(Candidate, { foreignKey: 'candidate_id', as: 'candidate' });
}

const normalizeEntry = (entry) => {
  if (!entry) return null;
  const nameSources = [
    typeof entry === 'string' ? entry : null,
    typeof entry?.name === 'string' ? entry.name : null,
    typeof entry?.displayNameHe === 'string' ? entry.displayNameHe : null,
    typeof entry?.displayNameEn === 'string' ? entry.displayNameEn : null,
    entry?.raw_type ? entry.raw_type : null,
    entry?.raw_type && entry?.context ? `${entry.context} ${entry.raw_type}` : null,
  ];
  const name = nameSources.find((value) => typeof value === 'string' && value.trim());
  if (!name) return null;
  return {
    name: name.trim(),
    tagKey:
      typeof entry?.tagKey === 'string'
        ? entry.tagKey.trim()
        : (name && typeof name === 'string' ? name.trim() : ''),
    raw_type: entry?.raw_type || entry?.type || entry?.role || null,
    context: entry?.context || null,
    is_current: typeof entry?.is_current === 'boolean' ? entry.is_current : true,
    is_in_summary: typeof entry?.is_in_summary === 'boolean' ? entry.is_in_summary : false,
    confidence_score:
      typeof entry?.confidence_score === 'number' ? entry.confidence_score : null,
    calculated_weight:
      typeof entry?.calculated_weight === 'number' ? entry.calculated_weight : null,
    final_score:
      typeof entry?.final_score === 'number' ? entry.final_score : null,
    raw_type_reason:
      typeof entry?.raw_type_reason === 'string' ? entry.raw_type_reason.trim() : null,
    tag_reason:
      typeof entry?.tag_reason === 'string' ? entry.tag_reason.trim() : null,
  };
};

const reassignCandidateTag = async (id, targetTagId) => {
  if (!id || !targetTagId) return null;
  const candidateTag = await CandidateTag.findByPk(id);
  if (!candidateTag) return null;
  if (candidateTag.tag_id === targetTagId) return candidateTag;
  const targetTag = await Tag.findByPk(targetTagId);
  if (!targetTag) return null;

  const existing = await CandidateTag.findOne({
    where: {
      candidate_id: candidateTag.candidate_id,
      tag_id: targetTagId,
    },
  });

  if (existing) {
    await candidateTag.destroy();
    await recordTagUsage(targetTag);
    return existing;
  }

  await candidateTag.update({ tag_id: targetTagId });
  await recordTagUsage(targetTag);
  return candidateTag;
};

const deleteCandidateTag = async (id) => {
  const entry = await CandidateTag.findByPk(id);
  if (!entry) return null;
  await entry.destroy();
  return entry;
};

const bulkUpdateCandidateTags = async (actions = []) => {
  const validActions = Array.isArray(actions) ? actions : [];
  if (!validActions.length) return [];
  for (const entry of validActions) {
    if (!entry?.candidateTagId) {
      throw new Error('Missing candidate tag id');
    }
    if (entry.action === 'reassign') {
      if (!entry.targetTagId) {
        throw new Error('Missing target tag for reassign');
      }
      await reassignCandidateTag(entry.candidateTagId, entry.targetTagId);
      continue;
    }
    await deleteCandidateTag(entry.candidateTagId);
  }
  return validActions;
};

const normalizeForComparison = (value) => {
  if (!value) return '';
  return value
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05FF]/g, '')
    .trim();
};

const levenshteinDistance = (a, b) => {
  const matrix = Array.from({ length: b.length + 1 }, () => Array(a.length + 1).fill(0));
  for (let i = 0; i <= b.length; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= a.length; j += 1) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[b.length][a.length];
};

const stringSimilarity = (a, b) => {
  if (!a || !b) return 0;
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 0;
  return 1 - distance / maxLen;
};

const buildAliasMatchLiteral = (lowerTrimmed) =>
  sequelize.where(
    sequelize.literal(`
      EXISTS (
        SELECT 1
        FROM unnest(COALESCE("Tag"."aliases", ARRAY[]::text[])) AS alias
        WHERE lower(trim(COALESCE(alias, '')::text)) = ${sequelize.escape(lowerTrimmed)}
      )
    `),
    true
  );

const buildSynonymMatchLiteral = (lowerTrimmed) => {
  // Match when any synonym object has "phrase" value equal to lowerTrimmed (exact, case-insensitive).
  // Pattern "phrase":"excel" matches {"phrase":"Excel"} but not {"phrase":"Microsoft Excel"}.
  const pattern = `%"phrase":"${String(lowerTrimmed).replace(/\\/g, '\\\\').replace(/'/g, "''")}"%`;
  const escapedPattern = sequelize.escape(pattern);
  return sequelize.where(
    sequelize.literal(`
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE("Tag"."synonyms", '[]'::jsonb)) AS s
        WHERE s ILIKE ${escapedPattern}
      )
    `),
    true,
  );
};

const findTagByNameOrAlias = async (name) => {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;

  const lowerTrimmed = trimmed.toLowerCase();
  const escaped = sequelize.escape(lowerTrimmed);
  // Same as working SQL: s ILIKE '%"excel"%' (element text contains the term in quotes)
  const synonymPattern = sequelize.escape(`%"${String(lowerTrimmed).replace(/\\/g, '\\\\').replace(/"/g, '""')}"%`);

  // Prefer raw query so synonym/alias match is reliable (no Sequelize alias or literal issues)
  const rows = await sequelize.query(
    `
    SELECT id FROM public.tags
    WHERE lower(trim(COALESCE(display_name_he, '')::text)) = lower(${escaped})
       OR lower(trim(COALESCE(display_name_en, '')::text)) = lower(${escaped})
       OR lower(trim(COALESCE(tag_key, '')::text)) = lower(${escaped})
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements_text(COALESCE(synonyms, '[]'::jsonb)) AS s
         WHERE s ILIKE ${synonymPattern}
       )
       OR EXISTS (
         SELECT 1 FROM unnest(COALESCE(aliases, ARRAY[]::text[])) AS alias
         WHERE lower(trim(COALESCE(alias, '')::text)) = lower(${escaped})
       )
    LIMIT 1
    `,
    { type: QueryTypes.SELECT }
  );
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (row && row.id) {
    return Tag.findByPk(row.id);
  }
  return null;
};

const doesTagNameOrAliasExist = async (name) => Boolean(await findTagByNameOrAlias(name));

const recordTagUsage = async (tagRecord) => {
  if (!tagRecord) return;
  tagRecord.usageCount = (tagRecord.usageCount || 0) + 1;
  tagRecord.lastUsedAt = new Date();
  await tagRecord.save();
};

const findFuzzyTag = async (value) => {
  const normalizedValue = normalizeForComparison(value);
  if (!normalizedValue) return null;
  const candidates = await Tag.findAll({ where: { status: 'active' } });
  let best = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const options = [
      candidate.tagKey,
      candidate.displayNameHe,
      candidate.displayNameEn,
      ...(Array.isArray(candidate.aliases) ? candidate.aliases : []),
    ];
    for (const option of options) {
      const normalizedOption = normalizeForComparison(option);
      if (!normalizedOption) continue;
      const score = stringSimilarity(normalizedValue, normalizedOption);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
      if (score >= 0.9) return candidate;
    }
  }
  return bestScore >= 0.9 ? best : null;
};

const ensureTagRecord = async (tagKey, defaults = {}) => {
  if (!tagKey) return null;
  const searchTargets = [tagKey, defaults.displayNameHe, defaults.displayNameEn];
  for (const target of searchTargets) {
    const found = await findTagByNameOrAlias(target);
    if (found) return { tag: found, created: false };
  }
  const fuzzy = await findFuzzyTag(defaults.displayNameHe || defaults.displayNameEn || tagKey);
  if (fuzzy) return { tag: fuzzy, created: false };

  const typeValue = typeof defaults.type === 'string' ? defaults.type.toLowerCase() : 'role';
  const allowedTypes = [
    'role',
    'skill',
    'industry',
    'tool',
    'certification',
    'language',
    'seniority',
    'degree',
    'soft_skill'
];
  const tagType = allowedTypes.includes(typeValue) ? typeValue : 'role';

  const tag = await Tag.create({
    tagKey,
    displayNameHe: defaults.displayNameHe || tagKey,
    displayNameEn: defaults.displayNameEn || tagKey,
    type: tagType,
    source: 'ai',
    status: 'pending'
  });
  return { tag, created: true };
};

/**
 * Sync all given tag entries to CandidateTag for a candidate.
 * Every entry is inserted; is_active is true only when the tag exists in Tag with status === 'active'.
 * @param {string} candidateId - Candidate UUID
 * @param {Array} entries - Tag entries (strings or objects with tagKey/name/displayNameHe, etc.)
 * @param {string} [uploadedByUserId] - Optional UUID of the user who uploaded the resume (stored in created_by)
 */
const syncTagsForCandidate = async (candidateId, entries = [], uploadedByUserId = null) => {
  if (!candidateId || !entries.length) return [];
  const normalizedEntries = entries
    .map(normalizeEntry)
    .filter(Boolean)
    .reduce((acc, curr) => {
      const key = curr.tagKey.toLowerCase();
      if (!acc.has(key)) acc.set(key, curr);
      return acc;
    }, new Map());
  const payloads = Array.from(normalizedEntries.values());
  if (!payloads.length) return [];

  await CandidateTag.destroy({ where: { candidate_id: candidateId } });

  // Resolve each payload to a tag (find existing or create pending). Deduplicate by tag.id.
  const resolved = await Promise.all(
    payloads.map(async (payload) => {
      const { tag, created } = await ensureTagRecord(payload.tagKey, {
        displayNameHe: payload.name,
        type: payload.raw_type || 'role',
      });
      return tag ? { tag, created, payload } : null;
    }),
  );
  const byTagId = new Map();
  resolved.filter(Boolean).forEach((r) => {
    if (!byTagId.has(r.tag.id)) byTagId.set(r.tag.id, r);
  });
  const uniqueResolved = Array.from(byTagId.values());

  // Insert every tag: is_active = true only when Tag exists with status === 'active', else false. Attach uploader if provided.
  await Promise.all(
    uniqueResolved.map(async ({ tag, payload }) => {
      const score = tagScoringEngine.scoreTag(payload);
      const isActive = (tag.status && String(tag.status).toLowerCase() === 'active') || false;
      await CandidateTag.create({
        candidate_id: candidateId,
        tag_id: tag.id,
        raw_type: payload.raw_type,
        context: payload.context,
        raw_type_reason: payload.raw_type_reason,
        tag_reason: payload.tag_reason,
        is_current: payload.is_current,
        is_in_summary: payload.is_in_summary,
        confidence_score: payload.confidence_score,
        calculated_weight: score.calculatedWeight,
        final_score: score.finalScore,
        is_active: isActive,
        ...(uploadedByUserId ? { created_by: uploadedByUserId } : {}),
      });
      await recordTagUsage(tag);
    }),
  );

  return CandidateTag.findAll({
    where: { candidate_id: candidateId },
    include: [{ model: Tag, as: 'tag' }],
  });
};

const removeAbsentTags = async (candidateId, tags = []) => {
  if (!candidateId) return;
  const normalized = new Set(
    tags
      .map((tag) => (typeof tag === 'string' ? tag : String(tag || '')))
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean),
  );
  const existing = await CandidateTag.findAll({
    where: { candidate_id: candidateId },
    include: [{ model: Tag, as: 'tag' }],
  });
  await Promise.all(
    existing.map(async (entry) => {
      const key = String(entry.tag?.tagKey || entry.tag?.displayNameHe || entry.tag?.displayNameEn || '').trim().toLowerCase();
      if (key && normalized.has(key)) return null;
      return entry.destroy();
    }),
  );
  return existing;
};

/** Tag columns for admin lists — avoid embedding/synonyms/aliases JSONB (OOM on large datasets). */
const TAG_ADMIN_LIST_ATTRIBUTES = [
  'id',
  'tagKey',
  'displayNameHe',
  'displayNameEn',
  'type',
  'category',
  'status',
  'qualityState',
  'source',
  'matchable',
  'usageCount',
];

/**
 * Paginated admin listing with optional search (DB) and is_active filter.
 * @param {{
 *   candidateId?: string,
 *   limit?: number,
 *   offset?: number,
 *   search?: string,
 *   isActive?: 'all' | boolean
 * }} opts
 */
const listCandidateTagsPaginatedForAdmin = async ({
  candidateId,
  limit = 500,
  offset = 0,
  search,
  isActive = 'all',
} = {}) => {
  const base = {};
  if (candidateId) {
    base.candidate_id = String(candidateId).trim();
  }
  if (isActive === true) {
    base.is_active = true;
  }
  if (isActive === false) {
    base.is_active = false;
  }

  const searchTrim = typeof search === 'string' ? search.trim() : '';
  let whereClause = base;
  if (searchTrim) {
    const like = `%${searchTrim}%`;
    // Do not use $assoc.field$ — Sequelize can emit wrong column names (e.g. "tag"."tagKey" vs tag_key).
    // Tag model uses underscored DB columns; Candidate uses camelCase attribute names as columns.
    whereClause = {
      [Op.and]: [
        base,
        {
          [Op.or]: [
            { raw_type: { [Op.iLike]: like } },
            { context: { [Op.iLike]: like } },
            sequelize.where(sequelize.col('tag.tag_key'), { [Op.iLike]: like }),
            sequelize.where(sequelize.col('tag.display_name_he'), { [Op.iLike]: like }),
            sequelize.where(sequelize.col('tag.display_name_en'), { [Op.iLike]: like }),
            sequelize.where(sequelize.col('candidate.fullName'), { [Op.iLike]: like }),
            sequelize.where(sequelize.col('candidate.email'), { [Op.iLike]: like }),
            sequelize.where(sequelize.col('candidate.phone'), { [Op.iLike]: like }),
            sequelize.literal(
              `("CandidateTag"."candidate_id")::text ILIKE ${sequelize.escape(like)}`,
            ),
          ],
        },
      ],
    };
  }

  const safeLimit = Math.min(2000, Math.max(1, Number(limit) || 500));
  const safeOffset = Math.max(0, Number(offset) || 0);

  const include = [
    { model: Tag, as: 'tag', attributes: TAG_ADMIN_LIST_ATTRIBUTES, required: false },
    { model: Candidate, as: 'candidate', attributes: ['id', 'fullName', 'email', 'phone'], required: false },
  ];

  const { rows, count } = await CandidateTag.findAndCountAll({
    where: whereClause,
    limit: safeLimit,
    offset: safeOffset,
    order: [['created_at', 'DESC']],
    subQuery: false,
    distinct: true,
    col: 'id',
    include,
  });

  return {
    rows,
    count,
    limit: safeLimit,
    offset: safeOffset,
    hasMore: safeOffset + rows.length < count,
  };
};

/** @deprecated Prefer listCandidateTagsPaginatedForAdmin — loads full table (risk of OOM). */
const listAllCandidateTags = () =>
  CandidateTag.findAll({
    include: [
      { model: Tag, as: 'tag', attributes: TAG_ADMIN_LIST_ATTRIBUTES },
      { model: Candidate, as: 'candidate', attributes: ['id', 'fullName'] },
    ],
    limit: 5000,
  });

// Find a tag by human name/alias/synonym and return all CandidateTag records for it
const listCandidateTagsByTagName = async (name) => {
  const tag = await findTagByNameOrAlias(name);
  if (!tag) return [];
  return CandidateTag.findAll({
    where: { tag_id: tag.id, is_active: true },
    include: [
      { model: Candidate, as: 'candidate', attributes: ['id', 'fullName'] },
      { model: Tag, as: 'tag' },
    ],
  });
};

const countTagUsage = async (tagIds = []) => {
  if (!Array.isArray(tagIds) || !tagIds.length) return {};
  const rows = await CandidateTag.findAll({
    attributes: ['tag_id', [fn('COUNT', col('id')), 'count']],
    where: {
      tag_id: { [Op.in]: tagIds },
      is_active: true,
    },
    group: ['tag_id'],
  });
  return rows.reduce((acc, row) => {
    acc[row.tag_id] = Number(row.get('count')) || 0;
    return acc;
  }, {});
};

module.exports = {
  syncTagsForCandidate,
  removeAbsentTags,
  ensureTagRecord,
  findTagByNameOrAlias,
  createCandidateTag: async (payload) => {
    if (!payload?.candidate_id || !payload?.tagKey) throw new Error('candidate_id and tagKey required');
    const { tag, created } = await ensureTagRecord(payload.tagKey, {
      displayNameHe: payload.displayNameHe,
      displayNameEn: payload.displayNameEn,
      type: payload.raw_type || 'role',
    });
    if (!tag) throw new Error('Unable to ensure tag record');
    const score = tagScoringEngine.scoreTag(payload);
    const entry = await CandidateTag.create({
      candidate_id: payload.candidate_id,
      tag_id: tag.id,
      raw_type: payload.raw_type,
      context: payload.context,
      raw_type_reason: payload.raw_type_reason ?? null,
      tag_reason: payload.tag_reason ?? null,
      is_current: payload.is_current,
      is_in_summary: payload.is_in_summary,
      confidence_score: payload.confidence_score,
      calculated_weight: score.calculatedWeight,
      final_score: score.finalScore,
      is_active: true,
    });
    await recordTagUsage(tag);
    return entry;
  },
  updateCandidateTag: async (id, updates = {}) => {
    const candidateTag = await CandidateTag.findByPk(id);
    if (!candidateTag) return null;

    let newTag = null;
    if (updates.tagKey) {
      const result = await ensureTagRecord(updates.tagKey, {
        displayNameHe: updates.displayNameHe,
        displayNameEn: updates.displayNameEn,
        type: updates.raw_type || 'role',
      });
      if (result.tag) {
        updates.tag_id = result.tag.id;
        newTag = result.tag;
      }
    }

    const mergedPayload = {
      raw_type: updates.raw_type ?? candidateTag.raw_type,
      context: updates.context ?? candidateTag.context,
      is_current: typeof updates.is_current === 'boolean' ? updates.is_current : candidateTag.is_current,
      is_in_summary: typeof updates.is_in_summary === 'boolean' ? updates.is_in_summary : candidateTag.is_in_summary,
      confidence_score: typeof updates.confidence_score === 'number' ? updates.confidence_score : candidateTag.confidence_score,
    };
    const manualWeight = Number(updates.calculated_weight);
    const manualFinal = Number(updates.final_score);
    const hasManualScore = Number.isFinite(manualWeight) && Number.isFinite(manualFinal);
    if (hasManualScore) {
      updates.calculated_weight = manualWeight;
      updates.final_score = manualFinal;
    } else {
      const score = tagScoringEngine.scoreTag(mergedPayload);
      updates.calculated_weight = score.calculatedWeight;
      updates.final_score = score.finalScore;
    }

    await candidateTag.update(updates);
    if (newTag) {
      await recordTagUsage(newTag);
    }
    return candidateTag;
  },
  deleteCandidateTag,
  reassignCandidateTag,
  bulkUpdateCandidateTags,
  listCandidateTags: async (candidateId) =>
    CandidateTag.findAll({
      where: { candidate_id: candidateId, is_active: true },
      include: [
        { model: Tag, as: 'tag' },
        { model: Candidate, as: 'candidate', attributes: ['id', 'fullName'] },
      ],
    }),
  listCandidateTagsByTag: async (tagId, { activeOnly = true } = {}) =>
    CandidateTag.findAll({
      where: { tag_id: tagId, ...(activeOnly ? { is_active: true } : {}) },
      include: [
        { model: Candidate, as: 'candidate', attributes: ['id', 'fullName', 'email', 'phone'] },
      ],
    }),
  listCandidateTagsByTagName,
  listAllCandidateTags,
  listCandidateTagsPaginatedForAdmin,
  countTagUsage,
};

