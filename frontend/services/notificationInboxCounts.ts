/** Dispatched after a task/message is saved so inbox views + TopBar badge refetch. */
export const NOTIFICATION_MESSAGES_REFRESH_EVENT = 'hiro:notification-messages-refresh';

export type NotificationInboxRefreshDetail = {
    /** When true, NotificationCenter reloads the full list (e.g. new task). TopBar always refetches the badge. */
    reloadNotificationList?: boolean;
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

/**
 * Active inbox only: משימות והודעות שלא סומנו כטופל (`metadata.taskCompleted`).
 * לא כולל נקרא/לא נקרא — תואם לבאדג׳ים ב-NotificationCenter.
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
