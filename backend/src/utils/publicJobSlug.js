const crypto = require('crypto');

const HEBREW = {
  א: 'a', ב: 'b', ג: 'g', ד: 'd', ה: 'h', ו: 'v', ז: 'z', ח: 'ch', ט: 't',
  י: 'y', כ: 'k', ך: 'k', ל: 'l', מ: 'm', ם: 'm', נ: 'n', ן: 'n', ס: 's',
  ע: 'a', פ: 'p', ף: 'p', צ: 'ts', ץ: 'ts', ק: 'k', ר: 'r', ש: 'sh', ת: 't',
};

const transliterate = (value) =>
  String(value || '')
    .replace(/[\u0591-\u05C7]/g, '')
    .split('')
    .map((ch) => HEBREW[ch] ?? ch)
    .join('');

const slugifySegment = (value) =>
  transliterate(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);

/**
 * Stable public slug. A Hebrew rename does not change a slug that was already stored.
 * @param {string} name
 * @param {string} [salt] used only when transliteration is empty
 */
const buildStableSlug = (name, salt = '') => {
  const base = slugifySegment(name);
  if (base) return base;
  const tail = crypto.createHash('sha1').update(String(salt || name || 'x')).digest('hex').slice(0, 6);
  return `n-${tail}`;
};

const composeJobSlug = ({ title, city, code, id }) => {
  const parts = [slugifySegment(title), slugifySegment(city), slugifySegment(code)].filter(Boolean);
  const joined = parts.join('-').replace(/-{2,}/g, '-').slice(0, 96);
  if (joined) return joined;
  return `job-${String(id || '').replace(/-/g, '').slice(0, 8) || 'item'}`;
};

const normalizeSearchText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[/"'`׳״]/g, ' ')
    .replace(/[^\p{L}\p{N}\s+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

module.exports = {
  transliterate,
  slugifySegment,
  buildStableSlug,
  composeJobSlug,
  normalizeSearchText,
};
