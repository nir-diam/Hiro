const HEBREW_CHAR_RE = /[\u0590-\u05FF]/g;
const HEBREW_WORD_RE = /[\u0590-\u05FF]{2,}/g;
const REPLACEMENT_CHAR_RE = /\uFFFD/g;
const PUA_CHAR_RE = /[\uE000-\uF8FF]/g;
const MOJIBAKE_RE = /Ã.|Â.|â€™|â€œ|â€|ðŸ/;

const HEBREW_CV_LEXICON = [
  'ניסיון', 'נסיון', 'השכלה', 'ניהול', 'שיווק', 'מכירות', 'עבודה', 'לקוחות',
  'פיתוח', 'עסקי', 'עסקאות', 'ישראל', 'תל', 'אביב', 'רמת', 'חיפה', 'ירושלים',
  'קורות', 'חיים', 'תואר', 'אוניברסיטה', 'מכללה', 'שירות', 'צבאי',
  'אחראי', 'מנהל', 'רכז', 'יועץ', 'מהנדס', 'חשבונאות', 'כספים', 'משאבי',
  'וסגירת', 'אסטרטגיים', 'קשרים', 'בנייה', 'נדלן', 'הזדמנויות',
];

const looksLikeRawPdfUtf8String = (s) =>
  Boolean(s && typeof s === 'string' && s.trimStart().startsWith('%PDF'));

/**
 * Higher score = better extract. Used to pick between pdf-parse and pdftotext.
 */
const scoreResumeTextExtract = (text) => {
  const s = String(text || '').trim();
  if (!s) return Number.NEGATIVE_INFINITY;
  if (looksLikeRawPdfUtf8String(s)) return Number.NEGATIVE_INFINITY;

  let score = Math.min(s.length, 4000);

  const replacement = (s.match(REPLACEMENT_CHAR_RE) || []).length;
  const pua = (s.match(PUA_CHAR_RE) || []).length;
  score -= replacement * 120;
  score -= pua * 120;
  if (MOJIBAKE_RE.test(s)) score -= 800;

  const hebrewWords = s.match(HEBREW_WORD_RE) || [];
  let lexiconHits = 0;
  for (const w of hebrewWords.slice(0, 100)) {
    const clean = w.replace(/[״׳"'`]/g, '');
    if (clean.length < 3) continue;
    if (HEBREW_CV_LEXICON.includes(clean)) lexiconHits += 1;
  }
  score += lexiconHits * 80;

  const head = s.slice(0, 1200);
  const headHebrew = (head.match(HEBREW_CHAR_RE) || []).length;
  if (headHebrew >= 15) {
    const tokens = head.split(/\s+/).filter(Boolean);
    if (tokens.length >= 12) {
      const singleLetter = tokens.filter((t) => /^[A-Za-z\u0590-\u05FF]$/u.test(t)).length;
      if (singleLetter / tokens.length > 0.35) score -= 1200;
    }
  }

  return score;
};

const pickBestResumeTextExtract = (candidates = []) => {
  let bestText = '';
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestSource = null;

  for (const entry of candidates) {
    const raw = typeof entry === 'string' ? entry : entry?.text;
    const source = typeof entry === 'string' ? null : entry?.source;
    const text = String(raw || '').trim();
    if (!text) continue;
    const score = scoreResumeTextExtract(text);
    if (score > bestScore) {
      bestScore = score;
      bestText = text;
      bestSource = source;
    }
  }

  return { text: bestText, score: bestScore, source: bestSource };
};

module.exports = {
  scoreResumeTextExtract,
  pickBestResumeTextExtract,
  HEBREW_CV_LEXICON,
};
