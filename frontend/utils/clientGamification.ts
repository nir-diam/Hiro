import { fetchClientOrgProfileUpdateHistory } from '../services/organizationProfileUpdatesApi';

export const CLIENT_GAMIFICATION_UPDATED_EVENT = 'client-gamification-updated';
export const CLIENT_PROFILE_UPDATES_REVIEW_SEEN_EVENT = 'client-profile-updates-review-seen';
export const PROFILE_UPDATES_HISTORY_SEEN_STORAGE_PREFIX = 'hiro-profile-updates-history-seen:';

export function readClientProfileUpdatePoints(client: unknown): number {
    const c = client as { metadata?: { gamification?: { profileUpdatePoints?: number } } } | null | undefined;
    const n = Number(c?.metadata?.gamification?.profileUpdatePoints);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function mergeClientProfileUpdatePoints(client: unknown, points: number): Record<string, unknown> {
    const base = client && typeof client === 'object' ? { ...(client as Record<string, unknown>) } : {};
    const meta = base.metadata && typeof base.metadata === 'object'
        ? { ...(base.metadata as Record<string, unknown>) }
        : {};
    const gam = meta.gamification && typeof meta.gamification === 'object'
        ? { ...(meta.gamification as Record<string, unknown>) }
        : {};
    gam.profileUpdatePoints = Math.max(0, Math.floor(points));
    meta.gamification = gam;
    return { ...base, metadata: meta };
}

export function dispatchClientGamificationUpdated(clientId: string, points: number): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(CLIENT_GAMIFICATION_UPDATED_EVENT, {
        detail: { clientId, points },
    }));
}

export function getProfileUpdatesHistorySeenAt(clientId: string): number {
    if (typeof localStorage === 'undefined' || !clientId) return 0;
    try {
        const raw = localStorage.getItem(`${PROFILE_UPDATES_HISTORY_SEEN_STORAGE_PREFIX}${clientId}`);
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
        return 0;
    }
}

export function markProfileUpdatesHistorySeen(clientId: string): void {
    if (typeof localStorage === 'undefined' || !clientId) return;
    try {
        localStorage.setItem(
            `${PROFILE_UPDATES_HISTORY_SEEN_STORAGE_PREFIX}${clientId}`,
            String(Date.now()),
        );
        window.dispatchEvent(
            new CustomEvent(CLIENT_PROFILE_UPDATES_REVIEW_SEEN_EVENT, { detail: { clientId } }),
        );
    } catch {
        /* ignore */
    }
}

export async function fetchClientProfileUpdatePoints(clientId: string): Promise<number> {
    try {
        const res = await fetchClientOrgProfileUpdateHistory(clientId, { limit: 1 });
        if (typeof res.clientGamificationPoints === 'number') {
            return Math.max(0, Math.floor(res.clientGamificationPoints));
        }
    } catch {
        /* fall back to client metadata */
    }
    const apiBase = (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE || '';
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const headers: HeadersInit = { Accept: 'application/json' };
    if (token) (headers as Record<string, string>).Authorization = `Bearer ${token}`;
    const res = await fetch(`${apiBase}/api/clients/${encodeURIComponent(clientId)}`, { headers });
    if (!res.ok) return 0;
    const client = await res.json();
    return readClientProfileUpdatePoints(client);
}
