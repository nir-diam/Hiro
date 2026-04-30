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

export type LogWhatsappOpenBody = {
    candidateId?: string | null;
    candidateName?: string;
    phone?: string;
    messagePreview?: string;
    templateId?: string | null;
    jobId?: string | null;
};

/** POST /api/messaging/log-whatsapp-open — writes audit_logs on the server */
export async function logWhatsappComposeOpen(body: LogWhatsappOpenBody): Promise<void> {
    const base = apiBase();
    if (!base) {
        throw new Error('לא מוגדר VITE_API_BASE — לא ניתן לרשום ביקורת. הגדר את כתובת ה-API ונסה שוב.');
    }
    const res = await fetch(`${base}/api/messaging/log-whatsapp-open`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
    });
    if (!res.ok && res.status !== 204) {
        throw new Error(await parseErr(res));
    }
}
