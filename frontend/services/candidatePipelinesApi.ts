import {
    fetchPipelines,
    syncPipelines,
    createPipeline,
    type PipelineDto,
    type PipelineStageDto,
    type StageOutcomeDto,
} from './pipelinesApi';

export type { PipelineDto, PipelineStageDto, StageOutcomeDto };

export async function fetchCandidatePipelines(clientId: string): Promise<PipelineDto[]> {
    const apiBase = () => import.meta.env.VITE_API_BASE || '';
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) (h as Record<string, string>).Authorization = `Bearer ${token}`;
    const res = await fetch(`${apiBase()}/api/clients/${encodeURIComponent(clientId)}/candidate-pipelines`, {
        headers: h,
        cache: 'no-store',
    });
    if (!res.ok) {
        let msg = res.statusText;
        try {
            const j = (await res.json()) as { message?: string };
            msg = j.message || msg;
        } catch {
            /* ignore */
        }
        throw new Error(msg || 'Request failed');
    }
    const json = (await res.json()) as { pipelines?: PipelineDto[] };
    return Array.isArray(json.pipelines) ? json.pipelines : [];
}

export async function syncCandidatePipelines(clientId: string, pipelines: PipelineDto[]): Promise<PipelineDto[]> {
    const apiBase = () => import.meta.env.VITE_API_BASE || '';
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) (h as Record<string, string>).Authorization = `Bearer ${token}`;
    const res = await fetch(`${apiBase()}/api/clients/${encodeURIComponent(clientId)}/candidate-pipelines`, {
        method: 'PUT',
        headers: h,
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
    if (!res.ok) {
        let msg = res.statusText;
        try {
            const j = (await res.json()) as { message?: string };
            msg = j.message || msg;
        } catch {
            /* ignore */
        }
        throw new Error(msg || 'Request failed');
    }
    const json = (await res.json()) as { pipelines?: PipelineDto[] };
    return Array.isArray(json.pipelines) ? json.pipelines : [];
}

export async function createCandidatePipeline(
    clientId: string,
    payload: { name: string; description?: string },
): Promise<PipelineDto> {
    const apiBase = () => import.meta.env.VITE_API_BASE || '';
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) (h as Record<string, string>).Authorization = `Bearer ${token}`;
    const res = await fetch(`${apiBase()}/api/clients/${encodeURIComponent(clientId)}/candidate-pipelines`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        let msg = res.statusText;
        try {
            const j = (await res.json()) as { message?: string };
            msg = j.message || msg;
        } catch {
            /* ignore */
        }
        throw new Error(msg || 'Request failed');
    }
    return (await res.json()) as PipelineDto;
}

/** Re-export client pipeline helpers for settings view switching. */
export { fetchPipelines, syncPipelines, createPipeline };

export type PatchCandidatePipelineStageResult = {
    id?: string;
    candidatePipelineId?: string | null;
    pipelineStageId?: string | null;
    candidatePipelineProcesses?: Array<{
        id: string;
        pipelineId: string;
        stageId: string;
        targetOutcomeId?: string | null;
        isActive?: boolean;
    }>;
    pipelineMove?: {
        viaOutcome?: boolean;
        async?: boolean;
        outcomeId?: string | null;
        outcomeName?: string | null;
        automationResults?: Array<{
            status: string;
            message?: string;
            channel?: string;
            reason?: string;
        }>;
        actionResult?: {
            nextStageId?: string;
            nextStageName?: string;
            note?: string;
        } | null;
    };
};

export async function patchCandidatePipelineStage(
    candidateId: string,
    payload: {
        pipelineId?: string | null;
        stageId?: string | null;
        /** Process card (תהליך) being dragged — scopes job-link + journal update. */
        jobCandidateId?: string | null;
        /** Visual from-stage on the board (job status mapped to stage). */
        fromStageId?: string | null;
    },
): Promise<PatchCandidatePipelineStageResult> {
    const apiBase = () => import.meta.env.VITE_API_BASE || '';
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) (h as Record<string, string>).Authorization = `Bearer ${token}`;
    const res = await fetch(`${apiBase()}/api/candidates/${encodeURIComponent(candidateId)}/pipeline-stage`, {
        method: 'PATCH',
        headers: h,
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        let msg = res.statusText;
        try {
            const j = (await res.json()) as { message?: string };
            msg = j.message || msg;
        } catch {
            /* ignore */
        }
        throw new Error(msg || 'Request failed');
    }
    return (await res.json()) as PatchCandidatePipelineStageResult;
}

export type CandidateKanbanBoardRow = {
    id: string;
    fullName?: string;
    title?: string;
    internalTags?: string[];
    approveByCandidate?: boolean;
    consentToJobOffers?: boolean;
    candidatePipelineId?: string | null;
    pipelineStageId?: string | null;
    kanbanJobCandidateId?: string | null;
    kanbanJobId?: string | null;
    kanbanJobTitle?: string | null;
    kanbanJobCompany?: string | null;
    updatedAt?: string;
};

export async function fetchCandidateKanbanBoard(opts: {
    pipelineId: string;
    search?: string;
    stageIds?: string[];
    limit?: number;
}): Promise<CandidateKanbanBoardRow[]> {
    const apiBase = () => import.meta.env.VITE_API_BASE || '';
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const h: HeadersInit = { Accept: 'application/json' };
    if (token) (h as Record<string, string>).Authorization = `Bearer ${token}`;
    const params = new URLSearchParams({ pipelineId: opts.pipelineId });
    const search = String(opts.search || '').trim();
    if (search) params.set('search', search);
    if (opts.stageIds?.length) params.set('stageIds', opts.stageIds.join(','));
    if (opts.limit != null) params.set('limit', String(opts.limit));
    const res = await fetch(`${apiBase()}/api/candidates/kanban-board?${params.toString()}`, {
        headers: h,
        cache: 'no-store',
    });
    if (!res.ok) {
        let msg = res.statusText;
        try {
            const j = (await res.json()) as { message?: string };
            msg = j.message || msg;
        } catch {
            /* ignore */
        }
        throw new Error(msg || 'Request failed');
    }
    const json = (await res.json()) as { data?: CandidateKanbanBoardRow[] };
    return Array.isArray(json.data) ? json.data : [];
}

export async function patchJobLinkKanbanStatus(jobCandidateId: string, status: string): Promise<void> {
    const apiBase = () => import.meta.env.VITE_API_BASE || '';
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) (h as Record<string, string>).Authorization = `Bearer ${token}`;
    const res = await fetch(
        `${apiBase()}/api/candidates/linked-jobs/${encodeURIComponent(jobCandidateId)}/status`,
        {
            method: 'PATCH',
            headers: h,
            body: JSON.stringify({ status }),
        },
    );
    if (!res.ok) {
        let msg = res.statusText;
        try {
            const j = (await res.json()) as { message?: string };
            msg = j.message || msg;
        } catch {
            /* ignore */
        }
        throw new Error(msg || 'Request failed');
    }
}
