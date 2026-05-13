const apiBase = () => import.meta.env.VITE_API_BASE || '';

function authHeaders(): HeadersInit {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) (h as Record<string, string>).Authorization = `Bearer ${token}`;
    return h;
}

async function parseErr(res: Response): Promise<string> {
    try {
        const j = (await res.json()) as { message?: string };
        return j.message || res.statusText || 'Request failed';
    } catch {
        return res.statusText || 'Request failed';
    }
}

export type ClientMatchingEnginePresetDto = {
    id: number;
    configKey: string;
    label: string | null;
    description: string | null;
    clientIds: string[];
    config: Record<string, unknown>;
    createdAt?: string;
};

export async function fetchClientMatchingEngineConfigs(clientId: string): Promise<ClientMatchingEnginePresetDto[]> {
    const res = await fetch(`${apiBase()}/api/clients/${encodeURIComponent(clientId)}/matching-engine-configs`, {
        headers: authHeaders(),
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}
