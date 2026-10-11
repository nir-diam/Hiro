import { fetchNotificationMessageRows } from '../services/notificationMessagesApi';
import { NOTIFICATION_MESSAGE_ID_REGEX } from '../services/notificationInboxCounts';
import { authHeaders } from './authHeaders';
import { parseLegacyLinkedAppendix, stripTaskLinkedAppendixFromBody } from './taskLinkedContext';
import type { ClientTask } from '../components/ClientTasksTab';

export const INBOX_LINKED_TASK_TYPE = '__inbox_notification__';

export type InboxTaskScope = {
    clientId?: string;
    organizationId?: string;
    organizationTmpId?: string;
    contactId?: string;
    contactName?: string;
    /** Jobs on the current organization — links tasks that only have `linkedJobId`. */
    organizationJobIds?: ReadonlySet<string>;
};

export type InboxLinkedTaskMeta = {
    notificationId: string;
    kind: 'task' | 'message';
};

function taskPayloadFromRow(row: Record<string, unknown>): Record<string, unknown> {
    const metadata =
        row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {};
    const tp =
        metadata.taskPayload && typeof metadata.taskPayload === 'object' && !Array.isArray(metadata.taskPayload)
            ? (metadata.taskPayload as Record<string, unknown>)
            : {};
    return tp;
}

function normId(value: unknown): string {
    return value != null ? String(value).trim() : '';
}

function mapInboxPriority(sla: unknown): ClientTask['priority'] {
    const s = String(sla || '').trim();
    if (s === 'גבוהה') return 'high';
    if (s === 'נמוכה') return 'low';
    return 'medium';
}

export function inboxNotificationMatchesScope(
    tp: Record<string, unknown>,
    scope: InboxTaskScope,
): boolean {
    const linkedClientId = normId(tp.linkedClientId);
    const linkedContactId = normId(tp.linkedContactId);
    const linkedOrgId = normId(tp.linkedOrganizationId);
    const linkedOrgTmp = normId(tp.linkedOrganizationTmpId);
    const linkedJobId = normId(tp.linkedJobId);
    const linkedContactLabel =
        typeof tp.linkedContactLabel === 'string' ? tp.linkedContactLabel.trim().toLowerCase() : '';

    if (scope.contactId || scope.contactName) {
        const contactId = normId(scope.contactId);
        if (contactId && linkedContactId && linkedContactId === contactId) return true;
        const nameNorm = String(scope.contactName || '').trim().toLowerCase();
        if (nameNorm && linkedContactLabel && linkedContactLabel === nameNorm) return true;
        if (contactId && !linkedContactId && !linkedContactLabel) return false;
        if (nameNorm && !linkedContactId && !linkedContactLabel) return false;
        return false;
    }

    if (scope.organizationTmpId) {
        const tmp = normId(scope.organizationTmpId);
        if (linkedOrgTmp && linkedOrgTmp === tmp) return true;
        if (linkedJobId && scope.organizationJobIds?.has(linkedJobId)) return true;
        return false;
    }

    if (scope.organizationId) {
        const org = normId(scope.organizationId);
        if (linkedOrgId && linkedOrgId === org) return true;
        if (linkedJobId && scope.organizationJobIds?.has(linkedJobId)) return true;
        return false;
    }

    if (scope.clientId) {
        const client = normId(scope.clientId);
        if (linkedClientId && linkedClientId === client) return true;
        return false;
    }

    return false;
}

export function isActiveInboxRow(row: Record<string, unknown>): boolean {
    const backendId = String(row?.id ?? row?.notificationMessageId ?? '').trim();
    if (!NOTIFICATION_MESSAGE_ID_REGEX.test(backendId)) return false;
    const status = row?.status;
    return status !== 'archived' && status !== 'deleted';
}

