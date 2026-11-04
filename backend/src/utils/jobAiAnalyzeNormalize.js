/**
 * Post-process AI job analyze JSON → stable API shape for NewJobView + matching.
 */

const AVAILABILITY_PICKLIST_VALUES = [
  '🟢 מיידי (זמין לעבודה מיד).',
  '🟡 חודש הודעה (עובד, מחפש אקטיבית).',
  '🟠 פסיבי (לא מחפש, אבל פתוח להצעות - Headhunting).',
  '🔴 לא רלוונטי (התקבל לעבודה / הקפיא תהליכים).',
];

const AGE_MIN_BOUND = 18;
const AGE_MAX_BOUND = 70;

function norm(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseAgeNumber(raw) {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw).replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(AGE_MAX_BOUND, Math.max(AGE_MIN_BOUND, Math.round(n)));
}

function inferAgesFromText(text) {
  const t = String(text ?? '');
  if (!t.trim()) return { ageMin: null, ageMax: null };

  const range =
    t.match(/(?:גיל|מגיל|עד גיל|בין גיל)\s*(\d{2})\s*(?:[-–—עד\s]+)\s*(\d{2})/i) ||
    t.match(/(?:גיל|age)\s*(\d{2})\s*[-–—]\s*(\d{2})/i) ||
    t.match(/(\d{2})\s*[-–—]\s*(\d{2})\s*(?:שנה|years)/i);
  if (range) {
    const a = parseAgeNumber(range[1]);
    const b = parseAgeNumber(range[2]);
    if (a != null && b != null) return { ageMin: Math.min(a, b), ageMax: Math.max(a, b) };
  }

  const minOnly = t.match(/(?:מגיל|מינימום גיל|age\s*min|minimum age)\s*(\d{2})/i);
  const maxOnly = t.match(/(?:עד גיל|מקסימום גיל|age\s*max|maximum age)\s*(\d{2})/i);
  return {
    ageMin: minOnly ? parseAgeNumber(minOnly[1]) : null,
    ageMax: maxOnly ? parseAgeNumber(maxOnly[1]) : null,
  };
}

/**
 * @param {Record<string, unknown>} parsed
 */
function coerceJobAges(parsed) {
  const aliasesMin = [parsed.ageMin, parsed.minAge, parsed.minimumAge, parsed.age_min];
  const aliasesMax = [parsed.ageMax, parsed.maxAge, parsed.maximumAge, parsed.age_max];
  let ageMin = null;
  let ageMax = null;
  for (const v of aliasesMin) {
    const n = parseAgeNumber(v);
    if (n != null) {
      ageMin = n;
      break;
    }
  }
  for (const v of aliasesMax) {
    const n = parseAgeNumber(v);
    if (n != null) {
      ageMax = n;
      break;
    }
  }

  if (ageMin == null || ageMax == null) {
    const blob = [
      parsed.internalNotes,
      parsed.description,
      ...(Array.isArray(parsed.requirements) ? parsed.requirements : []),
    ]
      .filter(Boolean)
      .join('\n');
    const inferred = inferAgesFromText(blob);
    if (ageMin == null) ageMin = inferred.ageMin;
    if (ageMax == null) ageMax = inferred.ageMax;
  }

  if (ageMin != null && ageMax != null && ageMin > ageMax) {
    const swap = ageMin;
    ageMin = ageMax;
    ageMax = swap;
  }

  return { ageMin, ageMax };
}

/**
 * Map free-text / partial Hebrew availability → canonical picklist value.
 * @param {unknown} raw
 * @returns {string|null}
 */
function mapAvailabilityToPicklistValue(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (AVAILABILITY_PICKLIST_VALUES.includes(s)) return s;
  if (s.startsWith('🟢')) return AVAILABILITY_PICKLIST_VALUES[0];
  if (s.startsWith('🟡')) return AVAILABILITY_PICKLIST_VALUES[1];
  if (s.startsWith('🟠')) return AVAILABILITY_PICKLIST_VALUES[2];
  if (s.startsWith('🔴')) return AVAILABILITY_PICKLIST_VALUES[3];
  const n = norm(s);
  if (/^מיידי|זמין לעבודה מיד|immediate|asap|available now/.test(n)) return AVAILABILITY_PICKLIST_VALUES[0];
  if (/חודש הודעה|חודש התראה|notice period|actively looking/.test(n)) return AVAILABILITY_PICKLIST_VALUES[1];
  if (/פסיבי|headhunt|open to offers/.test(n)) return AVAILABILITY_PICKLIST_VALUES[2];
  if (/לא רלוונטי|הקפיא תהליכים|placed|stopped looking/.test(n)) return AVAILABILITY_PICKLIST_VALUES[3];
  return null;
}

