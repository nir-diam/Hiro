const { Op, fn, col } = require('sequelize');
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
  const existing = await Tag.findOne({
    where: {
      [Op.or]: [
        { tagKey: { [Op.iLike]: tagKey } },
        { displayNameHe: { [Op.iLike]: tagKey } },
        { displayNameEn: { [Op.iLike]: tagKey } },
      ],
    },
  });
  if (existing) return { tag: existing, created: false };
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
    'domain',
  ];
  const tagType = allowedTypes.includes(typeValue) ? typeValue : 'role';

  const statusValue = typeof defaults.status === 'string' ? defaults.status.toLowerCase() : 'pending';
  const allowedStatuses = ['active', 'draft', 'deprecated', 'archived', 'pending'];
  const tagStatus = allowedStatuses.includes(statusValue) ? statusValue : 'pending';

  const [tag, created] = await Tag.findOrCreate({
    where: { tagKey },
    defaults: {
      displayNameHe: defaults.displayNameHe || tagKey,
      displayNameEn: defaults.displayNameEn || tagKey,
      type: tagType,
      source: 'ai',
      status: tagStatus,
    },
  });
  return { tag, created };
};

const syncTagsForCandidate = async (candidateId, entries = []) => {
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

  await Promise.all(
    payloads.map(async (payload) => {
      const { tag, created } = await ensureTagRecord(payload.tagKey, {
        displayNameHe: payload.name,
        type: payload.raw_type || 'role',
      });
      if (!tag) return null;
      const score = tagScoringEngine.scoreTag(payload);
      const entry = await CandidateTag.create({
        candidate_id: candidateId,
        tag_id: tag.id,
        raw_type: payload.raw_type,
        context: payload.context,
        is_current: payload.is_current,
        is_in_summary: payload.is_in_summary,
        confidence_score: payload.confidence_score,
        calculated_weight: score.calculatedWeight,
        final_score: score.finalScore,
        is_active: created ? false : true,
      });
      await recordTagUsage(tag);
      return entry;
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

const listAllCandidateTags = () =>
  CandidateTag.findAll({
    include: [
      { model: Tag, as: 'tag' },
      { model: Candidate, as: 'candidate', attributes: ['id', 'fullName'] },
    ],
  });

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
  listCandidateTagsByTag: async (tagId) =>
    CandidateTag.findAll({
      where: { tag_id: tagId, is_active: true },
      include: [
        { model: Candidate, as: 'candidate', attributes: ['id', 'fullName'] },
      ],
    }),
  listAllCandidateTags,
  countTagUsage,
};

