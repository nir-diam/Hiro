import { authHeaders } from '../utils/authHeaders';
import { downloadBlobAsFile } from '../utils/downloadBlobAsFile';

const apiBase = () => import.meta.env.VITE_API_BASE || '';

export type OutboundMessageChannel = 'email' | 'whatsapp' | 'sms';

export type OutboundMessageAttachmentRef = {
    filename: string;
    contentType?: string | null;
    size?: number | null;
    notificationMessageId: string;
    index: number;
    /** Stored on client journal events so downloads work even if notification metadata is missing. */
    contentBase64?: string | null;
};

export type CreateOutboundMessageEventInput = {
    clientId: string;
    organizationId?: string | null;
    contactId?: string | null;
    contactName?: string | null;
    channel: OutboundMessageChannel;
    to: string;
    subject?: string | null;
    body: string;
    senderName?: string | null;
    notificationMessageId?: string | null;
    providerMessageId?: string | null;
    deliveryStatus?: string | null;
    attachments?: OutboundMessageAttachmentRef[];
    /** When set, logs a completed proposal-sent journal event instead of a generic email event. */
    proposalTemplateNames?: string[];
    isProposal?: boolean;
};

/** Normalize any channel-like value. Never silently defaults to SMS. */
export const resolveOutboundChannel = (raw: unknown): OutboundMessageChannel | null => {
    const c = String(raw ?? '')
        .trim()
        .toLowerCase();
    if (!c) return null;
    if (c === 'email' || c === 'mail' || c === 'מייל' || c.includes('email')) return 'email';
    if (
        c === 'whatsapp'
        || c === 'wa'
        || c === 'וואטסאפ'
        || c === 'ואטסאפ'
        || c.includes('whatsapp')
        || c.includes('וואטסאפ')
    ) {
        return 'whatsapp';
    }
    if (c === 'sms' || c === 'text') return 'sms';
    return null;
};

const channelLabelHe = (channel: OutboundMessageChannel): string => {
    if (channel === 'email') return 'מייל';
    if (channel === 'whatsapp') return 'WhatsApp';
    return 'SMS';
};

/**
 * Creates a completed client journal event for an outbound staff message.
 * With organizationId + linkedTo contact, it appears under the company (org filter)
 * and under the contact profile events tab.
 */
