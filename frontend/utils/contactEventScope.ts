/** Match client-event rows to a contact — aligned with journal `normalizeRow` / contact scope (not coordinator name). */

export function rawEventLinkedToContactId(
    row: Record<string, unknown>,
    contactId: string,
): boolean {
    const cid = String(contactId).trim();
    if (!cid) return false;

    if (String(row.contactId || '').trim() === cid) return true;

    const linked =
        row.linkedTo && typeof row.linkedTo === 'object' && !Array.isArray(row.linkedTo)
            ? (row.linkedTo as Record<string, unknown>)
            : null;
    if (linked && String(linked.id || '').trim() === cid) return true;

    const meta = row.metadata;
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
        const linkedContacts = (meta as Record<string, unknown>).linkedContacts;
        if (Array.isArray(linkedContacts)) {
            for (const item of linkedContacts) {
                if (!item || typeof item !== 'object') continue;
                if (String((item as Record<string, unknown>).id || '').trim() === cid) return true;
            }
        }
    }

    return false;
}

export function rawEventMatchesContactScope(
    row: Record<string, unknown>,
    opts: { contactId: string; contactName?: string | null },
): boolean {
    const { contactId, contactName } = opts;
    if (rawEventLinkedToContactId(row, contactId)) return true;

    const name = String(contactName || '').trim();
    if (!name) return false;

    if (String(row.contactName || '').trim() === name) return true;

    const linked =
        row.linkedTo && typeof row.linkedTo === 'object' && !Array.isArray(row.linkedTo)
            ? (row.linkedTo as Record<string, unknown>)
            : null;
    if (linked && String(linked.name || '').trim() === name) return true;

    return false;
}

export function isOpenJournalEventStatus(status: unknown): boolean {
    const s = String(status || 'עתידי').trim();
    return s !== 'הושלם' && s !== 'בוטל';
}
