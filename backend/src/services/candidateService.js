const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const redis = require('./redisService');
const { isRedisAvailable } = require('../config/redis');
const { invalidateCandidateOpportunities, invalidateCandidateInAllJobMatches } = require('./matchingCacheService');
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

const CANDIDATE_KEY = (id) => `candidate:${id}`;
const CANDIDATE_TTL = 60 * 60; // 1 hour

const cacheSet = async (candidate) => {
  try {
    if (candidate?.id) await redis.set(CANDIDATE_KEY(candidate.id), candidate, { ttlSeconds: CANDIDATE_TTL });
  } catch (e) {
    console.warn('[candidateService] redis set failed (non-fatal):', e.message);
  }
};

const cacheDel = async (id) => {
  try {
    await redis.del(CANDIDATE_KEY(id));
  } catch (e) {
    console.warn('[candidateService] redis del failed (non-fatal):', e.message);
  }
};

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

/** Strip legal suffixes so "אלביט מערכות בע\"מ" resolves to canonical org "אלביט מערכות". */
const normalizeCompanyNameForOrgLookup = (name) => {
  let s = gridStr(name);
  if (!s) return '';
  s = s.replace(/\s+בע[״"']מ\.?\s*$/i, '');
  s = s.replace(/\s+בע\s*מ\.?\s*$/i, '');
  s = s.replace(/\s+l\.?t\.?d\.?\s*$/i, '');
  s = s.replace(/\s+inc\.?\s*$/i, '');
  return s.trim();
};

const companyLookupKeys = (name) => {
  const raw = gridStr(name);
  if (!raw) return [];
  const norm = normalizeCompanyNameForOrgLookup(raw);
  const keys = new Set([raw.toLowerCase()]);
  if (norm) keys.add(norm.toLowerCase());
  return [...keys];
};

const resolveOrgFromMap = (companyName, orgMap) => {
  if (!orgMap || !companyName) return null;
  for (const key of companyLookupKeys(companyName)) {
    const hit = orgMap.get(key);
    if (hit) return hit;
  }
  const norm = normalizeCompanyNameForOrgLookup(companyName).toLowerCase();
  if (!norm) return null;
  for (const [key, org] of orgMap) {
    if (key.startsWith(norm) || norm.startsWith(key)) return org;
  }
  return null;
};

const namesLikelySameCompany = (left, right) => {
  const aKeys = companyLookupKeys(left);
  const bKeys = companyLookupKeys(right);
  if (!aKeys.length || !bKeys.length) return false;
  for (const a of aKeys) {
    for (const b of bKeys) {
      if (a === b) return true;
      if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
    }
  }
  return false;
};

/** Resolve org by canonical name/alias map, then by candidate_organizations links (fuzzy name match). */
const resolveOrgForExperience = (companyName, orgMap, linkedOrgs = []) => {
  const fromMap = resolveOrgFromMap(companyName, orgMap);
  if (fromMap) return fromMap;
  for (const org of linkedOrgs) {
    const d = org?.toJSON ? org.toJSON() : org;
    if (!d) continue;
    if (namesLikelySameCompany(companyName, d.name)) return d;
    if (Array.isArray(d.aliases)) {
      for (const alias of d.aliases) {
        if (namesLikelySameCompany(companyName, alias)) return d;
      }
    }
  }
  return null;
};

const orgHasGridMetadata = (orgData) => {
  if (!orgData) return false;
  return Boolean(
    gridStr(orgData.mainField) ||
    firstSubFieldLabel(orgData.subField) ||
    gridStr(orgData.classification) ||
    gridStr(orgData.employeeCount),
  );
};

const industryLabelFromTags = (payload) => {
  for (const td of payload.tagDetails || []) {
    if (String(td.rawType || '').toLowerCase() !== 'industry') continue;
    const label = gridStr(td.displayNameHe || td.displayNameEn);
    if (label) return label;
  }
  return '';
};

const firstSubFieldLabel = (subField) => {
  if (Array.isArray(subField)) {
    for (const item of subField) {
      const s = gridStr(item);
      if (s) return s;
    }
    return '';
  }
  return gridStr(subField);
};

const isPresentEndDate = (value) =>
  /present|כיום|הווה|עד\s*היום|current/i.test(String(value || '').trim());

const parseEndYearForSort = (endDate) => {
  if (endDate == null) return 0;
  const s = String(endDate).trim();
  if (isPresentEndDate(s)) return 9999;
  const m = s.match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
};

/**
 * Build the denormalized companyExperiences array from workExperience / experience.
 * Each entry: { company, industry, sector, companySize, isCurrent, startDate, endDate }
 * Ordered: current jobs first, then by most-recent endDate, then by longest tenure.
 */
const buildCompanyExperiences = (workExperience, experience) => {
  const list = Array.isArray(workExperience) && workExperience.length
    ? workExperience
    : Array.isArray(experience) && experience.length
      ? experience
      : [];

  return list
    .filter((e) => e && String(e.company || '').trim())
    .map((e) => {
      const endDate = e.endDate != null ? String(e.endDate).trim() : null;
      const startDate = e.startDate != null ? String(e.startDate).trim() : null;
      const isCurrent = !endDate || isPresentEndDate(endDate) || e.isCurrent === true;
      return {
        company:     String(e.company || '').trim(),
        industry:    String(e.companyIndustry || e.industry || '').trim(),
        field:       String(e.field || e.companyField || '').trim(),
        sector:      String(e.sector || e.companyType || e.orgType || e.type || '').trim(),
        companySize: String(e.companySize || e.size || '').trim(),
        isCurrent,
        startDate:   startDate || null,
        endDate:     isCurrent ? null : (endDate || null),
      };
    })
    .sort((a, b) => {
      // 1. current first
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      // 2. latest endDate
      const ea = a.endDate ? parseEndYearForSort(a.endDate) : 9999;
      const eb = b.endDate ? parseEndYearForSort(b.endDate) : 9999;
      if (ea !== eb) return eb - ea;
      // 3. longest tenure
      const la = a.startDate ? (parseEndYearForSort(a.endDate || String(new Date().getFullYear())) - parseEndYearForSort(a.startDate)) : 0;
      const lb = b.startDate ? (parseEndYearForSort(b.endDate || String(new Date().getFullYear())) - parseEndYearForSort(b.startDate)) : 0;
      return lb - la;
    });
};

/** Prefer workExperience; else legacy experience JSON. Same ranking as buildCompanyExperiences. */
const pickBestExperienceRow = (payload) => {
  const built = buildCompanyExperiences(payload.workExperience, payload.experience);
  if (!built.length) return null;
  const primary = built[0];
  const wx = payload.workExperience;
  const ex = payload.experience;
  const list =
    Array.isArray(wx) && wx.length ? wx : Array.isArray(ex) && ex.length ? ex : [];
  const companyKey = gridStr(primary.company).toLowerCase();
  const match =
    list.find((e) => e && gridStr(e.company).toLowerCase() === companyKey) || list[0];
  return match;
};

/** Derive companyExperiences from workExperience (always rebuild when source rows exist). */
const ensureCompanyExperiencesOnPayload = (payload) => {
  const wx = payload.workExperience;
  const ex = payload.experience;
  const hasSource =
    (Array.isArray(wx) && wx.length) || (Array.isArray(ex) && ex.length);
  if (hasSource) {
    payload.companyExperiences = buildCompanyExperiences(wx, ex);
    return payload.companyExperiences;
  }
  if (!Array.isArray(payload.companyExperiences)) payload.companyExperiences = [];
  return payload.companyExperiences;
};

/** Ranked experiences: current → latest end date → longest tenure (companyExperiences[0] is primary). */
const pickRankedCompanyExperiences = (payload) => ensureCompanyExperiencesOnPayload(payload);

/** Most recent job: companyExperiences[0] (current → latest end date) or best workExperience row. */
const pickPrimaryCompanyExperience = (payload) => {
  const exps = pickRankedCompanyExperiences(payload);
  if (Array.isArray(exps) && exps.length && gridStr(exps[0]?.company)) {
    return exps[0];
  }
  const best = pickBestExperienceRow(payload);
  if (!best) return null;
  return {
    company: gridStr(best.company),
    industry: gridStr(best.companyIndustry || best.industry || best.companyField),
    field: gridStr(best.field || best.companyField),
    sector: gridStr(best.sector || best.companyType || best.orgType || best.type),
    companySize: gridStr(best.companySize || best.size),
  };
};

const orgFieldsFromData = (orgData) => {
  if (!orgData) return null;
  return {
    industry: gridStr(orgData.mainField),
    field: firstSubFieldLabel(orgData.subField),
    sector: gridStr(orgData.classification),
    companySize: gridStr(orgData.employeeCount),
  };
};

const mergeOrgIntoExperience = (exp, orgData) => {
  if (!exp || !orgData) return exp;
  const fromOrg = orgFieldsFromData(orgData);
  if (!fromOrg) return exp;
  if (fromOrg.industry) exp.industry = fromOrg.industry;
  if (fromOrg.field) exp.field = fromOrg.field;
  if (fromOrg.sector) exp.sector = fromOrg.sector;
  if (fromOrg.companySize) exp.companySize = fromOrg.companySize;
  return exp;
};

const enrichCompanyExperiencesArray = async (companyExperiences, linkedOrgs = []) => {
  if (!Array.isArray(companyExperiences) || !companyExperiences.length) return companyExperiences;
  const orgMap = await loadOrganizationsForCompanyNames(
    companyExperiences.map((e) => e?.company).filter(Boolean),
  );
  for (const exp of companyExperiences) {
    const orgData = resolveOrgForExperience(exp?.company, orgMap, linkedOrgs);
    if (orgData) mergeOrgIntoExperience(exp, orgData);
  }
  return companyExperiences;
};

/** Batch-resolve organizations by canonical name or aliases (incl. generic-bucket aliases). */
const loadOrganizationsForCompanyNames = async (companyNames) => {
  const keys = new Set();
  for (const n of companyNames || []) {
    for (const k of companyLookupKeys(n)) keys.add(k);
  }
  const lowerNames = [...keys];
  if (!lowerNames.length) return new Map();

  const binds = [...lowerNames, ...lowerNames];
  const ph1 = lowerNames.map((_, i) => `$${i + 1}`).join(', ');
  const offset = lowerNames.length;
  const ph2 = lowerNames.map((_, i) => `$${offset + i + 1}`).join(', ');

  const rows = await sequelize.query(
    `SELECT id, name, aliases, "mainField", "subField", "employeeCount", classification
     FROM organizations
     WHERE LOWER(TRIM(name)) IN (${ph1})
        OR EXISTS (
          SELECT 1 FROM unnest(COALESCE(aliases, ARRAY[]::text[])) a
          WHERE LOWER(TRIM(a)) IN (${ph2})
        )`,
    { bind: binds, type: QueryTypes.SELECT },
  );

  const orgMap = new Map();
  for (const d of rows) {
    const key = String(d.name || '').trim().toLowerCase();
    if (key) orgMap.set(key, d);
    for (const lk of companyLookupKeys(d.name)) orgMap.set(lk, d);
    if (Array.isArray(d.aliases)) {
      for (const alias of d.aliases) {
        for (const lk of companyLookupKeys(alias)) {
          if (!orgMap.has(lk)) orgMap.set(lk, d);
        }
      }
    }
  }
  return orgMap;
};

/** Organizations linked to candidates via candidate_organizations (employer history). */
const loadLinkedOrganizationsByCandidateIds = async (candidateIds) => {
  const ids = [...new Set((candidateIds || []).map((id) => String(id).trim()).filter(Boolean))];
  const byCandidate = new Map();
  if (!ids.length) return byCandidate;

  const rows = await sequelize.query(
    `SELECT co."candidateId" AS "candidateId",
            o.id, o.name, o.aliases, o."mainField", o."subField", o."employeeCount", o.classification
     FROM candidate_organizations co
     JOIN organizations o ON o.id = co."organizationId"
     WHERE co."candidateId" = ANY($1::uuid[])`,
    { bind: [ids], type: QueryTypes.SELECT },
  );

  for (const row of rows) {
    const cid = String(row.candidateId);
    if (!byCandidate.has(cid)) byCandidate.set(cid, []);
    byCandidate.get(cid).push(row);
  }
  return byCandidate;
};

/**
 * Pick the most relevant employer that yields grid metadata.
 * Walks ranked experiences in order; skips primary when its org is unknown/empty.
 */
const pickGridEmployerSource = (ranked, orgMap, linkedOrgs = []) => {
  for (const exp of ranked) {
    const orgData = resolveOrgForExperience(exp?.company, orgMap, linkedOrgs);
    if (orgData) mergeOrgIntoExperience(exp, orgData);
    const fromOrg = orgFieldsFromData(orgData);
    if (orgHasGridMetadata(orgData)) {
      return { exp, orgData, fromOrg };
    }
    if (gridStr(exp.industry) || gridStr(exp.sector) || gridStr(exp.companySize)) {
      return { exp, orgData, fromOrg };
    }
  }
  const primary = ranked[0];
  if (!primary) return null;
  const orgData = resolveOrgForExperience(primary.company, orgMap, linkedOrgs);
  if (orgData) mergeOrgIntoExperience(primary, orgData);
  return { exp: primary, orgData, fromOrg: orgFieldsFromData(orgData) };
};

/**
 * Grid columns תעשייה / תחום / סקטור / מס' עובדים.
 * - field: always from the most relevant job row (companyExperiences[0] / companyField).
 * - industry / sector / companySize: from that job's org when resolvable, else next ranked job with org data.
 */
const applyGridFieldsFromLastCompany = (payload, orgData = null, orgMap = null, linkedOrgs = []) => {
  const ranked = pickRankedCompanyExperiences(payload);
  payload.companyExperiences = ranked;
  const primary = ranked[0] || null;
  const primaryField = gridStr(primary?.field);

  if (orgData) {
    if (primary) mergeOrgIntoExperience(primary, orgData);
    const fromOrg = orgFieldsFromData(orgData);
    payload.industry = fromOrg?.industry || gridStr(primary?.industry);
    payload.field = primaryField || fromOrg?.field || gridStr(primary?.field);
    payload.sector = fromOrg?.sector || gridStr(primary?.sector);
    payload.companySize = fromOrg?.companySize || gridStr(primary?.companySize);
    return;
  }

  const map = orgMap || new Map();
  if (primary) {
    const primaryOrg = resolveOrgForExperience(primary.company, map, linkedOrgs);
    if (primaryOrg) mergeOrgIntoExperience(primary, primaryOrg);
    const primaryFromOrg = orgFieldsFromData(primaryOrg);
    if (orgHasGridMetadata(primaryOrg)) {
      payload.industry = primaryFromOrg.industry || gridStr(primary.industry);
      payload.field = primaryField || primaryFromOrg.field || gridStr(primary.field);
      payload.sector = primaryFromOrg.sector || gridStr(primary.sector);
      payload.companySize = primaryFromOrg.companySize || gridStr(primary.companySize);
      return;
    }
  }

  const source = pickGridEmployerSource(ranked, map, linkedOrgs);
  if (!source) {
    payload.industry = industryLabelFromTags(payload);
    payload.field = primaryField;
    payload.sector = '';
    payload.companySize = '';
    return;
  }

  const { exp, fromOrg } = source;
  payload.industry = fromOrg?.industry || gridStr(exp?.industry) || industryLabelFromTags(payload);
  payload.field = primaryField || fromOrg?.field || gridStr(exp?.field);
  payload.sector = fromOrg?.sector || gridStr(exp?.sector);
  payload.companySize = fromOrg?.companySize || gridStr(exp?.companySize);
};

/** List/detail grid: derive תעשייה / תחום / סקטור from last employer (org lookup fills in enrichMappedRowsWithOrgData). */
const enrichGridCompanyFields = (payload) => {
  applyGridFieldsFromLastCompany(payload);
};

/**
 * After mapCandidateWithTags, resolve תעשייה / תחום / סקטור / מס' עובדים from the organizations
 * table for each candidate's most relevant employer (companyExperiences[0]).
 */
const enrichMappedRowsWithOrgData = async (mappedRows) => {
  if (!mappedRows || !mappedRows.length) return;

  const companyNames = new Set();
  for (const row of mappedRows) {
    for (const exp of pickRankedCompanyExperiences(row)) {
      const name = gridStr(exp?.company);
      if (name) companyNames.add(name);
    }
  }
  if (!companyNames.size) return;

  const orgMap = await loadOrganizationsForCompanyNames([...companyNames]);
  const linkedOrgsByCandidate = await loadLinkedOrganizationsByCandidateIds(
    mappedRows.map((row) => row.id).filter(Boolean),
  );

  for (const row of mappedRows) {
    const linkedOrgs = linkedOrgsByCandidate.get(String(row.id)) || [];
    const ranked = pickRankedCompanyExperiences(row);
    for (const exp of ranked) {
      const orgData = resolveOrgForExperience(exp?.company, orgMap, linkedOrgs);
      if (orgData) mergeOrgIntoExperience(exp, orgData);
    }
    row.companyExperiences = ranked;
    applyGridFieldsFromLastCompany(row, null, orgMap, linkedOrgs);
  }
};

const mapCandidateWithTags = (candidate, options = {}) => {
  if (!candidate) return null;
  const payload = candidate.toJSON ? candidate.toJSON() : { ...candidate };
  const candidateTags = payload.candidateTags || [];
  const seenTagKeys = new Set();
  const uniqueCandidateTags = [];
  for (const ct of candidateTags) {
    const key = String(ct.tag?.tagKey || ct.tag?.displayNameHe || ct.tagId || ct.id || '')
      .trim()
      .toLowerCase();
    if (!key || seenTagKeys.has(key)) continue;
    seenTagKeys.add(key);
    uniqueCandidateTags.push(ct);
  }
  const tags = uniqueCandidateTags
    .map((ct) => ct.tag?.tagKey || ct.tag?.displayNameHe)
    .filter(Boolean);
  payload.tags = tags;
  payload.tagDetails = uniqueCandidateTags.map((ct) => ({
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

  ensureCompanyExperiencesOnPayload(payload);
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
 * Lightweight candidate fetch for vector-search pre-filtering.
 * Loads only scalar fields + embedding — NO tags JOIN.
 * ~10x faster than list() for 600+ candidates.
 */
const VECTOR_SEARCH_ATTRIBUTES = [
  'id', 'embedding', 'searchText',
  'status', 'address', 'salaryMin', 'salaryMax',
  'gender', 'mobility', 'drivingLicense', 'drivingLicenses',
  'jobScope', 'jobScopes', 'preferredWorkingHours', 'employmentType', 'employmentTypes',
  'birthYear', 'birthMonth', 'birthDay', 'age',
  'title', 'professionalSummary', 'industry', 'field', 'internalTags',
  'workExperience', 'experience', 'languages', 'skills', 'preferredWorkModels',
  'matchAnalysis', 'source', 'isArchived', 'isDeleted',
];

const listSlimForVectorSearch = async () => {
  const rows = await Candidate.findAll({ attributes: VECTOR_SEARCH_ATTRIBUTES });
  return rows.map((r) => r.get({ plain: true }));
};

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
  'companyExperiences',
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
        `("jobScope"::text = ANY($${n}::text[]) OR COALESCE("jobScopes"::text[], ARRAY[]::text[]) && $${n}::text[])`,
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

    // Company background filter — searches ALL experiences in companyExperiences JSONB array
    const cf = advanced.companyFilters;
    if (cf && typeof cf === 'object') {
      // Support both old single-value fields (industry/field) and new arrays (industries/fields)
      const cfIndustries = Array.isArray(cf.industries) ? cf.industries.map((s) => String(s).trim()).filter(Boolean)
        : (cf.industry ? [String(cf.industry).trim()] : []);
      const cfFields = Array.isArray(cf.fields) ? cf.fields.map((s) => String(s).trim()).filter(Boolean)
        : (cf.field ? [String(cf.field).trim()] : []);
      const cfRoles    = Array.isArray(cf.roles)   ? cf.roles.map((s)   => String(s).trim()).filter(Boolean)   : [];
      const cfSectors  = Array.isArray(cf.sectors)  ? cf.sectors.map((s)  => String(s).trim()).filter(Boolean)  : [];
      const cfSizes    = Array.isArray(cf.sizes)     ? cf.sizes.map((s)    => String(s).trim()).filter(Boolean)  : [];

      if (cfIndustries.length || cfFields.length || cfRoles.length || cfSectors.length || cfSizes.length) {
        // Each dimension builds its own clause (OR within dimension), then all dimensions are AND'd.
        // This ensures e.g. "tech industry AND 200+ employees" both must hold.
        const dimensionClauses = [];

        // ── INDUSTRY dimension ────────────────────────────────────────────────
        // The user picks a taxonomy category name ("טכנולוגיה וחדשנות") but candidates store
        // the sub-values ("הייטק", "פיתוח תוכנה") in their columns. We join picklist_category_values
        // to match ALL values that belong to that category, plus direct name match + JSONB.
        // We ALSO match via the organizations table: if the candidate worked at a company
        // whose org record has that mainField, count it as a match.
        if (cfIndustries.length) {
          const indOrs = cfIndustries.map((indName) => {
            const n = pushBind(binds, indName.trim());
            const n2 = pushBind(binds, indName.trim()); // separate bind for org join
            return `(
              candidates.industry ILIKE '%' || $${n} || '%'
              OR candidates.field   ILIKE '%' || $${n} || '%'
              OR EXISTS (
                SELECT 1 FROM picklist_category_values pcv
                INNER JOIN picklist_categories pc ON pc.id = pcv."categoryId"
                WHERE LOWER(TRIM(pc.name)) = LOWER(TRIM($${n}))
                  AND pc."parentId" = '16c81e14-316d-403d-951a-263d02f57f4b'
                  AND (
                    candidates.industry ILIKE '%' || COALESCE(pcv.display_name, pcv.label, pcv.value) || '%'
                    OR candidates.field ILIKE '%' || COALESCE(pcv.display_name, pcv.label, pcv.value) || '%'
                    OR EXISTS (
                      SELECT 1 FROM jsonb_array_elements(candidates."companyExperiences") AS ce
                      WHERE ce->>'industry' ILIKE '%' || COALESCE(pcv.display_name, pcv.label, pcv.value) || '%'
                    )
                  )
              )
              OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(candidates."companyExperiences") AS ce
                JOIN organizations o ON LOWER(TRIM(o.name)) = LOWER(TRIM(ce->>'company'))
                WHERE LOWER(TRIM(o."mainField")) = LOWER(TRIM($${n2}))
                   OR o."secondaryField" ILIKE '%' || $${n2} || '%'
              )
            )`;
          });
          dimensionClauses.push(`(${indOrs.join(' OR ')})`);
        }

        // ── FIELD (sub-domain) dimension ──────────────────────────────────────
        if (cfFields.length) {
          const fieldOrs = cfFields.map((f) => {
            const nf = pushBind(binds, `%${f}%`);
            const nf2 = pushBind(binds, `%${f}%`);
            const nf3 = pushBind(binds, `%${f}%`);
            return `(
              candidates.field ILIKE $${nf}
              OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(candidates."companyExperiences") AS ce
                WHERE ce->>'industry' ILIKE $${nf2}
              )
              OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(candidates."companyExperiences") AS ce
                JOIN organizations o ON LOWER(TRIM(o.name)) = LOWER(TRIM(ce->>'company'))
                WHERE o."subField" ILIKE $${nf3}
                   OR o."secondaryField" ILIKE $${nf3}
              )
            )`;
          });
          dimensionClauses.push(`(${fieldOrs.join(' OR ')})`);
        }

        // ── ROLE dimension ────────────────────────────────────────────────────
        if (cfRoles.length) {
          const roleOrs = cfRoles.map((role) => {
            const n = pushBind(binds, `%${role}%`);
            return `(tg.tag_key ILIKE $${n} OR tg.display_name_he ILIKE $${n} OR tg.display_name_en ILIKE $${n})`;
          });
          dimensionClauses.push(`EXISTS (
            SELECT 1 FROM system_tags ct
            INNER JOIN tags tg ON tg.id = ct.tag_id
            WHERE ct.entity_id = candidates.id AND ct.is_active = true AND ct.type = 'candidate'
              AND ct.raw_type IN ('role', 'seniority', 'domain', 'industry')
              AND (${roleOrs.join(' OR ')})
          )`);
        }

        // ── SECTOR dimension ──────────────────────────────────────────────────
        if (cfSectors.length) {
          const sectorOrs = cfSectors.map((s) => {
            const ns = pushBind(binds, s);
            const ns2 = pushBind(binds, s);
            const ns3 = pushBind(binds, s);
            return `(
              candidates.sector ILIKE $${ns}
              OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(candidates."companyExperiences") AS ce
                WHERE ce->>'sector' ILIKE $${ns2}
              )
              OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(candidates."companyExperiences") AS ce
                JOIN organizations o ON LOWER(TRIM(o.name)) = LOWER(TRIM(ce->>'company'))
                WHERE o.classification ILIKE $${ns3}
              )
            )`;
          });
          dimensionClauses.push(`(${sectorOrs.join(' OR ')})`);
        }

        // ── COMPANY SIZE dimension ────────────────────────────────────────────
        if (cfSizes.length) {
          const sizeOrs = cfSizes.map((sz) => {
            const nsz = pushBind(binds, sz);
            const nsz2 = pushBind(binds, sz);
            const nsz3 = pushBind(binds, sz);
            return `(
              candidates."companySize" = $${nsz}
              OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(candidates."companyExperiences") AS ce
                WHERE ce->>'companySize' = $${nsz2}
              )
              OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(candidates."companyExperiences") AS ce
                JOIN organizations o ON LOWER(TRIM(o.name)) = LOWER(TRIM(ce->>'company'))
                WHERE o."employeeCount" = $${nsz3}
              )
            )`;
          });
          dimensionClauses.push(`(${sizeOrs.join(' OR ')})`);
        }

        if (dimensionClauses.length) {
          panelFragments.push(dimensionClauses.join(' AND '));
        }
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

    // השכלה: active education/degree catalog tags; practical engineers excluded unless requested.
    if (advanced.hasDegree === true) {
      const includePracticalEngineers = advanced.includePracticalEngineers === true;
      const engineerExclude = includePracticalEngineers
        ? ''
        : `AND NOT (
            COALESCE(tg.display_name_he, '') ILIKE '%הנדסאי%'
            OR COALESCE(tg.display_name_he, '') ILIKE '%הנדסאית%'
            OR COALESCE(tg.display_name_he, '') ILIKE '%תואר הנדסאי%'
            OR COALESCE(tg.display_name_en, '') ILIKE '%הנדסאי%'
            OR COALESCE(tg.display_name_en, '') ILIKE '%הנדסאית%'
            OR COALESCE(tg.tag_key, '') ILIKE '%handasai%'
          )`;
      panelFragments.push(`EXISTS (
        SELECT 1 FROM system_tags ct
        INNER JOIN tags tg ON tg.id = ct.tag_id
        WHERE ct.entity_id = candidates.id AND ct.is_active = true AND ct.type = 'candidate'
        AND tg.status = 'active'
        AND (
          LOWER(TRIM(COALESCE(ct.raw_type, ''))) IN ('education', 'degree')
          OR LOWER(TRIM(COALESCE(tg.type::text, ''))) IN ('education', 'degree')
        )
        ${engineerExclude}
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

  // ── per-request in-memory cache keyed by jid so parallel callers for the same
  //    job don't redundantly hit DB / Redis for job data, config, and embedding ──
  if (!scoreCandidatesAgainstJob._jobCache) scoreCandidatesAgainstJob._jobCache = new Map();
  const _jc = scoreCandidatesAgainstJob._jobCache;

  let cached = _jc.get(jid);
  if (!cached) {
    let jobRow, jobPlain, config, jobEmb;
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
        /* score with whatever skills exist */
      }
    }
    jobPlain = jobService.toPlainJobForMatchScore(jobRow);

    try {
      config = await resolveEngineConfigForJob(jobPlain, {
        tenantClientId: opts.tenantClientId || null,
      });
    } catch (err) {
      console.warn('[candidateService.scoreCandidatesAgainstJob] resolveEngineConfig failed', err.message || err);
      return scores;
    }

    try {
      jobEmb = await getJobEmbedding(jobPlain);
    } catch (err) {
      console.warn('[candidateService.scoreCandidatesAgainstJob] job embedding failed', err.message || err);
      jobEmb = [];
    }

    cached = { jobPlain, config, jobEmb };
    _jc.set(jid, cached);
    // auto-clear after current event-loop tick finishes to prevent stale cross-request leakage
    setImmediate(() => _jc.delete(jid));
  }
  const { jobPlain, config, jobEmb } = cached;

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

  const LIST_SCORE_CACHE_TTL = 120; // 2 min — list scores are lightweight; invalidated on profile save
  const scoreCacheKey = (cid) => `list-score:${jid}:${cid}`;

  await runWithConcurrency(modelRows, LIST_SCORE_CONCURRENCY, async (inst) => {
    const cid = String(inst.id);
    let pkg = { matchScore: 0, scoreBreakdown: null, parameterMatches: {} };

    // Try Redis cache first
    if (isRedisAvailable()) {
      const cached = await redis.get(scoreCacheKey(cid));
      if (cached && typeof cached.matchScore === 'number') {
        scores.set(cid, cached);
        return;
      }
    }

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
    if (isRedisAvailable() && typeof pkg.matchScore === 'number') {
      redis.set(scoreCacheKey(cid), pkg, { ttlSeconds: LIST_SCORE_CACHE_TTL }).catch(() => {});
    }
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

  // Use pre-loaded Sequelize instances when the caller already fetched embedding+skills+tags,
  // avoiding a costly second Candidate.findAll with a large tags JOIN.
  if (Array.isArray(opts.preloadedInstances) && opts.preloadedInstances.length) {
    const idSet = new Set(ids.map(String));
    heavyRows = opts.preloadedInstances.filter((r) => idSet.has(String(r.id)));
  }

  if (!heavyRows.length) {
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

  // Run all per-job scoring groups in parallel (bounded concurrency) instead of sequentially.
  // Each group is already internally parallel via LIST_SCORE_CONCURRENCY inside scoreCandidatesAgainstJob.
  const JOB_GROUP_CONCURRENCY = 5;
  const jobEntries = Array.from(byJob.entries());
  await runWithConcurrency(jobEntries, JOB_GROUP_CONCURRENCY, async ([jobKey, candIdStrs]) => {
    if (reuseJobId && String(jobKey) === reuseJobId && reuseScoreMap?.size) {
      for (const cid of candIdStrs) {
        const pkg = reuseScoreMap.get(cid);
        if (pkg && typeof pkg === 'object') scoresByCandidate.set(cid, pkg);
        else if (typeof pkg === 'number' && Number.isFinite(pkg)) {
          scoresByCandidate.set(cid, { matchScore: pkg });
        }
      }
      return;
    }

    const instSubset = candIdStrs.map((cid) => heavyById.get(cid)).filter(Boolean);
    if (!instSubset.length) return;

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
  });

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
  /** Saved-search blacklist: exclude candidates whose email matches any of these. */
  blacklistedEmails = [],
  /** Saved-search blacklist: exclude candidates whose phone matches any of these. */
  blacklistedPhones = [],
} = {}) => {
  const safeLimit = Number.isFinite(limit) ? limit : 100;
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const offset = (safePage - 1) * safeLimit;
  const trimmedSearch = String(search || '').trim();
  const jid = jobId != null && String(jobId).trim() !== '' ? String(jobId).trim() : '';
  const tid = tagId != null && String(tagId).trim() !== '' ? String(tagId).trim() : '';

  let { whereSql, binds } = buildCandidateListWhere(trimmedSearch, advanced);

  // Saved-search blacklist: exclude by stable email/phone identifiers.
  if (blacklistedEmails.length > 0) {
    const placeholders = blacklistedEmails.map((e) => {
      const n = pushBind(binds, e.toLowerCase());
      return `$${n}`;
    });
    whereSql += ` AND (LOWER(email) NOT IN (${placeholders.join(',')}) OR email IS NULL)`;
  }
  if (blacklistedPhones.length > 0) {
    const placeholders = blacklistedPhones.map((p) => {
      const n = pushBind(binds, p);
      return `$${n}`;
    });
    whereSql += ` AND (phone NOT IN (${placeholders.join(',')}) OR phone IS NULL)`;
  }

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
    await enrichMappedRowsWithOrgData(mappedRows);
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

  const listAttrs = (jid || matchLastJobScores)
    ? [...LIST_GRID_ATTRIBUTES, 'embedding', 'skills']
    : LIST_GRID_ATTRIBUTES;

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
  await enrichMappedRowsWithOrgData(mappedRows);

  await attachLatestJobSubmissions(mappedRows);
  if (includeEngineScores) {
    await attachLastSubmissionEngineMatchScores(mappedRows, {
      reuseJobId: jid,
      reuseScoreMap: jid ? scoreMap : null,
      tenantClientId,
    });
  } else if (matchLastJobScores) {
    // Pass pre-loaded instances (already have embedding + skills + tags from initial query)
    // so attachLastSubmissionEngineMatchScores can skip its own heavy Candidate.findAll reload.
    await attachLastSubmissionEngineMatchScores(mappedRows, { tenantClientId, preloadedInstances: rows });
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
  // Cache-aside: return from Redis when available (skip DB + join round-trip)
  if (!opts.skipCache) {
    try {
      const cached = await redis.get(CANDIDATE_KEY(id));
      if (cached) {
        const rows = [cached];
        await enrichMappedRowsWithOrgData(rows);
        return rows[0];
      }
    } catch (e) {
      console.warn('[candidateService] redis get failed (non-fatal):', e.message);
    }
  }

  const candidate = await Candidate.findByPk(id, { include: includeCandidateTags });
  if (!candidate) {
    const err = new Error('Candidate not found');
    err.status = 404;
    throw err;
  }
  const mapped = mapCandidateWithTags(candidate);
  const rows = [mapped];
  await enrichMappedRowsWithOrgData(rows);
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

  // Populate cache for next request
  await cacheSet(row);
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
  // Always derive companyExperiences from workExperience for cross-experience search
  cleanPayload.companyExperiences = buildCompanyExperiences(
    cleanPayload.workExperience,
    cleanPayload.experience,
  );
  await prepareCityFieldsInPayload(cleanPayload);
  normalizePreferredWorkingHoursInPayload(cleanPayload);
  await applyCandidateCityFromCatalog(cleanPayload);
  syncCandidateNameForCreate(cleanPayload);
  let created;
  try {
    created = await Candidate.create(cleanPayload);
  } catch (err) {
    if (!isCityValidationError(err)) throw err;
    // eslint-disable-next-line no-console
    console.warn('[candidateService] create blocked by city validation, retrying with null city');
    cleanPayload.address = null;
    cleanPayload.location = null;
    created = await Candidate.create(cleanPayload);
  }
  await cacheSet(created.toJSON ? created.toJSON() : created);
  return created;
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

  // Re-derive companyExperiences whenever workExperience changes (or always, cheaply)
  const wxForUpdate = 'workExperience' in cleanPayload
    ? cleanPayload.workExperience
    : (candidate.workExperience || candidate.get?.('workExperience'));
  const exForUpdate = 'experience' in cleanPayload
    ? cleanPayload.experience
    : (candidate.experience || candidate.get?.('experience'));
  cleanPayload.companyExperiences = await enrichCompanyExperiencesArray(
    buildCompanyExperiences(wxForUpdate, exForUpdate),
  );

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
  const updated = mapCandidateWithTags(
    await Candidate.findByPk(id, { include: includeCandidateTags }),
  );
  await enrichMappedRowsWithOrgData([updated]);
  await cacheSet(updated);
  // Profile changed → remove stale scores from every job:*:matches + wipe their opportunities
  invalidateCandidateOpportunities(id).catch(() => {});
  invalidateCandidateInAllJobMatches(id).catch(() => {});
  return updated;
};

/** Rebuild companyExperiences from work history + organization metadata (after org sync / alias mapping). */
const refreshCompanyExperiencesForCandidate = async (id) => {
  const candidate = await Candidate.findByPk(id, {
    attributes: ['id', 'workExperience', 'experience'],
  });
  if (!candidate) return null;
  const linkedOrgs = (await loadLinkedOrganizationsByCandidateIds([id])).get(String(id)) || [];
  const companyExperiences = await enrichCompanyExperiencesArray(
    buildCompanyExperiences(candidate.workExperience, candidate.experience),
    linkedOrgs,
  );
  await Candidate.update({ companyExperiences }, { where: { id } });
  await cacheDel(id);
  return companyExperiences;
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
  // CV text changed → embedding will be rebuilt → old scores are stale everywhere
  invalidateCandidateOpportunities(id).catch(() => {});
  invalidateCandidateInAllJobMatches(id).catch(() => {});
  return mapCandidateWithTags(
    await Candidate.findByPk(id, { include: includeCandidateTags }),
  );
};

const remove = async (id) => {
  const candidate = await fetchInstanceById(id);
  await candidate.update({ isDeleted: true });
  await cacheDel(id);
  return candidate.toJSON ? candidate.toJSON() : candidate;
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
  listSlimForVectorSearch,
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
  refreshCompanyExperiencesForCandidate,
};


