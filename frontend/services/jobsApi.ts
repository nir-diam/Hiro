const apiBase = () => import.meta.env.VITE_API_BASE || '';

function authHeaders(): HeadersInit {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const token = raw != null ? String(raw).trim() || null : null;
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) (h as Record<string, string>).Authorization = `Bearer ${token}`;
    return h;
}

export type JobComposeRow = {
    id: string;
    title: string;
    client: string;
    postingCode?: string | null;
};

async function parseErr(res: Response): Promise<string> {
    try {
        const j = (await res.json()) as { message?: string };
        return j.message || res.statusText || 'Request failed';
    } catch {
        return res.statusText || 'Request failed';
    }
}

const inFlightJson = new Map<string, Promise<unknown>>();

/** Coalesce identical GETs (e.g. React StrictMode double-mount in dev). */
function fetchJsonDeduped<T>(key: string, run: () => Promise<T>): Promise<T> {
    const existing = inFlightJson.get(key);
    if (existing) return existing as Promise<T>;
    const promise = run().finally(() => {
        if (inFlightJson.get(key) === promise) inFlightJson.delete(key);
    });
    inFlightJson.set(key, promise);
    return promise;
}

async function fetchJobsForComposePayload(): Promise<unknown[]> {
    return fetchJsonDeduped('GET /api/jobs/for-compose', async () => {
        const res = await fetch(`${apiBase()}/api/jobs/for-compose`, {
            headers: authHeaders(),
            cache: 'no-store',
        });
        if (!res.ok) throw new Error(await parseErr(res));
        const payload = await res.json();
        return Array.isArray(payload) ? payload : [];
    });
}

/** Jobs scoped to the signed-in user's client (or all jobs when no tenant). */
export async function fetchJobsForCompose(): Promise<JobComposeRow[]> {
    return fetchJobsForComposePayload() as Promise<JobComposeRow[]>;
}

/** Tenant-scoped job list for grids (slim rows; heavy fields on GET /api/jobs/:id). */
export async function fetchJobsForTenantScope(): Promise<unknown[]> {
    return fetchJsonDeduped('GET /api/jobs/for-list', async () => {
        const res = await fetch(`${apiBase()}/api/jobs/for-list`, {
            headers: authHeaders(),
            cache: 'no-store',
        });
        if (!res.ok) throw new Error(await parseErr(res));
        const payload = await res.json();
        return Array.isArray(payload) ? payload : [];
    });
}

/** Platform admin job catalog (GET /api/jobs). */
export async function fetchAllJobs(): Promise<unknown[]> {
    return fetchJsonDeduped('GET /api/jobs', async () => {
        const res = await fetch(`${apiBase()}/api/jobs`, {
            headers: authHeaders(),
            cache: 'no-store',
        });
        if (!res.ok) throw new Error(await parseErr(res));
        const payload = await res.json();
        return Array.isArray(payload) ? payload : [];
    });
}

/** POST /api/jobs/log-smart-import-open — audit when staff opens AI smart-import modal on NewJobView */
export async function logJobSmartImportModalOpen(body: {
    jobId?: string | null;
    jobTitle?: string;
    context?: string;
}): Promise<void> {
    const base = apiBase();
    if (!base) return;
    const res = await fetch(`${base}/api/jobs/log-smart-import-open`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
    });
    if (!res.ok && res.status !== 204) {
        throw new Error(await parseErr(res));
    }
}
