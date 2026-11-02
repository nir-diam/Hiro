const PRESENT_END_RE = /^(present|היום|נוכחי|current|עכשיו)$/i;

/** Model sometimes loops ISO fragments in startDate until maxOutputTokens. */
const experienceDateLooksCorrupt = (raw) => {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  if (s.length > 32) return true;
  if (/T\d{2}:\d{2}/i.test(s)) return true;
  if (/or-year/i.test(s)) return true;
  if ((s.match(/\d{4}-\d{2}-\d{2}T/gi) || []).length > 0) return true;
  if (/(-\d{2}-\d{2}){2,}/.test(s)) return true;
  if (/(\d{4}-\d{2}-\d{2}T[^"]*){2,}/.test(s)) return true;
  if (/\.{3,}|…/.test(s)) return true;
  return false;
};

const sanitizeExperienceDate = (raw, { allowPresent = false } = {}) => {
  const s = String(raw ?? '').trim();
  if (!s) return { value: null, suspicious: false };
  if (allowPresent && PRESENT_END_RE.test(s)) return { value: 'Present', suspicious: false };

  const suspicious = experienceDateLooksCorrupt(s);
  const ym = s.match(/\b(19|20)\d{2}-(0[1-9]|1[0-2])\b/);
  if (ym) return { value: ym[0], suspicious };

  const isoPrefix = s.match(/^(\d{4})-(\d{2})-\d{2}T/);
  if (isoPrefix) return { value: `${isoPrefix[1]}-${isoPrefix[2]}`, suspicious: true };

  if (/^\d{4}$/.test(s)) return { value: s, suspicious: false };

  if (/^\d{4}-\d{2}$/.test(s)) return { value: s, suspicious: false };

  if (suspicious) {
    const yonly = s.match(/\b(19|20)\d{2}\b/);
    if (yonly) return { value: yonly[0], suspicious: true };
    return { value: null, suspicious: true };
  }

  if (s.length <= 12) return { value: s, suspicious: false };
  return { value: null, suspicious: true };
};

module.exports = {
  PRESENT_END_RE,
  experienceDateLooksCorrupt,
  sanitizeExperienceDate,
};
