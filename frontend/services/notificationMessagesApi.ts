import { authHeaders } from '../utils/authHeaders';

export type FetchNotificationMessagesOptions = {
    /** Lighter payload — no `html`, truncated `text` (badges, tab counts). */
    summary?: boolean;
    /** Skip in-memory cache (after reply/send). */
    bustCache?: boolean;
    /** Server-side filter: `metadata.taskPayload.linkedContactId` (contact profile tasks tab). */
    contactId?: string;
};

type CacheEntry = {
    expiresAt: number;
    rows: Record<string, unknown>[];
};

const CACHE_TTL_MS = 8000;
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<Record<string, unknown>[]>>();

function cacheKey(summary: boolean, contactId?: string): string {
    const cid = String(contactId || '').trim();
    const base = summary ? 'GET:/api/email-uploads/messages?summary=1' : 'GET:/api/email-uploads/messages';
    return cid ? `${base}&contactId=${cid}` : base;
}

export function invalidateNotificationMessagesCache(): void {
    cache.clear();
    inFlight.clear();
}

/**
 * Shared inbox list — coalesces in-flight GETs (StrictMode, TopBar + tasks tab + badges).
 */
export async function fetchNotificationMessageRows(
    apiBase: string,
    options: FetchNotificationMessagesOptions = {},
): Promise<Record<string, unknown>[]> {
    const base = String(apiBase || '').trim();
    if (!base) return [];

    const summary = Boolean(options.summary);
    const contactId = String(options.contactId || '').trim();
    if (options.bustCache) {
        invalidateNotificationMessagesCache();
    }

    const key = cacheKey(summary, contactId || undefined);
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) {
        return hit.rows;
    }

    const existing = inFlight.get(key);
    if (existing) return existing;

    const params = new URLSearchParams();
    if (summary) params.set('summary', '1');
    if (contactId) params.set('contactId', contactId);
    const qs = params.toString();
    const url = `${base}/api/email-uploads/messages${qs ? `?${qs}` : ''}`;

    const promise = (async () => {
        const res = await fetch(url, {
            method: 'GET',
            cache: 'no-store',
            credentials: 'include',
            headers: authHeaders(true),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(text || `HTTP ${res.status}`);
        }
        const rows = await res.json();
        const list = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
        cache.set(key, { rows: list, expiresAt: Date.now() + CACHE_TTL_MS });
        return list;
    })().finally(() => {
        if (inFlight.get(key) === promise) inFlight.delete(key);
    });

    inFlight.set(key, promise);
    return promise;
}

/** Full body + thread for one row (expand in NotificationCenter). */
export async function fetchNotificationMessageDetail(
    apiBase: string,
    messageId: string,
): Promise<Record<string, unknown>> {
    const base = String(apiBase || '').trim();
    const id = String(messageId || '').trim();
    if (!base || !id) {
        throw new Error('Missing api base or message id');
    }
    const res = await fetch(`${base}/api/email-uploads/messages/${encodeURIComponent(id)}`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
        headers: authHeaders(true),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
    }
    const row = await res.json();
    if (!row || typeof row !== 'object') {
        throw new Error('Invalid response');
    }
    return row as Record<string, unknown>;
}
