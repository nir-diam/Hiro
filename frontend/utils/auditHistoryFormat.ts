/** Shared formatting for human-readable audit/history rows (Hebrew). */

/** Resolve timestamp from API rows that may use camelCase or snake_case keys. */
export function resolveEntryTimestamp(entry?: Record<string, unknown> | null): string | Date | null {
    if (!entry) return null;
    const candidate =
        entry.createdAt ??
        entry.created_at ??
        entry.timestamp ??
        entry.updatedAt ??
        entry.updated_at;
    if (candidate == null || candidate === '') return null;
    return candidate as string | Date;
}

export function formatHistoryTimestamp(value?: string | Date | null): string {
    if (!value) return '—';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '—';
    const day = date.getDate();
    const month = date.toLocaleDateString('he-IL', { month: 'long' });
    const year = date.getFullYear();
    const time = date.toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    return `${day} ${month}, ${year} - ${time}`;
}

const AI_ACTOR_MARKERS = new Set(['system', 'ai', 'agent', 'hiro', 'tag-correction-agent']);

const isUuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value);

export function resolveHistoryActorName(input?: {
    actor?: string | null;
    actorDisplayName?: string | null;
    userName?: string | null;
    userEmail?: string | null;
}): string {
    if (input?.userName?.trim()) return input.userName.trim();
    if (input?.userEmail?.trim()) return input.userEmail.trim();

    const actorDisplay = input?.actorDisplayName?.trim();
    if (actorDisplay && actorDisplay !== 'סוכן AI (Hiro)') return actorDisplay;

    const actor = String(input?.actor || '').trim();
    if (actor && actor.includes('@')) return actor;
    if (actor && !AI_ACTOR_MARKERS.has(actor.toLowerCase()) && !isUuid(actor)) return actor;

    if (actor && isUuid(actor)) return 'משתמש';

    return 'סוכן AI (Hiro)';
}

export function resolveHistoryActorAvatar(input?: {
    actor?: string | null;
    actorDisplayName?: string | null;
    userName?: string | null;
    userAvatar?: string | null;
}): string | undefined {
    if (input?.userAvatar?.trim()) return input.userAvatar.trim();
    const name = resolveHistoryActorName(input);
    if (name === 'סוכן AI (Hiro)' || name === 'משתמש') return undefined;
    const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
    if (!parts.length) return undefined;
    return parts.map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

export const TAG_ACTION_LABELS: Record<string, string> = {
    create: 'יצירה',
    update: 'עדכון',
    delete: 'מחיקה',
    merge: 'מיזוג',
};

export const CLIENT_ACTION_LABELS: Record<string, string> = {
    create: 'יצירה',
    update: 'עדכון',
    delete: 'מחיקה',
    system: 'מערכת',
};
