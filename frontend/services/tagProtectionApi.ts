import { authHeaders } from '../utils/authHeaders';

const apiBase = () => (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

export type TagProtectionResult = {
    protected?: string[];
    unprotected?: string[];
    skipped?: Array<{ id: string; reason: string }>;
    count: number;
};

export async function protectTags(ids: string[], note: string): Promise<TagProtectionResult> {
    const base = apiBase();
    const res = await fetch(`${base}/api/tags/protect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ ids, note }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'Failed to protect tags');
    return body;
}

export async function unprotectTags(ids: string[]): Promise<TagProtectionResult> {
    const base = apiBase();
    const res = await fetch(`${base}/api/tags/unprotect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ ids }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'Failed to unprotect tags');
    return body;
}
