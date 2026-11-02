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
    const key = norm(v);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(v);
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

function skillEvidenceText(skill) {
  if (!skill || typeof skill !== 'object') return '';
  return [skill.quote, skill.tag_reason, skill.tagReason, skill.name, skill.raw_value]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .join('\n');
}

function hasExplicitLookbackPhrase(text) {
  const t = String(text || '');
  return /(אחרונות|עדכני(?:ות)?|ב[-־]?\d+\s*השנים|last\s+\d+\s+years|in the (?:last|past)\s+\d+)/i.test(t);
}

/**
 * Minimum years of experience stated for a tag ("לפחות 5 שנים", "5+ שנים", "שנתיים").
 * Ignores lookback-only phrasing.
 */
function extractExperienceYearsFromText(text) {
  const t = String(text || '');
  if (!t.trim()) return null;
  if (hasExplicitLookbackPhrase(t) && !/(לפחות|מינימום|\+|ניסיון של|years?\s+of\s+experience)/i.test(t)) {
    return null;
  }
  const patterns = [
    /(?:לפחות|מינימום|minimum|at\s+least)\s*(\d{1,2})\s*(?:\+)?\s*(?:שנ(?:ה|ים|ות)|years?)/i,
    /(\d{1,2})\s*\+\s*(?:שנ(?:ה|ים|ות)|years?)/i,
    /(?:ניסיון(?:\s+של)?|experience(?:\s+of)?)\s*(?:לפחות\s*)?(\d{1,2})\s*(?:שנ(?:ה|ים|ות)|years?)/i,
    /(\d{1,2})\s*[-–—]\s*\d{1,2}\s*(?:שנ(?:ה|ים|ות)|years?)/i,
    /(\d{1,2})\s*(?:שנ(?:ה|ים|ות)|years?)\s*(?:ניסיון|experience|בתחום|ב(?:תפקיד|מקצוע))?/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const n = parseJobTagYearsValue(m[1]);
      if (n != null && n > 0) return n;
    }
  }
  if (/(^|[^\d])שנתיים([^\d]|$)/.test(t)) return 2;
  if (/(^|[^\d])שנה([^\d]|$)/.test(t) && /ניסיון|experience/i.test(t)) return 1;
  return null;
}

/**
 * years_experience = stated minimum tenure.
 * lookback_years = how recent that experience must be.
 * Defaults: years>0 → lookback 1 when not stated; years===0 → lookback 0.
 * Also repairs the common LLM swap (5 years experience → lookback_years=5, years_experience=1).
 */
function normalizeJobSkillYears(skill) {
  if (!skill || typeof skill !== 'object') {
    return { years_experience: null, lookback_years: null };
  }
  let years = parseJobTagYearsValue(skill.years_experience ?? skill.yearsExperience);
  let lookback = parseJobTagYearsValue(skill.lookback_years ?? skill.lookbackYears);
  const evidence = skillEvidenceText(skill);
  const extracted = extractExperienceYearsFromText(evidence);
  const lookbackPhrase = hasExplicitLookbackPhrase(evidence);

  if (extracted != null) {
    if (years == null || years !== extracted) {
      if (lookback === extracted && (years == null || years === 1 || years < extracted)) {
        years = extracted;
        if (!lookbackPhrase) lookback = null;
      } else if (years == null) {
        years = extracted;
      }
    }
  }

  if (years == null && lookback != null && !lookbackPhrase && extracted == null) {
    // Lone number with no lookback wording → treat as experience years.
    years = lookback;
    lookback = null;
  }

  if (years === 0) {
    return { years_experience: 0, lookback_years: 0 };
  }
  if (years != null && years > 0) {
    if (!lookbackPhrase && (lookback == null || lookback === years)) {
      lookback = 1;
    } else if (lookback == null) {
      lookback = 1;
    }
    return { years_experience: years, lookback_years: lookback };
  }

  return { years_experience: null, lookback_years: lookbackPhrase ? lookback : null };
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
  extractExperienceYearsFromText,
  normalizeJobSkillYears,
  normalizeSkillsYearsInPlace,
};
