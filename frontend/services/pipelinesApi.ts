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

export type PipelineStageDto = {
    id: string;
    name: string;
    color: string;
    order: number;
    slaLimit: number;
};

export type PipelineDto = {
    id: string;
    clientId?: string;
    name: string;
    description: string;
    sortIndex?: number;
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
