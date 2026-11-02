/** Keep in sync with jobService.POSTING_CODE_MATCH_MIN (avoid requiring jobService here). */
const POSTING_CODE_MATCH_MIN = 100_000;

function isPostingCodeValidForMatch(code) {
  const raw = String(code || '').trim();
  if (!raw) return false;
  if (!/^\d+$/.test(raw)) return true;
  const n = Number(raw);
  return Number.isFinite(n) && n >= POSTING_CODE_MATCH_MIN;
}

/**
 * A leading 0 is never a Hiro / JobMaster posting code (phone, extension, etc.).
 */
function looksLikePhoneNumberDigits(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return false;
  if (digits.startsWith('0')) return true;
  if (digits.startsWith('972') && digits.length >= 11 && digits.length <= 13) return true;
  return false;
}

function isUsablePostingCode(code) {
  const raw = String(code || '').trim();
  if (!raw) return false;
  if (raw.startsWith('0') || looksLikePhoneNumberDigits(raw)) return false;
  return isPostingCodeValidForMatch(raw);
}

/** Job application inboxes: {prefix}+{postingCode}@{domain} */
const postingCodeFromPlusAddressText = (text = '') => {
  const m = String(text || '').match(/[a-zA-Z0-9][a-zA-Z0-9._-]*\+([a-zA-Z0-9_-]+)@/i);
  const code = m ? m[1] : null;
  return code && isUsablePostingCode(code) ? code : null;
};

/** First usable standalone number >= POSTING_CODE_MATCH_MIN. Skips phone-shaped values. */
const extractPostingCodeFromLargeNumberInText = (text = '') => {
  const src = String(text || '').trim();
  if (!src) return null;
  const re = /\b(\d+)\b/gu;
  let m;
  while ((m = re.exec(src)) !== null) {
    const digits = m[1];
    if (digits.length > 12) continue;
    const n = Number(digits);
    if (!Number.isFinite(n) || n < POSTING_CODE_MATCH_MIN) continue;
    if (!isUsablePostingCode(digits)) continue;
    return digits;
  }
  return null;
};

const extractPostingCodeFromEmailAddress = (email = '') => {
  const raw = String(email || '').trim();
  if (!raw) return null;
  const angle = raw.match(/<([^>]+@[^>]+)>/i);
  const addr = angle ? angle[1].trim() : raw;
  const fromPlus = postingCodeFromPlusAddressText(addr);
  if (fromPlus) return fromPlus;
  if (angle) {
    const displayPart = raw
      .replace(angle[0], '')
      .trim()
      .replace(/^["']|["']$/g, '')
      .trim();
    const fromNumber = extractPostingCodeFromLargeNumberInText(displayPart);
    if (fromNumber) return fromNumber;
  }
  return extractPostingCodeFromLargeNumberInText(raw);
};

/** e.g. "Name - 603771.pdf" → 603771 */
const extractPostingCodeFromFileKey = (fileKey = '') => {
  const base = String(fileKey || '').split('/').pop() || '';
  let name = base;
  try {
    name = decodeURIComponent(base);
  } catch {
    /* keep raw */
  }
  const dashMatch = name.match(/[-–—]\s*(\d{4,12})(?:\.[^.]+)?$/);
  if (dashMatch && isUsablePostingCode(dashMatch[1])) return dashMatch[1];
  const tailMatch = name.match(/(\d{4,12})(?:\.[^.]+)?$/);
  if (tailMatch && isUsablePostingCode(tailMatch[1])) return tailMatch[1];
  return null;
};

/**
 * Ordered unique posting-code candidates from a JobMaster / AllJobs subject.
 * Trailing " - CODE" wins over a phone number that appears earlier.
 */
const collectPostingCodeCandidatesFromSubject = (subject = '') => {
  const text = String(subject || '').trim();
  const out = [];
  const add = (code) => {
    const raw = String(code || '').trim();
    if (!isUsablePostingCode(raw) || out.includes(raw)) return;
    out.push(raw);
  };
  if (!text) return out;

  const fromPlus = postingCodeFromPlusAddressText(text);
  if (fromPlus) add(fromPlus);

  const masMatch = text.match(/מס['\u05F3]?\s*(\d{4,12})/u);
  if (masMatch) add(masMatch[1]);

  const dashMatch = text.match(/[-–—]\s*(\d{4,12})\s*$/);
  if (dashMatch) add(dashMatch[1]);

  const all = [...text.matchAll(/\b(\d{4,12})\b/g)].map((m) => m[1]);
  for (let i = all.length - 1; i >= 0; i -= 1) add(all[i]);
  return out;
};

const extractPostingCodeFromSubject = (subject = '') =>
  collectPostingCodeCandidatesFromSubject(subject)[0] || null;

module.exports = {
  looksLikePhoneNumberDigits,
  isUsablePostingCode,
  postingCodeFromPlusAddressText,
  extractPostingCodeFromLargeNumberInText,
  extractPostingCodeFromEmailAddress,
  extractPostingCodeFromFileKey,
  collectPostingCodeCandidatesFromSubject,
  extractPostingCodeFromSubject,
};
