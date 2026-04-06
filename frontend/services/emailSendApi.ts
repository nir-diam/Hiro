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

export type SendNotificationEmailBody = {
    toEmail: string;
    subject: string;
    text: string;
    html?: string | null;
    isTask?: boolean;
    messageType?: 'message' | 'task';
    taskPayload?: Record<string, unknown>;
};

export type SendNotificationEmailResult = {
    ok: boolean;
    messageId?: string | null;
    notificationMessageId?: string | null;
};

/**
 * Staff compose → same pipeline as NewTaskModal (`POST /api/email-uploads/send`).
 * Requires a valid JWT (authMiddleware on the route).
 */
export async function sendNotificationEmail(body: SendNotificationEmailBody): Promise<SendNotificationEmailResult> {
    const res = await fetch(`${apiBase()}/api/email-uploads/send`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({
            toEmail: body.toEmail,
            subject: body.subject,
            text: body.text,
            html: body.html ?? undefined,
            isTask: body.isTask ?? false,
            messageType: body.messageType ?? 'message',
            taskPayload: body.taskPayload ?? {},
        }),
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}
