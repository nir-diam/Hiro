/** Hebrew labels for public-site enums. The career site must not own these strings. */

const WORK_MODELS = Object.freeze([
  { value: 'office', label: 'מהמשרד' },
  { value: 'hybrid', label: 'היברידי' },
  { value: 'remote', label: 'מהבית' },
]);

const EMPLOYMENT_TYPES = Object.freeze([
  { value: 'full_time', label: 'משרה מלאה', aliases: ['מלאה', 'משרה מלאה', 'full time', 'full_time', 'full-time'] },
  { value: 'part_time', label: 'משרה חלקית', aliases: ['חלקית', 'משרה חלקית', 'part time', 'part_time', 'part-time'] },
  { value: 'shifts', label: 'משמרות', aliases: ['משמרות', 'shifts'] },
  { value: 'temporary', label: 'זמנית', aliases: ['זמנית', 'temporary', 'זמני'] },
  { value: 'freelance', label: 'פרילנס', aliases: ['פרילנס', 'עצמאי', 'freelance', 'contractor'] },
]);

const SENIORITIES = Object.freeze([
  { value: 'entry', label: 'ללא ניסיון' },
  { value: 'junior', label: 'ג׳וניור' },
  { value: 'mid', label: 'בינוני' },
  { value: 'senior', label: 'בכיר' },
  { value: 'manager', label: 'ניהולי' },
  { value: 'executive', label: 'הנהלה' },
]);

const SUITABLE_FOR = Object.freeze([
  { value: 'students', label: 'סטודנטים' },
  { value: 'discharged_soldiers', label: 'חיילים משוחררים' },
  { value: 'retirees', label: 'גמלאים' },
  { value: 'parents', label: 'הורים' },
  { value: 'disabilities', label: 'אנשים עם מוגבלות' },
]);

const REGION_LABELS = Object.freeze({
  center: 'מרכז',
  north: 'צפון',
  south: 'דרום',
  shfela: 'שפלה',
  jerusalem: 'ירושלים',
  other: 'אחר',
});

const REGION_ALIASES = Object.freeze([
  ['north', ['north', 'צפון', 'הצפון']],
  ['center', ['center', 'מרכז', 'גוש דן', 'שרון', 'מרכז, שרון וגוש דן', 'מרכז שרון וגוש דן']],
  ['south', ['south', 'דרום', 'הדרום']],
  ['shfela', ['shfela', 'שפלה', 'השפלה']],
  ['jerusalem', ['jerusalem', 'ירושלים', 'ירושלם']],
]);

/** Job statuses that appear on the site unless the tenant overrides them. */
const DEFAULT_JOB_STATUS_VISIBILITY = Object.freeze({
  פתוחה: true,
  פעילה: true,
  Open: true,
  מוקפאת: false,
  מאוישת: false,
  סגורה: false,
  טיוטה: false,
  'ממתין לאישור': false,
});

const CLOSED_PUBLIC_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const byValue = (list) => new Map(list.map((row) => [row.value, row]));

const WORK_MODEL_BY_VALUE = byValue(WORK_MODELS);
const SENIORITY_BY_VALUE = byValue(SENIORITIES);
const SUITABLE_BY_VALUE = byValue(SUITABLE_FOR);

const normalizeToken = (value) => String(value || '').trim().toLowerCase();

const mapEmploymentTypeLabel = (label) => {
  const token = normalizeToken(label);
  if (!token) return null;
  for (const row of EMPLOYMENT_TYPES) {
    if (row.value === token || row.aliases.some((alias) => normalizeToken(alias) === token)) return row;
  }
  return { value: token.replace(/\s+/g, '_'), label: String(label) };
};

const mapWorkModel = (value) => {
  const token = normalizeToken(value) || 'office';
  if (token === 'hybrid' || token === 'היברידי') return WORK_MODEL_BY_VALUE.get('hybrid');
  if (token === 'remote' || token === 'מהבית' || token === 'home') return WORK_MODEL_BY_VALUE.get('remote');
  return WORK_MODEL_BY_VALUE.get('office');
};