export function mapInboxRowToClientTask(
    row: Record<string, unknown>,
    scope: InboxTaskScope,
    organizationName?: string,
): ClientTask | null {
    if (!isActiveInboxRow(row)) return null;
    const tp = taskPayloadFromRow(row);
    if (!inboxNotificationMatchesScope(tp, scope)) return null;

    const backendId = String(row?.id ?? row?.notificationMessageId ?? '').trim();
    const metadata =
        row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {};
    const handledComplete = Boolean(metadata.taskCompleted);
    const rawText = String(row?.text || row?.html || '');
    const legacyLinked = parseLegacyLinkedAppendix(rawText);
    const linkedClientId = normId(tp.linkedClientId) || undefined;
    const linkedContactId = normId(tp.linkedContactId) || undefined;
    const linkedOrgId = normId(tp.linkedOrganizationId) || undefined;
    const linkedOrgTmp = normId(tp.linkedOrganizationTmpId) || undefined;
    const linkedClientLabel =
        typeof tp.linkedClientLabel === 'string' ? tp.linkedClientLabel : legacyLinked.client;
    const isTask = Boolean(row?.isTask) || row?.messageType === 'task';
    const dueRaw = row?.dueDate ? String(row.dueDate) : '';
    const dueDate = dueRaw ? dueRaw.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const assignee = String(row?.assignee || row?.toEmail || '—').trim() || '—';
    const body = stripTaskLinkedAppendixFromBody(rawText).trim();

    const task: ClientTask = {
        id: `inbox:${backendId}`,
        type: INBOX_LINKED_TASK_TYPE,
        status: handledComplete ? 'done' : 'pending',
        priority: mapInboxPriority(row?.sla),
        title: String(row?.subject || (isTask ? 'משימה' : 'הודעה')).trim(),
        description: body || undefined,
        dueDate,
        assignee,
        clientId: linkedClientId || scope.clientId,
        clientName: linkedClientLabel || undefined,
        organizationId: linkedOrgId || scope.organizationId,
        organizationTmpId: linkedOrgTmp || scope.organizationTmpId,
        organizationName: organizationName || undefined,
        contactId: linkedContactId,
        contactName:
            typeof tp.linkedContactLabel === 'string'
                ? tp.linkedContactLabel
                : undefined,
        inboxNotificationId: backendId,
        inboxKind: isTask ? 'task' : 'message',
        history: [],
    };

    return {
        ...task,
        isOverdue: task.status === 'pending' && new Date(dueDate).getTime() < new Date().setHours(0, 0, 0, 0),
    };
}

/** @deprecated Use `fetchNotificationMessageRows` — kept for call-site clarity. */
export async function fetchEmailUploadMessageRows(apiBase: string): Promise<Record<string, unknown>[]> {
    return fetchNotificationMessageRows(apiBase, { summary: true });
}

export function mapInboxRowsForScope(
    rows: Record<string, unknown>[],
    scope: InboxTaskScope,
    organizationName?: string,
): ClientTask[] {
    const out: ClientTask[] = [];
    for (const row of rows) {
        const mapped = mapInboxRowToClientTask(row, scope, organizationName);
        if (mapped) out.push(mapped);
    }
    return out;
}

export function countPendingInboxRowsForScope(
    rows: Record<string, unknown>[],
    scope: InboxTaskScope,
): number {
    let count = 0;
    for (const row of rows) {
        if (!isActiveInboxRow(row)) continue;
        const metadata =
            row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
                ? (row.metadata as Record<string, unknown>)
                : {};
        if (Boolean(metadata.taskCompleted)) continue;
        const tp = taskPayloadFromRow(row);
        if (inboxNotificationMatchesScope(tp, scope)) count += 1;
    }
    return count;
}

export async function patchInboxNotification(
    apiBase: string,
    notificationId: string,
    body: {
        status?: 'unread' | 'tasks' | 'archived' | 'deleted';
        taskCompleted?: boolean;
        dueDate?: string | null;
    },
): Promise<void> {
    if (!NOTIFICATION_MESSAGE_ID_REGEX.test(notificationId)) {
        throw new Error('Invalid notification id');
    }
    const res = await fetch(`${apiBase}/api/email-uploads/messages/${notificationId}/status`, {
        method: 'PATCH',
        cache: 'no-store',
        credentials: 'include',
        headers: authHeaders(true),
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
    }
}
