import { authHeaders } from './authHeaders';

const apiBase = () => (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

type CacheEntry = {
    at: number;
    promise: Promise<Record<string, unknown>>;
};

const candidateGetCache = new Map<string, CacheEntry>();
const STAFF_CANDIDATE_CACHE_MS = 30_000;

async function parseCandidateResponse(res: Response): Promise<Record<string, unknown>> {
    if (!res.ok) {
        let message = res.statusText || 'Request failed';
        try {
            const body = (await res.json()) as { message?: string };
            if (body?.message) message = body.message;
        } catch {
            /* ignore */
        }
        throw new Error(message);
    }
    const data = (await res.json()) as unknown;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Invalid candidate payload');
    }
    return data as Record<string, unknown>;
}

/**
 * Deduped GET /api/candidates/:id for staff UI.
 * Multiple mounted components (profile, drawer, compose modal, jobs tab) share one in-flight request.
 */
export async function fetchStaffCandidateById(
    candidateId: string,
    opts?: { bypassCache?: boolean },
): Promise<Record<string, unknown>> {
    const cid = String(candidateId || '').trim();
    if (!cid) throw new Error('missing candidate id');

    if (opts?.bypassCache) {
        invalidateStaffCandidateCache(cid);
    }

    const now = Date.now();
    const cached = candidateGetCache.get(cid);
    if (cached && now - cached.at < STAFF_CANDIDATE_CACHE_MS) {
        return cached.promise;
    }

    const promise = fetch(`${apiBase()}/api/candidates/${encodeURIComponent(cid)}`, {
        headers: authHeaders(true),
        credentials: 'include',
        cache: 'no-store',
    }).then(parseCandidateResponse);

    candidateGetCache.set(cid, { at: now, promise });
    return promise;
}

export function invalidateStaffCandidateCache(candidateId?: string | null): void {
    if (candidateId != null && String(candidateId).trim()) {
        candidateGetCache.delete(String(candidateId).trim());
        return;
    }
    candidateGetCache.clear();
}

if (typeof window !== 'undefined') {
    window.addEventListener('candidate-data-refreshed', (event) => {
        const detail = (event as CustomEvent)?.detail as Record<string, unknown> | undefined;
        const id =
            detail?.backendId != null
                ? String(detail.backendId).trim()
                : detail?.id != null
                  ? String(detail.id).trim()
                  : detail?.candidateId != null
                    ? String(detail.candidateId).trim()
                    : '';
        if (id) invalidateStaffCandidateCache(id);
    });
}
