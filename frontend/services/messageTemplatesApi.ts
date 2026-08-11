const apiBase = () => import.meta.env.VITE_API_BASE || '';

function authHeaders(): HeadersInit {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) (h as Record<string, string>).Authorization = `Bearer ${token}`;
    return h;
}

export type MessageTemplateDto = {
    id: string;
    templateKey: string | null;
    name: string;
    subject: string;
    content: string;
    channels: ('email' | 'sms' | 'whatsapp')[];
    isSystem: boolean;
    lastUpdated: string | null;
    updatedBy: string;
    attachmentUrl?: string | null;
    attachmentFileName?: string | null;
    attachmentContentType?: string | null;
    attachmentFileSize?: number | null;
};

/** Super-admin catalog row: Hiro templates + all tenants */
export type MessageTemplateCatalogDto = MessageTemplateDto & {
    scope: 'admin' | 'client';
    clientId: string | null;
    clientName: string | null;
};

async function parseErr(res: Response): Promise<string> {
    try {
        const j = (await res.json()) as { message?: string };
        return j.message || res.statusText || 'Request failed';
    } catch {
        return res.statusText || 'Request failed';
    }
}

export type MessageTemplatesComposeResponse = {
    scope: 'client' | 'admin';
    templates: MessageTemplateDto[];
};

/** Staff messaging UI: client-scoped templates or admin catalog when user has no clientId. */
export async function fetchMessageTemplatesForCompose(): Promise<MessageTemplatesComposeResponse> {
    const res = await fetch(`${apiBase()}/api/message-templates/for-compose`, {
        headers: authHeaders(),
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}

function withClientId(url: string, clientId?: string | null): string {
    if (!clientId) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}clientId=${encodeURIComponent(clientId)}`;
}

export async function fetchClientMessageTemplates(clientId?: string | null): Promise<MessageTemplateDto[]> {
    const res = await fetch(withClientId(`${apiBase()}/api/message-templates`, clientId), {
        headers: authHeaders(),
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}

export async function fetchAdminMessageTemplates(): Promise<MessageTemplateDto[]> {
    const res = await fetch(`${apiBase()}/api/admin/message-templates`, {
        headers: authHeaders(),
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}

export async function createClientMessageTemplate(
    body: {
        name: string;
        subject: string;
        content: string;
        channels?: ('email' | 'sms' | 'whatsapp')[];
        templateKey?: string | null;
    },
    clientId?: string | null,
): Promise<MessageTemplateDto> {
    const res = await fetch(withClientId(`${apiBase()}/api/message-templates`, clientId), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(clientId ? { ...body, clientId } : body),
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}

export async function createAdminMessageTemplate(body: {
    name: string;
    subject: string;
    content: string;
    channels?: ('email' | 'sms' | 'whatsapp')[];
    templateKey?: string | null;
}): Promise<MessageTemplateDto> {
    const res = await fetch(`${apiBase()}/api/admin/message-templates`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}

export async function updateClientMessageTemplate(
    id: string,
    body: Partial<{
        name: string;
        subject: string;
        content: string;
        channels: ('email' | 'sms' | 'whatsapp')[];
        templateKey: string | null;
        attachmentUrl: string | null;
        attachmentFileName: string | null;
        attachmentContentType: string | null;
        attachmentFileSize: number | null;
        clearAttachment: boolean;
    }>,
    clientId?: string | null,
): Promise<MessageTemplateDto> {
    const res = await fetch(
        withClientId(`${apiBase()}/api/message-templates/${encodeURIComponent(id)}`, clientId),
        {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify(clientId ? { ...body, clientId } : body),
        },
    );
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}

export async function updateAdminMessageTemplate(
    id: string,
    body: Partial<{ name: string; subject: string; content: string; channels: ('email' | 'sms' | 'whatsapp')[]; templateKey: string | null }>,
): Promise<MessageTemplateDto> {
    const res = await fetch(`${apiBase()}/api/admin/message-templates/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}

export async function deleteClientMessageTemplate(id: string, clientId?: string | null): Promise<void> {
    const res = await fetch(
        withClientId(`${apiBase()}/api/message-templates/${encodeURIComponent(id)}`, clientId),
        {
            method: 'DELETE',
            headers: authHeaders(),
        },
    );
    if (!res.ok) throw new Error(await parseErr(res));
}

export async function deleteAdminMessageTemplate(id: string): Promise<void> {
    const res = await fetch(`${apiBase()}/api/admin/message-templates/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });
    if (!res.ok) throw new Error(await parseErr(res));
}

export async function fetchMessageTemplateCatalog(): Promise<MessageTemplateCatalogDto[]> {
    const res = await fetch(`${apiBase()}/api/admin/message-templates/catalog`, {
        headers: authHeaders(),
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}

export async function createMessageTemplateCatalog(body: {
    scope: 'admin' | 'client';
    clientId?: string | null;
    name: string;
    subject: string;
    content: string;
    channels?: ('email' | 'sms' | 'whatsapp')[];
    templateKey?: string | null;
}): Promise<MessageTemplateCatalogDto> {
    const res = await fetch(`${apiBase()}/api/admin/message-templates/catalog`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}

export async function updateMessageTemplateCatalog(
    id: string,
    body: Partial<{ name: string; subject: string; content: string; channels: ('email' | 'sms' | 'whatsapp')[]; templateKey: string | null }>,
): Promise<MessageTemplateCatalogDto> {
    const res = await fetch(`${apiBase()}/api/admin/message-templates/catalog/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}

export async function deleteMessageTemplateCatalog(id: string): Promise<void> {
    const res = await fetch(`${apiBase()}/api/admin/message-templates/catalog/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });
    if (!res.ok) throw new Error(await parseErr(res));
}

const ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;

export async function uploadClientMessageTemplateAttachment(
    templateId: string,
    file: File,
    clientId?: string | null,
): Promise<MessageTemplateDto> {
    if (file.size > ATTACHMENT_MAX_BYTES) {
        throw new Error('גודל הקובץ המקסימלי הוא 15MB');
    }
    const presignRes = await fetch(
        withClientId(
            `${apiBase()}/api/message-templates/${encodeURIComponent(templateId)}/attachment/upload-url`,
            clientId,
        ),
        {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                fileName: file.name,
                contentType: file.type || 'application/octet-stream',
                fileSize: file.size,
                ...(clientId ? { clientId } : {}),
            }),
        },
    );
    if (!presignRes.ok) throw new Error(await parseErr(presignRes));
    const { uploadUrl, publicUrl } = await presignRes.json() as { uploadUrl: string; publicUrl: string };

    const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
    if (!putRes.ok) throw new Error('העלאת הקובץ נכשלה');

    return updateClientMessageTemplate(
        templateId,
        {
            attachmentUrl: publicUrl,
            attachmentFileName: file.name,
            attachmentContentType: file.type || 'application/octet-stream',
            attachmentFileSize: file.size,
        },
        clientId,
    );
}