/**
 * @param {Record<string, unknown>} parsed
 * @returns {string[]}
 */
function normalizeAvailabilityOptionsFromAi(parsed) {
  const rawList = [];
  if (Array.isArray(parsed.availabilityOptions)) {
    rawList.push(...parsed.availabilityOptions);
  } else if (Array.isArray(parsed.availabilities)) {
    rawList.push(...parsed.availabilities);
  }
  if (parsed.availability != null && String(parsed.availability).trim()) {
    rawList.push(parsed.availability);
  }
  if (parsed.startAvailability != null && String(parsed.startAvailability).trim()) {
    rawList.push(parsed.startAvailability);
  }

  const out = [];
  const seen = new Set();
  for (const item of rawList) {
    const mapped = mapAvailabilityToPicklistValue(item);
    if (mapped && !seen.has(mapped)) {
      seen.add(mapped);
      out.push(mapped);
    }
  }
  return out;
}

/**
 * @param {Record<string, unknown>} parsed
 * @returns {string[]}
 */
function normalizeLicenseTypesFromAi(parsed) {
  const rawList = [];
  if (Array.isArray(parsed.licenseTypes)) rawList.push(...parsed.licenseTypes);
  if (Array.isArray(parsed.drivingLicenses)) rawList.push(...parsed.drivingLicenses);
  if (parsed.licenseType != null && String(parsed.licenseType).trim()) {
    rawList.push(parsed.licenseType);
  }
  if (parsed.drivingLicense != null && String(parsed.drivingLicense).trim()) {
    rawList.push(parsed.drivingLicense);
  }

  const neutral = new Set(['', '-', 'לא חשוב', 'ללא', 'none', 'not required']);
  const out = [];
  const seen = new Set();
  for (const item of rawList) {
    const v = String(item ?? '').trim();
    if (!v || neutral.has(v.toLowerCase()) || neutral.has(norm(v))) continue;
    const code = licenseCodeForJob(v);
    const stored = code || v;
    const key = norm(stored);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(stored);
    }
  }
  return out;
}

const JOB_TAG_YEARS_MAX = 50;

function parseJobTagYearsValue(raw) {
  if (raw == null || raw === '') return null;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(n, JOB_TAG_YEARS_MAX);
}

/** Years are stored only on role, skill, and industry. Seniority and every other type stay empty. */
const JOB_SKILL_YEARS_TYPES = new Set(['role', 'skill', 'industry']);

function jobSkillYearsType(skill) {
  const raw = String(
    skill?.tagType || skill?.tag_type || skill?.raw_type || skill?.type || '',
  )
    .toLowerCase()
    .trim();
  if (!raw) return '';
  if (raw === 'soft') return 'soft_skill';
  if (raw === 'education') return 'degree';
  return raw;
}

const LICENSE_CODE = {
  a: 'A',
  a_motorcycle: 'A',
  motorcycle: 'A',
  a1: 'A1',
  a2: 'A2',
  b: 'B',
  b_private_car: 'B',
  private_car: 'B',
  private: 'B',
  car: 'B',
  c: 'C',
  c_truck: 'C',
  truck: 'C',
  c1: 'C1',
  d: 'D',
  d_bus: 'D',
  bus: 'D',
  d1: 'D1',
  e: 'E',
  e_trailer: 'E',
  trailer: 'E',
  1: '1',
  '1_tractor': '1',
  tractor: '1',
};

function licenseCodeForJob(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const key = s.toLowerCase().replace(/[\s-]+/g, '_');
  if (LICENSE_CODE[key]) return LICENSE_CODE[key];
  const head = key.split('_')[0];
  if (/^(a1|a2|c1|d1)$/.test(head)) return head.toUpperCase();
  if (/^[a-e]$/.test(head)) return head.toUpperCase();
  if (head === '1') return '1';
  return null;
}

/**
 * Job mobility is a boolean. Gemini often sends "Yes" / "No" (same tokens as CV parse).
 * @returns {boolean|null}
 */
