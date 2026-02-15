const { Op } = require('sequelize');
const Candidate = require('../models/Candidate');
const CandidateTag = require('../models/CandidateTag');
const Tag = require('../models/Tag');

const associateTagRelations = () => {
  if (!Candidate.associations?.candidateTags) {
    Candidate.hasMany(CandidateTag, { foreignKey: 'candidate_id', as: 'candidateTags' });
  }
  if (!CandidateTag.associations?.tag) {
    CandidateTag.belongsTo(Tag, { foreignKey: 'tag_id', as: 'tag' });
  }
};

associateTagRelations();

const includeCandidateTags = [
  {
    model: CandidateTag,
    as: 'candidateTags',
    required: false,
    where: {
      is_active: true,
    },
    include: [
      {
        model: Tag,
        as: 'tag',
      },
    ],
  },
];

const mapCandidateWithTags = (candidate) => {
  if (!candidate) return null;
  const payload = candidate.toJSON ? candidate.toJSON() : { ...candidate };
  const candidateTags = payload.candidateTags || [];
  const tags = candidateTags
    .map((ct) => ct.tag?.tagKey || ct.tag?.displayNameHe)
    .filter(Boolean);
  payload.tags = tags;
  payload.tagDetails = candidateTags.map((ct) => ({
    id: ct.id,
    tagId: ct.tagId,
    tagKey: ct.tag?.tagKey,
    displayNameHe: ct.tag?.displayNameHe,
    displayNameEn: ct.tag?.displayNameEn,
    rawType: ct.raw_type,
    context: ct.context,
    isCurrent: ct.is_current,
    isInSummary: ct.is_in_summary,
    confidenceScore: ct.confidence_score,
    calculatedWeight: ct.calculated_weight,
    finalScore: ct.final_score,
    status: ct.status,
  }));
  delete payload.candidateTags;
  return payload;
};

const list = async () =>
  (await Candidate.findAll({ include: includeCandidateTags })).map(mapCandidateWithTags);

const getById = async (id) => {
  const candidate = await Candidate.findByPk(id, { include: includeCandidateTags });
  if (!candidate) {
    const err = new Error('Candidate not found');
    err.status = 404;
    throw err;
  }
  return mapCandidateWithTags(candidate);
};

const fetchInstanceById = async (id) => {
  const candidate = await Candidate.findByPk(id);
  if (!candidate) {
    const err = new Error('Candidate not found');
    err.status = 404;
    throw err;
  }
  return candidate;
};

const getByUserId = async (userId) =>
  mapCandidateWithTags(
    await Candidate.findOne({ where: { userId }, include: includeCandidateTags }),
  );
const listByUserId = async (userId) =>
  (await Candidate.findAll({ where: { userId }, include: includeCandidateTags })).map(mapCandidateWithTags);

const create = async (payload) => {
  const cleanPayload = { ...payload };
  if ('embedding' in cleanPayload) {
    const parsed = sanitizeEmbedding(cleanPayload.embedding);
    if (parsed && parsed.length > 0) cleanPayload.embedding = parsed;
    else delete cleanPayload.embedding; // avoid invalid/empty vector writes
  }
  // If the DB column is pgvector and has a bad default (e.g. empty vector),
  // explicitly set null on create so we don't hit "vector must have at least 1 dimension".
  if (!('embedding' in cleanPayload)) {
    cleanPayload.embedding = null;
  }
  delete cleanPayload.tags;
  return Candidate.create(cleanPayload);
};

const sanitizeEmbedding = (emb) => {
  if (emb === null || emb === undefined) return undefined;
  if (Array.isArray(emb)) return emb;
  if (typeof emb === 'string') {
    const trimmed = emb.trim();
    // handle JSON stringified array or pgvector string "(..)" or "[..]"
    try {
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(Number).filter((n) => Number.isFinite(n));
      }
    } catch {}
    const clean = (trimmed.startsWith('(') || trimmed.startsWith('['))
      ? trimmed.slice(1, -1)
      : trimmed;
    const nums = clean
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isFinite(n));
    return nums.length ? nums : undefined;
  }
  if (emb?.data) {
    const arr = Array.from(emb.data).map((n) => Number(n)).filter((n) => Number.isFinite(n));
    return arr.length ? arr : undefined;
  }
  return undefined;
};

const update = async (id, payload) => {
  const candidate = await fetchInstanceById(id);
  const cleanPayload = { ...payload };
  if ('embedding' in cleanPayload) {
    const parsed = sanitizeEmbedding(cleanPayload.embedding);
    if (parsed && parsed.length > 0) cleanPayload.embedding = parsed;
    else delete cleanPayload.embedding; // avoid invalid/empty vector writes
  }
  delete cleanPayload.tags;
  await candidate.update(cleanPayload);
  return mapCandidateWithTags(
    await Candidate.findByPk(id, { include: includeCandidateTags }),
  );
};

const remove = async (id) => {
  const candidate = await getById(id);
  await candidate.update({ isDeleted: true });
  return candidate;
};

const searchFree = async ({ query, limit = 50 }) => {
  const term = query?.trim();
  if (!term) return [];

  return Candidate.findAll({
    where: {
      [Op.or]: [
        { fullName: { [Op.iLike]: `%${term}%` } },
        { email: { [Op.iLike]: `%${term}%` } },
        { phone: { [Op.iLike]: `%${term}%` } },
        { source: { [Op.iLike]: `%${term}%` } },
      ],
    },
    limit,
  });
};

module.exports = { list, getById, getByUserId, listByUserId, create, update, remove, searchFree };


