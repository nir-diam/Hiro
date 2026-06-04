const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Candidate = require('../models/Candidate');
const RecruitmentSource = require('../models/RecruitmentSource');
const SystemTag = require('../models/SystemTag');
const { SYSTEM_TAG_TYPE_CANDIDATE } = require('../models/SystemTag');
const Tag = require('../models/Tag');
const CandidateOrganization = require('../models/CandidateOrganization');
const Organization = require('../models/Organization');
const Job = require('../models/Job');
const JobCandidate = require('../models/JobCandidate');
const { resolveEngineConfigForJob } = require('./matchingEngineService');
const cityService = require('./cityService');
const { normalizeOriginalTextHistory } = require('../utils/parsedTextHistory');
/** Lazy-require matchingScoreService + vectorSearchService inside scoring helpers to avoid circular load:
 * vectorSearchService → candidateService → matchingScoreService → vectorSearchService */

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

const trimStr = (x) => (x != null ? String(x).trim() : '');

const splitFullNameToParts = (full) => {
  const t = trimStr(full);
  if (!t) return { firstName: '', lastName: '' };
  const idx = t.indexOf(' ');
  if (idx === -1) return { firstName: t, lastName: '' };
  return { firstName: t.slice(0, idx).trim(), lastName: t.slice(idx + 1).trim() };
};

const buildFullNameFromParts = (first, last) =>
  [trimStr(first), trimStr(last)].filter(Boolean).join(' ');

const syncCandidateNameForCreate = (p) => {
  let first = trimStr(p.firstName);
  let last = trimStr(p.lastName);
  const full = trimStr(p.fullName);
  if (first || last) {
    p.firstName = first || null;
    p.lastName = last || null;
    p.fullName = buildFullNameFromParts(first, last) || full || 'מועמד חדש';
  } else if (full) {
    const parts = splitFullNameToParts(full);
    p.firstName = parts.firstName || null;
    p.lastName = parts.lastName || null;
    p.fullName = full;
  } else {
    p.fullName = 'מועמד חדש';
    p.firstName = null;
    p.lastName = null;
  }
};

const syncCandidateNameForUpdate = (p, existing) => {
  const hasFirst = Object.prototype.hasOwnProperty.call(p, 'firstName');
  const hasLast = Object.prototype.hasOwnProperty.call(p, 'lastName');
  const hasFull = Object.prototype.hasOwnProperty.call(p, 'fullName');
  if (!hasFirst && !hasLast && !hasFull) return;

  const exFirst = trimStr(existing.firstName);
  const exLast = trimStr(existing.lastName);
  const exFull = trimStr(existing.fullName);

  const first = hasFirst ? trimStr(p.firstName) : exFirst;
  const last = hasLast ? trimStr(p.lastName) : exLast;
  const fullIn = hasFull ? trimStr(p.fullName) : '';

  if (hasFirst || hasLast) {
    p.firstName = first || null;
    p.lastName = last || null;
    p.fullName = buildFullNameFromParts(first, last) || fullIn || exFull || 'מועמד חדש';
  } else if (hasFull && fullIn) {
    p.fullName = fullIn;
    const parts = splitFullNameToParts(fullIn);
    p.firstName = parts.firstName || null;
    p.lastName = parts.lastName || null;
  }
};

const enrichCandidateNameForRead = (payload) => {
  const fn = trimStr(payload.firstName);
  const ln = trimStr(payload.lastName);
  const full = trimStr(payload.fullName);
  if (!fn && !ln && full) {
    const parts = splitFullNameToParts(full);
    payload.firstName = parts.firstName;
    payload.lastName = parts.lastName;
  } else if (!full && (fn || ln)) {
    payload.fullName = buildFullNameFromParts(fn, ln);
  }
};

const associateTagRelations = () => {
  if (!Candidate.associations?.candidateTags) {
    Candidate.hasMany(SystemTag, {
      foreignKey: 'entity_id',
      as: 'candidateTags',
      scope: { type: SYSTEM_TAG_TYPE_CANDIDATE },
    });
  }
  if (!SystemTag.associations?.tag) {
    SystemTag.belongsTo(Tag, { foreignKey: 'tag_id', as: 'tag' });
  }
};

associateTagRelations();

