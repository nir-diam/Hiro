
import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Candidate } from './CandidatesListView';
import NotificationCenter from './NotificationCenter';

// --- TYPES (used by inboxLinkedTasks and legacy API mappers) ---

/** Pipeline id from תהליכי לקוחות settings (UUID) or legacy sales/retention. */
export type TaskType = string;
export type TaskStatus = 'pending' | 'done';
export type TaskPriority = 'high' | 'medium' | 'low';

export interface TaskHistoryItem {
    date: string;
    user: string;
    action: string;
}

export interface ClientTask {
    id: string;
    type: TaskType;
    status: TaskStatus;
    priority: TaskPriority;
    title: string;
    description?: string;
    dueDate: string;
    assignee: string;
    isOverdue?: boolean;
    clientName?: string;
    clientId?: string;
    organizationId?: string;
    organizationTmpId?: string;
    organizationName?: string;
    contactName?: string;
    contactId?: string;
    processStage?: string;
    history?: TaskHistoryItem[];
    inboxNotificationId?: string;
    inboxKind?: 'task' | 'message';
}

type PickerOption = { id: string; name: string };

interface ClientTasksTabProps {
    showPipeline?: boolean;
    /** Omit to show inbox for all clients (admin list). */
    clientId?: string;
    organizationId?: string;
    organizationTmpId?: string;
    organizationName?: string;
    contactName?: string;
    contactId?: string;
    clientPickerOptions?: PickerOption[];
    organizationPickerOptions?: PickerOption[];
    onOpenCandidateSummary?: (candidate: Candidate | number) => void;
}

/**
 * Client / organization «משימות» — same messages + tasks inbox as contact profile (NotificationCenter).
 */
const ClientTasksTab: React.FC<ClientTasksTabProps> = ({
    clientId,
    organizationId,
    organizationTmpId,
    organizationName,
    contactName,
    contactId,
    onOpenCandidateSummary,
}) => {
    const navigate = useNavigate();

    const openCandidate = useCallback(
        (candidate: Candidate | number) => {
            if (onOpenCandidateSummary) {
                onOpenCandidateSummary(candidate);
                return;
            }
            if (typeof candidate === 'object' && candidate?.backendId) {
                navigate(`/candidates/${encodeURIComponent(String(candidate.backendId))}`);
                return;
            }
            if (typeof candidate === 'number') {
                navigate(`/candidates/${candidate}`);
            }
        },
        [navigate, onOpenCandidateSummary],
    );

    return (
        <NotificationCenter
            variant="embedded"
            onOpenCandidateSummary={openCandidate}
            scopeClientId={clientId}
            scopeContactId={contactId}
            scopeContactName={contactName}
            scopeOrganizationId={organizationId}
            scopeOrganizationTmpId={organizationTmpId}
            scopeOrganizationName={organizationName}
        />
    );
};

export default ClientTasksTab;
