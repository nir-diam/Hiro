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

export type ClientUsageSettingsDto = {
    clientId?: string;
    doubleAuth: string;
    googleLogin: string;
    initialScreeningLevel: string;
    returnMonths: number;
    questionnaireSource: string;
    autoDisconnect: boolean;
    logoOnCv: boolean;
    candidateNoLocationToFix: boolean;
    candidateNoTagToFix: boolean;
    showCvPreview: boolean;
    jobAlerts: boolean;
    autoThanksEmail: boolean;
    oneCandidatePerEmail: boolean;
    billingStatusParent: boolean;
    billingStatusAccepted: boolean;
};

export async function fetchClientUsageSettings(clientId: string): Promise<ClientUsageSettingsDto> {
    const res = await fetch(`${apiBase()}/api/clients/${encodeURIComponent(clientId)}/usage-settings`, {
        headers: authHeaders(),
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}

export async function saveClientUsageSettings(
    clientId: string,
    body: Partial<ClientUsageSettingsDto>,
): Promise<ClientUsageSettingsDto> {
    const res = await fetch(`${apiBase()}/api/clients/${encodeURIComponent(clientId)}/usage-settings`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}