const resolveRegionSlug = (raw) => {
  const s = normalizeToken(raw);
  if (!s) return '';
  if (REGION_LABELS[s]) return s;
  for (const [id, aliases] of REGION_ALIASES) {
    if (aliases.some((alias) => normalizeToken(alias) === s)) return id;
  }
  const ranked = REGION_ALIASES.flatMap(([id, aliases]) =>
    aliases.map((alias) => ({ id, alias: normalizeToken(alias) })),
  )
    .filter((row) => row.alias.length >= 3)
    .sort((a, b) => b.alias.length - a.alias.length);
  for (const row of ranked) {
    if (s.includes(row.alias) || row.alias.includes(s)) return row.id;
  }
  return '';
};

const regionLabel = (slug) => REGION_LABELS[slug] || REGION_LABELS.other;

/**
 * @param {string} status
 * @param {Record<string, boolean> | null | undefined} overrides tenant metadata.publicJobStatusVisibility
 */
const jobStatusAppearsOnSite = (status, overrides) => {
  const name = String(status || '').trim();
  if (!name) return false;
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, name)) {
    return Boolean(overrides[name]);
  }
  if (Object.prototype.hasOwnProperty.call(DEFAULT_JOB_STATUS_VISIBILITY, name)) {
    return DEFAULT_JOB_STATUS_VISIBILITY[name];
  }
  return false;
};

const deriveSeniority = (years, noExperience, roleLabel) => {
  const manager = /מנהל|ראש צוות|הנהל|director|manager/i.test(String(roleLabel || ''));
  if (noExperience || years === 0) return SENIORITY_BY_VALUE.get('entry');
  if (years == null || years === '') {
    return manager ? SENIORITY_BY_VALUE.get('manager') : null;
  }
  const n = Number(years);
  if (!Number.isFinite(n)) return null;
  if (n <= 2) return SENIORITY_BY_VALUE.get('junior');
  if (n <= 5) return manager ? SENIORITY_BY_VALUE.get('manager') : SENIORITY_BY_VALUE.get('mid');
  if (manager && n >= 10) return SENIORITY_BY_VALUE.get('executive');
  return SENIORITY_BY_VALUE.get('senior');
};

const deriveExperience = (text, stored = {}) => {
  if (stored.noExperience === true) {
    return { experienceYearsMin: stored.experienceYearsMin ?? 0, noExperience: true };
  }
  if (stored.experienceYearsMin != null && stored.experienceYearsMin !== '') {
    const n = Number(stored.experienceYearsMin);
    return {
      experienceYearsMin: Number.isFinite(n) ? n : null,
      noExperience: n === 0,
    };
  }
  const src = String(text || '');
  if (/ללא ניסיון|no experience/i.test(src)) {
    return { experienceYearsMin: 0, noExperience: true };
  }
  const match = src.match(/(\d+)\s*(?:\+|שנות|שנים|שנה|שנ)/);
  if (match) {
    const n = Number(match[1]);
    return { experienceYearsMin: n, noExperience: n === 0 };
  }
  return { experienceYearsMin: null, noExperience: false };
};

const deriveHoursDescription = (text, stored) => {
  const explicit = String(stored || '').trim();
  if (explicit) return explicit;
  const src = String(text || '');
  const match = src.match(/(?:שעות עבודה|שעות|משמרות)[^\n.]{0,80}/);
  return match ? match[0].trim() : null;
};

const mapQuestionType = (raw) => {
  const token = String(raw || '').toLowerCase();
  if (/video|וידאו/.test(token)) return 'video';
  if (/yes|boolean|כן/.test(token)) return 'yes_no';
  if (/number|numeric|מספר/.test(token)) return 'number';
  if (/choice|select|בחירה|multiple/.test(token)) return 'choice';
  return 'text';
};

const isVideoQuestion = (question) =>
  mapQuestionType(question?.type || question?.answerType || question?.presentationMode) === 'video';

module.exports = {
  WORK_MODELS,
  EMPLOYMENT_TYPES,
  SENIORITIES,
  SUITABLE_FOR,
  REGION_LABELS,
  SUITABLE_BY_VALUE,
  DEFAULT_JOB_STATUS_VISIBILITY,
  CLOSED_PUBLIC_WINDOW_MS,
  mapEmploymentTypeLabel,
  mapWorkModel,
  resolveRegionSlug,
  regionLabel,
  jobStatusAppearsOnSite,
  deriveSeniority,
  deriveExperience,
  deriveHoursDescription,
  mapQuestionType,
  isVideoQuestion,
};
