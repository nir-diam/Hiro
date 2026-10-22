const CV_TITLE_CORE =
  '(?:מסמך\\s+)?(?:קורות\\s*חיים(?:\\s+של)?|קו["׳״\']?ח|curriculum\\s*vitae|(?:cv|resume)(?:\\s+of)?)';

const CV_DOC_TITLE_PREFIX_RE = new RegExp(
  `^${CV_TITLE_CORE}\\s*(?:\\/\\/+|[-–—־:|]+)?\\s*`,
  'iu',
);

/** "שרה ברוורמן // קורות" or "שי אוחיון - Resume". Bare "חיים" is a real name and is not stripped. */
const CV_DOC_TITLE_SUFFIX_RE = new RegExp(
  `\\s*(?:\\/\\/+|\\||[-–—־:])\\s*(?:${CV_TITLE_CORE}|קורות)\\s*$|\\s+(?:${CV_TITLE_CORE})\\s*$`,
  'iu',
);

const CV_DOC_TITLE_ONLY_RE = new RegExp(`^${CV_TITLE_CORE}$`, 'iu');

const CV_DOC_TITLE_TOKEN_RE =
  /קורות\s*חיים|קורות|קו["׳״']?ח|curriculum\s*vitae|\b(?:cv|resume)\b/iu;

const PLACEHOLDER_NAMES = new Set(['מועמד חדש', 'candidate', 'ללא שם']);

function collapseNameWs(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * CVs often open or close with a document title ("קורות חיים – שם", "שם // קורות", "Resume: Name").
 * That title is not a person name. Separators removed: - – — : | //
 * Returns '' when nothing but the title remains.
 */
function stripCvDocumentTitleFromPersonName(name) {
  let s = collapseNameWs(name);
  if (!s) return '';
  for (let i = 0; i < 4; i += 1) {
    const next = s
      .replace(CV_DOC_TITLE_PREFIX_RE, '')
      .replace(CV_DOC_TITLE_SUFFIX_RE, '')
      .replace(/^[-–—־:|/]+\s*/, '')
      .replace(/\s*[-–—־:|/]+$/, '')
      .trim();
    if (next === s) break;
    s = next;
  }
  if (!s || CV_DOC_TITLE_ONLY_RE.test(s)) return '';
  return s;
}

function isCvTitleWord(token) {
  return /^(?:קורות|חיים|קוח|cv|resume|curriculum|vitae)$/iu.test(String(token || '').trim());
}

/** firstName "קורות" + lastName "חיים" is the document title split across fields. */
function isSplitCvDocumentTitle(firstName, lastName) {
  const first = collapseNameWs(firstName);
  const last = collapseNameWs(lastName);
  if (!first || !last) return false;
  if (!isCvTitleWord(first) || !isCvTitleWord(last)) return false;
  return /קורות|cv|resume|curriculum|vitae|קוח/iu.test(`${first} ${last}`);
}

function nameLooksLikeCvDocumentTitle(name) {
  const raw = collapseNameWs(name);
  if (!raw) return false;
  const stripped = stripCvDocumentTitleFromPersonName(raw);
  return CV_DOC_TITLE_TOKEN_RE.test(raw) && stripped !== raw;
}

function isPlaceholderPersonName(name) {
  const t = collapseNameWs(name);
  if (!t) return true;
  return PLACEHOLDER_NAMES.has(t) || PLACEHOLDER_NAMES.has(t.toLowerCase());
}

/**
 * Clean first / last / full together.
 * `cleared` is true when the input had a name and it was only a CV document title.
 */
function sanitizePersonNameFields({ firstName, lastName, fullName } = {}) {
  const rawFirst = collapseNameWs(firstName);
  const rawLast = collapseNameWs(lastName);
  const rawFull = collapseNameWs(fullName);
  const hadInput = Boolean(rawFirst || rawLast || rawFull);

  let first = stripCvDocumentTitleFromPersonName(rawFirst);
  let last = stripCvDocumentTitleFromPersonName(rawLast);
  if (isSplitCvDocumentTitle(rawFirst, rawLast) || isSplitCvDocumentTitle(first, last)) {
    first = '';
    last = '';
  }

  const fromParts = [first, last].filter(Boolean).join(' ').trim();
  let full = stripCvDocumentTitleFromPersonName(rawFull);
  if (!full) full = stripCvDocumentTitleFromPersonName(fromParts);
  const fullTokens = full ? full.split(/\s+/) : [];
  if (fullTokens.length === 2 && isSplitCvDocumentTitle(fullTokens[0], fullTokens[1])) {
    full = '';
  }
  if (!full && fromParts && !isSplitCvDocumentTitle(first, last)) full = fromParts;

  if (full) {
    const parts = full.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      first = parts.slice(0, -1).join(' ');
      last = parts[parts.length - 1];
    } else if (parts.length === 1) {
      first = parts[0];
      last = '';
    }
  } else {
    first = '';
    last = '';
  }

  const titleOnlyInput =
    nameLooksLikeCvDocumentTitle(rawFull)
    || isSplitCvDocumentTitle(rawFirst, rawLast)
    || CV_DOC_TITLE_ONLY_RE.test(rawFull);
  const cleared = hadInput && !full && (titleOnlyInput || !fromParts);
  return {
    firstName: first || '',
    lastName: last || '',
    fullName: full || '',
    cleared,
  };
}

/** Role / headline words. A line built from these is a job title, not a person. */
const JOB_HEADLINE_TOKEN_RE =
  /^(?:ו)?(?:מבצע(?:ים)?|תמיכה|יומיומית|יומי|ניהול|מנהל|אחראי(?:ת)?|מומחה|ניסיון|נסיון|פיתוח|רכש|מכירות|שיווק|לוגיסטיקה|קמעונאות|תפעול|בעיות|בבעיות|בשטח|בתחום|פרויקט|פרויקטים|זכיינים|קניינות|אופנה|הנעלה|merchandiser|manager|operations|support|daily)$/iu;

/**
 * CV openings are often a professional headline ("מבצעים ותמיכה יומיומית בבעיות בשטח"),
 * not the candidate's name. Person names in this product are short (2–4 tokens).
 */
function nameLooksLikeJobHeadline(name) {
  const s = collapseNameWs(stripCvDocumentTitleFromPersonName(name) || name);
  if (!s) return false;
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length >= 5) return true;
  const jobish = tokens.filter(
    (token) => JOB_HEADLINE_TOKEN_RE.test(token) || JOB_HEADLINE_TOKEN_RE.test(token.replace(/^[בלמה]/u, '')),
  );
  if (tokens.length >= 3 && jobish.length >= 1) return true;
  if (tokens.length >= 2 && jobish.length >= 2) return true;
  return false;
}

module.exports = {
  stripCvDocumentTitleFromPersonName,
  nameLooksLikeCvDocumentTitle,
  nameLooksLikeJobHeadline,
  sanitizePersonNameFields,
  isPlaceholderPersonName,
  isSplitCvDocumentTitle,
};
