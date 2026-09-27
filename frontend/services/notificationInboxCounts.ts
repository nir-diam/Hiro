/** Dispatched after a task/message is saved so inbox views + TopBar badge refetch. */
export const NOTIFICATION_MESSAGES_REFRESH_EVENT = 'hiro:notification-messages-refresh';

export type NotificationInboxRefreshDetail = {
    /** When false, NotificationCenter skips list reload. Default: reload. TopBar always refetches the badge. */
    reloadNotificationList?: boolean;
    /** When set, NotificationCenter switches to this tab after reload (e.g. new outgoing item → sent). */
    focusTab?: 'all' | 'tasks' | 'unread' | 'sent' | 'archived';
};

/** TopBar always refetches; pass `reloadNotificationList: true` when the messages list should reload too. */
export function requestNotificationInboxCountsRefresh(detail?: NotificationInboxRefreshDetail): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
        new CustomEvent(NOTIFICATION_MESSAGES_REFRESH_EVENT, { detail: detail ?? {} }),
    );
}

/** Same rule as NotificationCenter — only valid UUID rows count toward inbox. */
export const NOTIFICATION_MESSAGE_ID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function emailInCommaSeparatedField(field: string, emailNorm: string): boolean {
    const norm = String(emailNorm || '').trim().toLowerCase();
    if (!norm) return false;
    return String(field || '')
        .split(/[,;\n]+/)
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean)
        .includes(norm);
}

function rowRecipientMatchesViewer(
    row: Record<string, unknown>,
    email?: string | null,
    name?: string | null,
): boolean {
    const emailNorm = (email || '').trim().toLowerCase();
    const nameNorm = (name || '').trim().toLowerCase();
    const assignee = row?.assignee != null ? String(row.assignee) : '';
    const toEmail = row?.toEmail != null ? String(row.toEmail) : '';
    const assigneeWhole = assignee.trim().toLowerCase();
    if (emailNorm) {
        if (emailInCommaSeparatedField(toEmail, emailNorm)) return true;
        if (emailInCommaSeparatedField(assignee, emailNorm)) return true;
    }
    if (nameNorm && assigneeWhole === nameNorm) return true;
    return false;
}

function rowSentByViewer(row: Record<string, unknown>, userId?: string | null): boolean {
    if (!userId || row?.senderUserId == null) return false;
    return String(row.senderUserId) === String(userId);
}

/** Inbox row visible to viewer — same rule as NotificationCenter `inboxNotifications`. */
function rowInInboxForViewer(
    row: Record<string, unknown>,
    viewer?: { email?: string | null; name?: string | null; id?: string | null },
): boolean {
    return (
        rowRecipientMatchesViewer(row, viewer?.email, viewer?.name) ||
        !rowSentByViewer(row, viewer?.id)
    );
}

/**
 * Tab «נכנסות»: הודעות (לא משימות) באינבוקס שלא סומנו כטופל.
 * תואם ל-`unreadMessagesCount` ב-NotificationCenter.
 */
export function countIncomingMessagesFromApiRows(
    rows: unknown,
    viewer?: { email?: string | null; name?: string | null; id?: string | null },
): number {
    if (!Array.isArray(rows)) return 0;
    let c = 0;
    for (const row of rows as Record<string, unknown>[]) {
        const backendId = String(row?.id ?? row?.notificationMessageId ?? '').trim();
        if (!NOTIFICATION_MESSAGE_ID_REGEX.test(backendId)) continue;
        const status = row?.status;
        if (status === 'archived' || status === 'deleted') continue;
        const isTask = Boolean(row?.isTask) || row?.messageType === 'task';
        if (isTask) continue;
        const metadata =
            row?.metadata && typeof row.metadata === 'object' && row.metadata !== null
                ? (row.metadata as Record<string, unknown>)
                : {};
        if (Boolean(metadata.taskCompleted)) continue;
        if (!rowInInboxForViewer(row, viewer)) continue;
        c += 1;
    }
    return c;
}

/**
 * Active inbox only: משימות והודעות שלא סומנו כטופל (`metadata.taskCompleted`).
 * לא כולל נקרא/לא נקרא — תואם לבאדג' «הכל» ב-NotificationCenter.
 */
export function countInboxAttentionFromApiRows(rows: unknown): number {
    if (!Array.isArray(rows)) return 0;
    let c = 0;
    for (const row of rows as Record<string, unknown>[]) {
        const backendId = String(row?.id ?? row?.notificationMessageId ?? '').trim();
        if (!NOTIFICATION_MESSAGE_ID_REGEX.test(backendId)) continue;
        const status = row?.status;
        if (status === 'archived' || status === 'deleted') continue;
        const metadata =
            row?.metadata && typeof row.metadata === 'object' && row.metadata !== null
                ? (row.metadata as Record<string, unknown>)
                : {};
        const taskCompleted = Boolean(metadata.taskCompleted);
        const isTask = Boolean(row?.isTask) || row?.messageType === 'task';
        if (isTask) {
            if (status === 'tasks' && !taskCompleted) c += 1;
        } else if (!taskCompleted) {
            c += 1;
        }
    }
    return c;
}
