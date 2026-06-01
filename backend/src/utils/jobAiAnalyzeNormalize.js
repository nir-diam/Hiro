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
};
