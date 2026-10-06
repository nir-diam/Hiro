'use strict';

const trimStr = (value) => String(value || '').trim();

/** Strip legal suffixes so "אלביט מערכות בע\"מ" resolves to "אלביט מערכות". */
const normalizeCompanyNameForLookup = (name) => {
  let s = trimStr(name);
  if (!s) return '';
  s = s.replace(/\s+בע[״"']מ\.?\s*$/i, '');
  s = s.replace(/\s+בע\s*מ\.?\s*$/i, '');
  s = s.replace(/\s+l\.?t\.?d\.?\s*$/i, '');
  s = s.replace(/\s+inc\.?\s*$/i, '');
  return s.trim();
};

/** Build normalized lookup keys for a company label (exact + fragments). */
const companyNameLookupVariants = (name) => {
  const raw = trimStr(name);
  if (!raw) return [];

  const variants = new Set();
  const add = (value) => {
    const t = trimStr(value);
    if (!t) return;
    variants.add(t.toLowerCase());
    const norm = normalizeCompanyNameForLookup(t);
    if (norm) variants.add(norm.toLowerCase());
  };

  add(raw);

  for (const part of raw.split(/\s[-–|]\s/)) add(part);

  const beforeParen = raw.split('(')[0].trim();
  if (beforeParen) add(beforeParen);

  const parenMatch = raw.match(/\(([^)]+)\)/);
  if (parenMatch?.[1]) add(parenMatch[1].trim());

  const afterParen = raw.replace(/^[^)]*\)\s*/, '').trim();
  if (afterParen && afterParen !== raw && !isInsignificantLookupVariant(afterParen)) {
    add(afterParen);
  }

  return [...variants];
};

const MIN_FUZZY_LEN = 4;

const LEGAL_SUFFIX_ONLY_RE = /^בע[״"']?\s*מ\.?$|^l\.?\s*t\.?\s*d\.?$|^inc\.?$/i;

const isInsignificantLookupVariant = (key) => {
  const k = trimStr(key).toLowerCase();
  if (!k) return true;
  return LEGAL_SUFFIX_ONLY_RE.test(k);
};

/** True when two labels likely refer to the same company (exact, fragment, or substring). */
const namesLikelySameCompany = (left, right) => {
  const aKeys = companyNameLookupVariants(left);
  const bKeys = companyNameLookupVariants(right);
  if (!aKeys.length || !bKeys.length) return false;

  for (const a of aKeys) {
    if (isInsignificantLookupVariant(a)) continue;
    for (const b of bKeys) {
      if (isInsignificantLookupVariant(b)) continue;
      if (a === b) return true;
      if (a.length >= MIN_FUZZY_LEN && b.length >= MIN_FUZZY_LEN && (a.includes(b) || b.includes(a))) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Resolve organization id from a label→orgId map using exact keys then fuzzy substring.
 */
const resolveOrgIdFromLabelMap = (searchLabel, labelToOrgIdMap) => {
  if (!labelToOrgIdMap || typeof labelToOrgIdMap.get !== 'function') return null;
  const variants = companyNameLookupVariants(searchLabel);
  for (const key of variants) {
    if (labelToOrgIdMap.has(key)) return labelToOrgIdMap.get(key);
  }

  const norm = normalizeCompanyNameForLookup(searchLabel).toLowerCase();
  if (!norm || norm.length < MIN_FUZZY_LEN) return null;

  let best = null;
  let bestLen = 0;
  for (const [key, orgId] of labelToOrgIdMap.entries()) {
    if (key.length < MIN_FUZZY_LEN) continue;
    if (key.includes(norm) || norm.includes(key)) {
      const score = Math.min(key.length, norm.length);
      if (score > bestLen) {
        bestLen = score;
        best = orgId;
      }
    }
  }
  return best;
};

/**
 * Pick best option from [{ id, label }] list for an AI/client label.
 */
const findBestLabelOptionMatch = (searchLabel, options = []) => {
  const needle = trimStr(searchLabel);
  if (!needle || !Array.isArray(options) || !options.length) return null;

  const needleLower = needle.toLowerCase();
  const exact = options.find((opt) => trimStr(opt.label ?? opt.name).toLowerCase() === needleLower);
  if (exact) return exact;

  for (const opt of options) {
    const label = trimStr(opt.label ?? opt.name);
    if (label && namesLikelySameCompany(needle, label)) return opt;
  }
  return null;
};

module.exports = {
  normalizeCompanyNameForLookup,
  companyNameLookupVariants,
  namesLikelySameCompany,
  resolveOrgIdFromLabelMap,
  findBestLabelOptionMatch,
  MIN_FUZZY_LEN,
};
