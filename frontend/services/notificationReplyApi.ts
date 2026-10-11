import { authHeaders } from '../utils/authHeaders';
import { NOTIFICATION_MESSAGE_ID_REGEX } from './notificationInboxCounts';

export type NotificationThreadReply = {
    id: string;
    senderUserId: string;
    senderName: string;
    senderEmail?: string;
    text: string;
    createdAt: string;
    attachments?: {
        filename: string;
        contentType?: string | null;
        size?: number | null;
        index: number;
    }[];
};

export type ReplyAttachmentInput = {
    filename: string;
    content: string;
    contentType?: string;
};

export async function replyToNotificationMessage(
    apiBase: string,
    messageId: string,
    body: {
        text: string;
        markComplete?: boolean;
        attachments?: ReplyAttachmentInput[];
    },
): Promise<Record<string, unknown>> {
    if (!NOTIFICATION_MESSAGE_ID_REGEX.test(messageId)) {
        throw new Error('Invalid notification id');
    }
    const res = await fetch(`${apiBase}/api/email-uploads/messages/${messageId}/reply`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: authHeaders(true),
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
    }
    return (await res.json()) as Record<string, unknown>;
}

export function mapThreadFromMetadata(metadata: Record<string, unknown>): NotificationThreadReply[] {
    const raw = metadata.thread;
    if (!Array.isArray(raw)) return [];
    return raw
        .map((entry, threadIndex) => {
            if (!entry || typeof entry !== 'object') return null;
            const row = entry as Record<string, unknown>;
            const id = String(row.id || `${threadIndex}`).trim();
            const text = String(row.text || '').trim();
            const createdAt = String(row.createdAt || '').trim();
            if (!createdAt) return null;
            const attRaw = Array.isArray(row.attachments) ? row.attachments : [];
            const attachments = attRaw
                .map((a, index) => {
                    if (!a || typeof a !== 'object') return null;
                    const att = a as Record<string, unknown>;
                    const filename = String(att.filename || '').trim();
                    if (!filename) return null;
                    return {
                        filename,
                        contentType: att.contentType != null ? String(att.contentType) : null,
                        size: typeof att.size === 'number' ? att.size : null,
                        index,
                    };
                })
                .filter((x): x is NonNullable<typeof x> => Boolean(x));
            return {
                id,
                senderUserId: String(row.senderUserId || ''),
                senderName: String(row.senderName || 'משתמש'),
                senderEmail: row.senderEmail != null ? String(row.senderEmail) : undefined,
                text,
                createdAt,
                attachments: attachments.length ? attachments : undefined,
            };
        })
        .filter((x): x is NotificationThreadReply => Boolean(x));
}
