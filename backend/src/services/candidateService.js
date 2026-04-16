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

  enrichGridCompanyFields(payload);

  if (options.stripListHeavyJson) {
    delete payload.workExperience;
    delete payload.experience;
  }

  return payload;
};

const list = async () =>
  (await Candidate.findAll({ include: includeCandidateTags })).map((r) => mapCandidateWithTags(r));

/**
 * GET /api/candidates grid: explicit allowlist so JSONB/array fields (languages, jobScopes) are never
 * dropped by Sequelize attribute resolution, and heavy columns stay out of the list query.
 */
const LIST_GRID_ATTRIBUTES = [
  'id',
  'fullName',
  'status',
  'phone',
  'email',
  'address',
  'idNumber',
  'maritalStatus',
  'gender',
  'drivingLicense',
  'mobility',
  'userId',
  'employmentType',
  'jobScope',
  'jobScopes',
  'availability',
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
    const g = advanced.gender;
    if (g === 'male') {
      fragments.push(`(gender ILIKE '%זכר%' OR gender ILIKE '%male%')`);
    } else if (g === 'female') {
      fragments.push(`(gender ILIKE '%נקב%' OR gender ILIKE '%female%')`);
    }

    const statusFilter = String(advanced.statusFilter || '').trim();
    if (statusFilter === 'active') {
      fragments.push(`"isArchived" = false`);
    } else if (statusFilter === 'inactive') {
      fragments.push(`"isArchived" = true`);
    }

    if (Array.isArray(advanced.tags)) {
      for (const tag of advanced.tags) {
        const t = String(tag || '').trim();
        if (!t) continue;
        const n = pushBind(binds, `%${t}%`);
        fragments.push(`EXISTS (
          SELECT 1 FROM candidate_tags ct
          INNER JOIN tags tg ON tg.id = ct.tag_id
          WHERE ct.candidate_id = candidates.id AND ct.is_active = true
          AND (tg.tag_key ILIKE $${n} OR tg.display_name_he ILIKE $${n} OR tg.display_name_en ILIKE $${n})
        )`);
      }
    }

    if (Array.isArray(advanced.locations) && advanced.locations.length) {
      const locParts = [];
      for (const loc of advanced.locations) {
        const v = String(loc?.value || '').trim();
        if (!v) continue;
        const n = pushBind(binds, `%${v}%`);
        locParts.push(`(address ILIKE $${n} OR location ILIKE $${n})`);
      }
      if (locParts.length) fragments.push(`(${locParts.join(' OR ')})`);
    }

    if (
      advanced.jobScopeAll === false &&
      Array.isArray(advanced.jobScopes) &&
      advanced.jobScopes.length
    ) {
      const n = pushBind(binds, advanced.jobScopes);
      fragments.push(
        `("jobScope" = ANY($${n}::text[]) OR "jobScopes" && $${n}::text[])`,
      );
    }

    if (advanced.lastUpdated && typeof advanced.lastUpdated === 'object') {
      const from = String(advanced.lastUpdated.from || '').trim();
      const to = String(advanced.lastUpdated.to || '').trim();
      if (from) {
        const n = pushBind(binds, from);
        fragments.push(`"updatedAt" >= $${n}::date`);
      }
      if (to) {
        const n = pushBind(binds, `${to}T23:59:59.999Z`);
        fragments.push(`"updatedAt" <= $${n}::timestamptz`);
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
      fragments.push(`EXISTS (
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
        fragments.push(`(${inRange} OR ${unknownAge})`);
      } else {
        fragments.push(`((${inRange}) AND (${hasKnownAge}))`);
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
        fragments.push(`(${inSalaryRange} OR ${unknownSalary})`);
      } else {
        fragments.push(inSalaryRange);
      }
    }

    // השכלה: at least one active tag classified as education (link raw_type or catalog type degree/education).
    if (advanced.hasDegree === true) {
      fragments.push(`EXISTS (
        SELECT 1 FROM candidate_tags ct
        INNER JOIN tags tg ON tg.id = ct.tag_id
        WHERE ct.candidate_id = candidates.id AND ct.is_active = true
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
        fragments.push(`languages::text ILIKE $${n}`);
      }
    }

    if (Array.isArray(advanced.complexRules)) {
      for (const rule of advanced.complexRules) {
        if (rule.field === 'source' && rule.textValue) {
          const tv = String(rule.textValue).trim();
          if (tv) {
            const n = pushBind(binds, `%${tv}%`);
            fragments.push(`source ILIKE $${n}`);
          }
        }
      }
    }
  }

  const whereSql = fragments.join(' AND ');
  return { whereSql, binds };
};

const listPaginated = async ({ page = 1, limit = 100, search = '', advanced = null } = {}) => {
  const safeLimit = Number.isFinite(limit) ? limit : 100;
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const offset = (safePage - 1) * safeLimit;
  const trimmedSearch = String(search || '').trim();

  const { whereSql, binds } = buildCandidateListWhere(trimmedSearch, advanced);
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

  const rows = await Candidate.findAll({
    where: { id: ids },
    include: includeCandidateTagsForList,
    attributes: LIST_GRID_ATTRIBUTES,
  });

  const orderIndex = new Map(ids.map((id, i) => [String(id), i]));
  rows.sort((a, b) => (orderIndex.get(String(a.id)) ?? 0) - (orderIndex.get(String(b.id)) ?? 0));

  return {
    rows: rows.map((r) => mapCandidateWithTags(r, { stripListHeavyJson: true })),
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


