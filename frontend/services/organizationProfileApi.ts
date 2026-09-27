import { authHeaders } from '../utils/authHeaders';

const apiBase = () => (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

type CacheEntry<T> = { at: number; promise: Promise<T> };

const ORG_CACHE_MS = 30_000;
const CLIENT_CACHE_MS = 30_000;

const organizationCache = new Map<string, CacheEntry<Record<string, unknown>>>();
const clientCache = new Map<string, CacheEntry<Record<string, unknown>>>();

async function parseJsonRecord(res: Response, notFoundMessage: string): Promise<Record<string, unknown>> {
    if (!res.ok) {
        let message = notFoundMessage;
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
        throw new Error('Invalid response payload');
    }
    return data as Record<string, unknown>;
}

function cachedGet<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    ttlMs: number,
    factory: () => Promise<T>,
    bypassCache?: boolean,
): Promise<T> {
    if (bypassCache) cache.delete(key);
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && now - hit.at < ttlMs) return hit.promise;
    const promise = factory();
    cache.set(key, { at: now, promise });
    promise.catch(() => cache.delete(key));
    return promise;
}

export type OrganizationPrimaryClient = {
    clientId: string | null;
    clientName: string | null;
};

export type OrganizationProfileBundle = {
    organization: Record<string, unknown>;
    primaryClient: OrganizationPrimaryClient;
    client: Record<string, unknown> | null;
};

/** Pending (staging) organization profile — linked tenant client included. */
export function fetchPendingOrganizationProfile(
    organizationTmpId: string,
    opts?: { bypassCache?: boolean },
): Promise<OrganizationProfileBundle> {
    const id = String(organizationTmpId || '').trim();
    if (!id) return Promise.reject(new Error('missing organization tmp id'));
    const cacheKey = `tmp-profile:${id}`;
    return cachedGet(
        organizationCache,
        cacheKey,
        ORG_CACHE_MS,
        () =>
            fetch(
                `${apiBase()}/api/organizations/tmp/${encodeURIComponent(id)}?includeProfile=1`,
                {
                    headers: authHeaders(true),
                    credentials: 'include',
                },
            ).then(async (res) => {
                const data = await parseJsonRecord(res, 'Organization not found');
                const organization =
                    data.organization && typeof data.organization === 'object' && !Array.isArray(data.organization)
                        ? (data.organization as Record<string, unknown>)
                        : data;
                const primaryRaw = data.primaryClient;
                const primaryClient: OrganizationPrimaryClient =
                    primaryRaw && typeof primaryRaw === 'object' && !Array.isArray(primaryRaw)
                        ? {
                            clientId: (primaryRaw as OrganizationPrimaryClient).clientId ?? null,
                            clientName: (primaryRaw as OrganizationPrimaryClient).clientName ?? null,
                        }
                        : { clientId: null, clientName: null };
                const clientRaw = data.client;
                const client =
                    clientRaw && typeof clientRaw === 'object' && !Array.isArray(clientRaw)
                        ? (clientRaw as Record<string, unknown>)
                        : null;
                return { organization, primaryClient, client };
            }),
        opts?.bypassCache,
    );
}

/** Single request: organization + primary client + slim client row (one DB connection on server). */
export function fetchOrganizationProfile(
    organizationId: string,
    opts?: { bypassCache?: boolean },
): Promise<OrganizationProfileBundle> {
    const id = String(organizationId || '').trim();
    if (!id) return Promise.reject(new Error('missing organization id'));
    const cacheKey = `profile:${id}`;
    return cachedGet(
        organizationCache,
        cacheKey,
        ORG_CACHE_MS,
        () =>
            fetch(`${apiBase()}/api/organizations/${encodeURIComponent(id)}/profile`, {
                headers: authHeaders(true),
                credentials: 'include',
            }).then(async (res) => {
                const data = await parseJsonRecord(res, 'Organization not found');
                const organization =
                    data.organization && typeof data.organization === 'object' && !Array.isArray(data.organization)
                        ? (data.organization as Record<string, unknown>)
                        : data;
                const primaryRaw = data.primaryClient;
                const primaryClient: OrganizationPrimaryClient =
                    primaryRaw && typeof primaryRaw === 'object' && !Array.isArray(primaryRaw)
                        ? {
                            clientId: (primaryRaw as OrganizationPrimaryClient).clientId ?? null,
                            clientName: (primaryRaw as OrganizationPrimaryClient).clientName ?? null,
                        }
                        : { clientId: null, clientName: null };
                const clientRaw = data.client;
                const client =
                    clientRaw && typeof clientRaw === 'object' && !Array.isArray(clientRaw)
                        ? (clientRaw as Record<string, unknown>)
                        : null;
                return { organization, primaryClient, client };
            }),
        opts?.bypassCache,
    );
}