const includeCandidateTags = [
  {
    model: SystemTag,
    as: 'candidateTags',
    required: false,
    where: {
      type: SYSTEM_TAG_TYPE_CANDIDATE,
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
    model: SystemTag,
    as: 'candidateTags',
    required: false,
    separate: true,
    where: {
      type: SYSTEM_TAG_TYPE_CANDIDATE,
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

/** One query for all candidate tags (avoids separate:true N+1 on list pages). */
const attachCandidateTagsBulk = async (instances = []) => {
  if (!Array.isArray(instances) || !instances.length) return instances;
  const ids = [...new Set(instances.map((r) => r?.id).filter(Boolean))];
  if (!ids.length) return instances;

  const tagRows = await SystemTag.findAll({
    where: {
      entity_id: { [Op.in]: ids },
      type: SYSTEM_TAG_TYPE_CANDIDATE,
      is_active: true,
    },
    include: [
      {
        model: Tag,
        as: 'tag',
        attributes: { exclude: TAG_ATTRIBUTES_EXCLUDE_FOR_LIST },
      },
    ],
    order: [['created_at', 'ASC']],
  });

  const byCandidate = new Map();
  for (const row of tagRows) {
    const key = String(row.entity_id);
    if (!byCandidate.has(key)) byCandidate.set(key, []);
    byCandidate.get(key).push(row);
  }

  for (const inst of instances) {
    const list = byCandidate.get(String(inst.id)) || [];
    if (typeof inst.setDataValue === 'function') {
      inst.setDataValue('candidateTags', list);
    } else {
      inst.candidateTags = list;
    }
  }
  return instances;
};

/** Bounded parallel map for list scoring (keeps DB/API load predictable). */
const runWithConcurrency = async (items, limit, fn) => {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];
  const cap = Math.max(1, Math.min(limit, list.length));
  const results = new Array(list.length);
  let next = 0;
  const workers = Array.from({ length: cap }, async () => {
    while (next < list.length) {
      const i = next++;
      results[i] = await fn(list[i], i);
    }
  });
  await Promise.all(workers);
  return results;
};

const LIST_SCORE_CONCURRENCY = 12;

// When SystemTag.raw_type is null, derive from Tag.type so frontend gets correct labels (e.g. Skill, Tool).
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

const gridStr = (v) => {
  if (v == null) return '';
  const s = String(v).trim();
  if (!s || s === '-') return '';
  return s;
};

const topIndustryLabelFromAnalysis = (ia) => {
  if (!ia || typeof ia !== 'object') return '';
  const inds = ia.industries;
  if (!Array.isArray(inds) || !inds.length) return '';
  const sorted = [...inds].sort(
    (a, b) => (Number(b?.percentage) || 0) - (Number(a?.percentage) || 0),
  );
  return gridStr(sorted[0]?.label);
};

const parseEndYearForSort = (endDate) => {
  if (endDate == null) return 0;
  const s = String(endDate).trim();
  if (/present|כיום/i.test(s)) return 9999;
  const m = s.match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
};

/** Prefer workExperience; else legacy experience JSON. Pick current job or latest by end year. */
const pickBestExperienceRow = (payload) => {
  const wx = payload.workExperience;
  const ex = payload.experience;
  const list =
    Array.isArray(wx) && wx.length ? wx : Array.isArray(ex) && ex.length ? ex : [];
  if (!list.length) return null;
  const current = list.find(
    (e) =>
      e &&
      (/present|כיום/i.test(String(e.endDate || e.end || '').trim()) || e.isCurrent === true),
  );
  if (current) return current;
  let best = list[0];
  let bestY = parseEndYearForSort(best?.endDate || best?.end);
  for (let i = 1; i < list.length; i++) {
    const e = list[i];
    const y = parseEndYearForSort(e?.endDate || e?.end);
    if (y > bestY) {
      bestY = y;
      best = e;
    }
  }
  return best;
};

const sortTagDetailsByRelevance = (details, rawType) => {
  const t = String(rawType).toLowerCase();
  return [...details.filter((d) => String(d.rawType || '').toLowerCase() === t)].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return (Number(b.finalScore) || 0) - (Number(a.finalScore) || 0);
  });
};

/** Fill empty industry / field / sector / companySize for list & detail from tags + analysis + experience. */
const enrichGridCompanyFields = (payload) => {
  const details = payload.tagDetails || [];
  const bestExp = pickBestExperienceRow(payload);

  if (!gridStr(payload.industry)) {
    const fromIa = topIndustryLabelFromAnalysis(payload.industryAnalysis);
    if (fromIa) payload.industry = fromIa;
  }
  if (!gridStr(payload.industry)) {
    const sorted = sortTagDetailsByRelevance(details, 'industry');
    const tag = sorted[0];
    if (tag) {
      payload.industry =
        gridStr(tag.displayNameHe) || gridStr(tag.displayNameEn) || gridStr(tag.tagKey);
    }
  }
  if (!gridStr(payload.industry) && bestExp) {
    const v =
      gridStr(bestExp.companyField) ||
      gridStr(bestExp.industry) ||
      gridStr(bestExp.companyIndustry);
    if (v) payload.industry = v;
  }

  if (!gridStr(payload.field)) {
    const sorted = sortTagDetailsByRelevance(details, 'role');
    const tag = sorted[0];
    if (tag) {
      payload.field =
        gridStr(tag.category) ||
        gridStr(tag.displayNameHe) ||
        gridStr(tag.displayNameEn) ||
        gridStr(tag.tagKey);
    }
  }
  if (!gridStr(payload.field) && bestExp) {
    const v = gridStr(bestExp.field) || gridStr(bestExp.companyField);
    if (v) payload.field = v;
  }

  if (!gridStr(payload.sector)) {
    const ia = payload.industryAnalysis;
    const sub = ia?.smartTags?.orgDNA?.subLabel;
    if (gridStr(sub)) payload.sector = gridStr(sub);
    else if (Array.isArray(ia?.smartTags?.domains) && ia.smartTags.domains.length) {
      payload.sector = gridStr(ia.smartTags.domains[0]);
    }
  }
  if (!gridStr(payload.sector) && bestExp) {
    const v =
      gridStr(bestExp.type) ||
      gridStr(bestExp.companyType) ||
      gridStr(bestExp.sector) ||
      gridStr(bestExp.orgType);
    if (v) payload.sector = v;
  }

  if (!gridStr(payload.companySize) && bestExp) {
    const v = gridStr(bestExp.size) || gridStr(bestExp.companySize);
    if (v) payload.companySize = v;
  }
};

const mapCandidateWithTags = (candidate, options = {}) => {
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
    quote: ct.quote || null,
    // Mirror `quote` into the legacy `evidence` field so existing UI tooltip code
    // (CandidateProfile.normalizeTagDetail → SmartTagTooltipPanel.cvQuote) keeps working.
    evidence: ct.quote || null,
    createdBy: ct.created_by || ct.createdBy || null,
    tagSource: ct.tag?.source || null,
    createdAt: ct.created_at,
    updatedAt: ct.updated_at,
  }));
  delete payload.candidateTags;

  let langs = Array.isArray(payload.languages) ? payload.languages : [];
  if (!langs.length && payload.tagDetails?.length) {
    const seen = new Set(
      langs.map((x) => String(x?.name || x?.language || '').trim().toLowerCase()).filter(Boolean),
    );
    for (const td of payload.tagDetails) {
      const rt = String(td.rawType || '').toLowerCase();
      if (rt !== 'language') continue;
      const name = String(td.displayNameHe || td.displayNameEn || td.tagKey || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      langs.push({ name });
    }
  }
  payload.languages = langs;
  payload.jobScopes = Array.isArray(payload.jobScopes) ? payload.jobScopes : [];
  payload.drivingLicenses = Array.isArray(payload.drivingLicenses) ? payload.drivingLicenses : [];
  if (!payload.drivingLicenses.length && payload.drivingLicense) {
    payload.drivingLicenses = [String(payload.drivingLicense).trim()].filter(Boolean);
  }
  payload.employmentTypes = Array.isArray(payload.employmentTypes) ? payload.employmentTypes : [];
  if (!payload.employmentTypes.length && payload.employmentType) {
    payload.employmentTypes = [String(payload.employmentType).trim()].filter(Boolean);
  }

  enrichCandidateNameForRead(payload);

  enrichGridCompanyFields(payload);

  if (options.stripListHeavyJson) {
    delete payload.workExperience;
    delete payload.experience;
  }

  return payload;
};

/** Same CandidateTag join as list scoring — engine matches job skills against `tags` + skills JSON. */
async function findByPkWithTagsForMatchScore(id) {
  return Candidate.findByPk(id, { include: includeCandidateTagsForList });
}

/** Batch load candidates with tags + scoring fields (Sonar / bulk engine scoring). */
async function findManyWithTagsForMatchScore(ids) {
  const unique = [...new Set((ids || []).map((id) => String(id).trim()).filter(Boolean))];
  if (!unique.length) return [];
  return Candidate.findAll({
    where: { id: { [Op.in]: unique } },
    include: includeCandidateTagsForList,
    attributes: [...LIST_GRID_ATTRIBUTES, ...LIST_SCORING_EXTRA_ATTRIBUTES],
  });
}

/** Plain candidate shaped like scored list rows for computeFullMatchScore. */
function toPlainCandidateForMatchScore(candidateRow) {
  if (!candidateRow) return null;
  const plain = mapCandidateWithTags(candidateRow, { stripListHeavyJson: false });
  const { normalizeEmbedding } = require('./vectorSearchService');
  plain.embedding = normalizeEmbedding(plain.embedding);
  return plain;
}

const list = async () =>
  (await Candidate.findAll({ include: includeCandidateTags })).map((r) => mapCandidateWithTags(r));

/**
 * GET /api/candidates grid: explicit allowlist so JSONB/array fields (languages, jobScopes) are never
 * dropped by Sequelize attribute resolution, and heavy columns stay out of the list query.
 */
