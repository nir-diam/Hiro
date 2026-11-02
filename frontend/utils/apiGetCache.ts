/** Short-lived in-memory cache for heavy GET JSON (journal tab bootstrap). */

type Entry = { at: number; data: unknown };

const store = new Map<string, Entry>();

const defaultTtlMs = () =>
  Math.max(5_000, Number.parseInt(import.meta.env.VITE_API_GET_CACHE_MS || '90000', 10) || 90_000);

export function invalidateApiGetCache(urlPrefix?: string) {
  if (!urlPrefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(urlPrefix)) store.delete(key);
  }
}

export async function fetchJsonGetCached(
  url: string,
  init?: RequestInit,
  ttlMs = defaultTtlMs(),
): Promise<unknown> {
  const key = url;
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) {
    return hit.data;
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`GET ${url} failed (${res.status})`);
  }
  const data = await res.json();
  store.set(key, { at: Date.now(), data });
  return data;
}
