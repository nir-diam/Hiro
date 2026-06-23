const apiBase = () => (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE || '';

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

export type OrgAiDecisionDto = {
    id: string;
    originalTerm: string;
    candidateId: string | null;
    candidateName: string | null;
    actionDate: string;
    context: string;
    aiDecision: 'create_company' | 'merge_company' | 'map_generic';
    aiSuggestedTarget: string | null;
    aiSuggestedTargetId: string | null;
    aiReasoning: string | null;
    hesitationLevel: number | null;
    dilemmaReasoning: string | null;
    similarEntities: { name: string; similarity: number }[];
    reviewStatus: 'pending_review' | 'approved' | 'changed' | 'manual';
    reviewerAction: string | null;
    resolvedAt: string | null;
    organizationTmpId: string | null;
};

export async function fetchOrgAiDecisions(params: {
    page?: number;
    limit?: number;
    decision?: string;
    date?: string;
    sortOrder?: 'asc' | 'desc';
    reviewStatus?: string;
}): Promise<{
    data: OrgAiDecisionDto[];
    total: number;
    page: number;
    totalPages: number;
}> {
    const q = new URLSearchParams();
    if (params.page) q.set('page', String(params.page));
    if (params.limit) q.set('limit', String(params.limit));
    if (params.decision && params.decision !== 'all') q.set('decision', params.decision);
    if (params.date) q.set('date', params.date);
    if (params.reviewStatus) q.set('reviewStatus', params.reviewStatus);
    if (params.sortOrder) q.set('sortOrder', params.sortOrder);

    const res = await fetch(`${apiBase()}/api/organizations/ai-decisions?${q.toString()}`, {
        headers: authHeaders(),
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}

export async function resolveOrgAiDecision(
    id: string,
    payload: {
        reviewerAction?: string;
        reviewStatus?: string;
        aiDecision?: string;
        aiSuggestedTarget?: string;
        aiSuggestedTargetId?: string;
    },
): Promise<{ success: boolean; id: string; reviewStatus: string; aliasResult?: unknown }> {
    const res = await fetch(`${apiBase()}/api/organizations/ai-decisions/${id}/resolve`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}

export type OrgAiDecisionStats = {
    total: number;
    todayCount: number;
    byDecision: { create_company: number; merge_company: number; map_generic: number };
    byStatus: { pending_review: number; approved: number; manual: number; changed: number };
    byHesitation: { vodai: number; binoni: number; namuch: number };
    recentActivity: {
        id: string;
        originalTerm: string;
        aiDecision: string;
        hesitationLevel: number | null;
        reviewStatus: string;
        createdAt: string;
    }[];
};

export async function fetchOrgAiDecisionStats(): Promise<OrgAiDecisionStats> {
    const res = await fetch(`${apiBase()}/api/organizations/ai-decisions/stats`, {
        headers: authHeaders(),
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}

export async function bulkResolveOrgAiDecisions(payload: {
    ids: string[];
    reviewerAction?: string;
    reviewStatus?: string;
}): Promise<{ success: boolean; resolvedIds: string[] }> {
    const res = await fetch(`${apiBase()}/api/organizations/ai-decisions/bulk-resolve`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}
