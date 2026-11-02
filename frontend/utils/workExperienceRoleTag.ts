import { inferSmartTagType, normalizeTagDetail } from './candidateGroupedSmartTags';

export type RoleTagDetailLike = {
  tagId?: string | number;
  tag?: { id?: string | number };
  displayNameHe?: string;
  displayNameEn?: string;
  tagKey?: string;
  rawType?: string;
  raw_type?: string;
};

const isRoleDetail = (d: RoleTagDetailLike) => {
  const raw = String(d.rawType || d.raw_type || '')
    .trim()
    .toLowerCase();
  return raw === 'role' || raw.includes('role');
};

const detailLabels = (d: RoleTagDetailLike): string[] =>
  [d.displayNameHe, d.displayNameEn, d.tagKey]
    .map((v) => String(v || '').trim())
    .filter(Boolean);

const detailDisplayName = (d: RoleTagDetailLike): string =>
  String(d.displayNameHe || d.displayNameEn || d.tagKey || '').trim();

/** תפקיד (תגית) in ניסיון modal — only tags that exist under תפקיד והקשר (tagDetails), not raw CV titles. */
export function resolveRoleTagForJob(
  exp: Record<string, unknown> | null | undefined,
  tagDetails: RoleTagDetailLike[] = [],
): string {
  if (!exp || typeof exp !== 'object') return '';

  const roleDetails = tagDetails.filter(isRoleDetail);
  if (!roleDetails.length) return '';

  const tagId = exp.tagId ?? exp.tag_id;
  if (tagId != null) {
    const idStr = String(tagId);
    const byId = roleDetails.find((d) => {
      const detailId = d.tagId ?? d.tag?.id;
      return detailId != null && String(detailId) === idStr;
    });
    if (byId) return detailDisplayName(byId);
  }

  const rowRole = String(exp.roleTag ?? exp.role_tag ?? '').trim().toLowerCase();
  if (rowRole) {
    const exact = roleDetails.find((d) =>
      detailLabels(d).some((label) => label.toLowerCase() === rowRole),
    );
    if (exact) return detailDisplayName(exact);
  }

  return '';
}

export type ExperienceContextTagType = 'role' | 'seniority' | 'industry';

export type ExperienceContextTag = {
  key: string;
  label: string;
  type: ExperienceContextTagType;
};

const CONTEXT_TAG_TYPES = new Set<string>(['role']);

/** Shorter quotes match too many unrelated description lines. */
const MIN_DESCRIPTION_QUOTE_CHARS = 10;

const lower = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

const LETTER_RE = /[\p{L}\p{N}]/u;

/** Whole-word containment, so "מנכ\"ל" does not match inside "סמנכ\"ל". */
function containsWord(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return false;
    const before = at > 0 ? haystack[at - 1] : '';
    const after = haystack[at + needle.length] ?? '';
    if (!LETTER_RE.test(before) && !LETTER_RE.test(after)) return true;
    from = at + 1;
  }
  return false;
}

/** "סמנכ\"ל/ית מכירות" → "סמנכ\"ל מכירות"; "CMO - סמנכ\"ל/ית שיווק" → both halves. */
function labelVariants(label: string): string[] {
  const base = lower(label).replace(/\/(?:ית|ה|ת)(?=\s|$)/gu, '');
  const parts = base.split(/\s+[-–/]\s+/).map((p) => p.trim());
  return Array.from(new Set([base, ...parts])).filter((p) => p.length >= 2);
}

const quoteSnippets = (raw: Record<string, unknown>): string[] =>
  [raw.quote, raw.evidence]
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .map(lower)
    .filter(Boolean);

/**
 * Role tags (תפקיד) that belong to one work-experience row.
 * Matched from the row's own text (title, companyField slug, description quote) — the stored
 * roleTag/tagId are not trusted alone because the parser sometimes fills them with the
 * candidate's main role on unrelated rows.
 */
export function resolveExperienceContextTags(
  exp: Record<string, unknown> | null | undefined,
  tagDetails: unknown[] = [],
): ExperienceContextTag[] {
  if (!exp || typeof exp !== 'object' || !Array.isArray(tagDetails)) return [];

  const explicitIds = Array.isArray(exp.roleTagIds)
    ? exp.roleTagIds.map((id) => String(id).trim()).filter(Boolean).slice(0, 2)
    : [];
  if (explicitIds.length) {
    const out: ExperienceContextTag[] = [];
    const seen = new Set<string>();
    for (const tid of explicitIds) {
      const detail = tagDetails.find((item) => {
        if (!item || typeof item !== 'object') return false;
        const d = item as RoleTagDetailLike;
        const detailId = d.tagId ?? d.tag?.id;
        return detailId != null && String(detailId) === tid;
      }) as RoleTagDetailLike | undefined;
      const label = detail ? detailDisplayName(detail) : '';
      if (!label) continue;
      const key = `role:${label.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, label, type: 'role' });
    }
    if (out.length) return out;
  }

  const companyField = lower(exp.companyField ?? exp.company_field);
  const title = lower(exp.title);
  const company = lower(exp.company);
  const description = lower(exp.description);

  const out: ExperienceContextTag[] = [];
  const seen = new Set<string>();

  for (const item of tagDetails) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const detail = normalizeTagDetail(raw);
    const type = inferSmartTagType(detail);
    if (!CONTEXT_TAG_TYPES.has(type)) continue;

    const label = String(detail.displayNameHe || detail.displayNameEn || detail.tagKey || '').trim();
    if (!label) continue;
    const names = [detail.displayNameHe, detail.displayNameEn].filter(Boolean) as string[];
    const variants = names.flatMap(labelVariants);
    const quotes = quoteSnippets(raw);
    const tagKey = lower(detail.tagKey);

    const matched =
      (companyField !== '' && (companyField === tagKey || names.some((n) => lower(n) === companyField)))
      || variants.some((v) => containsWord(title, v))
      || quotes.some((q) => containsWord(title, q))
      || (type === 'industry' && variants.some((v) => v.length >= 4 && containsWord(company, v)))
      || quotes.some((q) => q.length >= MIN_DESCRIPTION_QUOTE_CHARS && containsWord(description, q));
    if (!matched) continue;

    const key = `${type}:${label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label, type: type as ExperienceContextTagType });
  }

  const order: Record<ExperienceContextTagType, number> = { role: 0, seniority: 1, industry: 2 };
  return out.sort((a, b) => order[a.type] - order[b.type]);
}
