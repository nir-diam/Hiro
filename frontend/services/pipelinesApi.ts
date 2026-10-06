const apiBase = () => import.meta.env.VITE_API_BASE || '';

function authHeaders(): HeadersInit {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) (h as Record<string, string>).Authorization = `Bearer ${token}`;
    return h;
}

async function parseErr(res: Response): Promise<string> {
    try {
        const j = (await res.json()) as { message?: string };
        return j.message || res.statusText || 'Request failed';
    } catch {
        return res.statusText || 'Request failed';
    }
}

export type OutcomeTriggerType = 'none' | 'system_event';

export type OutcomeTrigger = {
    type: OutcomeTriggerType;
    systemEventId?: string;
};

export type AutomationActionType =
    | 'send_email'
    | 'send_sms'
    | 'start_pipeline'
    | 'open_additional_process'
    | 'close_event'
    | 'change_status';
export type AutomationScheduleType = 'immediate' | 'minutes' | 'hours' | 'days';

export type OutcomeAutomationRecipients = {
    candidate?: boolean;
    hiringManager?: boolean;
    coordinator?: boolean;
    extra?: string;
};

export type OutcomeAutomation = {
    id: string;
    actionType: AutomationActionType;
    templateId?: string;
    pipelineId?: string;
    stageId?: string;
    /** Target stage outcome when action moves/opens another process. */
    targetOutcomeId?: string;
    statusName?: string;
    scheduleType: AutomationScheduleType;
    scheduleValue?: number;
    requireManualApproval?: boolean;
    recipients?: OutcomeAutomationRecipients;
};

export type StageOutcomeDto = {
    id: string;
    name: string;
    actionType: 'stay' | 'move' | 'freeze' | 'close';
    targetStageId?: string;
    autoFollowupDays?: number;
    autoFollowupUnit?: 'days' | 'hours' | 'minutes';
    trigger?: OutcomeTrigger;
    automations?: OutcomeAutomation[];
};

export type PipelineStageDto = {
    id: string;
    name: string;
    color: string;
    order: number;
    slaLimit: number;
    slaLimitUnit?: 'days' | 'hours' | 'minutes';
    outcomes?: StageOutcomeDto[];
};

export type PipelineDto = {
    id: string;
    clientId?: string;
    name: string;
    description: string;
    sortIndex?: number;
    /** @deprecated first default assignee; use defaultAssigneeUserIds */
    defaultContactId?: string | null;
    /** Staff user ids for «לטיפול» defaults when creating a process event. */
    defaultAssigneeUserIds?: string[];
    stages: PipelineStageDto[];
};

export async function fetchPipelines(clientId: string): Promise<PipelineDto[]> {
    const res = await fetch(`${apiBase()}/api/clients/${encodeURIComponent(clientId)}/pipelines`, {
        headers: authHeaders(),
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(await parseErr(res));
    const json = (await res.json()) as { pipelines?: PipelineDto[] };
    return Array.isArray(json.pipelines) ? json.pipelines : [];
}

export async function syncPipelines(clientId: string, pipelines: PipelineDto[]): Promise<PipelineDto[]> {
    const res = await fetch(`${apiBase()}/api/clients/${encodeURIComponent(clientId)}/pipelines`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
            pipelines: pipelines.map((p, index) => ({
                id: p.id,
                name: p.name,
                description: p.description || '',
                sortIndex: index,
                defaultContactId: p.defaultContactId ? String(p.defaultContactId) : null,
                defaultAssigneeUserIds: Array.isArray(p.defaultAssigneeUserIds)
                    ? p.defaultAssigneeUserIds.map((id) => String(id)).filter(Boolean)
                    : p.defaultContactId
                      ? [String(p.defaultContactId)]
                      : [],
                stages: (p.stages || []).map((s) => ({
                    id: s.id,
                    name: s.name,
                    color: s.color,
                    order: s.order,
                    slaLimit: s.slaLimit,
                    slaLimitUnit: s.slaLimitUnit || 'days',
                    outcomes: Array.isArray(s.outcomes) ? s.outcomes : [],
                })),
            })),
        }),
    });
    if (!res.ok) throw new Error(await parseErr(res));
    const json = (await res.json()) as { pipelines?: PipelineDto[] };
    return Array.isArray(json.pipelines) ? json.pipelines : [];
}

export async function createPipeline(
    clientId: string,
    payload: { name: string; description?: string },
): Promise<PipelineDto> {
    const res = await fetch(`${apiBase()}/api/clients/${encodeURIComponent(clientId)}/pipelines`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return (await res.json()) as PipelineDto;
}