const LIST_GRID_ATTRIBUTES = [
  'id',
  'fullName',
  'firstName',
  'lastName',
  'status',
  'phone',
  'email',
  'address',
  'idNumber',
  'maritalStatus',
  'gender',
  'drivingLicense',
  'drivingLicenses',
  'mobility',
  'userId',
  'employmentType',
  'employmentTypes',
  'jobScope',
  'preferredWorkModels',
  'jobScopes',
  'availability',
  'preferredWorkingHours',
  'physicalWork',
  'birthYear',
  'birthMonth',
  'birthDay',
  'age',
  'location',
  'title',
  'professionalSummary',
  'profilePicture',
  'resumeUrl',
  'internalTags',
  /** Used only to derive sector / company size / field when columns are empty; stripped from list JSON. */
  'workExperience',
  'experience',
  'languages',
  'salaryMin',
  'salaryMax',
  'source',
  'lastActivity',
  'lastActive',
  'matchScore',
  'matchAnalysis',
  'sector',
  'companySize',
  'field',
  'industry',
  'industryAnalysis',
  'isArchived',
  'isDeleted',
  'createdAt',
  'updatedAt',
];

const pushBind = (binds, val) => {
  binds.push(val);
  return binds.length;
};

/** Persist daily-hours preference (גמיש / ללא אילוצי שעות / HH:mm-HH:mm) on `preferredWorkingHours`. */
const normalizePreferredWorkingHoursInPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return;
  if (!Object.prototype.hasOwnProperty.call(payload, 'preferredWorkingHours')) return;
  const raw = payload.preferredWorkingHours;
  if (raw === undefined) {
    delete payload.preferredWorkingHours;
    return;
  }
  if (raw === null || raw === '') {
    payload.preferredWorkingHours = null;
    return;
  }
  const s = String(raw).trim();
  if (!s) {
    payload.preferredWorkingHours = null;
    return;
  }
  if (s === 'גמיש' || s === 'ללא אילוצי שעות') {
    payload.preferredWorkingHours = s;
    return;
  }
  const rangeOk = /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(s);
  payload.preferredWorkingHours = rangeOk ? s : s.slice(0, 255);
};

/** Resolve or clear city fields before create/update — never throws. */
const prepareCityFieldsInPayload = async (payload) => {
  if (!payload || typeof payload !== 'object') return;
  const touchesAddress = Object.prototype.hasOwnProperty.call(payload, 'address');
  const touchesLocation = Object.prototype.hasOwnProperty.call(payload, 'location');
  // Partial updates (e.g. resumeUrl only) must not wipe stored city.
  if (!touchesAddress && !touchesLocation) return;

  const raw = String(
    touchesAddress ? payload.address ?? '' : payload.location ?? '',
  ).trim();
  if (!raw) {
    if (touchesAddress || touchesLocation) {
      payload.address = null;
      payload.location = null;
    }
    return;
  }
  try {
    const canonical = await cityService.resolveCityForCandidate(raw);
    payload.address = canonical;
    payload.location = canonical;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[candidateService] prepareCityFields failed (non-fatal):', raw, err?.message || err);
    if (touchesAddress || touchesLocation) {
      payload.address = null;
      payload.location = null;
    }
  }
};

const isCityValidationError = (err) =>
  Boolean(err && (err.status === 400 || /עיר/.test(String(err.message || ''))));

/** Never throws — clears address/location when city cannot be resolved. */
const applyCandidateCityFromCatalog = async (payload) => {
  if (!payload || typeof payload !== 'object') return;
  const touchesAddress = Object.prototype.hasOwnProperty.call(payload, 'address');
  const touchesLocation = Object.prototype.hasOwnProperty.call(payload, 'location');
  if (!touchesAddress && !touchesLocation) return;

  const raw = String(
    touchesAddress ? payload.address ?? '' : payload.location ?? '',
  ).trim();

  if (!raw) {
    if (touchesAddress) payload.address = null;
    if (touchesLocation) payload.location = null;
    return;
  }

  try {
    const canonical = await cityService.resolveCityForCandidate(raw);
    if (!canonical) {
      // eslint-disable-next-line no-console
      console.warn('[candidateService] city not in catalog, clearing address/location:', raw);
      payload.address = null;
      payload.location = null;
      return;
    }
  // eslint-disable-next-line no-console
    console.log('[candidateService] city resolved:', { input: raw, canonical });
    payload.address = canonical;
    payload.location = canonical;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[candidateService] city resolution error (non-fatal), clearing address/location:',
      raw,
      err?.message || err,
    );
    payload.address = null;
    payload.location = null;
  }
};

/** @deprecated use applyCandidateCityFromCatalog — kept as alias, never throws */
const normalizeCandidateCityInPayload = applyCandidateCityFromCatalog;

/** Normalize typography so job catalog text matches candidate CV text (e.g. גרשיים vs ASCII "). */
const normalizeInterestSearchText = (s) =>
  String(s || '')
    .trim()
    .replace(/[\u201c\u201d\u05f4\u201e]/g, '"')
    .replace(/\s+/g, ' ');

/** e.g. "קצין/ת ביטחון (קב\"ט)" → also "קצין/ת ביטחון" for job.role equality variants. */
const expandInterestRolePhrases = (roleRaw) => {
  if (!roleRaw) return [];
  const phrases = [roleRaw];
  const stripped = roleRaw
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length >= 3 && stripped !== roleRaw) phrases.push(stripped);
  return phrases;
};

/**
 * Shared WHERE for candidate list + count (parameterized).
 * @param {string} trimmedSearch - free text (name / email / summary)
 * @param {object|null} advanced - JSON from GET ?adv= (frontend advanced search panel)
 */
