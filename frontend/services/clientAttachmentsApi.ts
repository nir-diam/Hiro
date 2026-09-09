import { authHeaders } from '../utils/authHeaders';

export type ClientAttachment = {
    id: string;
    name: string;
    type: string;
    uploadDate: string;
    uploadedBy: string;
    notes: string;
    fileSize: number;
    key?: string;
    url?: string;
    organizationId?: string | null;
};

const apiBase = () => (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const normalize = (row: Record<string, unknown>): ClientAttachment => ({
    id: String(row.id || ''),
    name: String(row.name || ''),
    type: String(row.type || 'צרופה'),
    uploadDate: String(row.uploadDate || new Date().toISOString()),
    uploadedBy: String(row.uploadedBy || 'מערכת'),
    notes: String(row.notes || ''),
    fileSize: Number(row.fileSize ?? 0),
    key: row.key ? String(row.key) : undefined,
    url: row.url ? String(row.url) : undefined,
    organizationId: row.organizationId != null ? String(row.organizationId) : null,
});

export async function fetchClientAttachments(
    clientId: string,
    organizationId?: string,
): Promise<ClientAttachment[]> {
    const qs = organizationId
        ? `?organizationId=${encodeURIComponent(organizationId)}`
        : '';
    const res = await fetch(`${apiBase()}/api/clients/${encodeURIComponent(clientId)}/documents${qs}`, {
        headers: authHeaders(true),
        cache: 'no-store',
    });
    if (!res.ok) throw new Error('טעינת צרופות נכשלה');
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    const rows = list.map((row) => normalize(row as Record<string, unknown>));
    if (!organizationId) return rows;
    return rows.filter((row) => String(row.organizationId || '') === organizationId);
}

export async function uploadClientAttachment(
    clientId: string,
    file: File,
    opts?: { name?: string; uploadedBy?: string; type?: string; notes?: string; organizationId?: string },
): Promise<ClientAttachment> {
    const uploadRes = await fetch(`${apiBase()}/api/clients/${encodeURIComponent(clientId)}/documents/upload-url`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
        }),
    });
    if (!uploadRes.ok) throw new Error('הכנת העלאה נכשלה');
    const { uploadUrl, key, publicUrl } = await uploadRes.json();

    const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
    if (!putRes.ok) throw new Error('העלאת הקובץ נכשלה');

    const displayName = opts?.name?.trim() || file.name;
    const attachRes = await fetch(`${apiBase()}/api/clients/${encodeURIComponent(clientId)}/documents/attach`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
            name: displayName,
            type: opts?.type || 'צרופה',
            notes: opts?.notes || '',
            uploadedBy: opts?.uploadedBy || 'מערכת',
            fileSize: Math.max(1, Math.round(file.size / 1024)),
            key,
            url: publicUrl,
            uploadDate: new Date().toISOString(),
            ...(opts?.organizationId ? { organizationId: opts.organizationId } : {}),
        }),
    });
    if (!attachRes.ok) throw new Error('שמירת הצרופה נכשלה');
    return normalize((await attachRes.json()) as Record<string, unknown>);
}

export async function deleteClientAttachment(clientId: string, attachmentId: string): Promise<void> {
    const res = await fetch(
        `${apiBase()}/api/clients/${encodeURIComponent(clientId)}/documents/${encodeURIComponent(attachmentId)}`,
        { method: 'DELETE', headers: authHeaders(true) },
    );
    if (!res.ok) throw new Error('מחיקת הצרופה נכשלה');
}

export const isImageAttachment = (attachment: Pick<ClientAttachment, 'name' | 'url'>): boolean => {
    const probe = `${attachment.name} ${attachment.url || ''}`.toLowerCase();
    return /\.(png|jpe?g|gif|webp|svg|bmp)(\?|$)/i.test(probe);
};

export const formatAttachmentSize = (kilobytes: number): string => {
    if (kilobytes < 1024) return `${kilobytes} KB`;
    return `${(kilobytes / 1024).toFixed(1)} MB`;
};