export async function createOutboundMessageClientEvent(
    input: CreateOutboundMessageEventInput,
): Promise<void> {
    const clientId = String(input.clientId || '').trim();
    if (!clientId || !apiBase()) return;

    const channel = resolveOutboundChannel(input.channel);
    if (!channel) {
        console.warn('[clientOutboundMessageApi] refused to log event — invalid channel', input.channel);
        return;
    }

    const channelHe = channelLabelHe(channel);
    const sender = String(input.senderName || 'משתמש מערכת').trim() || 'משתמש מערכת';
    const when = new Date();
    const whenLabel = when.toLocaleString('he-IL');
    const to = String(input.to || '').trim() || '—';
    const subject = input.subject != null ? String(input.subject).trim() : '';
    const body = String(input.body || '').trim();
    const delivery = String(input.deliveryStatus || 'נשלח').trim() || 'נשלח';
    const proposalTemplateNames = Array.isArray(input.proposalTemplateNames)
        ? input.proposalTemplateNames.map((name) => String(name || '').trim()).filter(Boolean)
        : [];
    const isProposalSend =
        channel === 'email'
        && (input.isProposal === true || proposalTemplateNames.length > 0);

    const descriptionLines = [
        `ערוץ: ${channelHe}`,
        `מאת: ${sender}`,
        `אל: ${to}`,
        subject ? `נושא: ${subject}` : null,
        isProposalSend ? `תבניות הצעת מחיר: ${proposalTemplateNames.join(', ')}` : null,
        `מתי: ${whenLabel}`,
        `סטטוס מסירה: ${delivery}`,
        input.providerMessageId ? `מזהה ספק: ${input.providerMessageId}` : null,
        input.notificationMessageId ? `מזהה הודעה במערכת: ${input.notificationMessageId}` : null,
        '',
        '── תוכן ההודעה ──',
        body || '(ללא תוכן)',
    ].filter((line) => line !== null) as string[];

    const contactId = input.contactId ? String(input.contactId).trim() : '';
    const contactName = input.contactName ? String(input.contactName).trim() : '';
    const organizationId = input.organizationId ? String(input.organizationId).trim() : '';

    const title =
        isProposalSend
            ? `נשלחה הצעת מחיר${proposalTemplateNames.length ? `: ${proposalTemplateNames.join(', ')}` : ''}${contactName ? ` ל${contactName}` : ''}`
            : channel === 'email'
              ? `נשלח מייל${subject ? `: ${subject}` : ''}${contactName ? ` ל${contactName}` : ''}`
              : channel === 'whatsapp'
                ? `נשלחה הודעת WhatsApp${contactName ? ` ל${contactName}` : ''}`
                : `נשלחה הודעת SMS${contactName ? ` ל${contactName}` : ''}`;

    const payload = {
        title: title.slice(0, 240),
        // English channel code first for reliable filtering; Hebrew/label second for UI.
        type: isProposalSend ? ['proposal', 'הצעת מחיר', channel, channelHe] : [channel, channelHe],
        date: when.toISOString(),
        description: descriptionLines.join('\n'),
        coordinator: sender,
        creator: sender,
        status: 'הושלם',
        linkedTo: contactId
            ? { type: 'איש קשר', id: contactId, name: contactName || contactId }
            : null,
        organizationId: organizationId || null,
        history: [
            {
                user: sender,
                timestamp: when.toISOString(),
                summary: `נשלח ${channelHe} אל ${to}`,
            },
        ],
        metadata: {
            outboundMessage: true,
            channel,
            to,
            subject: subject || null,
            body,
            sender,
            deliveryStatus: delivery,
            providerMessageId: input.providerMessageId || null,
            notificationMessageId: input.notificationMessageId || null,
            attachments: Array.isArray(input.attachments) && input.attachments.length ? input.attachments : null,
            readReceipt: null,
            ...(isProposalSend
                ? {
                      outboundProposal: true,
                      proposalTemplateNames,
                      systemEvent: {
                          triggerName: 'דיוור ודיווח',
                          eventName: 'הצעת מחיר',
                      },
                  }
                : channel === 'email'
                  ? {
                        systemEvent: {
                            triggerName: 'דיוור ודיווח',
                            eventName: 'נשלח מייל',
                        },
                    }
                  : {}),
        },
    };

    const res = await fetch(`${apiBase()}/api/clients/${encodeURIComponent(clientId)}/events`, {
        method: 'POST',
        headers: authHeaders(true),
        credentials: 'include',
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
            typeof (err as { message?: string }).message === 'string'
                ? (err as { message: string }).message
                : 'יצירת אירוע הודעה נכשלה',
        );
    }

    if (typeof window !== 'undefined') {
        window.dispatchEvent(
            new CustomEvent('hiro:outbound-message-logged', {
                detail: {
                    clientId,
                    channel,
                    contactId: contactId || null,
                    organizationId: organizationId || null,
                },
            }),
        );
    }
}

export type OutboundMessageHistoryItem = {
    id: string;
    channel: OutboundMessageChannel;
    title: string;
    subject: string | null;
    body: string;
    to: string;
    sender: string;
    date: string;
    deliveryStatus: string;
    contactId: string | null;
    contactName: string | null;
    organizationId: string | null;
    notificationMessageId: string | null;
    attachments: OutboundMessageAttachmentRef[];
};

type ClientEventLike = {
    id?: string;
    title?: string;
    description?: string;
    date?: string;
    type?: string[] | string;
    linkedTo?: { type?: string; id?: string; name?: string } | string | null;
    organizationId?: string | null;
    coordinator?: string;
    metadata?: {
        outboundMessage?: boolean;
        channel?: string;
        to?: string;
        subject?: string | null;
        body?: string;
        sender?: string;
        deliveryStatus?: string | null;
        notificationMessageId?: string | null;
        attachments?: OutboundMessageAttachmentRef[] | null;
    } | null;
};