const buildCandidateListWhere = (trimmedSearch, advanced) => {
  const fragments = ['"isDeleted" = false'];
  const binds = [];

  if (trimmedSearch) {
    const n = pushBind(binds, `%${trimmedSearch}%`);
    fragments.push(
      `("fullName" ILIKE $${n} OR "email" ILIKE $${n} OR "professionalSummary" ILIKE $${n})`,
    );
  }

  if (advanced && typeof advanced === 'object' && !Array.isArray(advanced)) {
    const panelFragments = [];
    const g = advanced.gender;
    if (g === 'male') {
      panelFragments.push(`(gender ILIKE '%זכר%' OR gender ILIKE '%male%')`);
    } else if (g === 'female') {
      panelFragments.push(`(gender ILIKE '%נקב%' OR gender ILIKE '%female%')`);
    }

    const statusFilter = String(advanced.statusFilter || '').trim();
    if (statusFilter === 'active') {
      panelFragments.push(`"isArchived" = false`);
    } else if (statusFilter === 'inactive') {
      panelFragments.push(`"isArchived" = true`);
    }

    if (Array.isArray(advanced.tags)) {
      for (const tag of advanced.tags) {
        const t = String(tag || '').trim();
        if (!t) continue;
        const n = pushBind(binds, `%${t}%`);
        panelFragments.push(`EXISTS (
          SELECT 1 FROM system_tags ct
          INNER JOIN tags tg ON tg.id = ct.tag_id
          WHERE ct.entity_id = candidates.id AND ct.is_active = true AND ct.type = 'candidate'
          AND (tg.tag_key ILIKE $${n} OR tg.display_name_he ILIKE $${n} OR tg.display_name_en ILIKE $${n})
        )`);
      }
    }

    if (Array.isArray(advanced.locations) && advanced.locations.length) {
      const locParts = [];
      for (const loc of advanced.locations) {
        const v = String(loc?.value || '').trim();
        if (!v) continue;
        const locType = String(loc?.type || 'city').trim().toLowerCase();
        if (locType === 'region') {
          const rn = pushBind(binds, v);
          locParts.push(`EXISTS (
            SELECT 1 FROM cities c
            WHERE TRIM(COALESCE(c.column4, c.region, '')) ILIKE TRIM($${rn}::text)
            AND (
              candidates.address ILIKE '%' || TRIM(COALESCE(c.city_name, c.city, '')) || '%'
              OR candidates.location ILIKE '%' || TRIM(COALESCE(c.city_name, c.city, '')) || '%'
            )
          )`);
        } else {
          const n = pushBind(binds, `%${v}%`);
          locParts.push(`(address ILIKE $${n} OR location ILIKE $${n})`);
        }
      }
      if (locParts.length) panelFragments.push(`(${locParts.join(' OR ')})`);
    }

    if (
      advanced.jobScopeAll === false &&
      Array.isArray(advanced.jobScopes) &&
      advanced.jobScopes.length
    ) {
      const n = pushBind(binds, advanced.jobScopes);
      panelFragments.push(
        `("jobScope" = ANY($${n}::text[]) OR "jobScopes" && $${n}::text[])`,
      );
    }

    if (advanced.lastUpdated && typeof advanced.lastUpdated === 'object') {
      const from = String(advanced.lastUpdated.from || '').trim();
      const to = String(advanced.lastUpdated.to || '').trim();
      if (from) {
        const n = pushBind(binds, from);
        panelFragments.push(`"updatedAt" >= $${n}::date`);
      }
      if (to) {
        const n = pushBind(binds, `${to}T23:59:59.999Z`);
        panelFragments.push(`"updatedAt" <= $${n}::timestamptz`);
      }
    }

    const roleRaw = normalizeInterestSearchText(advanced.interestRole || '');
    const interestFieldRaw = normalizeInterestSearchText(advanced.interestField || '');

    // Match jobs.field / jobs.role (catalog), then only candidates linked in job_candidates.
    if (interestFieldRaw || roleRaw) {
      const jobMatchConds = [];
      if (interestFieldRaw) {
        const n = pushBind(binds, interestFieldRaw);
        jobMatchConds.push(`LOWER(TRIM(COALESCE(j.field, ''))) = LOWER(TRIM($${n}::text))`);
      }
      if (roleRaw) {
        const phrases = expandInterestRolePhrases(roleRaw);
        const roleEqParts = phrases.map((phrase) => {
          const nn = pushBind(binds, phrase);
          return `LOWER(TRIM(COALESCE(j.role, ''))) = LOWER(TRIM($${nn}::text))`;
        });
        jobMatchConds.push(
          roleEqParts.length === 1 ? roleEqParts[0] : `(${roleEqParts.join(' OR ')})`,
        );
      }
      panelFragments.push(`EXISTS (
        SELECT 1 FROM job_candidates jc
        INNER JOIN jobs j ON j.id = jc."jobId"
        WHERE jc."candidateId" = candidates.id
          AND jc."jobId" IS NOT NULL
          AND ${jobMatchConds.join(' AND ')}
      )`);
    }

    // Age: when ageMin/ageMax sent, filter by range. includeUnknownAge=true → also rows with no parseable age.
    const amin =
      advanced.ageMin != null && advanced.ageMin !== '' ? Number(advanced.ageMin) : NaN;
    const amax =
      advanced.ageMax != null && advanced.ageMax !== '' ? Number(advanced.ageMax) : NaN;
    const includeUnknownAge = advanced.includeUnknownAge === true;
    if (Number.isFinite(amin) && Number.isFinite(amax)) {
      const cy = new Date().getFullYear();
      const n1 = pushBind(binds, amin);
      const n2 = pushBind(binds, amax);
      const numericAge = `(NULLIF(trim(COALESCE(age::text, '')), '') ~ '^[0-9]+$' AND (NULLIF(trim(COALESCE(age::text, '')), ''))::int BETWEEN $${n1} AND $${n2})`;
      const birthYearTrim = `NULLIF(trim(COALESCE("birthYear"::text, '')), '')`;
      const birthAge = `((${birthYearTrim}) ~ '^[0-9]{4}$' AND (${cy} - (${birthYearTrim})::int) BETWEEN $${n1} AND $${n2})`;
      const inRange = `(${numericAge} OR ${birthAge})`;
      // IS TRUE so empty/null age (regex → NULL) counts as “unknown”, not excluded by NOT(NULL).
      const hasKnownAge = `(
        (NULLIF(trim(COALESCE(age::text, '')), '') ~ '^[0-9]+$' IS TRUE)
        OR ((${birthYearTrim}) ~ '^[0-9]{4}$' IS TRUE)
      )`;
      const unknownAge = `(NOT (${hasKnownAge}))`;
      // Checked: in range OR no parseable age. Unchecked: in range only among those with a known age (exclude unknown).
      if (includeUnknownAge) {
        panelFragments.push(`(${inRange} OR ${unknownAge})`);
      } else {
        panelFragments.push(`((${inRange}) AND (${hasKnownAge}))`);
      }
    }

    // Salary: when salaryMin/salaryMax sent. includeUnknownSalary=true → also rows with no salary fields.
    const smin =
      advanced.salaryMin != null && advanced.salaryMin !== '' ? Number(advanced.salaryMin) : NaN;
    const smax =
      advanced.salaryMax != null && advanced.salaryMax !== '' ? Number(advanced.salaryMax) : NaN;
    const includeUnknownSalary = advanced.includeUnknownSalary === true;
    if (Number.isFinite(smin) && Number.isFinite(smax)) {
      const n1 = pushBind(binds, smin);
      const n2 = pushBind(binds, smax);
      const hasSalary = `("salaryMin" IS NOT NULL OR "salaryMax" IS NOT NULL)`;
      const overlap = `(COALESCE("salaryMin", 0) <= $${n2} AND COALESCE("salaryMax", "salaryMin", 2147483647) >= $${n1})`;
      const inSalaryRange = `(${hasSalary} AND ${overlap})`;
      const unknownSalary = `(NOT (${hasSalary}))`;
      if (includeUnknownSalary) {
        panelFragments.push(`(${inSalaryRange} OR ${unknownSalary})`);
      } else {
        panelFragments.push(inSalaryRange);
      }
    }

    // השכלה: at least one active tag classified as education (link raw_type or catalog type degree/education).
    if (advanced.hasDegree === true) {
      panelFragments.push(`EXISTS (
        SELECT 1 FROM system_tags ct
        INNER JOIN tags tg ON tg.id = ct.tag_id
        WHERE ct.entity_id = candidates.id AND ct.is_active = true AND ct.type = 'candidate'
        AND tg.status = 'active'
        AND (
          LOWER(TRIM(COALESCE(ct.raw_type, ''))) IN ('education')
          OR LOWER(TRIM(COALESCE(tg.type::text, ''))) IN ('education')
        )
      )`);
    }

    if (Array.isArray(advanced.languages) && advanced.languages.length) {
      for (const lf of advanced.languages) {
        const lang = String(lf?.language || '').trim();
        if (!lang) continue;
        const n = pushBind(binds, `%${lang}%`);
        panelFragments.push(`languages::text ILIKE $${n}`);
      }
    }

    /** Preferred daily hours: `preferredWorkingHours` column; fallback to legacy values still stored on `availability`. */
    const whRaw = String(advanced.workingHours || '').trim();
    const whFlexible =
      !whRaw || whRaw === 'גמיש' || whRaw === 'ללא אילוצי שעות';
    if (whRaw && !whFlexible) {
      const nEq = pushBind(binds, whRaw);
      const nLike = pushBind(binds, `%${whRaw}%`);
      panelFragments.push(
        `((NULLIF(TRIM(COALESCE("preferredWorkingHours", '')), '') IS NOT NULL AND (TRIM(COALESCE("preferredWorkingHours", '')) = $${nEq} OR "preferredWorkingHours" ILIKE $${nLike})) OR (NULLIF(TRIM(COALESCE("preferredWorkingHours", '')), '') IS NULL AND NULLIF(TRIM(COALESCE(availability::text, '')), '') IS NOT NULL AND (TRIM(COALESCE(availability::text, '')) = $${nEq} OR availability ILIKE $${nLike})))`,
      );
    }

    let complexSql = null;
    if (Array.isArray(advanced.complexRules) && advanced.complexRules.length) {
      const { compileComplexRulesWhere, combinePanelAndComplexSql } = require('./complexQueryCompiler');
      complexSql = compileComplexRulesWhere(advanced.complexRules, binds);
      const panelSql = panelFragments.join(' AND ');
      const merged = combinePanelAndComplexSql(panelSql, complexSql, advanced.complexRules);
      if (merged) {
        panelFragments.length = 0;
        panelFragments.push(merged);
      }
    }

    if (advanced.dataIncomplete === true) {
      const n = pushBind(binds, 'חסר נתונים');
      panelFragments.push(`"status" = $${n}`);
    }

    fragments.push(...panelFragments);
  }

  const whereSql = fragments.join(' AND ');
  return { whereSql, binds };
};

