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

export type CandidateTagMatchDto = {
    name: string;
    source: 'vector' | 'fuzzy';
    score?: number;
    tagId?: string;
};

export type TagAiDecisionDto = {
    id: string;
    pendingTagId: string | null;
    resolvedTargetTagId?: string | null;
    originalTerm: string;
    detectedType: string;
    contextSample: string;
    aiDecision: 'merge' | 'create' | 'delete';
    aiSuggestedTarget?: string | null;
    aiReasoning: string;
    candidateTagsFromDB: CandidateTagMatchDto[];
    status: 'pending' | 'approved' | 'overridden';
    actionDate: string;
    reviewStatus: string;
    reviewerAction?: string | null;
    hesitationLevel?: number | null;
    dilemmaReasoning?: string | null;
};

export async function fetchTagCorrectionAgentEnabled(): Promise<boolean> {
    const res = await fetch(`${apiBase()}/api/tags/corrections/agent-settings`, {
        headers: authHeaders(),
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(await parseErr(res));
    const body = (await res.json()) as { agentEnabled?: boolean };
    return body.agentEnabled !== false;
}

export async function saveTagCorrectionAgentEnabled(agentEnabled: boolean): Promise<boolean> {
    const res = await fetch(`${apiBase()}/api/tags/corrections/agent-settings`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ agentEnabled }),
    });
    if (!res.ok) throw new Error(await parseErr(res));
    const body = (await res.json()) as { agentEnabled?: boolean };
    return body.agentEnabled !== false;
}

export async function backfillTagAiDecisions(limit = 20): Promise<{ processed: number; total: number }> {
    const res = await fetch(`${apiBase()}/api/tags/ai-decisions/backfill`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ limit }),
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}

export async function fetchTagAiDecisions(params: {
    page?: number;
    limit?: number;
    decision?: string;
    date?: string;
    sortOrder?: 'asc' | 'desc';
    reviewStatus?: string;
    reviewerAction?: string;
    autoBackfill?: boolean;
    backfillLimit?: number;
}): Promise<{
    data: TagAiDecisionDto[];
    total: number;
    page: number;
    totalPages: number;
    backfill?: { processed: number; total: number; lastError?: string | null };
}> {
    const q = new URLSearchParams();
    if (params.page) q.set('page', String(params.page));
    if (params.limit) q.set('limit', String(params.limit));
    if (params.decision && params.decision !== 'all') q.set('decision', params.decision);
    if (params.date) q.set('date', params.date);
    q.set('reviewStatus', params.reviewStatus || 'all');
    if (params.reviewerAction) q.set('reviewerAction', params.reviewerAction);
    if (params.autoBackfill) {
        q.set('autoBackfill', '1');
        if (params.backfillLimit) q.set('backfillLimit', String(params.backfillLimit));
    }
    const res = await fetch(`${apiBase()}/api/tags/ai-decisions?${q.toString()}`, {
        headers: authHeaders(),
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(await parseErr(res));
    const body = await res.json();
    let data = Array.isArray(body?.data) ? body.data : [];
    if (params.sortOrder === 'asc') {
        data = [...data].sort(
            (a, b) => new Date(a.actionDate).getTime() - new Date(b.actionDate).getTime(),
        );
    }
    return {
        data,
        total: typeof body.total === 'number' ? body.total : data.length,
        page: typeof body.page === 'number' ? body.page : 1,
        totalPages: typeof body.totalPages === 'number' ? body.totalPages : 1,
        backfill: body.backfill,
    };
}

export async function resolveTagAiDecisions(payload: {
    decisionIds: string[];
    action: 'merge' | 'create' | 'delete' | 'blacklist' | 'manual' | 'undo_manual' | 'undo_blacklist';
    targetTagId?: string;
    aliasPriority?: number;
}): Promise<{ success: boolean; resolvedIds: string[] }> {
    const res = await fetch(`${apiBase()}/api/tags/ai-decisions/resolve`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}