const parseAttachmentRefs = (
    meta: ClientEventLike['metadata'],
    fallbackNotificationMessageId: string | null,
): OutboundMessageAttachmentRef[] => {
    const raw = meta?.attachments;
    if (!Array.isArray(raw) || !raw.length) return [];
    const messageId =
        (meta?.notificationMessageId != null ? String(meta.notificationMessageId).trim() : '')
        || fallbackNotificationMessageId
        || '';
    if (!messageId) return [];

    return raw
        .map((row, index) => {
            if (!row || typeof row !== 'object') return null;
            const filename = String((row as OutboundMessageAttachmentRef).filename || '').trim();
            if (!filename) return null;
            const rowIndex = Number((row as OutboundMessageAttachmentRef).index);
            const resolvedIndex = Number.isInteger(rowIndex) && rowIndex >= 0 ? rowIndex : index;
            const rowMessageId = String((row as OutboundMessageAttachmentRef).notificationMessageId || '').trim();
            return {
                filename,
                contentType:
                    (row as OutboundMessageAttachmentRef).contentType != null
                        ? String((row as OutboundMessageAttachmentRef).contentType)
                        : null,
                size:
                    typeof (row as OutboundMessageAttachmentRef).size === 'number'
                        ? (row as OutboundMessageAttachmentRef).size
                        : null,
                notificationMessageId: rowMessageId || messageId,
                index: resolvedIndex,
            } satisfies OutboundMessageAttachmentRef;
        })
        .filter((row): row is OutboundMessageAttachmentRef => Boolean(row));
};

export function notificationAttachmentDownloadUrl(messageId: string, index: number): string {
    return `${apiBase()}/api/email-uploads/messages/${encodeURIComponent(messageId)}/attachments/${index}`;
}

export async function downloadNotificationMessageAttachment(
    attachment: OutboundMessageAttachmentRef,
): Promise<void> {
    const messageId = String(attachment.notificationMessageId || '').trim();
    if (!messageId || !apiBase()) {
        throw new Error('לא ניתן להוריד את הקובץ');
    }

    const res = await fetch(notificationAttachmentDownloadUrl(messageId, attachment.index), {
        method: 'GET',
        headers: authHeaders(),
        credentials: 'include',
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
            typeof (err as { message?: string }).message === 'string'
                ? (err as { message: string }).message
                : 'הורדת הקובץ נכשלה',
        );
    }

    const blob = await res.blob();
    await downloadBlobAsFile(blob, attachment.filename);
}

const extractBodyFromDescription = (description: string): string => {
    const marker = '── תוכן ההודעה ──';
    const idx = description.indexOf(marker);
    if (idx >= 0) return description.slice(idx + marker.length).trim();
    return description.trim();
};

const extractFieldFromDescription = (description: string, label: string): string | null => {
    const line = description
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith(`${label}:`));
    if (!line) return null;
    const value = line.slice(label.length + 1).trim();
    return value || null;
};

const parseChannelFromEvent = (event: ClientEventLike): OutboundMessageChannel | null => {
    const description = String(event.description || '');
    const title = String(event.title || '');
    const titleLower = title.toLowerCase();
    const types = Array.isArray(event.type)
        ? event.type.map((t) => String(t || '').trim())
        : event.type
          ? [String(event.type).trim()]
          : [];

    const metaChannel = resolveOutboundChannel(event.metadata?.channel);
    const fromDesc = resolveOutboundChannel(extractFieldFromDescription(description, 'ערוץ'));
    let fromTitle: OutboundMessageChannel | null = null;
    if (title.includes('מייל') || titleLower.includes('email')) fromTitle = 'email';
    else if (titleLower.includes('whatsapp') || title.includes('וואטסאפ') || title.includes('ואטסאפ')) {
        fromTitle = 'whatsapp';
    } else if (title.includes('SMS') || /\bsms\b/i.test(title)) {
        fromTitle = 'sms';
    }

    let fromTypes: OutboundMessageChannel | null = null;
    for (const t of types) {
        const resolved = resolveOutboundChannel(t);
        if (resolved) {
            fromTypes = resolved;
            break;
        }
    }

    // WhatsApp wins over SMS if any signal says WhatsApp (repairs mis-tagged rows).
    const signals = [metaChannel, fromDesc, fromTitle, fromTypes].filter(Boolean) as OutboundMessageChannel[];
    if (signals.includes('whatsapp')) return 'whatsapp';
    if (signals.includes('email')) return 'email';
    if (signals.includes('sms')) return 'sms';
    return null;
};

