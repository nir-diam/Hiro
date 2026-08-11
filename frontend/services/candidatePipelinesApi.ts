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
            pipelines: pipelines.map((p) => ({
                id: p.id,
                name: p.name,
                description: p.description || '',
                stages: (p.stages || []).map((s) => ({
                    id: s.id,
                    name: s.name,
                    color: s.color,
                    order: s.order,
                    slaLimit: s.slaLimit,
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

export async function patchCandidatePipelineStage(
    candidateId: string,
    payload: { pipelineId?: string | null; stageId?: string | null },
): Promise<void> {
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
}
