export function normalizeEmailAddress(raw: unknown): string {
    return String(raw || '').trim().toLowerCase();
}

/** Parse "Name <a@b.com>", comma-separated lists, etc. */
export function parseRecipientEmailAddresses(toField: unknown): string[] {
    const raw = String(toField || '').trim();
    if (!raw) return [];
    const parts = raw.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
    const out: string[] = [];
    for (const part of parts) {
        const angle = part.match(/<([^>]+)>/);
        if (angle?.[1]) {
            const e = normalizeEmailAddress(angle[1]);
            if (e.includes('@')) out.push(e);
            continue;
        }
        const e = normalizeEmailAddress(part);
        if (e.includes('@')) out.push(e);
    }
    return [...new Set(out)];
}

export function recipientMatchesContactEmails(
    toField: unknown,
    contactEmails: string[] | null | undefined,
): boolean {
    const allowed = new Set(
        (contactEmails || []).map(normalizeEmailAddress).filter((e) => e.includes('@')),
    );
    if (!allowed.size) return false;
    const targets = parseRecipientEmailAddresses(toField);
    return targets.some((t) => allowed.has(t));
}

export function collectContactEmailAddresses(input: {
    emails?: { value?: string; isPrimary?: boolean }[];
    email?: string | null;
    mainContactEmail?: string | null;
} | null | undefined): string[] {
    const rows = Array.isArray(input?.emails) ? input.emails : [];
    const fromRows = rows.map((r) => String(r?.value || '').trim()).filter((e) => e.includes('@'));
    const legacy = [input?.email, input?.mainContactEmail]
        .map((v) => String(v || '').trim())
        .filter((e) => e.includes('@'));
    return [...new Set([...fromRows, ...legacy].map(normalizeEmailAddress))];
}

export function isOutboundClientMessageEvent(event: {
    title?: string;
    metadata?: { outboundMessage?: boolean } | null;
}): boolean {
    return (
        event.metadata?.outboundMessage === true
        || String(event.title || '').startsWith('נשלח')
        || String(event.title || '').startsWith('נשלחה')
    );
}

export function extractOutboundRecipientTo(event: {
    description?: string;
    metadata?: { to?: string } | null;
}): string {
    const metaTo = event.metadata?.to;
    if (metaTo != null && String(metaTo).trim()) return String(metaTo).trim();
    const description = String(event.description || '');
    const line = description
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith('אל:'));
    return line ? line.slice(3).trim() : '';
}

export function outboundEventLooksLikeEmail(event: {
    title?: string;
    metadata?: { channel?: string; to?: string } | null;
    description?: string;
}): boolean {
    const ch = String(event.metadata?.channel || '').toLowerCase();
    if (ch.includes('email') || ch.includes('mail') || ch === 'מייל') return true;
    const title = String(event.title || '');
    if (title.includes('מייל') || title.toLowerCase().includes('email')) return true;
    const to = extractOutboundRecipientTo(event);
    return Boolean(to && to.includes('@'));
}
