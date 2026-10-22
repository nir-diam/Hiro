import type { TagCategory, TagOption } from '../components/TagSelectorModal';

export type TagSortMode = 'usage' | 'hebrew';

export type SearchMatchTier = 0 | 1 | 2 | 3 | 4;

const normalize = (value: string) => value.trim().toLowerCase();

const synonymStrings = (tag: TagOption): string[] => {
  const raw = tag.synonyms || [];
  return raw
    .map((syn) => (typeof syn === 'string' ? syn : (syn as { name?: string }).name || ''))
    .filter(Boolean);
};

/** Higher tier = better match. Exact > startsWith > contains. */
export const searchMatchTier = (tag: TagOption, searchTerm: string): SearchMatchTier => {
  const q = normalize(searchTerm);
  if (!q) return 4;
  const names = [tag.nameHe, tag.nameEn, ...synonymStrings(tag)].map(normalize).filter(Boolean);
  for (const name of names) {
    if (name === q) return 4;
  }
  for (const name of names) {
    if (name.startsWith(q)) return 3;
  }
  for (const name of names) {
    if (name.includes(q)) return 2;
  }
  return 0;
};

export const hasExactCatalogMatch = (tags: TagOption[], searchTerm: string): boolean => {
  const q = normalize(searchTerm);
  if (!q) return true;
  return tags.some((tag) => searchMatchTier(tag, q) === 4);
};

export const sortTags = (tags: TagOption[], sortMode: TagSortMode, searchTerm: string): TagOption[] => {
  const withSearch = Boolean(searchTerm.trim());
  return [...tags].sort((a, b) => {
    if (withSearch) {
      const tierDiff = searchMatchTier(b, searchTerm) - searchMatchTier(a, searchTerm);
      if (tierDiff !== 0) return tierDiff;
    }
    if (sortMode === 'hebrew') {
      return (a.nameHe || '').localeCompare(b.nameHe || '', 'he');
    }
    const usageDiff = (b.usageCount || 0) - (a.usageCount || 0);
    if (usageDiff !== 0) return usageDiff;
    return (a.nameHe || '').localeCompare(b.nameHe || '', 'he');
  });
};

export const highlightParts = (text: string, searchTerm: string): Array<{ text: string; highlight: boolean }> => {
  const q = searchTerm.trim();
  if (!q || !text) return [{ text, highlight: false }];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx < 0) return [{ text, highlight: false }];
  const parts: Array<{ text: string; highlight: boolean }> = [];
  if (idx > 0) parts.push({ text: text.slice(0, idx), highlight: false });
  parts.push({ text: text.slice(idx, idx + q.length), highlight: true });
  if (idx + q.length < text.length) parts.push({ text: text.slice(idx + q.length), highlight: false });
  return parts;
};

export const tagMatchesSearch = (tag: TagOption, searchTerm: string): boolean =>
  searchMatchTier(tag, searchTerm) > 0;

export const categoryResultCounts = (
  tags: TagOption[],
  searchTerm: string,
  existingNames: Set<string>,
): Partial<Record<TagCategory, number>> => {
  const q = searchTerm.trim();
  const counts: Partial<Record<TagCategory, number>> = {};
  for (const tag of tags) {
    if (existingNames.has(tag.nameHe)) continue;
    if (q && !tagMatchesSearch(tag, q)) continue;
    const cat = tag.category || 'role';
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return counts;
};

export const isAssociatedTag = (tag: TagOption, existingNames: Set<string>, associatedIds: Set<string>): boolean =>
  associatedIds.has(tag.id) || existingNames.has(tag.nameHe);
