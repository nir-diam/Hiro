import type { UserPreferencesV2 } from '../utils/userPreferences';

const apiBase = (import.meta.env.VITE_API_BASE as string) || '';

function authHeaders(): HeadersInit {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

export async function fetchUserPreferences(): Promise<UserPreferencesV2 | null> {
    const url = apiBase ? `${apiBase}/api/auth/me/preferences` : '/api/auth/me/preferences';
    const res = await fetch(url, { headers: authHeaders(), credentials: 'include' });
    if (!res.ok) return null;
    return (await res.json()) as UserPreferencesV2;
}

export async function patchUserPreferences(
    patch: Partial<UserPreferencesV2>,
): Promise<UserPreferencesV2 | null> {
    const url = apiBase ? `${apiBase}/api/auth/me/preferences` : '/api/auth/me/preferences';
    const res = await fetch(url, {
        method: 'PATCH',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify(patch),
    });
    if (!res.ok) return null;
    return (await res.json()) as UserPreferencesV2;
}
