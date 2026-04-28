/** Truncate for history lines (long descriptions). */
const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max)}…`);

/**
 * “שינה את {label} מ-"…" ל-"…"” for audit-style history in Hebrew.
 */
export function hebrewFieldChangeLine(
  fieldLabel: string,
  oldVal: string,
  newVal: string,
  maxEach = 200,
): string {
  return `שינה את ${fieldLabel} מ-"${clip((oldVal ?? '').trim(), maxEach)}" ל-"${clip((newVal ?? '').trim(), maxEach)}"`;
}

export function hebrewDescriptionChangeLine(oldText: string, newText: string, maxEach = 200): string {
  return hebrewFieldChangeLine('התיאור', oldText, newText, maxEach);
}

export type EventLink = { type: string; name: string };

const normalizeLinkArray = (links: EventLink[] | null | undefined): EventLink[] =>
  (Array.isArray(links) ? links : [])
    .map((l) => ({
      type: String(l?.type ?? '').trim(),
      name: String(l?.name ?? '').trim(),
    }))
    .filter((l) => l.name.length > 0)
    .sort((a, b) => {
      const at = `${a.type}\u0000${a.name}`;
      const bt = `${b.type}\u0000${b.name}`;
      return at.localeCompare(bt, 'he');
    });

const formatLinksForHistory = (links: EventLink[] | null | undefined, emptyLabel: string) => {
  const n = normalizeLinkArray(links);
  if (n.length === 0) return emptyLabel;
  return n.map((l) => `${l.type || '?'}: ${l.name}`).join('؛ ');
};

/**
 * “שינה את הקישורים המשויכים מ-… ל-…” — empty / missing lists use `emptyLabel` (e.g. "ללא").
 */
export function hebrewLinkedListChangeLine(
  oldLinks: EventLink[] | null | undefined,
  newLinks: EventLink[] | null | undefined,
  options?: { maxEach?: number; emptyLabel?: string },
) {
  const emptyLabel = options?.emptyLabel ?? 'ללא';
  const maxEach = options?.maxEach ?? 320;
  const oldS = formatLinksForHistory(oldLinks, emptyLabel);
  const newS = formatLinksForHistory(newLinks, emptyLabel);
  if (oldS === newS) return '';
  return hebrewFieldChangeLine('הקישורים המשויכים', oldS, newS, maxEach);
}
