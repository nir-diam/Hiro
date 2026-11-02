/** Shared GET coalescing for client journal list (`/api/clients/.../events?journalFilter=1`). */

const DEFAULT_MIN_GAP_MS = Math.max(
  5000,
  Number.parseInt(import.meta.env.VITE_CLIENT_JOURNAL_LIST_MIN_GAP_MS || '60000', 10) || 60000,
);

type CacheEntry = { url: string; at: number; data: unknown };

let lastCompleted: CacheEntry | null = null;

type InflightEntry = { ac: AbortController; promise: Promise<unknown> };

const inflightByUrl = new Map<string, InflightEntry>();

export function invalidateClientJournalEventsListCache(url?: string): void {
  if (!url) {
    lastCompleted = null;
    return;
  }
  if (lastCompleted?.url === url) lastCompleted = null;
}

export function abortClientJournalEventsListFetch(url?: string): void {
  if (url) {
    inflightByUrl.get(url)?.ac.abort();
    inflightByUrl.delete(url);
    return;
  }
  for (const entry of inflightByUrl.values()) entry.ac.abort();
  inflightByUrl.clear();
}

export async function fetchClientJournalEventsList(
  url: string,
  init: RequestInit,
  options: { force?: boolean; minGapMs?: number; parentSignal?: AbortSignal } = {},
): Promise<unknown> {
  const force = options.force === true;
  const minGapMs = options.minGapMs ?? DEFAULT_MIN_GAP_MS;
  const now = Date.now();

  const existing = inflightByUrl.get(url);
  if (existing && !force) return existing.promise;

  if (
    !force
    && lastCompleted?.url === url
    && now - lastCompleted.at < minGapMs
  ) {
    return lastCompleted.data;
  }

  if (existing && force) {
    existing.ac.abort();
    inflightByUrl.delete(url);
  }

  const ac = new AbortController();
  const onParentAbort = () => ac.abort();
  if (options.parentSignal) {
    if (options.parentSignal.aborted) ac.abort();
    else options.parentSignal.addEventListener('abort', onParentAbort, { once: true });
  }

  const promise = fetch(url, { ...init, signal: ac.signal })
    .then(async (res) => {
      if (!res.ok) throw new Error('טעינת אירועים נכשלה');
      const data = await res.json();
      lastCompleted = { url, at: Date.now(), data };
      return data;
    })
    .finally(() => {
      options.parentSignal?.removeEventListener('abort', onParentAbort);
      if (inflightByUrl.get(url)?.promise === promise) inflightByUrl.delete(url);
    });

  inflightByUrl.set(url, { ac, promise });
  return promise;
}
