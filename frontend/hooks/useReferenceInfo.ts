import { useEffect, useState } from 'react';
import { ReferenceInfoEntry, fetchReferenceInfo } from '../services/referenceInfoApi';

type CacheState = {
    entries: ReferenceInfoEntry[];
    byKey: Map<string, ReferenceInfoEntry>;
    loaded: boolean;
    loading: boolean;
    error: string | null;
};

const cache: CacheState = {
    entries: [],
    byKey: new Map(),
    loaded: false,
    loading: false,
    error: null,
};

let inflight: Promise<void> | null = null;
const subscribers = new Set<() => void>();

const notify = () => {
    subscribers.forEach((cb) => {
        try {
            cb();
        } catch {
            /* ignore */
        }
    });
};

const getToken = (): string | null =>
    typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;

const loadOnce = async (force = false): Promise<void> => {
    if (cache.loaded && !force) return;
    if (inflight && !force) return inflight;

    const apiBase = import.meta.env.VITE_API_BASE || '';
    cache.loading = true;
    cache.error = null;
    notify();

    inflight = (async () => {
        try {
            const rows = await fetchReferenceInfo(apiBase, getToken());
            cache.entries = rows;
            cache.byKey = new Map(rows.map((r) => [r.key, r]));
            cache.loaded = true;
        } catch (err) {
            cache.error = err instanceof Error ? err.message : 'שגיאה בטעינת מידע עזר';
        } finally {
            cache.loading = false;
            inflight = null;
            notify();
        }
    })();

    return inflight;
};

export const refreshReferenceInfoCache = (): Promise<void> => loadOnce(true);

export type UseReferenceInfoResult = {
    entry: ReferenceInfoEntry | null;
    loading: boolean;
    error: string | null;
};

/**
 * Returns the cached ReferenceInfo entry for the given key, lazily fetching
 * the full list once on first use. All instances share the same in-memory
 * cache so adding many icons does not multiply network calls.
 */
export function useReferenceInfo(key: string | null | undefined): UseReferenceInfoResult {
    const [, force] = useState(0);

    useEffect(() => {
        const cb = () => force((n) => n + 1);
        subscribers.add(cb);
        if (!cache.loaded && !cache.loading) {
            void loadOnce();
        }
        return () => {
            subscribers.delete(cb);
        };
    }, []);

    const entry = key ? cache.byKey.get(key) ?? null : null;
    return { entry, loading: cache.loading, error: cache.error };
}