/**
 * Multi-dimensional match vs one job (matchingScoreService + admin weights).
 * @param {import('sequelize').Model[]} modelRows Candidate rows with tags included
 * @param {string} jobId
 * @returns {Promise<Map<string, { matchScore: number, scoreBreakdown: object, parameterMatches: object }>>}
 */
const scoreCandidatesAgainstJob = async (modelRows, jobId, opts = {}) => {
  const {
    computeMatchPackage,
    getJobEmbedding,
    buildLinkedInfoFromJobCandidate,
    buildIntentOptionsByCandidateIds,
  } = require('./matchingScoreService');

  const scores = new Map();
  const jid = jobId && String(jobId).trim();
  if (!jid || !Array.isArray(modelRows) || modelRows.length === 0) return scores;

  let jobRow;
  let jobService;
  try {
    jobService = require('./jobService');
    jobRow = await jobService.getById(jid);
  } catch (err) {
    console.warn('[candidateService.scoreCandidatesAgainstJob] bad jobId', err.message || err);
    return scores;
  }
  if (!jobRow) return scores;

  if (!Array.isArray(jobRow.skills) || !jobRow.skills.length) {
    try {
      await jobService.hydrateJobSkills(jobRow);
    } catch {
      /* same as simulate — score with whatever skills exist */
    }
  }
  const jobPlain = jobService.toPlainJobForMatchScore(jobRow);

  let config;
  try {
    config = await resolveEngineConfigForJob(jobPlain, {
      tenantClientId: opts.tenantClientId || null,
    });
  } catch (err) {
    console.warn('[candidateService.scoreCandidatesAgainstJob] resolveEngineConfig failed', err.message || err);
    return scores;
  }

  let jobEmb = [];
  try {
    jobEmb = await getJobEmbedding(jobPlain);
  } catch (err) {
    console.warn('[candidateService.scoreCandidatesAgainstJob] job embedding failed', err.message || err);
  }

  const ids = modelRows.map((r) => r.id).filter(Boolean);
  let links = [];
  try {
    links = await JobCandidate.findAll({
      where: { jobId: jid, candidateId: { [Op.in]: ids } },
      attributes: ['candidateId', 'id', 'status', 'source'],
    });
  } catch (err) {
    console.warn('[candidateService.scoreCandidatesAgainstJob] links failed', err.message || err);
  }

  const linkedMap = new Map(
    links.map((r) => {
      const p = r.get ? r.get({ plain: true }) : r;
      return [String(p.candidateId), buildLinkedInfoFromJobCandidate(p)];
    }),
  );

  const intentByCandidate = await buildIntentOptionsByCandidateIds(ids);

  const { embedCandidateAndSave } = require('./vectorSearchService');

  await runWithConcurrency(modelRows, LIST_SCORE_CONCURRENCY, async (inst) => {
    const cid = String(inst.id);
    let pkg = { matchScore: 0, scoreBreakdown: null, parameterMatches: {} };
    try {
      const full = toPlainCandidateForMatchScore(inst);
      if (!full.embedding?.length) {
        try {
          const rebuilt = await embedCandidateAndSave(cid);
          const { normalizeEmbedding } = require('./vectorSearchService');
          full.embedding = normalizeEmbedding(rebuilt);
        } catch {
          /* keep empty — same as simulate */
        }
      }
      const linkedInfo = linkedMap.get(cid) || null;
      const intentOpts = intentByCandidate.get(cid) || {};
      pkg = await computeMatchPackage(full, jobPlain, jobEmb, config, linkedInfo, intentOpts);
    } catch (err) {
      console.warn('[candidateService.scoreCandidatesAgainstJob] score failed', cid, err.message || err);
    }
    scores.set(cid, pkg);
  });

  return scores;
};

/**
 * Plain candidate rows (e.g. semantic search): reload scored fields and set matchScore.
 */
const attachJobMatchScores = async (plainRows, jobId, opts = {}) => {
  const jid = jobId && String(jobId).trim();
  if (!jid || !Array.isArray(plainRows) || plainRows.length === 0) return plainRows;

  const ids = [...new Set(plainRows.map((r) => r?.id).filter(Boolean))];
  if (!ids.length) return plainRows;

  const instRows = await Candidate.findAll({
    where: { id: { [Op.in]: ids } },
    include: includeCandidateTagsForList,
    attributes: [...LIST_GRID_ATTRIBUTES, 'embedding', 'skills', 'workExperience', 'experience'],
  });

  const scoreMap = await scoreCandidatesAgainstJob(instRows, jid, opts);
  for (const row of plainRows) {
    if (!row || typeof row !== 'object') continue;
    const pkg = scoreMap.get(String(row.id));
    if (!pkg) continue;
    if (typeof pkg.matchScore === 'number' && Number.isFinite(pkg.matchScore)) {
      row.matchScore = pkg.matchScore;
    }
    if (pkg.scoreBreakdown) row.scoreBreakdown = pkg.scoreBreakdown;
    if (pkg.parameterMatches) row.parameterMatches = pkg.parameterMatches;
  }
  return plainRows;
};

