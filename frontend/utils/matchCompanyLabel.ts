export type CompanyLabelOption = {
  id: string;
  label: string;
  clientId?: string | null;
};

const trimStr = (value: unknown) => String(value ?? '').trim();

const normalizeCompanyNameForLookup = (name: string): string => {
  let s = trimStr(name);
  if (!s) return '';
  s = s.replace(/\s+בע[״"']מ\.?\s*$/i, '');
  s = s.replace(/\s+בע\s*מ\.?\s*$/i, '');
  s = s.replace(/\s+l\.?t\.?d\.?\s*$/i, '');
  s = s.replace(/\s+inc\.?\s*$/i, '');
  return s.trim();
};

export const companyNameLookupVariants = (name: string): string[] => {
  const raw = trimStr(name);
  if (!raw) return [];

  const variants = new Set<string>();
  const add = (value: string) => {
    const t = trimStr(value);
    if (!t) return;
    variants.add(t.toLowerCase());
    const norm = normalizeCompanyNameForLookup(t);
    if (norm) variants.add(norm.toLowerCase());
  };

  add(raw);
  for (const part of raw.split(/\s[-–|]\s/)) add(part);

  const beforeParen = raw.split('(')[0]?.trim() ?? '';
  if (beforeParen) add(beforeParen);

  const parenMatch = raw.match(/\(([^)]+)\)/);
  if (parenMatch?.[1]) add(parenMatch[1]);

  const afterParen = raw.replace(/^[^)]*\)\s*/, '').trim();
  if (afterParen && afterParen !== raw && !isInsignificantLookupVariant(afterParen)) {
    add(afterParen);
  }

  return [...variants];
};

const MIN_FUZZY_LEN = 4;

/** Variants like standalone "בע\"מ" must not fuzzy-match every * בע\"מ company name. */
const LEGAL_SUFFIX_ONLY_RE = /^בע[״"']?\s*מ\.?$|^l\.?\s*t\.?\s*d\.?$|^inc\.?$/i;

const isInsignificantLookupVariant = (key: string): boolean => {
  const k = trimStr(key).toLowerCase();
  if (!k) return true;
  return LEGAL_SUFFIX_ONLY_RE.test(k);
};

export const namesLikelySameCompany = (left: string, right: string): boolean => {
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

/** Match AI/client label to an org picker option (exact, dash-split, or substring). */
export const matchOrgOption = (
  searchLabel: string | null | undefined,
  options: CompanyLabelOption[],
): CompanyLabelOption | null => {
  const needle = trimStr(searchLabel);
  if (!needle || !options.length) return null;

  const needleLower = needle.toLowerCase();
  const exact = options.find((opt) => trimStr(opt.label).toLowerCase() === needleLower);
  if (exact) return exact;

  for (const opt of options) {
    const label = trimStr(opt.label);
    if (label && namesLikelySameCompany(needle, label)) return opt;
  }
  return null;
};
