const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Candidate = require('../models/Candidate');
const CandidateTag = require('../models/CandidateTag');
const Tag = require('../models/Tag');
const CandidateOrganization = require('../models/CandidateOrganization');
const Organization = require('../models/Organization');

// Parse year from experience date string (YYYY-MM, YYYY, or "Present")
const parseExperienceYear = (s) => {
  if (!s || typeof s !== 'string') return null;
  const t = String(s).trim();
  if (/present|כיום/i.test(t)) return new Date().getFullYear();
  const match = t.match(/^(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
};

/** Returns { yearsInCompany, isCurrent, lastEndYear } for this org from experience/workExperience. */
const getWorkedAtOrgInfo = (experience, workExperience, orgName, aliases = []) => {
  const names = new Set([
    (orgName || '').trim().toLowerCase(),
    ...(Array.isArray(aliases) ? aliases : []).map((a) => String(a).trim().toLowerCase()).filter(Boolean),
  ]);
  if (!names.size) return { yearsInCompany: null, isCurrent: false, lastEndYear: null };
  let totalYears = 0;
  let isCurrent = false;
  let lastEndYear = null;
  const exp = [
    ...(Array.isArray(experience) ? experience : []),
    ...(Array.isArray(workExperience) ? workExperience : []),
  ];
  for (const item of exp) {
    const company = String(item?.company || '').trim().toLowerCase();
    if (!company || !names.has(company)) continue;
    const start = parseExperienceYear(item.startDate);
    const end = parseExperienceYear(item.endDate);
    if (start != null && end != null && end >= start) totalYears += end - start;
    if (end != null) {
      if (/present|כיום/i.test(String(item.endDate || '').trim())) isCurrent = true;
      if (lastEndYear == null || end > lastEndYear) lastEndYear = end;
    }
  }
  return {
    yearsInCompany: totalYears > 0 ? totalYears : null,
    isCurrent,
    lastEndYear,
  };
};

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

/** List view: avoid wide tag join on candidates; second query + slim tag rows (no embeddings / synonyms JSON). */
const TAG_ATTRIBUTES_EXCLUDE_FOR_LIST = [
  'synonyms',
  'aliases',
  'domains',
  'embedding',
  'internalNote',
  'qualityState',
  'usageCount',
  'createdBy',
  'updatedBy',
  'lastUsedAt',
];

const includeCandidateTagsForList = [
  {
    model: CandidateTag,
    as: 'candidateTags',
    required: false,
    separate: true,
    where: {
      is_active: true,
    },
    include: [
      {
        model: Tag,
        as: 'tag',
        attributes: { exclude: TAG_ATTRIBUTES_EXCLUDE_FOR_LIST },
      },
    ],
  },
];

// When CandidateTag.raw_type is null, derive from Tag.type so frontend gets correct labels (e.g. Skill, Tool).
const TAG_TYPE_TO_RAW_TYPE = {
  role: 'Role',
  skill: 'Skill',
  industry: 'Industry',
  tool: 'Tool',
  certification: 'Certification',
  language: 'Language',
  seniority: 'Seniority',
  domain: 'Industry',
  soft_skill: 'Soft',
  education: 'Certification',
};

function resolveRawType(ct) {
  if (ct.raw_type) return ct.raw_type;
  const tagType = ct.tag?.type;
  if (tagType && Object.prototype.hasOwnProperty.call(TAG_TYPE_TO_RAW_TYPE, tagType)) {
    return TAG_TYPE_TO_RAW_TYPE[tagType];
  }
  if (tagType) return tagType.charAt(0).toUpperCase() + tagType.slice(1).toLowerCase();
  return null;
}

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
    rawType: resolveRawType(ct),
    context: ct.context,
    isCurrent: ct.is_current,
    isInSummary: ct.is_in_summary,
    confidenceScore: ct.confidence_score,
    calculatedWeight: ct.calculated_weight,
    finalScore: ct.final_score,
    status: ct.status,
    descriptionHe: ct.tag?.descriptionHe,
    category: ct.tag?.category,
    rawTypeReason: ct.raw_type_reason,
    tagReason: ct.tag_reason,
    createdAt: ct.created_at,
    updatedAt: ct.updated_at,
  }));
  delete payload.candidateTags;
  return payload;
};

const list = async () =>
  (await Candidate.findAll({ include: includeCandidateTags })).map(mapCandidateWithTags);

/**
 * Heavy JSON / text not used by GET /api/candidates grid (full profile loads on detail).
 * Dropping these columns is the largest win on wide rows.
 */
const LIST_EXCLUDE_ATTRIBUTES = [
  'embedding',
  'searchText',
  'workExperience',
  'experience',
  'education',
  'skills',
  'languages',
  'internalNotes',
  'candidateNotes',
  'highlights',
  'jobScopes',
  'industryAnalysis',
];