/** Deduped GET /api/organizations/:id (or tmp variant). */
export function fetchOrganizationById(
    organizationId: string,
    opts?: { pending?: boolean; bypassCache?: boolean; includePrimaryClient?: boolean },
): Promise<Record<string, unknown> & { primaryClient?: OrganizationPrimaryClient }> {
    const id = String(organizationId || '').trim();
    if (!id) return Promise.reject(new Error('missing organization id'));
    const pending = Boolean(opts?.pending);
    const includePrimaryClient = Boolean(opts?.includePrimaryClient);
    const cacheKey = pending
        ? `tmp:${id}${includePrimaryClient ? ':pc' : ''}`
        : `${id}${includePrimaryClient ? ':pc' : ''}`;
    return cachedGet(
        organizationCache,
        cacheKey,
        ORG_CACHE_MS,
        () => {
            const qs = includePrimaryClient ? '?includePrimaryClient=1' : '';
            const url = pending
                ? `${apiBase()}/api/organizations/tmp/${encodeURIComponent(id)}`
                : `${apiBase()}/api/organizations/${encodeURIComponent(id)}${qs}`;
            return fetch(url, {
                headers: authHeaders(true),
                credentials: 'include',
            }).then((res) => parseJsonRecord(res, 'Organization not found'));
        },
        opts?.bypassCache,
    );
}

/** Deduped GET /api/clients/:id */
export function fetchClientById(
    clientId: string,
    opts?: { bypassCache?: boolean; includeLinks?: boolean },
): Promise<Record<string, unknown>> {
    const id = String(clientId || '').trim();
    if (!id) return Promise.reject(new Error('missing client id'));
    const includeLinks = opts?.includeLinks !== false;
    const cacheKey = includeLinks ? id : `${id}:summary`;
    return cachedGet(
        clientCache,
        cacheKey,
        CLIENT_CACHE_MS,
        () => {
            const qs = includeLinks ? '' : '?includeLinks=0';
            return fetch(`${apiBase()}/api/clients/${encodeURIComponent(id)}${qs}`, {
                headers: authHeaders(true),
                credentials: 'include',
            }).then((res) => parseJsonRecord(res, 'Client not found'));
        },
        opts?.bypassCache,
    );
}

export async function fetchOrganizationPrimaryClientId(
    organizationId: string,
): Promise<string | null> {
    const id = String(organizationId || '').trim();
    if (!id) return null;
    try {
        const res = await fetch(
            `${apiBase()}/api/organizations/${encodeURIComponent(id)}/primary-client`,
            { headers: authHeaders(true), credentials: 'include' },
        );
        if (!res.ok) return null;
        const data = (await res.json()) as { clientId?: string };
        return data?.clientId ? String(data.clientId) : null;
    } catch {
        return null;
    }
}

export function invalidateOrganizationProfileCaches(opts?: {
    organizationId?: string | null;
    clientId?: string | null;
}): void {
    if (opts?.organizationId) {
        const id = String(opts.organizationId).trim();
        organizationCache.delete(id);
        organizationCache.delete(`tmp:${id}`);
        organizationCache.delete(`tmp-profile:${id}`);
        organizationCache.delete(`profile:${id}`);
        organizationCache.delete(`${id}:pc`);
    }
    if (opts?.clientId) {
        const cid = String(opts.clientId).trim();
        clientCache.delete(cid);
        clientCache.delete(`${cid}:summary`);
    }
    if (!opts?.organizationId && !opts?.clientId) {
        organizationCache.clear();
        clientCache.clear();
    }
}