/**
 * Latest job_candidates link per candidate (by updatedAt/createdAt), with job title + rating-derived match %.
 * Mutates plain candidate objects in `rows` (adds `lastJobSubmission` when a link exists).
 */
const attachLatestJobSubmissions = async (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const ids = [...new Set(rows.map((r) => r?.id).filter(Boolean))];
  if (!ids.length) return rows;

  let subs;
  try {
    subs = await sequelize.query(
      `SELECT DISTINCT ON (jc."candidateId")
        jc."candidateId" AS "candidateId",
        jc.id AS "jobCandidateId",
        jc."jobId" AS "jobId",
        COALESCE(NULLIF(TRIM(j.title), ''), NULLIF(TRIM(j."publicJobTitle"), ''), '—') AS "jobTitle",
        j.rating AS "jobRating",
        COALESCE(jc."updatedAt", jc."createdAt") AS "linkedAt"
      FROM job_candidates jc
      LEFT JOIN jobs j ON j.id = jc."jobId"
      WHERE jc."candidateId" = ANY($1::uuid[])
        AND jc."jobId" IS NOT NULL
      ORDER BY jc."candidateId", COALESCE(jc."updatedAt", jc."createdAt") DESC NULLS LAST`,
      { bind: [ids], type: QueryTypes.SELECT },
    );
  } catch (err) {
    console.error('[candidateService.attachLatestJobSubmissions]', err.message || err);
    return rows;
  }

  const subById = new Map((subs || []).map((s) => [String(s.candidateId), s]));
  for (const row of rows) {
    const sub = subById.get(String(row.id));
    if (!sub || !sub.jobId) continue;
    const rating = Number(sub.jobRating);
    const matchScore =
      Number.isFinite(rating) && rating > 0
        ? Math.min(100, Math.max(0, Math.round((rating / 5) * 100)))
        : null;
    row.lastJobSubmission = {
      jobId: String(sub.jobId),
      jobCandidateId: String(sub.jobCandidateId),
      jobTitle: String(sub.jobTitle || '—'),
      matchScore,
      linkedAt: sub.linkedAt ? new Date(sub.linkedAt).toISOString() : undefined,
    };
  }
  return rows;
};

/** Extra columns for engine scoring when reloading candidates for last-job matches */
const LIST_SCORING_EXTRA_ATTRIBUTES = ['embedding', 'skills'];

/**
 * Fill lastJobSubmission.matchScore (and optionally reuse list scores) via matchingScoreService
 * for each candidate's latest submission job. Rating-only fallback stays null when unrated.
 *
 * @param {object[]} mappedRows plain rows (after attachLatestJobSubmissions)
 * @param {{ reuseJobId?: string, reuseScoreMap?: Map<string, { matchScore: number }> }} [opts]
 */
const attachLastSubmissionEngineMatchScores = async (mappedRows, opts = {}) => {
  if (!Array.isArray(mappedRows) || mappedRows.length === 0) return mappedRows;

  const reuseJobId = opts.reuseJobId != null ? String(opts.reuseJobId).trim() : '';
  const reuseScoreMap = opts.reuseScoreMap instanceof Map ? opts.reuseScoreMap : null;

  const ids = [
    ...new Set(
      mappedRows.filter((m) => m?.lastJobSubmission?.jobId).map((m) => m.id).filter(Boolean),
    ),
  ];
  if (!ids.length) return mappedRows;

  let heavyRows = [];
  try {
    heavyRows = await Candidate.findAll({
      where: { id: { [Op.in]: ids } },
      include: includeCandidateTagsForList,
      attributes: [...LIST_GRID_ATTRIBUTES, ...LIST_SCORING_EXTRA_ATTRIBUTES],
    });
  } catch (err) {
    console.warn('[candidateService.attachLastSubmissionEngineMatchScores] reload failed', err.message || err);
    return mappedRows;
  }

  const heavyById = new Map(heavyRows.map((r) => [String(r.id), r]));
  const byJob = new Map();
  for (const m of mappedRows) {
    const lj = m.lastJobSubmission;
    if (!lj?.jobId) continue;
    const jid = String(lj.jobId);
    const cid = String(m.id);
    if (!heavyById.has(cid)) continue;
    if (!byJob.has(jid)) byJob.set(jid, []);
    byJob.get(jid).push(cid);
  }

  const scoresByCandidate = new Map();

  for (const [jobKey, candIdStrs] of byJob) {
    if (reuseJobId && String(jobKey) === reuseJobId && reuseScoreMap?.size) {
      for (const cid of candIdStrs) {
        const pkg = reuseScoreMap.get(cid);
        if (pkg && typeof pkg === 'object') scoresByCandidate.set(cid, pkg);
        else if (typeof pkg === 'number' && Number.isFinite(pkg)) {
          scoresByCandidate.set(cid, { matchScore: pkg });
        }
      }
      continue;
    }

    const instSubset = candIdStrs.map((cid) => heavyById.get(cid)).filter(Boolean);
    if (!instSubset.length) continue;

    try {
      const sm = await scoreCandidatesAgainstJob(instSubset, jobKey, {
        tenantClientId: opts.tenantClientId || null,
      });
      for (const [cid, pkg] of sm) {
        if (pkg && typeof pkg === 'object') scoresByCandidate.set(cid, pkg);
      }
    } catch (err) {
      console.warn(
        '[candidateService.attachLastSubmissionEngineMatchScores] score batch failed',
        jobKey,
        err.message || err,
      );
    }
  }

  for (const m of mappedRows) {
    const lj = m.lastJobSubmission;
    if (!lj?.jobId) continue;
    const cid = String(m.id);
    const pkg = scoresByCandidate.get(cid);
    const sc = typeof pkg === 'number' ? pkg : pkg?.matchScore;
    if (typeof sc === 'number' && Number.isFinite(sc)) {
      lj.matchScore = sc;
    }
    if (pkg && typeof pkg === 'object') {
      if (pkg.scoreBreakdown) lj.scoreBreakdown = pkg.scoreBreakdown;
      if (pkg.parameterMatches) lj.parameterMatches = pkg.parameterMatches;
    }
  }

  return mappedRows;
};

/** Match justification + highlight terms for complex free-text rules (list API). */
const enrichListRowsComplexMatchMetadata = async (mappedRows, advanced) => {
  const rules = advanced?.complexRules;
  if (!Array.isArray(rules) || !rules.length || !Array.isArray(mappedRows) || !mappedRows.length) {
    return;
  }
  const { attachComplexMatchMetadata } = require('./complexQueryCompiler');
  const needsCvText = rules.some((r) => r?.field === 'text');
  const needsLastRole = rules.some((r) => r?.field === 'last_role');
  if (needsCvText || needsLastRole) {
    const ids = mappedRows.map((m) => m.id).filter(Boolean);
    if (ids.length) {
      const extraAttrs = ['id', 'searchText', 'internalNotes', 'candidateNotes'];
      if (needsLastRole) extraAttrs.push('workExperience', 'experience', 'title');
      const extras = await Candidate.findAll({
        where: { id: { [Op.in]: ids } },
        attributes: extraAttrs,
      });
      const byId = new Map(extras.map((r) => [String(r.id), r.get({ plain: true })]));
      for (const m of mappedRows) {
        const ex = byId.get(String(m.id));
        if (ex) {
          m.searchText = ex.searchText;
          m.internalNotes = ex.internalNotes;
          m.candidateNotes = ex.candidateNotes;
          if (needsLastRole) {
            m.workExperience = ex.workExperience;
            m.experience = ex.experience;
            m.title = ex.title;
          }
        }
      }
    }
  }
  attachComplexMatchMetadata(mappedRows, rules);
  for (const m of mappedRows) {
    if (m && typeof m === 'object') delete m.searchText;
  }
};