const listPaginated = async ({ page = 1, limit = 100, search = '' } = {}) => {
  const safeLimit = Number.isFinite(limit) ? limit : 100;
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const offset = (safePage - 1) * safeLimit;
  const trimmedSearch = String(search || '').trim();

  // Parameterized raw SQL: narrow index-friendly scans (no ORM overhead on COUNT/LIMIT page).
  let count;
  let idRows;
  if (!trimmedSearch) {
    const [countRows, idQueryRows] = await Promise.all([
      sequelize.query('SELECT COUNT(*)::int AS c FROM candidates WHERE "isDeleted" = false', {
        type: QueryTypes.SELECT,
      }),
      sequelize.query(
        'SELECT id FROM candidates WHERE "isDeleted" = false ORDER BY "updatedAt" DESC NULLS LAST LIMIT $1 OFFSET $2',
        { bind: [safeLimit, offset], type: QueryTypes.SELECT },
      ),
    ]);
    count = countRows[0].c;
    idRows = idQueryRows;
  } else {
    const term = `%${trimmedSearch}%`;
    const [countRows, idQueryRows] = await Promise.all([
      sequelize.query(
        `SELECT COUNT(*)::int AS c FROM candidates WHERE "isDeleted" = false
         AND ("fullName" ILIKE $1 OR "email" ILIKE $1 OR "professionalSummary" ILIKE $1)`,
        { bind: [term], type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT id FROM candidates WHERE "isDeleted" = false
         AND ("fullName" ILIKE $1 OR "email" ILIKE $1 OR "professionalSummary" ILIKE $1)
         ORDER BY "updatedAt" DESC NULLS LAST LIMIT $2 OFFSET $3`,
        { bind: [term, safeLimit, offset], type: QueryTypes.SELECT },
      ),
    ]);
    count = countRows[0].c;
    idRows = idQueryRows;
  }

  const ids = idRows.map((r) => r.id).filter(Boolean);
  if (!ids.length) {
    return {
      rows: [],
      count,
      page: safePage,
      limit: safeLimit,
    };
  }

  const rows = await Candidate.findAll({
    where: { id: ids },
    include: includeCandidateTagsForList,
    attributes: { exclude: LIST_EXCLUDE_ATTRIBUTES },
  });

  const orderIndex = new Map(ids.map((id, i) => [String(id), i]));
  rows.sort((a, b) => (orderIndex.get(String(a.id)) ?? 0) - (orderIndex.get(String(b.id)) ?? 0));

  return {
    rows: rows.map(mapCandidateWithTags),
    count,
    page: safePage,
    limit: safeLimit,
  };
};

/**
 * List candidates that are linked to a given organization (worked/working at company).
 * Filters: yearsExperience (min years at org), employmentStatus ('current'|'past'), yearsLeftAgo (left at least N years ago).
 */
const listByWorkedAtOrganization = async ({
  organizationId,
  yearsExperience,
  employmentStatus,
  yearsLeftAgo,
  limit = 500,
} = {}) => {
  if (!organizationId) {
    return { rows: [], count: 0 };
  }
  const [org, links] = await Promise.all([
    Organization.findByPk(organizationId, { attributes: ['name', 'aliases'] }),
    CandidateOrganization.findAll({ where: { organizationId }, attributes: ['candidateId'] }),
  ]);
  const candidateIds = [...new Set(links.map((l) => l.candidateId).filter(Boolean))];
  if (!candidateIds.length) {
    return { rows: [], count: 0 };
  }
  const orgName = org?.name || '';
  const aliases = org?.aliases || [];
  const safeLimit = Number.isFinite(limit) ? Math.min(500, Math.max(1, limit)) : 500;
  const candidates = await Candidate.findAll({
    where: { id: candidateIds },
    include: includeCandidateTags,
    limit: safeLimit,
    order: [['updatedAt', 'DESC']],
  });
  const currentYear = new Date().getFullYear();
  const minYears = yearsExperience != null && Number.isFinite(yearsExperience) ? Number(yearsExperience) : null;
  const wantCurrent = employmentStatus === 'current';
  const wantPast = employmentStatus === 'past';
  const leftYearsAgo = yearsLeftAgo != null && Number.isFinite(yearsLeftAgo) ? Number(yearsLeftAgo) : null;

  const filtered = candidates.filter((c) => {
    const row = c.toJSON ? c.toJSON() : { ...c.get() };
    const exp = row.experience || [];
    const workExp = row.workExperience || [];
    const { yearsInCompany, isCurrent, lastEndYear } = getWorkedAtOrgInfo(exp, workExp, orgName, aliases);

    if (minYears != null && (yearsInCompany == null || yearsInCompany < minYears)) return false;
    if (wantCurrent && !isCurrent) return false;
    if (wantPast && isCurrent) return false;
    if (leftYearsAgo != null && (isCurrent || lastEndYear == null || currentYear - lastEndYear < leftYearsAgo)) return false;

    return true;
  });

  return {
    rows: filtered.map(mapCandidateWithTags),
    count: filtered.length,
  };
};

const getById = async (id) => {
  const candidate = await Candidate.findByPk(id, { include: includeCandidateTags });
  if (!candidate) {
    const err = new Error('Candidate not found');
    err.status = 404;
    throw err;
  }
  return mapCandidateWithTags(candidate);
};

const findByEmail = async (email) => {
  if (!email) return null;
  return Candidate.findOne({ where: { email } });
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
  delete cleanPayload.sendWelcomeEmail;
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
  delete cleanPayload.sendWelcomeEmail;
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

module.exports = {
  list,
  getById,
  getByUserId,
  listByUserId,
  create,
  update,
  remove,
  searchFree,
  listPaginated,
  listByWorkedAtOrganization,
  findByEmail,
};


