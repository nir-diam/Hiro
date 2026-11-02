const apiBase = () => import.meta.env.VITE_API_BASE || '';

function authHeaders(): HeadersInit {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const token = raw != null ? String(raw).trim() || null : null;
    const headers: HeadersInit = { Accept: 'application/json' };
    if (token) (headers as Record<string, string>).Authorization = `Bearer ${token}`;
    return headers;
}

/** Path only, so extension checks still work on a presigned URL. */
export function filePathFromUrl(url: string): string {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
        return decodeURIComponent(new URL(raw).pathname);
    } catch {
        return raw.split('?')[0];
    }
}

/**
 * Mint a short-lived URL at the moment the file is opened.
 * Falls back to the URL already on the record if the call fails.
 */
export async function fetchCandidateFileUrl(
    candidateId: string,
    options: { which?: 'resume' | 'picture' | 'video' | 'document'; documentId?: string; storedUrl?: string } = {},
): Promise<string | null> {
    const id = String(candidateId || '').trim();
    const base = apiBase();
    if (!id || !base) return options.storedUrl || null;
    const params = new URLSearchParams();
    if (options.which) params.set('which', options.which);
    if (options.documentId) params.set('documentId', options.documentId);
    if (options.storedUrl) params.set('storedUrl', options.storedUrl);
    const qs = params.toString();
    try {
        const res = await fetch(`${base}/api/candidates/${encodeURIComponent(id)}/file-url${qs ? `?${qs}` : ''}`, {
            headers: authHeaders(),
        });
        if (!res.ok) return options.storedUrl || null;
        const body = (await res.json()) as { url?: string };
        const url = String(body?.url || '').trim();
        return url || options.storedUrl || null;
    } catch {
        return options.storedUrl || null;
    }
}
