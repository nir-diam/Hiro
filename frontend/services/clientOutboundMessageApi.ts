import { authHeaders } from '../utils/authHeaders';

const apiBase = () => import.meta.env.VITE_API_BASE || '';

export type OutboundMessageChannel = 'email' | 'whatsapp' | 'sms';

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

    const descriptionLines = [
        `ערוץ: ${channelHe}`,
        `מאת: ${sender}`,
        `אל: ${to}`,
        subject ? `נושא: ${subject}` : null,
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
        channel === 'email'
            ? `נשלח מייל${subject ? `: ${subject}` : ''}${contactName ? ` ל${contactName}` : ''}`
            : channel === 'whatsapp'
              ? `נשלחה הודעת WhatsApp${contactName ? ` ל${contactName}` : ''}`
              : `נשלחה הודעת SMS${contactName ? ` ל${contactName}` : ''}`;

    const payload = {
        title: title.slice(0, 240),
        // English channel code first for reliable filtering; Hebrew/label second for UI.
        type: [channel, channelHe],
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
            readReceipt: null,
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
    } | null;
};

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