const toHistoryItem = (event: ClientEventLike, channel: OutboundMessageChannel): OutboundMessageHistoryItem => {
    const meta = event.metadata && typeof event.metadata === 'object' ? event.metadata : null;
    const description = String(event.description || '');
    const linked =
        event.linkedTo && typeof event.linkedTo === 'object' ? event.linkedTo : null;
    const notificationMessageId =
        meta?.notificationMessageId != null
            ? String(meta.notificationMessageId).trim() || null
            : extractFieldFromDescription(description, 'מזהה הודעה במערכת');
    return {
        id: String(event.id || ''),
        channel,
        title: String(event.title || ''),
        subject: meta?.subject != null ? String(meta.subject) : extractFieldFromDescription(description, 'נושא'),
        body: meta?.body != null ? String(meta.body) : extractBodyFromDescription(description),
        to: meta?.to != null ? String(meta.to) : extractFieldFromDescription(description, 'אל') || '',
        sender:
            meta?.sender != null
                ? String(meta.sender)
                : extractFieldFromDescription(description, 'מאת') || String(event.coordinator || ''),
        date: String(event.date || ''),
        deliveryStatus:
            meta?.deliveryStatus != null
                ? String(meta.deliveryStatus)
                : extractFieldFromDescription(description, 'סטטוס מסירה') || 'נשלח',
        contactId: linked?.id ? String(linked.id) : null,
        contactName: linked?.name ? String(linked.name) : null,
        organizationId: event.organizationId != null ? String(event.organizationId) : null,
        notificationMessageId,
        attachments: parseAttachmentRefs(meta, notificationMessageId),
    };
};

/**
 * Loads outbound message history from client events for a channel.
 * Contact-scoped by default; companyWide returns all matching messages for the org/client.
 */
export async function listOutboundMessageEvents(params: {
    clientId: string;
    channel: OutboundMessageChannel;
    contactId?: string | null;
    contactName?: string | null;
    organizationId?: string | null;
    companyWide?: boolean;
}): Promise<OutboundMessageHistoryItem[]> {
    const clientId = String(params.clientId || '').trim();
    if (!clientId || !apiBase()) return [];

    // Load all client events; filter in-memory so contact history still shows
    // messages even when organizationId was missing on the stored event.
    const res = await fetch(`${apiBase()}/api/clients/${encodeURIComponent(clientId)}/events`, {
        method: 'GET',
        headers: authHeaders(),
        credentials: 'include',
    });
    if (!res.ok) {
        throw new Error('טעינת היסטוריית הודעות נכשלה');
    }
    const rows = await res.json();
    const list: ClientEventLike[] = Array.isArray(rows) ? rows : [];
    const contactId = params.contactId ? String(params.contactId).trim() : '';
    const contactName = params.contactName ? String(params.contactName).trim() : '';
    const organizationId = params.organizationId ? String(params.organizationId).trim() : '';
    const companyWide = Boolean(params.companyWide);

    return list
        .map((event) => {
            const channel = parseChannelFromEvent(event);
            if (channel !== params.channel) return null;
            const isOutbound =
                event.metadata?.outboundMessage === true ||
                String(event.title || '').startsWith('נשלח') ||
                String(event.title || '').startsWith('נשלחה');
            if (!isOutbound) return null;

            const linked =
                event.linkedTo && typeof event.linkedTo === 'object' ? event.linkedTo : null;
            const eventOrgId = event.organizationId != null ? String(event.organizationId) : '';

            if (companyWide) {
                if (organizationId && eventOrgId && eventOrgId !== organizationId) return null;
            } else if (contactId || contactName) {
                const idMatch = contactId && linked?.id && String(linked.id) === contactId;
                const nameMatch =
                    contactName &&
                    linked?.name &&
                    String(linked.name).includes(contactName);
                const blobMatch =
                    contactName &&
                    `${event.title || ''} ${event.description || ''}`.includes(contactName);
                if (!idMatch && !nameMatch && !blobMatch) return null;
            }

            return toHistoryItem(event, channel);
        })
        .filter((item): item is OutboundMessageHistoryItem => Boolean(item))
        .sort((a, b) => {
            const ta = a.date ? new Date(a.date).getTime() : 0;
            const tb = b.date ? new Date(b.date).getTime() : 0;
            return tb - ta;
        });
}
