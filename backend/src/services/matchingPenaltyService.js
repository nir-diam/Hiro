/**
 * General penalty policies (Penalty_general) — mismatch vs missing per dimension.
 * Config shape: penaltyPolicies.{gender|mobility|scope|license|work_hours|availability}.{mismatch,missing}
 */

function norm(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Treat UI placeholders as empty (—, -, לא רלוונטי, etc.). */
function isPlaceholderValue(s) {
  const x = norm(s);
  if (!x) return true;
  return x === '-' || x === '—' || x === 'n/a' || x === 'לא רלוונטי' || x === 'לא ידוע';
}

function partialMatch(a, b) {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

const DEFAULT_PENALTY_POLICIES = {
  gender:       { mismatch: 10, missing: 5 },
  mobility:     { mismatch: 10, missing: 5 },
  scope:        { mismatch: 10, missing: 5 },
  license:      { mismatch: 10, missing: 5 },
  work_hours:   { mismatch: 8,  missing: 4 },
  availability: { mismatch: 8,  missing: 4 },
};

const PENALTY_LABELS = {
  gender:       { mismatch: 'מין (לא תואם)',           missing: 'מין (מידע חסר)' },
  mobility:     { mismatch: 'ניידות (לא תואם)',       missing: 'ניידות (מידע חסר)' },
  scope:        { mismatch: 'היקף משרה (לא תואם)',    missing: 'היקף משרה (מידע חסר)' },
  license:      { mismatch: 'רישיון נהיגה (לא תואם)', missing: 'רישיון נהיגה (מידע חסר)' },
  work_hours:   { mismatch: 'שעות עבודה (לא תואם)',   missing: 'שעות עבודה (מידע חסר)' },
  availability: { mismatch: 'זמינות (לא תואם)',       missing: 'זמינות (מידע חסר)' },
};

function normalizePenaltyPolicies(raw) {
  const out = {};
  for (const [id, defaults] of Object.entries(DEFAULT_PENALTY_POLICIES)) {
    const row = raw && typeof raw === 'object' ? raw[id] : null;
    out[id] = {
      mismatch: Number(row?.mismatch ?? defaults.mismatch) || 0,
      missing:  Number(row?.missing  ?? defaults.missing)  || 0,
    };
  }
  return out;
}

function parseCandidateAge(candidate) {
  const ag =
    candidate.age != null ? parseInt(String(candidate.age).replace(/[^\d]/g, ''), 10) : NaN;
  if (Number.isFinite(ag) && ag > 10 && ag < 120) return ag;

  const yRaw = candidate.birthYear != null ? String(candidate.birthYear).trim() : '';
  const y = /^\d{4}$/.test(yRaw) ? parseInt(yRaw, 10) : NaN;
  const m = candidate.birthMonth != null ? parseInt(String(candidate.birthMonth), 10) : NaN;
  const d = candidate.birthDay != null ? parseInt(String(candidate.birthDay), 10) : NaN;

  if (Number.isFinite(y) && y > 1900) {
    const now = new Date();
    let age = now.getFullYear() - y;
    if (Number.isFinite(m) && m >= 1 && m <= 12) {
      const monthDiff = now.getMonth() + 1 - m;
      if (monthDiff < 0 || (monthDiff === 0 && Number.isFinite(d) && d >= 1 && now.getDate() < d)) {
        age -= 1;
      }
    }
    if (age > 10 && age < 120) return age;
  }

  const iso =
    candidate.birthDate ||
    (yRaw.includes('-') ? yRaw : null);
  if (iso) {
    const bd = new Date(iso);
    if (!Number.isNaN(bd.getTime())) {
      const now = new Date();
      let age = now.getFullYear() - bd.getFullYear();
      const md = now.getMonth() - bd.getMonth();
      if (md < 0 || (md === 0 && now.getDate() < bd.getDate())) age -= 1;
      if (age > 10 && age < 120) return age;
    }
  }

  return null;
}

function candidateMobilityRaw(candidate) {
  return candidate.mobility != null ? String(candidate.mobility).trim() : '';
}

/** True when mobility is present and not a UI placeholder (—, -, etc.). */
function candidateHasMobilityField(candidate) {
  const raw = candidateMobilityRaw(candidate);
  return Boolean(raw) && !isPlaceholderValue(raw);
}

function candidateHasMobility(candidate) {
  const m = norm(candidateMobilityRaw(candidate));
  if (!m || isPlaceholderValue(m)) return false;
  if (
    m === 'not_mobile' ||
    m === 'not mobile' ||
    m === 'לא נייד' ||
    m === 'לא' ||
    m === 'no' ||
    m === 'false'
  ) {
    return false;
  }
  if (
    m === 'mobile' ||
    m === 'נייד' ||
    m === 'כן' ||
    m === 'yes' ||
    m === 'true'
  ) {
    return true;
  }
  return false;
}

function jobRequiresGender(job) {
  const g = job.gender ? String(job.gender).trim() : '';
  return Boolean(g && g !== 'לא משנה');
}

/** Normalize gender for comparison (Hebrew job ENUM + English/picklist candidate values). */
function normalizeGenderBucket(raw) {
  const x = String(raw ?? '').trim().toLowerCase();
  if (!x || isPlaceholderValue(raw)) return '';
  if (/זכר|^male$|^m$|גבר/.test(x)) return 'm';
  if (/נקב|^female$|^f$|אישה/.test(x)) return 'f';
  return '';
}

function gendersMatch(jobGender, candidateGender) {
  const jb = normalizeGenderBucket(jobGender);
  const cb = normalizeGenderBucket(candidateGender);
  if (!jb || !cb) return false;
  return jb === cb;
}

function jobRequiresMobility(job) {
  return job.mobility === true || job.mobility === 'true';
}

function jobRequiredLicenseTypes(job) {
  const arr = Array.isArray(job.licenseTypes) ? job.licenseTypes : [];
  const fromArr = arr
    .map((x) => String(x ?? '').trim())
    .filter((x) => x && x !== 'לא חשוב');
  if (fromArr.length) return fromArr;
  const single = job.licenseType ? String(job.licenseType).trim() : '';
  if (single && single !== 'לא חשוב') return [single];
  return [];
}

function jobRequiresLicense(job) {
  return jobRequiredLicenseTypes(job).length > 0;
}

function jobTypeList(job) {
  return Array.isArray(job.jobType) ? job.jobType.map((t) => String(t)) : [];
}

function jobRequiresScope(job) {
  return jobTypeList(job).some((t) => /מלאה|חלקית|משמרות/i.test(t));
}

/** גמיש / ללא אילוצי שעות — default UI value, not a concrete hours preference. */
function isFlexibleWorkingHours(val) {
  const s = norm(val != null ? String(val) : '');
  if (!s || isPlaceholderValue(s)) return true;
  if (s === 'גמיש' || s === 'ללא אילוצי שעות') return true;
  if (/^flexible$|^no\s*hours\s*constraint/i.test(s)) return true;
  if (/ללא התחייבות|משמרות גמישות|עבודה גמישה/i.test(s)) return true;
  return false;
}

const DEFAULT_FULL_TIME_WORKING_HOURS = '08:00-17:00';

function extractJobWorkingHours(job) {
  for (const field of ['preferredWorkingHours', 'workHours', 'workingHours']) {
    const raw = job[field];
    if (raw != null && String(raw).trim() && !isFlexibleWorkingHours(raw)) {
      return String(raw).trim();
    }
  }
  const notes = job.internalNotes != null ? String(job.internalNotes) : '';
  const m = notes.match(/\[WORKING_HOURS\]\s*([^\n\r<]*)/i);
  if (m?.[1]) {
    const h = m[1].trim();
    if (h && !isFlexibleWorkingHours(h)) return h;
  }
  const jt = jobTypeList(job).join(',');
  if (/מלאה|full/i.test(jt)) return DEFAULT_FULL_TIME_WORKING_HOURS;
  return '';
}

function candidateConcreteWorkingHours(candidate) {
  const h =
    candidate.preferredWorkingHours != null ? String(candidate.preferredWorkingHours).trim() : '';
  if (!h || isFlexibleWorkingHours(h)) return '';
  return h;
}

function parseWorkingHoursRange(str) {
  const s = String(str ?? '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const sh = parseInt(m[1], 10);
  const sm = parseInt(m[2], 10);
  const eh = parseInt(m[3], 10);
  const em = parseInt(m[4], 10);
  if (sh < 0 || sh > 23 || eh < 0 || eh > 23 || sm < 0 || sm > 59 || em < 0 || em > 59) return null;
  const start = sh * 60 + sm;
  let end = eh * 60 + em;
  if (end <= start) end += 24 * 60;
  return { start, end };
}

/** Candidate window must cover most of the job window (not just touch it). */
function workingHourRangesOverlap(jobRange, candRange) {
  const overlapStart = Math.max(jobRange.start, candRange.start);
  const overlapEnd = Math.min(jobRange.end, candRange.end);
  const overlap = Math.max(0, overlapEnd - overlapStart);
  if (overlap <= 0) return false;
  const jobLen = jobRange.end - jobRange.start;
  if (jobLen <= 0) return false;
  const coverageOfJob = overlap / jobLen;
  if (coverageOfJob >= 0.5) return true;
  if (candRange.start <= jobRange.start && candRange.end >= jobRange.end) return true;
  return false;
}

function workingHoursTextRoughMatch(candidateHours, jobHours) {
  const c = norm(candidateHours);
  const j = norm(jobHours);
  if (!c || !j) return false;
  return c === j || c.includes(j) || j.includes(c);
}

function candidateHasWorkHoursInfo(candidate, job) {
  if (candidateConcreteWorkingHours(candidate)) return true;
  if (extractJobWorkingHours(job)) return false;
  return Boolean(candidateScopeOnlyBlob(candidate));
}

function jobRequiresWorkHours(job) {
  if (extractJobWorkingHours(job)) return true;
  const jt = jobTypeList(job).join(',');
  return /מלאה|חלקית|משמרות/i.test(jt);
}

/** Readiness rank: higher = more available sooner (candidates may exceed job minimum). */
const AVAILABILITY_TIER_RANK = {
  immediate: 4,
  notice: 3,
  passive: 2,
  not_relevant: 1,
};

/**
 * Maps `jobs.availability` / `candidates.availability` (emoji picklist or legacy Hebrew) to a tier id.
 */
function normalizeAvailabilityTier(raw) {
  const s = String(raw ?? '').trim();
  if (!s || isPlaceholderValue(s)) return null;
  if (s.startsWith('🟢')) return 'immediate';
  if (s.startsWith('🟡')) return 'notice';
  if (s.startsWith('🟠')) return 'passive';
  if (s.startsWith('🔴')) return 'not_relevant';
  const n = norm(s);
  if (/^מיידי|זמין לעבודה מיד|immediate|asap|available now/i.test(n)) return 'immediate';
  if (/חודש הודעה|חודש התראה|notice period|actively looking/i.test(n)) return 'notice';
  if (/פסיבי|headhunt|open to offers/i.test(n)) return 'passive';
  if (/לא רלוונטי|הקפיא תהליכים|placed|stopped looking/i.test(n)) return 'not_relevant';
  return null;
}

function inferJobAvailabilityTierFromText(text) {
  const t = norm(text);
  if (!t) return null;
  if (/מיידי|זמין לעבודה מיד|immediate|asap/i.test(t)) return 'immediate';
  if (/חודש הודעה|חודש התראה|notice period/i.test(t)) return 'notice';
  if (/פסיבי|headhunt/i.test(t)) return 'passive';
  return null;
}

/** Explicit availability picklist values on the job (multiselect). */
function jobAcceptedAvailabilityValues(job) {
  const opts = Array.isArray(job.availabilityOptions) ? job.availabilityOptions : [];
  const trimmed = opts.map((x) => String(x ?? '').trim()).filter((x) => x && !isPlaceholderValue(x));
  if (trimmed.length) return trimmed;
  const single = job.availability != null ? String(job.availability).trim() : '';
  return single && !isPlaceholderValue(single) ? [single] : [];
}

function jobAcceptedAvailabilityTiers(job) {
  return jobAcceptedAvailabilityValues(job)
    .map((v) => normalizeAvailabilityTier(v))
    .filter(Boolean);
}

function jobAvailabilityRequirementTier(job) {
  const tiers = jobAcceptedAvailabilityTiers(job);
  if (tiers.length === 1) return tiers[0];
  if (tiers.length > 1) {
    let minRank = Infinity;
    let minTier = null;
    for (const t of tiers) {
      const r = AVAILABILITY_TIER_RANK[t];
      if (r != null && r < minRank) {
        minRank = r;
        minTier = t;
      }
    }
    if (minTier) return minTier;
  }
  const fromField = normalizeAvailabilityTier(job.availability);
  if (fromField) return fromField;
  const text = [
    ...(Array.isArray(job.requirements) ? job.requirements : []),
    job.description || '',
    job.internalNotes || '',
  ].join(' ');
  return inferJobAvailabilityTierFromText(text);
}

function jobRequiresAvailability(job) {
  if (jobAcceptedAvailabilityValues(job).length > 0) return true;
  const avail = job.availability != null ? String(job.availability).trim() : '';
  if (avail && !isPlaceholderValue(avail)) return true;
  const text = [
    ...(Array.isArray(job.requirements) ? job.requirements : []),
    job.description || '',
    job.internalNotes || '',
  ].join(' ');
  return /זמינות|מועד התחלה|תחילת עבודה|availability|start date/i.test(text);
}

/** True when candidate readiness meets or exceeds the job requirement tier. */
function candidateMeetsJobAvailabilityTier(jobTier, candTier) {
  if (!jobTier || !candTier) return false;
  if (candTier === 'not_relevant') return false;
  const j = AVAILABILITY_TIER_RANK[jobTier];
  const c = AVAILABILITY_TIER_RANK[candTier];
  if (!j || !c) return false;
  return c >= j;
}

/** Job scope / work-model only — not employment type (שכיר ≠ משרה מלאה). */
function candidateScopeOnlyBlob(candidate) {
  const parts = [];
  if (candidate.jobScope) parts.push(String(candidate.jobScope));
  if (Array.isArray(candidate.jobScopes)) {
    parts.push(...candidate.jobScopes.filter(Boolean).map(String));
  }
  if (Array.isArray(candidate.preferredWorkModels)) {
    parts.push(...candidate.preferredWorkModels.filter(Boolean).map(String));
  }
  return norm(parts.join(','));
}

function candidateScopeBlob(candidate) {
  const parts = [];
  const scopeOnly = candidateScopeOnlyBlob(candidate);
  if (scopeOnly) return scopeOnly;
  if (candidate.employmentType) parts.push(String(candidate.employmentType));
  if (Array.isArray(candidate.employmentTypes)) {
    parts.push(...candidate.employmentTypes.filter(Boolean).map(String));
  }
  if (Array.isArray(candidate.jobType)) parts.push(...candidate.jobType.map(String));
  return norm(parts.join(','));
}

function scopeMatches(job, candidate) {
  const blob = candidateScopeOnlyBlob(candidate);
  if (!blob) return null;
  for (const t of jobTypeList(job)) {
    if (t.includes('מלאה') && /מלאה|full/i.test(blob)) return true;
    if (t.includes('חלקית') && /חלקית|part/i.test(blob)) return true;
    if (t.includes('משמרות') && /משמר|shift/i.test(blob)) return true;
  }
  return false;
}

function licenseMatches(job, candidate) {
  const required = jobRequiredLicenseTypes(job);
  if (!required.length) return null;
  const dl = norm(candidate.drivingLicense);
  const dls = Array.isArray(candidate.drivingLicenses)
    ? candidate.drivingLicenses.map((x) => norm(String(x)))
    : [];
  const candParts = [dl, ...dls].filter(Boolean);
  if (!candParts.length) return false;
  return required.some((lic) => {
    const needle = norm(lic);
    return candParts.some((part) => partialMatch(part, needle));
  });
}

function workHoursMatches(job, candidate) {
  const jobHours = extractJobWorkingHours(job);
  const candHours = candidateConcreteWorkingHours(candidate);

  if (jobHours) {
    if (!candHours) return null;
    const jr = parseWorkingHoursRange(jobHours);
    const cr = parseWorkingHoursRange(candHours);
    if (jr && cr) return workingHourRangesOverlap(jr, cr);
    return workingHoursTextRoughMatch(candHours, jobHours);
  }

  const jt = jobTypeList(job).join(',');
  if (!/מלאה|חלקית|משמרות/i.test(jt)) return null;
  const pref = candidateScopeOnlyBlob(candidate);
  if (!pref && !candHours) return null;
  if (jt.includes('מלאה')) {
    if (/מלאה|full/i.test(pref)) return true;
    if (candHours) {
      const cr = parseWorkingHoursRange(candHours);
      if (cr && cr.end - cr.start >= 420) return true;
    }
    return false;
  }
  if (jt.includes('חלקית')) {
    return /חלקית|part/i.test(pref) || Boolean(candHours);
  }
  return null;
}

function availabilityMatches(job, candidate) {
  const candTier = normalizeAvailabilityTier(candidate.availability);
  if (!candTier) return null;

  const acceptedTiers = jobAcceptedAvailabilityTiers(job);
  if (acceptedTiers.length > 1) {
    if (candTier === 'not_relevant') return false;
    return acceptedTiers.includes(candTier);
  }
  if (acceptedTiers.length === 1) {
    return candidateMeetsJobAvailabilityTier(acceptedTiers[0], candTier);
  }

  const jobTier = jobAvailabilityRequirementTier(job);
  if (jobTier) {
    return candidateMeetsJobAvailabilityTier(jobTier, candTier);
  }

  if (jobRequiresAvailability(job)) {
    return candTier !== 'not_relevant';
  }

  return null;
}

function jobRequiresAge(job) {
  const amin = job.ageMin != null && job.ageMin !== '' ? Number(job.ageMin) : NaN;
  const amax = job.ageMax != null && job.ageMax !== '' ? Number(job.ageMax) : NaN;
  return (Number.isFinite(amin) && amin > 0) || (Number.isFinite(amax) && amax > 0);
}

function ageMatches(job, candidate) {
  const age = parseCandidateAge(candidate);
  if (age == null) return null;
  const amin = Number(job.ageMin);
  const amax = Number(job.ageMax);
  if (Number.isFinite(amin) && age < amin) return false;
  if (Number.isFinite(amax) && age > amax) return false;
  return true;
}

function jobRequiresSalary(job) {
  const jMax = Number(job.salaryMax);
  return Number.isFinite(jMax) && jMax > 0;
}

function salaryMatches(job, candidate) {
  const jMax = Number(job.salaryMax);
  const cMin = candidate.salaryMin != null ? Number(candidate.salaryMin) : NaN;
  if (!Number.isFinite(jMax) || jMax <= 0) return null;
  if (!Number.isFinite(cMin) || cMin <= 0) return null;
  return cMin <= jMax;
}

function collectCandidateSkillKeys(candidate) {
  const keys = new Set();
  const sk = candidate.skills;
  if (!sk || typeof sk !== 'object') return keys;
  for (const bucket of ['technical', 'soft']) {
    const arr = sk[bucket];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (typeof item === 'string') keys.add(norm(item));
      else if (item && typeof item === 'object') {
        if (item.key) keys.add(norm(item.key));
        if (item.name) keys.add(norm(item.name));
        if (item.tag_key) keys.add(norm(item.tag_key));
      }
    }
  }
  const tags = Array.isArray(candidate.tags) ? candidate.tags : [];
  for (const t of tags) {
    if (typeof t === 'string') keys.add(norm(t));
  }
  return keys;
}

function jobHasMandatorySkills(job) {
  const skills = Array.isArray(job.skills) ? job.skills : [];
  return skills.some((s) => s && typeof s === 'object' && norm(s.mode) === 'mandatory');
}

function mandatorySkillsMatch(job, candidate) {
  const keys = collectCandidateSkillKeys(candidate);
  const skills = Array.isArray(job.skills) ? job.skills : [];
  for (const s of skills) {
    if (!s || typeof s !== 'object') continue;
    if (norm(s.mode) !== 'mandatory') continue;
    const key = norm(s.key || s.name || '');
    if (key && !keys.has(key)) return false;
  }
  return true;
}

function jobHasMandatoryLanguages(job) {
  const jlangs = Array.isArray(job.languages) ? job.languages : [];
  return jlangs.some((jl) => {
    if (!jl || typeof jl !== 'object') return false;
    return jl.mandatory === true || norm(jl.level) === 'mandatory';
  });
}

function mandatoryLanguagesMatch(job, candidate) {
  const clangs = candidate.languages;
  const candLangStr = Array.isArray(clangs)
    ? clangs
        .map((x) => (typeof x === 'string' ? x : x?.language || x?.name || ''))
        .map(norm)
        .join('|')
    : '';
  const jlangs = Array.isArray(job.languages) ? job.languages : [];
  for (const jl of jlangs) {
    if (!jl || typeof jl !== 'object') continue;
    const reqName = norm(jl.language || jl.name || '');
    if (!reqName) continue;
    const mandatory = jl.mandatory === true || norm(jl.level) === 'mandatory';
    if (mandatory && !candLangStr.includes(reqName)) return false;
  }
  return true;
}

/**
 * UI traffic-light per dimension (aligned with penalty engine rules).
 * @returns {'match'|'missing'|'mismatch'|'unknown'}
 */
function dimStatus(required, hasCandidateInfo, matchesFn) {
  if (!required) return 'unknown';
  if (!hasCandidateInfo) return 'missing';
  return matchesFn() ? 'match' : 'mismatch';
}

/**
 * Parameter match map for client UI: green = match, red = gap/mismatch, gray = job N/A.
 */
function computeParameterMatches(candidate, job) {
  const cg = candidate.gender ? String(candidate.gender).trim() : '';
  const jg = job.gender ? String(job.gender).trim() : '';

  return {
    gender: dimStatus(
      jobRequiresGender(job),
      Boolean(normalizeGenderBucket(cg)),
      () => gendersMatch(jg, cg),
    ),
    mobility: dimStatus(
      jobRequiresMobility(job),
      candidateHasMobilityField(candidate),
      () => candidateHasMobility(candidate),
    ),
    scope: dimStatus(
      jobRequiresScope(job),
      Boolean(candidateScopeOnlyBlob(candidate)),
      () => scopeMatches(job, candidate) === true,
    ),
    license: dimStatus(
      jobRequiresLicense(job),
      !isPlaceholderValue(candidate.drivingLicense) ||
        (Array.isArray(candidate.drivingLicenses) &&
          candidate.drivingLicenses.some((x) => !isPlaceholderValue(x))),
      () => licenseMatches(job, candidate) === true,
    ),
    work_hours: dimStatus(
      jobRequiresWorkHours(job),
      candidateHasWorkHoursInfo(candidate, job),
      () => workHoursMatches(job, candidate) === true,
    ),
    availability: dimStatus(
      jobRequiresAvailability(job),
      Boolean(
        norm(candidate.availability || '') && !isPlaceholderValue(candidate.availability),
      ),
      () => availabilityMatches(job, candidate) === true,
    ),
    age: dimStatus(
      jobRequiresAge(job),
      parseCandidateAge(candidate) != null,
      () => ageMatches(job, candidate) === true,
    ),
    salary: dimStatus(
      jobRequiresSalary(job),
      Number.isFinite(Number(candidate.salaryMin)) && Number(candidate.salaryMin) > 0,
      () => salaryMatches(job, candidate) === true,
    ),
    mandatory_skill: dimStatus(
      jobHasMandatorySkills(job),
      collectCandidateSkillKeys(candidate).size > 0,
      () => mandatorySkillsMatch(job, candidate),
    ),
    mandatory_language: dimStatus(
      jobHasMandatoryLanguages(job),
      (() => {
        const clangs = candidate.languages;
        if (!Array.isArray(clangs) || !clangs.length) return false;
        return clangs.some((x) => {
          const s = typeof x === 'string' ? x : x?.language || x?.name || '';
          return Boolean(norm(s));
        });
      })(),
      () => mandatoryLanguagesMatch(job, candidate),
    ),
  };
}

function pushPenalty(reasons, key, type, amount, policies) {
  const pol = policies[key];
  if (!pol) return;
  const pts = type === 'missing' ? pol.missing : pol.mismatch;
  if (pts == null || pts <= 0) return;
  const labels = PENALTY_LABELS[key] || { mismatch: key, missing: key };
  reasons.push({
    key,
    type,
    label: labels[type] || key,
    amount: pts,
  });
}

/**
 * @param {object} candidate
 * @param {object} job
 * @param {object} config  – admin engine config (penaltyPolicies)
 * @returns {{ total: number, reasons: Array<{key,type,label,amount}> }}
 */
function computeGeneralPenalties(candidate, job, config = {}) {
  const policies = normalizePenaltyPolicies(config.penaltyPolicies);
  const reasons = [];

  if (jobRequiresGender(job)) {
    const cg = candidate.gender ? String(candidate.gender).trim() : '';
    const candBucket = normalizeGenderBucket(cg);
    if (!candBucket) pushPenalty(reasons, 'gender', 'missing', 0, policies);
    else if (!gendersMatch(job.gender, cg)) pushPenalty(reasons, 'gender', 'mismatch', 0, policies);
  }

  if (jobRequiresMobility(job)) {
    if (!candidateHasMobilityField(candidate)) {
      pushPenalty(reasons, 'mobility', 'missing', 0, policies);
    } else if (!candidateHasMobility(candidate)) {
      pushPenalty(reasons, 'mobility', 'mismatch', 0, policies);
    }
  }

  if (jobRequiresScope(job)) {
    const m = scopeMatches(job, candidate);
    if (m === null) pushPenalty(reasons, 'scope', 'missing', 0, policies);
    else if (!m) pushPenalty(reasons, 'scope', 'mismatch', 0, policies);
  }

  if (jobRequiresLicense(job)) {
    const dl = candidate.drivingLicense;
    const dls = Array.isArray(candidate.drivingLicenses) ? candidate.drivingLicenses : [];
    const hasLicenseInfo =
      !isPlaceholderValue(dl) ||
      dls.some((x) => !isPlaceholderValue(x));
    const m = licenseMatches(job, candidate);
    if (!hasLicenseInfo) pushPenalty(reasons, 'license', 'missing', 0, policies);
    else if (!m) pushPenalty(reasons, 'license', 'mismatch', 0, policies);
  }

  if (jobRequiresWorkHours(job)) {
    const m = workHoursMatches(job, candidate);
    if (m === null) pushPenalty(reasons, 'work_hours', 'missing', 0, policies);
    else if (!m) pushPenalty(reasons, 'work_hours', 'mismatch', 0, policies);
  }

  if (jobRequiresAvailability(job)) {
    const m = availabilityMatches(job, candidate);
    if (m === null) pushPenalty(reasons, 'availability', 'missing', 0, policies);
    else if (!m) pushPenalty(reasons, 'availability', 'mismatch', 0, policies);
  }

  const total = reasons.reduce((s, r) => s + r.amount, 0);
  return { total, reasons };
}

function buildSalaryPenaltyReasons(salaryPenaltyPoints, missingSalaryScore, candSalaryMin) {
  const reasons = [];
  if (salaryPenaltyPoints <= 0) return reasons;
  if (!candSalaryMin && missingSalaryScore > 0) {
    reasons.push({ label: 'ציפיות שכר חסרות', amount: salaryPenaltyPoints, key: 'salary', type: 'missing' });
  } else {
    reasons.push({ label: 'ציפיות שכר מוגזמות', amount: salaryPenaltyPoints, key: 'salary', type: 'mismatch' });
  }
  return reasons;
}

function buildAgePenaltyReasons(ageGapPenaltyPoints, opts = {}) {
  if (ageGapPenaltyPoints <= 0) return [];
  const missing = opts.missing === true;
  return [{
    label: missing ? 'גיל (מידע חסר)' : 'חריגה מטווח גילאים',
    amount: ageGapPenaltyPoints,
    key: 'age',
    type: missing ? 'missing' : 'mismatch',
  }];
}

/**
 * Map internal breakdown to API contract (+ keep legacy fields).
 */
function enrichBreakdownForApi(breakdown) {
  if (!breakdown || typeof breakdown !== 'object') return breakdown;
  const penaltyReasons = Array.isArray(breakdown.penaltyReasons) ? breakdown.penaltyReasons : [];
  return {
    ...breakdown,
    semanticScore: breakdown.semanticScore ?? breakdown.vector ?? 0,
    tagsScore: breakdown.tagsScore ?? breakdown.tags ?? 0,
    geoScore: breakdown.geoScore ?? breakdown.geo ?? 0,
    intentScore: breakdown.intentScore ?? breakdown.intent ?? 0,
    experienceScore: breakdown.experienceScore ?? breakdown.experience ?? 0,
    generalPenalties: breakdown.generalPenalties ?? 0,
    salaryPenalty: breakdown.salaryPenalty ?? 0,
    ageGapPenalty: breakdown.ageGapPenalty ?? 0,
    penaltyReasons,
  };
}

module.exports = {
  DEFAULT_PENALTY_POLICIES,
  PENALTY_LABELS,
  normalizePenaltyPolicies,
  computeGeneralPenalties,
  computeParameterMatches,
  buildSalaryPenaltyReasons,
  buildAgePenaltyReasons,
  enrichBreakdownForApi,
  parseCandidateAge,
  jobRequiresGender,
  jobRequiresMobility,
  jobRequiresScope,
  jobRequiresLicense,
  jobRequiredLicenseTypes,
  jobAcceptedAvailabilityValues,
  jobAcceptedAvailabilityTiers,
  jobRequiresWorkHours,
  jobRequiresAvailability,
  jobRequiresAge,
  jobRequiresSalary,
  normalizeAvailabilityTier,
  jobAvailabilityRequirementTier,
  candidateMeetsJobAvailabilityTier,
  normalizeGenderBucket,
  gendersMatch,
};