const listPaginated = async ({
  page = 1,
  limit = 100,
  search = '',
  advanced = null,
  jobId = null,
  tagId = null,
  tenantClientId = null,
  /** Score vs filter `jobId` when set (opt-in via query). */
  includeEngineScores = false,
  /** Score each row vs its latest `lastJobSubmission.jobId` (opt-in via `matchLastJobScores=1`). */
  matchLastJobScores = false,
} = {}) => {
  const safeLimit = Number.isFinite(limit) ? limit : 100;
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const offset = (safePage - 1) * safeLimit;
  const trimmedSearch = String(search || '').trim();
  const jid = jobId != null && String(jobId).trim() !== '' ? String(jobId).trim() : '';
  const tid = tagId != null && String(tagId).trim() !== '' ? String(tagId).trim() : '';

  const { whereSql, binds } = buildCandidateListWhere(trimmedSearch, advanced);
  if (tid) {
    const n = pushBind(binds, tid);
    const tagClause = `id IN (
      SELECT DISTINCT entity_id FROM system_tags
      WHERE tag_id = $${n}::uuid AND type = 'candidate' AND is_active = true
    )`;
    const combinedWhere = `${whereSql} AND ${tagClause}`;
    const countSql = `SELECT COUNT(*)::int AS c FROM candidates WHERE ${combinedWhere}`;
    const idSql = `SELECT id FROM candidates WHERE ${combinedWhere} ORDER BY "updatedAt" DESC NULLS LAST LIMIT $${binds.length + 1} OFFSET $${binds.length + 2}`;
    const idBinds = [...binds, safeLimit, offset];

    const [countRows, idQueryRows] = await Promise.all([
      sequelize.query(countSql, { bind: binds, type: QueryTypes.SELECT }),
      sequelize.query(idSql, { bind: idBinds, type: QueryTypes.SELECT }),
    ]);
    const count = countRows[0].c;
    const ids = idQueryRows.map((r) => r.id).filter(Boolean);
    if (!ids.length) {
      return { rows: [], count, page: safePage, limit: safeLimit };
    }
    const rows = await Candidate.findAll({
      where: { id: ids },
      attributes: LIST_GRID_ATTRIBUTES,
    });
    await attachCandidateTagsBulk(rows);
    const orderIndex = new Map(ids.map((id, i) => [String(id), i]));
    rows.sort((a, b) => (orderIndex.get(String(a.id)) ?? 0) - (orderIndex.get(String(b.id)) ?? 0));
    const mappedRows = rows.map((r) => mapCandidateWithTags(r, { stripListHeavyJson: true }));
    await attachLatestJobSubmissions(mappedRows);
    if (includeEngineScores) {
      await attachLastSubmissionEngineMatchScores(mappedRows, { tenantClientId });
    } else if (matchLastJobScores) {
      await attachLastSubmissionEngineMatchScores(mappedRows, { tenantClientId });
    }
    for (const m of mappedRows) {
      const lj = m.lastJobSubmission;
      m.matchScore =
        lj && typeof lj.matchScore === 'number' && Number.isFinite(lj.matchScore) ? lj.matchScore : null;
      if (lj?.scoreBreakdown) m.scoreBreakdown = lj.scoreBreakdown;
      if (lj?.parameterMatches) m.parameterMatches = lj.parameterMatches;
    }
    await enrichListRowsComplexMatchMetadata(mappedRows, advanced);
    return { rows: mappedRows, count, page: safePage, limit: safeLimit };
  }
  const li = binds.length + 1;
  const oi = binds.length + 2;
  const countSql = `SELECT COUNT(*)::int AS c FROM candidates WHERE ${whereSql}`;
  const idSql = `SELECT id FROM candidates WHERE ${whereSql} ORDER BY "updatedAt" DESC NULLS LAST LIMIT $${li} OFFSET $${oi}`;
  const idBinds = [...binds, safeLimit, offset];

  const [countRows, idQueryRows] = await Promise.all([
    sequelize.query(countSql, { bind: binds, type: QueryTypes.SELECT }),
    sequelize.query(idSql, { bind: idBinds, type: QueryTypes.SELECT }),
  ]);
  const count = countRows[0].c;
  const idRows = idQueryRows;

  const ids = idRows.map((r) => r.id).filter(Boolean);
  if (!ids.length) {
    return {
      rows: [],
      count,
      page: safePage,
      limit: safeLimit,
    };
  }

  const listAttrs = jid ? [...LIST_GRID_ATTRIBUTES, 'embedding', 'skills'] : LIST_GRID_ATTRIBUTES;

  const rows = await Candidate.findAll({
    where: { id: ids },
    attributes: listAttrs,
  });
  await attachCandidateTagsBulk(rows);

  const orderIndex = new Map(ids.map((id, i) => [String(id), i]));
  rows.sort((a, b) => (orderIndex.get(String(a.id)) ?? 0) - (orderIndex.get(String(b.id)) ?? 0));

  let scoreMap = new Map();
  if (jid) {
    scoreMap = await scoreCandidatesAgainstJob(rows, jid, { tenantClientId });
  }

  const mappedRows = rows.map((r) => mapCandidateWithTags(r, { stripListHeavyJson: true }));

  await attachLatestJobSubmissions(mappedRows);
  if (includeEngineScores) {
    await attachLastSubmissionEngineMatchScores(mappedRows, {
      reuseJobId: jid,
      reuseScoreMap: jid ? scoreMap : null,
      tenantClientId,
    });
  } else if (matchLastJobScores) {
    await attachLastSubmissionEngineMatchScores(mappedRows, { tenantClientId });
  }

  for (const m of mappedRows) {
    if (jid) {
      const pkg = scoreMap.get(String(m.id));
      if (pkg && typeof pkg.matchScore === 'number' && Number.isFinite(pkg.matchScore)) {
        m.matchScore = pkg.matchScore;
        m.scoreBreakdown = pkg.scoreBreakdown || null;
        m.parameterMatches = pkg.parameterMatches || null;
      } else {
        m.matchScore = null;
      }
    } else {
      const lj = m.lastJobSubmission;
      m.matchScore =
        lj && typeof lj.matchScore === 'number' && Number.isFinite(lj.matchScore) ? lj.matchScore : null;
      if (lj?.scoreBreakdown) m.scoreBreakdown = lj.scoreBreakdown;
      if (lj?.parameterMatches) m.parameterMatches = lj.parameterMatches;
    }
  }

  await enrichListRowsComplexMatchMetadata(mappedRows, advanced);

  return {
    rows: mappedRows,
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
    rows: filtered.map((r) => mapCandidateWithTags(r)),
    count: filtered.length,
  };
};

