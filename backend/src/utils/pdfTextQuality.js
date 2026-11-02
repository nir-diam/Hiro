const HEBREW_CHAR_RE = /[\u0590-\u05FF]/g;
const HEBREW_WORD_RE = /[\u0590-\u05FF]{2,}/g;
const REPLACEMENT_CHAR_RE = /\uFFFD/g;
const PUA_CHAR_RE = /[\uE000-\uF8FF]/g;
const MOJIBAKE_RE = /Ã.|Â.|â€™|â€œ|â€|ðŸ/;
/** Latin "eth" (U+00F0) often appears inside broken Hebrew PDF font maps. */
const PDF_ETH_CHAR_RE = /\u00F0/g;

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

  const ethNoise = (s.match(PDF_ETH_CHAR_RE) || []).length;
  score -= ethNoise * 180;

  // OCR often inserts digits into Hebrew words (8→ח/ת, 6→ו) — heavy penalty.
  const hebrewDigitMix = (s.match(/[\u0590-\u05FF]\d|\d[\u0590-\u05FF]/g) || []).length;
  score -= hebrewDigitMix * 120;
  const bidiMarks = (s.match(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g) || []).length;
  score -= bidiMarks * 40;

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

/** True when extract looks like noisy OCR (digits in Hebrew, mangled email, bidi junk). */
const resumeTextLooksOcrGarbled = (text) => {
  const s = String(text || '');
  if (!s.trim()) return false;

  const hebrewDigitInWord = (s.match(/[\u0590-\u05FF]\d[\u0590-\u05FF]/g) || []).length;
  const hebrewDigitMix = (s.match(/[\u0590-\u05FF]\d|\d[\u0590-\u05FF]/g) || []).length;
  if (hebrewDigitInWord >= 1 || hebrewDigitMix >= 3) return true;

  if (/gmail\.com[a-z0-9]{1,6}@|@[a-z0-9]+gmail\.com/i.test(s)) return true;
  if (/[\u200e\u200f\u202a-\u202e\u2066-\u2069].{0,40}@/.test(s)) return true;

  const ocrLineNoise = (s.match(/‎N[ITWV]{2,4}:/g) || []).length;
  if (ocrLineNoise >= 2) return true;

  return false;
};

/** True when pdf-parse returned long text but with PDF font-encoding noise (e.g. embedded ð). */
const resumeTextHasPdfFontEncodingNoise = (text) => {
  const s = String(text || '');
  if (!s.trim()) return false;
  const hebrew = (s.match(HEBREW_CHAR_RE) || []).length;
  const eth = (s.match(PDF_ETH_CHAR_RE) || []).length;
  if (hebrew >= 40 && eth >= 4) return true;
  if (hebrew >= 15 && eth >= 2) return true;
  return false;
};

module.exports = {
  scoreResumeTextExtract,
  pickBestResumeTextExtract,
  resumeTextLooksOcrGarbled,
  resumeTextHasPdfFontEncodingNoise,
  HEBREW_CV_LEXICON,
};
