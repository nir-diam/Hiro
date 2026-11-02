/** Turn stored HTML or a single paragraph into text that keeps section breaks. */

const HEADER_PATTERNS = [
  { key: 'responsibilities', pattern: 'עיקרי התפקיד|תחומי האחריות|תחומי אחריות|אחריות התפקיד' },
  { key: 'requirements', pattern: 'דרישות התפקיד|דרישות המשרה|דרישות הסף|ניסיון נדרש|דרישות' },
  { key: 'niceToHave', pattern: 'יתרון משמעותי|נחמד שיהיה|יתרונות|יתרון' },
  { key: 'benefits', pattern: 'תנאים\\s+מעולים|תנאים\\s+נלווים|מה אנחנו מציעים|הטבות' },
  { key: 'description', pattern: 'תיאור המשרה|תיאור התפקיד|אודות המשרה' },
];

const HEADER_SOURCE = HEADER_PATTERNS.map((row) => row.pattern).join('|');
const HEADER_LINE = new RegExp(`^(${HEADER_SOURCE})\\s*:?\\s*(.*)$`);

const htmlToPlain = (html) =>
  String(html || '')
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const insertHeaderBreaks = (text) => {
  const re = new RegExp(`(${HEADER_SOURCE})\\s*:`, 'g');
  return String(text || '').replace(re, (match, _header, offset, source) => {
    if (offset === 0 || source[offset - 1] === '\n') return match;
    return `\n${match}`;
  });
};

const joinLines = (lines) => lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

/**
 * Split a public description into the sections the career site renders separately.
 * The full text, with line breaks, stays in `description` so nothing is dropped.
 */
const splitPublicDescription = (raw) => {
  const text = insertHeaderBreaks(htmlToPlain(raw));
  const buckets = {
    description: [],
    responsibilities: [],
    requirements: [],
    niceToHave: [],
    benefits: [],
  };
  let current = 'description';
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      if (buckets[current].length) buckets[current].push('');
      continue;
    }
    const header = line.match(HEADER_LINE);
    if (header) {
      const found = HEADER_PATTERNS.find((row) => new RegExp(`^(?:${row.pattern})$`).test(header[1]));
      current = found?.key || current;
      if (header[2]) buckets[current].push(header[2].trim());
      continue;
    }
    buckets[current].push(line);
  }
  return {
    description: text,
    responsibilities: joinLines(buckets.responsibilities),
    requirementsText: joinLines(buckets.requirements),
    niceToHave: joinLines(buckets.niceToHave),
    benefits: joinLines(buckets.benefits),
  };
};

const SYSTEM_RECRUITER_NAMES = new Set([
  'מערכת',
  'system',
  'admin',
  'hiro',
  'משתמש',
  'אוטומטי',
]);

const recruiterFirstName = (raw) => {
  const cleaned = String(raw || '').trim().replace(/[,.،]+$/g, '').trim();
  const first = (cleaned.split(/\s+/)[0] || '').replace(/[,.]+$/g, '');
  if (!first) return null;
  if (SYSTEM_RECRUITER_NAMES.has(first) || SYSTEM_RECRUITER_NAMES.has(first.toLowerCase())) return null;
  return first;
};

/** Non-empty lines for list-shaped API fields (responsibilities, benefits, …). */
const sectionToLines = (value) => {
  if (Array.isArray(value)) {
    return value.map((line) => String(line || '').trim()).filter(Boolean);
  }
  const text = String(value || '').trim();
  if (!text) return [];
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
};

module.exports = {
  htmlToPlain,
  splitPublicDescription,
  recruiterFirstName,
  sectionToLines,
};