const getById = async (id, opts = {}) => {
  const candidate = await Candidate.findByPk(id, { include: includeCandidateTags });
  if (!candidate) {
    const err = new Error('Candidate not found');
    err.status = 404;
    throw err;
  }
  const mapped = mapCandidateWithTags(candidate);
  const rows = [mapped];
  await attachLatestJobSubmissions(rows);
  await attachLastSubmissionEngineMatchScores(rows, {
    tenantClientId: opts.tenantClientId || null,
  });
  const row = rows[0];
  const lj = row.lastJobSubmission;
  row.matchScore =
    lj && typeof lj.matchScore === 'number' && Number.isFinite(lj.matchScore) ? lj.matchScore : null;
  if (lj?.scoreBreakdown) row.scoreBreakdown = lj.scoreBreakdown;
  if (lj?.parameterMatches) row.parameterMatches = lj.parameterMatches;
  return row;
};

const findByEmail = async (email) => {
  if (!email) return null;
  return Candidate.findOne({ where: { email } });
};

/** Match envelope sender after `email` was updated from the CV (e.g. gilad@) — set on email-ingest create. */
const findByInboundFromEmail = async (email) => {
  if (!email) return null;
  const n = String(email).trim().toLowerCase();
  if (!n) return null;
  return Candidate.findOne({ where: { inboundFromEmail: n } });
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
  (await Candidate.findAll({ where: { userId }, include: includeCandidateTags })).map((r) =>
    mapCandidateWithTags(r),
  );

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
  await prepareCityFieldsInPayload(cleanPayload);
  normalizePreferredWorkingHoursInPayload(cleanPayload);
  await applyCandidateCityFromCatalog(cleanPayload);
  syncCandidateNameForCreate(cleanPayload);
  try {
    return await Candidate.create(cleanPayload);
  } catch (err) {
    if (!isCityValidationError(err)) throw err;
    // eslint-disable-next-line no-console
    console.warn('[candidateService] create blocked by city validation, retrying with null city');
    cleanPayload.address = null;
    cleanPayload.location = null;
    return Candidate.create(cleanPayload);
  }
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
  delete cleanPayload.tagDetails;
  delete cleanPayload.backendId;
  delete cleanPayload.id;

  const strArr = (a) =>
    Array.isArray(a) ? a.map((x) => String(x || '').trim()).filter(Boolean) : undefined;

  if ('drivingLicenses' in cleanPayload) {
    cleanPayload.drivingLicenses = strArr(cleanPayload.drivingLicenses) || [];
    if (cleanPayload.drivingLicenses.length) {
      cleanPayload.drivingLicense = cleanPayload.drivingLicenses[0];
    }
  }
  if ('employmentTypes' in cleanPayload) {
    cleanPayload.employmentTypes = strArr(cleanPayload.employmentTypes) || [];
    cleanPayload.employmentType = cleanPayload.employmentTypes[0] || '';
  }
  if ('jobScopes' in cleanPayload) {
    cleanPayload.jobScopes = strArr(cleanPayload.jobScopes) || [];
    if (cleanPayload.jobScopes.length) {
      cleanPayload.jobScope = cleanPayload.jobScopes[0];
    }
  }

  if (Object.prototype.hasOwnProperty.call(cleanPayload, 'recruitmentSourceId')) {
    const rid = cleanPayload.recruitmentSourceId;
    if (rid === '' || rid === null || rid === undefined) {
      cleanPayload.recruitmentSourceId = null;
      if (!Object.prototype.hasOwnProperty.call(cleanPayload, 'source')) {
        cleanPayload.source = '';
      }
    } else {
      const rs = await RecruitmentSource.findByPk(rid);
      if (!rs) {
        const err = new Error('Invalid recruitment source');
        err.status = 400;
        throw err;
      }
      cleanPayload.source = rs.name;
    }
  }

  const mergedSource = cleanPayload.source !== undefined ? cleanPayload.source : candidate.source;
  const mergedRsId =
    cleanPayload.recruitmentSourceId !== undefined
      ? cleanPayload.recruitmentSourceId
      : candidate.recruitmentSourceId;

  if (
    Object.prototype.hasOwnProperty.call(cleanPayload, 'source') ||
    Object.prototype.hasOwnProperty.call(cleanPayload, 'recruitmentSourceId')
  ) {
    const srcTrim = String(mergedSource || '').trim();
    const cleared = !srcTrim && !mergedRsId;
    const changed =
      String(candidate.source || '').trim() !== srcTrim ||
      String(candidate.recruitmentSourceId || '') !== String(mergedRsId || '');

    if (cleared) {
      cleanPayload.recruitmentSourceId = null;
      cleanPayload.recruitmentSourceCreatedAt = null;
      cleanPayload.recruitmentSourceUpdatedAt = null;
      cleanPayload.source = '';
    } else if (changed) {
      const now = new Date();
      cleanPayload.recruitmentSourceUpdatedAt = now;
      if (!candidate.recruitmentSourceCreatedAt) {
        cleanPayload.recruitmentSourceCreatedAt = now;
      }
    }
  }

  normalizePreferredWorkingHoursInPayload(cleanPayload);

  await prepareCityFieldsInPayload(cleanPayload);
  await applyCandidateCityFromCatalog(cleanPayload);

  syncCandidateNameForUpdate(cleanPayload, candidate);

  try {
    await candidate.update(cleanPayload);
  } catch (err) {
    if (!isCityValidationError(err)) throw err;
    cleanPayload.address = null;
    cleanPayload.location = null;
    await candidate.update(cleanPayload);
  }
  return mapCandidateWithTags(
    await Candidate.findByPk(id, { include: includeCandidateTags }),
  );
};

/** Save edited parsed CV text: archive previous searchText into originalText, set new searchText. */
const saveParsedTextVersion = async (id, text) => {
  const candidate = await fetchInstanceById(id);
  const trimmed = String(text ?? '').trim();
  if (!trimmed) {
    const err = new Error('טקסט ריק');
    err.status = 400;
    throw err;
  }
  const capped = trimmed.slice(0, 50000);
  const prev = String(candidate.searchText || '').trim();
  const history = normalizeOriginalTextHistory(candidate.originalText);
  const now = new Date();
  if (prev && prev !== capped) {
    const archivedAt =
      candidate.searchTextSavedAt instanceof Date
        ? candidate.searchTextSavedAt.toISOString()
        : candidate.searchTextSavedAt
          ? String(candidate.searchTextSavedAt)
          : now.toISOString();
    history.push({ text: prev.slice(0, 50000), savedAt: archivedAt });
  }
  await candidate.update({
    searchText: capped,
    originalText: history,
    searchTextSavedAt: now,
  });
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
  saveParsedTextVersion,
  remove,
  searchFree,
  listPaginated,
  listByWorkedAtOrganization,
  findByEmail,
  findByInboundFromEmail,
  attachLatestJobSubmissions,
  attachJobMatchScores,
  findByPkWithTagsForMatchScore,
  findManyWithTagsForMatchScore,
  toPlainCandidateForMatchScore,
};


