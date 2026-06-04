/** Hiro organization UI / DB buckets for employee headcount. */
const HIRO_EMPLOYEE_BUCKETS = ['1-10', '11-50', '51-200', '201-1000', '1000+', '10000+'];

/** Exact strings from organization enrich prompt → Hiro `<select>` values. */
const PROMPT_EMPLOYEE_TO_HIRO = {
  '(seed) 1-10': '1-10',
  '(startup) 11-50': '11-50',
  '(growth) 51-200': '51-200',
  '(scale) 201-1000': '201-1000',
  '(enterprise) +1000': '1000+',
  '(mega enterprise) +10000': '10000+',
};

/** PDL / LinkedIn / legacy range strings → Hiro buckets. */
const PDL_SIZE_TO_HIRO = {
  '1-10': '1-10',
  '11-50': '11-50',
  '51-200': '51-200',
  '201-500': '201-1000',
  '501-1000': '201-1000',
  '201-1000': '201-1000',
  '1001-5000': '1000+',
  '5001-10000': '10000+',
  '1000+': '1000+',
  '10000+': '10000+',
  '10001+': '10000+',
  '+1000': '1000+',
  '+10000': '10000+',
};

const UNKNOWN_VALUES = new Set([
  'unknown',
  'n/a',
  'na',
  'none',
  'estimate range',
  'estimate',
  'not available',
  'לא ידוע',
]);

const HIRO_BUCKET_PATTERN = /\b(1-10|11-50|51-200|201-1000)\b/i;

const normalizeDashes = (s) =>
  String(s).replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D–—]/g, '-');

/** Remove label parens but keep numeric range / +bucket. */
const stripLabelNoise = (s) => {
  let t = normalizeDashes(s).trim();
  t = t.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  t = t.replace(/\s+employees?\s*$/i, '').trim();
  return t;
};

const bucketFromNumber = (n) => {
  if (!Number.isFinite(n) || n < 0) return null;
  if (n <= 10) return '1-10';
  if (n <= 50) return '11-50';
  if (n <= 200) return '51-200';
  if (n <= 1000) return '201-1000';
  if (n <= 10000) return '1000+';
  return '10000+';
};

const canonicalPlusBucket = (s) => {
  const compact = s.replace(/\s/g, '').toLowerCase();
  if (compact === '10000+' || compact === '+10000' || compact === '10001+') return '10000+';
  if (compact === '1000+' || compact === '+1000' || compact === '1001+') return '1000+';
  return null;
};

const fromPromptLiteral = (raw) => {
  const key = String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
  return PROMPT_EMPLOYEE_TO_HIRO[key] || null;
};

/**
 * Map enrich prompt / PDL / raw headcount to a Hiro select value.
 * @param {unknown} value
 * @returns {string|null} One of HIRO_EMPLOYEE_BUCKETS, or null if unmappable
 */
function normalizeEmployeeCount(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return bucketFromNumber(value);

  const raw = String(value).trim();
  const fromPrompt = fromPromptLiteral(raw);
  if (fromPrompt) return fromPrompt;

  let s = stripLabelNoise(raw);
  if (!s) return null;

  const lower = s.toLowerCase();
  if (UNKNOWN_VALUES.has(lower)) return null;

  if (HIRO_EMPLOYEE_BUCKETS.includes(s)) return s;

  const plusBucket = canonicalPlusBucket(s);
  if (plusBucket) return plusBucket;

  const mapped = PDL_SIZE_TO_HIRO[s] || PDL_SIZE_TO_HIRO[lower];
  if (mapped) return mapped;

  const rangeHit = s.match(HIRO_BUCKET_PATTERN);
  if (rangeHit) return rangeHit[1];

  const plusHit = s.match(/\+\s*(1000|10000)\b/i) || s.match(/\b(1000|10000)\s*\+/i);
  if (plusHit) {
    return plusHit[1] === '10000' ? '10000+' : '1000+';
  }

  const rangeMatch = s.match(/(\d[\d,]*)\s*-\s*(\d[\d,]*)/);
  if (rangeMatch) {
    const a = parseInt(rangeMatch[1].replace(/,/g, ''), 10);
    const b = parseInt(rangeMatch[2].replace(/,/g, ''), 10);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return bucketFromNumber(Math.round((a + b) / 2));
    }
  }

  const numOnly = s.match(/^(\d[\d,]*)\+?$/);
  if (numOnly) {
    return bucketFromNumber(parseInt(numOnly[1].replace(/,/g, ''), 10));
  }

  const n = parseInt(s.replace(/,/g, ''), 10);
  if (Number.isFinite(n) && /^\d/.test(s)) {
    return bucketFromNumber(n);
  }

  return null;
}

module.exports = {
  HIRO_EMPLOYEE_BUCKETS,
  PROMPT_EMPLOYEE_TO_HIRO,
  normalizeEmployeeCount,
};