function coerceJobMobility(raw) {
  if (raw === true) return true;
  if (raw === false) return false;
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (!s || s === '-') return null;
  const lower = s.toLowerCase().replace(/[\s-]+/g, '_');
  if (
    ['yes', 'true', '1', 'כן', 'יש', 'mobile', 'נייד', 'בעל_רכב', 'car_owner', 'חובה'].includes(lower)
    || s === 'בעל/ת רכב'
    || s === 'בעל רכב פרטי'
  ) {
    return true;
  }
  if (
    ['no', 'false', '0', 'לא', 'אין', 'לא_נייד', 'not_mobile', 'לא_חשוב'].includes(lower)
    || s === 'לא נייד'
    || s === 'לא חשוב'
  ) {
    return false;
  }
  return null;
}

/** Map דחוף / דחופה onto the job priority picklist. Unknown text stays null. */
function normalizeJobPriority(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (s === 'רגילה' || s === 'רגיל' || /^normal$/i.test(s)) return 'רגילה';
  if (s === 'דחופה' || s === 'דחוף' || /^urgent$/i.test(s)) return 'דחופה';
  if (s === 'קריטית' || s === 'קריטי' || /^critical$/i.test(s)) return 'קריטית';
  return null;
}

/**
 * years_experience and lookback_years are kept as the model sent them.
 * lookback stays null unless the model set it. years === 0 forces lookback 0.
 * Seniority and any type other than role / skill / industry are always null.
 */
function normalizeJobSkillYears(skill) {
  if (!skill || typeof skill !== 'object') {
    return { years_experience: null, lookback_years: null };
  }
  const type = jobSkillYearsType(skill);
  if (type && !JOB_SKILL_YEARS_TYPES.has(type)) {
    return { years_experience: null, lookback_years: null };
  }
  const years = parseJobTagYearsValue(skill.years_experience ?? skill.yearsExperience);
  const lookback = parseJobTagYearsValue(skill.lookback_years ?? skill.lookbackYears);
  if (years === 0) {
    return { years_experience: 0, lookback_years: 0 };
  }
  return { years_experience: years, lookback_years: lookback };
}

function normalizeSkillsYearsInPlace(skills) {
  if (!Array.isArray(skills)) return skills;
  return skills.map((skill) => {
    if (!skill || typeof skill !== 'object') return skill;
    const years = normalizeJobSkillYears(skill);
    return { ...skill, ...years };
  });
}

/**
 * @param {Record<string, unknown>} parsed
 */
function enrichJobAnalyzeResult(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed;

  const { ageMin, ageMax } = coerceJobAges(parsed);
  if (ageMin != null) parsed.ageMin = ageMin;
  if (ageMax != null) parsed.ageMax = ageMax;

  const availabilityOptions = normalizeAvailabilityOptionsFromAi(parsed);
  if (availabilityOptions.length) {
    parsed.availabilityOptions = availabilityOptions;
    parsed.availability = availabilityOptions[0];
  }

  const licenseTypes = normalizeLicenseTypesFromAi(parsed);
  if (licenseTypes.length) {
    parsed.licenseTypes = licenseTypes;
    parsed.licenseType = licenseTypes[0];
  }

  if (Array.isArray(parsed.skills)) {
    parsed.skills = normalizeSkillsYearsInPlace(parsed.skills);
  }
  if (Array.isArray(parsed.tags)) {
    parsed.tags = normalizeSkillsYearsInPlace(parsed.tags);
  }

  if (Object.prototype.hasOwnProperty.call(parsed, 'mobility')) {
    parsed.mobility = coerceJobMobility(parsed.mobility);
  }

  const priority = normalizeJobPriority(parsed.priority);
  if (priority) parsed.priority = priority;

  return parsed;
}

module.exports = {
  AVAILABILITY_PICKLIST_VALUES,
  coerceJobAges,
  mapAvailabilityToPicklistValue,
  normalizeAvailabilityOptionsFromAi,
  normalizeLicenseTypesFromAi,
  enrichJobAnalyzeResult,
  inferAgesFromText,
  parseAgeNumber,
  parseJobTagYearsValue,
  licenseCodeForJob,
  coerceJobMobility,
  normalizeJobPriority,
  normalizeJobSkillYears,
  normalizeSkillsYearsInPlace,
  JOB_SKILL_YEARS_TYPES,
};
